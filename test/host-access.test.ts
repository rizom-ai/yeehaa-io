import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { exportVarlockEnv } from "../deploy/scripts/export-varlock-env";

// The scripts Deploy and the binary asset conversion share to reach the host.
const scripts = new URL("../deploy/scripts/", import.meta.url).pathname;
const fingerprint = "SHA256:O4H13ugPhbYit8qcs5CKaXCdZInFaYLlWgEU88YH9O4";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "host-access-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function run(
  command: string[],
  env: Record<string, string>,
): Promise<{ code: number; stdout: string; stderr: string }> {
  const child = Bun.spawn(command, { env, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { code, stdout, stderr };
}

describe("exporting the Varlock load", () => {
  it("masks every value and exports only single-line values, never the bootstrap token", () => {
    const masks: string[] = [];
    const lines: string[] = [];
    exportVarlockEnv(
      {
        BWS_ACCESS_TOKEN: "bootstrap",
        HCLOUD_TOKEN: "hetzner%token",
        KAMAL_SSH_PRIVATE_KEY: "-----BEGIN\r\nkey\r\n-----END",
        UNSET: null,
      },
      { mask: (text) => masks.push(text), envLines: (out) => lines.push(...out) },
    );
    expect(masks).toEqual(["hetzner%25token", "-----BEGIN%0Akey%0A-----END"]);
    expect(lines).toEqual(["HCLOUD_TOKEN=hetzner%token"]);
  });
});

describe("writing the deploy key", () => {
  it("reads the multi-line key from the Varlock load and writes it private", async () => {
    const envJson = join(root, "varlock-env.json");
    await writeFile(
      envJson,
      JSON.stringify({ KAMAL_SSH_PRIVATE_KEY: "-----BEGIN\r\nkey\r\n-----END" }),
    );
    const result = await run(["bun", join(scripts, "write-ssh-key.ts"), envJson], {
      PATH: process.env["PATH"] ?? "",
      HOME: root,
    });
    expect(result.code).toBe(0);
    const keyPath = join(root, ".ssh/id_ed25519");
    expect(await readFile(keyPath, "utf8")).toBe("-----BEGIN\nkey\n-----END\n");
    expect((await stat(keyPath)).mode & 0o777).toBe(0o600);
  });

  it("fails without a key", async () => {
    const envJson = join(root, "varlock-env.json");
    await writeFile(envJson, JSON.stringify({}));
    const result = await run(["bun", join(scripts, "write-ssh-key.ts"), envJson], {
      PATH: process.env["PATH"] ?? "",
      HOME: root,
    });
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("Missing KAMAL_SSH_PRIVATE_KEY");
  });
});

describe("trusting the host", () => {
  // ssh-keyscan returns a fixed line; ssh-keygen -lf prints the fingerprint
  // the test sets, as the real one prints a scanned key's.
  async function fakeSsh(scanned: string): Promise<string> {
    const bin = join(root, "bin");
    await mkdir(bin, { recursive: true });
    await writeFile(join(bin, "ssh-keyscan"), `#!/usr/bin/env bash\nprintf '%s\\n' '${scanned}'\n`);
    await writeFile(
      join(bin, "ssh-keygen"),
      `#!/usr/bin/env bash\ncat > /dev/null\necho "256 \${FAKE_FINGERPRINT} 203.0.113.7 (ED25519)"\n`,
    );
    await chmod(join(bin, "ssh-keyscan"), 0o755);
    await chmod(join(bin, "ssh-keygen"), 0o755);
    return bin;
  }

  async function trust(env: Record<string, string>) {
    const bin = await fakeSsh("203.0.113.7 ssh-ed25519 AAAAhost");
    const fingerprintFile = join(root, "ssh-host-key.sha256");
    await writeFile(fingerprintFile, `${fingerprint}\n`);
    return run(["bash", join(scripts, "trust-ssh-host.sh"), "203.0.113.7"], {
      PATH: `${bin}:${process.env["PATH"] ?? ""}`,
      HOME: root,
      FINGERPRINT_FILE: fingerprintFile,
      KEYSCAN_ATTEMPTS: "1",
      KEYSCAN_INTERVAL: "0",
      ...env,
    });
  }

  it("writes strict SSH config and the scanned key when the fingerprint matches", async () => {
    const result = await trust({ FAKE_FINGERPRINT: fingerprint });
    expect(result.code).toBe(0);
    const config = await readFile(join(root, ".ssh/config"), "utf8");
    expect(config).toContain("StrictHostKeyChecking yes");
    expect(config).toContain("UserKnownHostsFile ~/.ssh/known_hosts");
    expect(config).toContain("IdentityFile ~/.ssh/id_ed25519");
    expect(await readFile(join(root, ".ssh/known_hosts"), "utf8")).toBe(
      "203.0.113.7 ssh-ed25519 AAAAhost\n",
    );
  });

  it("refuses a host whose key does not match the pinned fingerprint", async () => {
    const result = await trust({ FAKE_FINGERPRINT: "SHA256:someone-else" });
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("SSH host identity mismatch for 203.0.113.7");
    expect(await Bun.file(join(root, ".ssh/known_hosts")).exists()).toBe(false);
  });
});

describe("resolving the server", () => {
  // A stand-in for the Hetzner API that records every request.
  async function hetzner(servers: unknown[]) {
    const requests: string[] = [];
    const server = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch(request) {
        requests.push(`${request.method} ${new URL(request.url).pathname}`);
        if (request.method === "GET") return Response.json({ servers });
        return Response.json({ server: { id: 2, status: "running", public_net: { ipv4: { ip: "198.51.100.2" } } } });
      },
    });
    return { requests, url: `http://127.0.0.1:${server.port}`, stop: () => server.stop(true) };
  }

  async function provision(apiUrl: string, env: Record<string, string>) {
    const output = join(root, "github-output");
    await writeFile(output, "");
    const result = await run(["bun", join(scripts, "provision-server.ts")], {
      PATH: process.env["PATH"] ?? "",
      HCLOUD_API_URL: apiUrl,
      HCLOUD_TOKEN: "token",
      INSTANCE_NAME: "yeehaa-io",
      HCLOUD_SSH_KEY_NAME: "key",
      HCLOUD_SERVER_TYPE: "cx33",
      HCLOUD_LOCATION: "fsn1",
      GITHUB_OUTPUT: output,
      ...env,
    });
    return { ...result, output: await readFile(output, "utf8") };
  }

  it("in lookup mode, outputs the labeled server's address", async () => {
    const api = await hetzner([{ id: 1, status: "running", public_net: { ipv4: { ip: "203.0.113.7" } } }]);
    try {
      const result = await provision(api.url, { LOOKUP_ONLY: "1" });
      expect(result.code).toBe(0);
      expect(result.output).toContain("server_ip=203.0.113.7");
      expect(api.requests).toEqual(["GET /servers"]);
    } finally {
      api.stop();
    }
  });

  it("in lookup mode, never creates a server when none is labeled", async () => {
    const api = await hetzner([]);
    try {
      const result = await provision(api.url, { LOOKUP_ONLY: "1" });
      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain("refusing to create one in lookup mode");
      expect(api.requests).toEqual(["GET /servers"]);
    } finally {
      api.stop();
    }
  });

  it("for a deploy, still creates the server when none is labeled", async () => {
    const api = await hetzner([]);
    try {
      const result = await provision(api.url, {});
      expect(result.code).toBe(0);
      expect(api.requests).toEqual(["GET /servers", "POST /servers"]);
      expect(result.output).toContain("server_ip=198.51.100.2");
    } finally {
      api.stop();
    }
  });
});
