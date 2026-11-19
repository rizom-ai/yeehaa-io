import { describe, expect, it } from "bun:test";

const packageConfig = (await Bun.file(
  new URL("../package.json", import.meta.url),
).json()) as Record<string, unknown>;
const dockerfile = await Bun.file(
  new URL("../deploy/Dockerfile", import.meta.url),
).text();
const tsconfig = (await Bun.file(
  new URL("../tsconfig.json", import.meta.url),
).json()) as Record<string, any>;
const deployConfig = await Bun.file(
  new URL("../config/deploy.yml", import.meta.url),
).text();
const deployWorkflowPath = new URL(
  "../.github/workflows/deploy.yml",
  import.meta.url,
);
const publishWorkflowPath = new URL(
  "../.github/workflows/publish-image.yml",
  import.meta.url,
);
const ciWorkflowPath = new URL("../.github/workflows/ci.yml", import.meta.url);
const deployWorkflow = await Bun.file(deployWorkflowPath).text();
const deployWorkflowConfig = Bun.YAML.parse(deployWorkflow) as Record<
  string,
  any
>;
const publishWorkflowConfig = Bun.YAML.parse(
  await Bun.file(publishWorkflowPath).text(),
) as Record<string, any>;
const ciWorkflowText = await Bun.file(ciWorkflowPath).text();
const ciWorkflowConfig = Bun.YAML.parse(ciWorkflowText) as Record<string, any>;

