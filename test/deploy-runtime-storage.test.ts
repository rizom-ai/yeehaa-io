import { describe, expect, it } from "bun:test";

const packageConfig = (await Bun.file(
  new URL("../package.json", import.meta.url),
).json()) as Record<string, unknown>;
const dockerfile = await Bun.file(
  new URL("../deploy/Dockerfile", import.meta.url),
).text();
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
    expect(ciWorkflowText).toContain("bun-version: 1.4.0");
    expect(dockerfile).toContain("ARG BUN_VERSION=1.4.0");
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
