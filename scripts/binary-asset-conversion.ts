import { appendFileSync } from "node:fs";

/**
 * Run the binary asset conversion on one brain's host and summarize it.
 *
 *   HANDLE=<handle> MODE=<dry-run|migrate> CONFIRM=assets:<handle> SERVER_IP=<ip> \
 *     bun scripts/binary-asset-conversion.ts
 *
 * The host-side work lives in binary-asset-conversion-remote.sh, which runs
 * over SSH as root with the deploy key. Its RESULT_ lines and step reports
 * become the job summary; its exit code is this script's.
 */

export type ConversionMode = "dry-run" | "migrate";

export interface ConversionInputs {
  handle: string;
  mode: ConversionMode;
}

export interface ConversionStep {
  name: string;
  exit: number;
  lines: string[];
}

export interface ConversionOutput {
  results: Record<string, string>;
  steps: ConversionStep[];
}

export function parseInputs(input: {
  handle: string | undefined;
  mode: string | undefined;
  confirm: string | undefined;
}): ConversionInputs {
  const handle = input.handle ?? "";
  if (!/^[a-z0-9][a-z0-9-]*$/.test(handle)) {
    throw new Error(`unsupported handle "${handle}"`);
  }
  const mode = input.mode;
  if (mode !== "dry-run" && mode !== "migrate") {
    throw new Error(`mode must be dry-run or migrate, got "${mode ?? ""}"`);
  }
  if (input.confirm !== `assets:${handle}`) {
    throw new Error(`type assets:${handle} to confirm that ${handle} stops during the run`);
  }
  return { handle, mode };
}

export function parseConversionOutput(stdout: string): ConversionOutput {
  const results: Record<string, string> = {};
  const steps: ConversionStep[] = [];
  let open: { name: string; lines: string[] } | undefined;
  for (const line of stdout.split(/\r?\n/)) {
    const begin = line.match(/^--- BEGIN (\S+)$/);
    const end = line.match(/^--- END (\S+) exit=(\d+)$/);
    if (begin?.[1]) {
      open = { name: begin[1], lines: [] };
    } else if (end?.[1] && open?.name === end[1]) {
      steps.push({ name: open.name, exit: Number(end[2]), lines: open.lines });
      open = undefined;
    } else if (open) {
      open.lines.push(line);
    } else {
      const result = line.match(/^RESULT_([A-Z_]+)=(.*)$/);
      if (result?.[1]) results[result[1]] = result[2] ?? "";
    }
  }
  return { results, steps };
}

export function renderSummary(inputs: ConversionInputs, output: ConversionOutput): string {
  const { results } = output;
  const facts = [
    `- Outcome: \`${results["OUTCOME"] ?? "failed before a brain command ran"}\``,
    ...(results["SNAPSHOT"] ? [`- Snapshot: \`${results["SNAPSHOT"]}\``] : []),
    ...(results["COPY"]
      ? [
          `- Copy: \`${results["COPY"]}\`, VACUUM INTO of the live brain.db; ${results["COPY_LEASES_CLEARED"] ?? "?"} brain lease(s) cleared on the copy; ${results["COPY_REMOVED"] === "true" ? "removed" : "not removed"}; the app kept running`,
        ]
      : []),
    ...(results["BRAIN_VERSION"] ? [`- Brain: \`${results["BRAIN_VERSION"]}\``] : []),
    ...(results["IMAGE"] ? [`- Image: \`${results["IMAGE"]}\``] : []),
    ...(Number(results["FRESH_LEASE_POLLS"] ?? 0) > 0
      ? [`- Fresh lease: waited ${results["FRESH_LEASE_POLLS"]} poll(s) for it to expire`]
      : []),
    ...(results["STALE_LEASE_IGNORED"] === "true"
      ? [
          "- Stale lease: ignored with --ignore-stale-heartbeat, after the host showed no app container running and no process holding brain.db",
        ]
      : []),
    ...(results["BOOT_REFUSED"] === "true"
      ? ["- Boot: refused while a maintenance lease was fresh; started again after it expired"]
      : []),
    `- Ready after the run: ${results["READY"] === "true" ? "yes" : "no"}`,
  ];
  const steps = output.steps.map(
    (step) => `#### ${step.name} (exit ${step.exit})\n\n\`\`\`\n${step.lines.join("\n")}\n\`\`\``,
  );
  return [`### Binary asset conversion: ${inputs.handle} (${inputs.mode})`, facts.join("\n"), ...steps]
    .join("\n\n")
    .concat("\n");
}

async function main(): Promise<number> {
  const inputs = parseInputs({
    handle: process.env["HANDLE"],
    mode: process.env["MODE"],
    confirm: process.env["CONFIRM"],
  });
  const serverIp = process.env["SERVER_IP"] ?? "";
  if (!/^[0-9A-Fa-f.:]+$/.test(serverIp)) throw new Error("SERVER_IP is missing or invalid");
  const sshUser = process.env["SSH_USER"] ?? "root";
  const script = await Bun.file(new URL("./binary-asset-conversion-remote.sh", import.meta.url)).text();

  const child = Bun.spawn(
    ["ssh", `${sshUser}@${serverIp}`, `bash -s -- ${inputs.mode} ${inputs.handle}`],
    { stdin: new Blob([script]), stdout: "pipe", stderr: "inherit" },
  );
  const stdout = await new Response(child.stdout).text();
  const code = await child.exited;
  process.stdout.write(stdout);

  const summaryPath = process.env["GITHUB_STEP_SUMMARY"];
  if (summaryPath) appendFileSync(summaryPath, renderSummary(inputs, parseConversionOutput(stdout)));
  return code;
}

if (import.meta.main) {
  process.exit(await main());
}