describe("deployment runtime storage", () => {
  it("uses one reviewed Bun version for development, CI, and runtime", () => {
    expect(packageConfig["packageManager"]).toBe("bun@1.4.0");
    expect(packageConfig).toMatchObject({
      dependencies: {
        "@rizom/brain": "0.2.0-alpha.746",
        "@rizom/site": "0.2.0-alpha.235",
        react: "^19.2.7",
        "react-dom": "^19.2.7",
      },
      devDependencies: {
        "@types/react": "^19.2.17",
        "@types/react-dom": "^19.0.3",
      },
    });
    expect(
      (packageConfig["dependencies"] as Record<string, string>)["preact"],
    ).toBeUndefined();
    expect(tsconfig["compilerOptions"]["jsxImportSource"]).toBe("react");
    expect(ciWorkflowText).toContain("bun-version: 1.4.0");
    expect(dockerfile).toContain("ARG BUN_VERSION=1.4.0");
    expect(dockerfile).toContain(
      "oven/bun:${BUN_VERSION}-slim@sha256:e0ee68d16ccb9927bf02aa7dd8fd4bf3369ee6d46da04faa72b05ce8bfd135f6",
    );
  });

  it("installs the exact locked production graph", () => {
    expect(dockerfile).toContain("COPY package.json bun.lock ./");
    expect(dockerfile).toContain(
      "bun install --production --frozen-lockfile --ignore-scripts",
    );
  });

  it("pins the confirmed post-reprovision SSH host identity", async () => {
    const expectedHostKey = (
      await Bun.file(
        new URL("../deploy/ssh-host-key.sha256", import.meta.url),
      ).text()
    ).trim();
    expect(expectedHostKey).toBe(
      "SHA256:O4H13ugPhbYit8qcs5CKaXCdZInFaYLlWgEU88YH9O4",
    );
    // Deploy and the binary asset conversion trust the host through one
    // script, against the pinned fingerprint.
    const trustScript = await Bun.file(
      new URL("../deploy/scripts/trust-ssh-host.sh", import.meta.url),
    ).text();
    expect(deployWorkflow).toContain("Verify SSH host identity");
    expect(deployWorkflow).toContain('deploy/scripts/trust-ssh-host.sh "$SERVER_IP"');
    expect(trustScript).toContain("deploy/ssh-host-key.sha256");
    expect(trustScript).toContain("StrictHostKeyChecking yes");
    for (const source of [deployWorkflow, trustScript]) {
      expect(source).not.toContain("StrictHostKeyChecking no");
      expect(source).not.toContain("UserKnownHostsFile /dev/null");
    }
  });

  it("gates replacement on the released canonical backup command", async () => {
    const backupScript = Bun.file(
      new URL("../deploy/scripts/create-predeploy-backup.ts", import.meta.url),
    );
    expect(await backupScript.exists()).toBe(true);
    const backupSource = await backupScript.text();
    expect(backupSource).toContain("brains-predeploy-backup-v1");
    expect(backupSource).toContain("VACUUM INTO");
    expect(backupSource).toContain("content-untracked.tar");
    const sshIndex = deployWorkflow.indexOf("- name: Wait for SSH access");
    const backupIndex = deployWorkflow.indexOf(
      "bun deploy/scripts/create-predeploy-backup.ts",
    );
    const deployIndex = deployWorkflow.indexOf("kamal setup --skip-push");
    expect(backupIndex).toBeGreaterThan(sshIndex);
    expect(deployIndex).toBeGreaterThan(backupIndex);
  });

  it("lets a dispatched deploy skip the predeploy backup, operator-confirmed", () => {
    // As @brains/deploy-support renders it (rizom-ai/brains#994): off by
    // default and only on a dispatched run; a deploy started by Publish
    // Image carries no inputs, so its backup always runs.
    expect(deployWorkflowConfig["on"]["workflow_dispatch"]).toEqual({
      inputs: {
        skip_predeploy_backup: {
          description:
            "Skip the predeploy backup, operator-confirmed, when the running runtime cannot go idle; its last verified backup stands",
          required: false,
          type: "boolean",
          default: false,
        },
      },
    });
    const steps = deployWorkflowConfig["jobs"]["deploy"]["steps"] as Array<{
      name?: string;
      if?: string;
    }>;
    const gated = steps.filter((step) =>
      step.if?.includes("skip_predeploy_backup"),
    );
    expect(gated.map((step) => [step.name, step.if])).toEqual([
      [
        "Create verified predeploy backup",
        "${{ !inputs.skip_predeploy_backup }}",
      ],
    ]);
  });

  it("passes the model key under the provider's name the brain reads", async () => {
    // Since @rizom/brain 0.2.0-alpha.730 (brains #927) each provider reads
    // its own key and AI_API_KEY is no longer read: the brain's OpenAI
    // models stop `brain start` without OPENAI_API_KEY.
    const envSchema = await Bun.file(
      new URL("../.env.schema", import.meta.url),
    ).text();
    expect(deployConfig).toMatch(/^ {4}- OPENAI_API_KEY$/m);
    expect(deployConfig).not.toMatch(/^ {4}- AI_API_KEY$/m);
    expect(envSchema).toMatch(
      /# @required @sensitive\nOPENAI_API_KEY=bitwarden\("17ee8ea6-6967-4b78-9087-b4420106cdd6"\)/,
    );
    expect(envSchema).not.toMatch(/^AI_(API|IMAGE)_KEY=/m);
  });

  it("persists auth state outside disposable containers", () => {
    expect(deployConfig).toContain("- /opt/brain-runtime:/app/data");
  });

  it("confirms provider acceptance while first-passkey setup is pending", () => {
    expect(deployWorkflow).toContain("setup_token_deliveries");
    expect(deployWorkflow).toContain(
      "Passkey setup email provider acceptance confirmed",
    );
  });

  it("keeps pull-request validation credential-free and non-deploying", () => {
    expect(ciWorkflowConfig["on"]["pull_request"]).toBeNull();
    expect(ciWorkflowConfig["permissions"]).toEqual({ contents: "read" });
    expect(ciWorkflowText).not.toContain("secrets.");
    expect(ciWorkflowText).not.toContain("docker/login-action");
    expect(ciWorkflowText).not.toContain("kamal");
  });

  it("loads the Varlock environment before exporting it, in Deploy and the conversion", async () => {
    const conversionConfig = Bun.YAML.parse(
      await Bun.file(
        new URL("../.github/workflows/binary-asset-conversion.yml", import.meta.url),
      ).text(),
    ) as Record<string, any>;
    const load =
      "bunx varlock@1.1.0 load --path .env.schema --format json --compact > /tmp/varlock-env.json\nbun deploy/scripts/export-varlock-env.ts /tmp/varlock-env.json\n";
    for (const steps of [
      deployWorkflowConfig["jobs"]["deploy"]["steps"],
      conversionConfig["jobs"]["convert"]["steps"],
    ] as { name?: string; run?: string }[][]) {
      expect(steps.find((step) => step.name === "Load env via varlock")?.run).toBe(load);
    }
  });

  it("publishes and deploys only from main or explicit dispatch", () => {
    expect(publishWorkflowConfig["on"]["pull_request"]).toBeUndefined();
    expect(publishWorkflowConfig["on"]["push"]).toEqual({
      branches: ["main"],
    });
    expect(deployWorkflowConfig["on"]["pull_request"]).toBeUndefined();
    expect(deployWorkflowConfig["on"]["workflow_run"]).toMatchObject({
      workflows: ["Publish Image"],
      branches: ["main"],
      types: ["completed"],
    });
  });
});
