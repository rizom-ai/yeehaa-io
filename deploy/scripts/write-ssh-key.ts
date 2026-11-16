import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { requireEnv } from "./helpers";

/**
 * Write the Kamal deploy key to ~/.ssh/id_ed25519.
 *
 *   bun deploy/scripts/write-ssh-key.ts [varlock-env.json]
 *
 * The key is read from the Varlock JSON load when one is given (a multi-line
 * value never reaches GITHUB_ENV), otherwise from KAMAL_SSH_PRIVATE_KEY.
 */
function readPrivateKey(envJsonPath: string | undefined): string {
  if (!envJsonPath) return requireEnv("KAMAL_SSH_PRIVATE_KEY");
  const env = JSON.parse(readFileSync(envJsonPath, "utf8")) as Record<
    string,
    unknown
  >;
  const value = env["KAMAL_SSH_PRIVATE_KEY"];
  if (value === null || value === undefined || value === "") {
    throw new Error("Missing KAMAL_SSH_PRIVATE_KEY");
  }
  return String(value);
}

const privateKey = readPrivateKey(process.argv[2]);

let normalized = privateKey.replace(/\r\n/g, "\n").replace(/\\n/g, "\n");
if (!normalized.endsWith("\n")) {
  normalized += "\n";
}

const sshDir = join(process.env["HOME"] ?? "/root", ".ssh");
mkdirSync(sshDir, { recursive: true });
writeFileSync(join(sshDir, "id_ed25519"), normalized, {
  encoding: "utf8",
  mode: 0o600,
});
