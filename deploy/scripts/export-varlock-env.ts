import { appendFileSync, readFileSync } from "node:fs";

/**
 * Export a Varlock JSON load to the job's environment.
 *
 *   bun deploy/scripts/export-varlock-env.ts /tmp/varlock-env.json
 *
 * Every value is masked in the log. Single-line values are appended to
 * GITHUB_ENV; multi-line values (keys and certificates) stay in the JSON for
 * the steps that write them to files. The Bitwarden bootstrap token is never
 * exported.
 */
export function exportVarlockEnv(
  env: Record<string, unknown>,
  write: { mask: (text: string) => void; envLines: (lines: string[]) => void },
): void {
  const newline = "\n";
  const lines = Object.entries(env).flatMap(([key, value]) => {
    if (key === "BWS_ACCESS_TOKEN" || value === null || value === undefined) {
      return [];
    }
    const text = String(value).split("\r\n").join(newline);
    const escapedMask = text
      .replace(/%/g, "%25")
      .replace(/\r/g, "%0D")
      .replace(/\n/g, "%0A");
    if (escapedMask.length > 0) write.mask(escapedMask);
    if (text.includes(newline)) return [];
    return [`${key}=${text}`];
  });
  write.envLines(lines);
}

if (import.meta.main) {
  const path = process.argv[2];
  if (!path) throw new Error("usage: export-varlock-env.ts <varlock-env.json>");
  const githubEnvPath = process.env["GITHUB_ENV"];
  if (!githubEnvPath) throw new Error("Missing GITHUB_ENV");
  const env = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  exportVarlockEnv(env, {
    mask: (text) => process.stdout.write(`::add-mask::${text}\n`),
    envLines: (lines) => appendFileSync(githubEnvPath, `${lines.join("\n")}\n`),
  });
}
