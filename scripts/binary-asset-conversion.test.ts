import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseConversionOutput, parseInputs, renderSummary } from "./binary-asset-conversion";

const remoteScript = new URL("./binary-asset-conversion-remote.sh", import.meta.url).pathname;
const workflow = await Bun.file(
  new URL("../.github/workflows/binary-asset-conversion.yml", import.meta.url),
).text();

/**
 * A stand-in for the host's docker: one brain web container (Kamal service `brain`) whose running
 * state is a marker file, and maintenance runs that log the brain command,
 * whether the app was stopped while it ran, and exit as the test directs.
 * `assets:migrate` without --dry-run appends to brain.db, as a write would.
 * Lease refusals and the refused boot replay output captured from the real
 * @rizom/brain@0.2.0-alpha.715 CLI against scratch databases, still printed by 0.2.0-alpha.730 (fixtures/,
 * paths rewritten to the container's): the remote script decides on those
 * lines, so a release that rewords them must update the fixtures.
 */
const fixtures = new URL("./fixtures/binary-asset-conversion/", import.meta.url).pathname;
const fakeDocker = `#!/usr/bin/env bash
set -u
log="$FAKE_ROOT/calls.log"
running() { [ -f "$FAKE_ROOT/running" ]; }
case "$1" in
  ps)
    # Kamal labels the app container service=brain, as config/deploy.yml names it.
    [[ "$*" == *"label=service=brain"* ]] || exit 0
    if running; then printf 'c0ffee\\n'; [ -f "$FAKE_ROOT/second" ] && printf 'beef00\\n'; fi
    exit 0 ;;
  inspect)
    case "$*" in
      *State.Status*) running && echo running || echo exited ;;
      *Health*) echo healthy ;;
      *Config.Image*) echo ghcr.io/rizom-ai/yeehaa-io:test-sha ;;
    esac
    exit 0 ;;
  exec)
    case "$*" in
      *package.json*) echo 0.2.0-alpha.730; exit 0 ;;
      *curl*) echo "exec ready" >> "$log"; [ -z "\${FAKE_NEVER_READY:-}" ] && running; exit $? ;;
      *COPY_PATH=*)
        cat > /dev/null
        target=$(printf '%s\n' "$@" | sed -n 's/^COPY_PATH=//p')
        echo "exec copy $target" >> "$log"
        [ -z "\${FAKE_COPY_FAILS:-}" ] || { echo "asset conversion: the copy has no database_leases table: this brain predates database leases" >&2; exit 1; }
        host_target="$FAKE_STATE_ROOT\${target#/data}"
        cp "$FAKE_STATE_ROOT/brain.db" "$host_target"
        echo "RESULT_COPY_LEASES_CLEARED=2"
        exit 0 ;;
      *)
        echo "exec readiness" >> "$log"
        if [ -n "\${FAKE_QUEUE_BUSY:-}" ] && [[ "$*" == *REQUIRE_IDLE=1* ]]; then
          echo "asset conversion: job queue is not idle (1 pending, 0 processing); rerun once it drains" >&2
          exit 1
        fi
        exit "\${FAKE_READINESS_EXIT:-0}" ;;
    esac ;;
  stop) echo "stop" >> "$log"; rm -f "$FAKE_ROOT/running"; exit 0 ;;
  start)
    echo "start" >> "$log"
    refusals=$(cat "$FAKE_ROOT/boot-refusals" 2>/dev/null || echo 0)
    if [ "$refusals" -gt 0 ]; then
      echo $((refusals - 1)) > "$FAKE_ROOT/boot-refusals"
      cat "$FIXTURES/boot-refused.log" >> "$FAKE_ROOT/boot.log"
    else
      touch "$FAKE_ROOT/running"
    fi
    exit 0 ;;
  logs) cat "$FAKE_ROOT/boot.log" 2>/dev/null; exit 0 ;;
  run)
    shift
    flags=""
    while [ "$#" -gt 0 ]; do
      case "$1" in
        --entrypoint) shift 2; break ;;
        *) flags="$flags $1"; shift ;;
      esac
    done
    image="$1"; shift; shift
    command="$*"
    state=$(running && echo app-running || echo app-stopped)
    echo "run $command [$state]" >> "$log"
    echo "flags$flags" >> "$FAKE_ROOT/run-flags.log"
    # Leases: each dry-run takes the next state from lease-sequence (fresh,
    # fresh-maintenance, stale, held or none); every command refuses a fresh
    # lease and an open handle, and a stale lease unless
    # --ignore-stale-heartbeat is passed.
    case "$command" in
      "assets:migrate --dry-run"*)
        if [ -s "$FAKE_ROOT/lease-sequence" ]; then
          head -1 "$FAKE_ROOT/lease-sequence" > "$FAKE_ROOT/lease"
          sed -i 1d "$FAKE_ROOT/lease-sequence"
        fi ;;
    esac
    lease=$(cat "$FAKE_ROOT/lease" 2>/dev/null || echo none)
    case "$lease" in
      fresh) cat "$FIXTURES/fresh-brain-lease.txt"; exit 1 ;;
      fresh-maintenance) cat "$FIXTURES/fresh-maintenance-lease.txt"; exit 1 ;;
      held) cat "$FIXTURES/held-open.txt"; exit 1 ;;
      stale) [[ "$command" == *--ignore-stale-heartbeat* ]] || { cat "$FIXTURES/stale-brain-lease.txt"; exit 1; } ;;
    esac
    if [ -n "\${FAKE_MIGRATE_REFUSES:-}" ] && [[ "$command" == "assets:migrate --database"* ]]; then
      cat "$FIXTURES/held-open.txt"; exit 1
    fi
    case "$command" in
      "assets:migrate --dry-run"*) cat "$FIXTURES/dry-run-ready.txt"; exit "\${FAKE_EXIT_DRY_RUN:-0}" ;;
      "assets:reconcile"*) cat "$FIXTURES/reconcile-dry-run.txt"; exit "\${FAKE_EXIT_RECONCILE:-0}" ;;
      "assets:migrate"*) echo "migrated" >> "$FAKE_STATE_ROOT/brain.db"; echo "Migrated 12 image(s)."; exit "\${FAKE_EXIT_MIGRATE:-0}" ;;
      "assets:verify"*) echo "12 asset-backed image(s): 12 valid, 0 broken."; exit "\${FAKE_EXIT_VERIFY:-0}" ;;
    esac
    exit 99 ;;
esac
echo "unexpected docker $*" >&2
exit 98
`;

let root: string;

async function host(): Promise<{ state: string; proc: string }> {
  const state = join(root, "opt/brain-state");
  const proc = join(root, "proc");
  await mkdir(state, { recursive: true });
  await mkdir(join(root, "opt/brain-runtime/auth"), { recursive: true });
  await mkdir(join(root, "opt/brain-data/image"), { recursive: true });
  await mkdir(join(root, "opt/brain-config"), { recursive: true });
  await mkdir(join(root, "bin"), { recursive: true });
  await mkdir(join(proc, "1/fd"), { recursive: true });
  await writeFile(join(root, "opt/brain.yaml"), "brain: brain\n");
  await writeFile(join(state, "brain.db"), "original entity database\n");
  await writeFile(join(state, "brain-jobs.db"), "jobs\n");
  await writeFile(join(root, "opt/brain-runtime/auth/auth.db"), "auth\n");
  await writeFile(join(root, "bin/docker"), fakeDocker);
  await chmod(join(root, "bin/docker"), 0o755);
  await writeFile(join(root, "running"), "");
  return { state, proc };
}

async function run(
  mode: string,
  env: Record<string, string> = {},
): Promise<{ code: number; stdout: string; stderr: string; calls: string[] }> {
  const state = join(root, "opt/brain-state");
  const child = Bun.spawn(["bash", remoteScript, mode, "yeehaa-io"], {
    env: {
      PATH: `${join(root, "bin")}:${process.env["PATH"] ?? ""}`,
      FAKE_ROOT: root,
      FIXTURES: fixtures,
      FAKE_STATE_ROOT: state,
      STATE_ROOT: state,
      RUNTIME_ROOT: join(root, "opt/brain-runtime"),
      CONTENT_ROOT: join(root, "opt/brain-data"),
      CONFIG_ROOT: join(root, "opt/brain-config"),
      BRAIN_YAML: join(root, "opt/brain.yaml"),
      PROC_ROOT: join(root, "proc"),
      READY_ATTEMPTS: "3",
      READY_INTERVAL: "0",
      LEASE_POLL_ATTEMPTS: "3",
      LEASE_POLL_INTERVAL: "0",
      LEASE_EXPIRY_WAIT: "0",
      ...env,
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  const log = await readFile(join(root, "calls.log"), "utf8").catch(() => "");
  return { code, stdout, stderr, calls: log.split("\n").filter(Boolean) };
}

async function snapshots(state: string): Promise<string[]> {
  return readdir(join(state, "backups")).catch(() => []);
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "asset-conversion-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("the remote conversion", () => {
  test("migrates on a stopped app from a cold snapshot, then starts it again", async () => {
    const { state } = await host();
    const result = await run("migrate");

    expect(result.code).toBe(0);
    expect(result.calls).toEqual([
      "exec readiness",
      "stop",
      "run assets:migrate --dry-run --database /data/brain.db [app-stopped]",
      "run assets:reconcile --from /app/brain-data --dry-run --database /data/brain.db [app-stopped]",
      "run assets:migrate --database /data/brain.db [app-stopped]",
      "run assets:verify --database /data/brain.db --brain-data /app/brain-data [app-stopped]",
      "start",
      "exec ready",
    ]);
    const [snapshot] = await snapshots(state);
    expect(snapshot).toMatch(/^pre-asset-migration-yeehaa-io-\d{8}T\d{6}Z$/);
    const dir = join(state, "backups", snapshot ?? "");
    expect(await readFile(join(dir, "state/brain.db"), "utf8")).toBe("original entity database\n");
    expect(await readFile(join(dir, "runtime-auth/auth.db"), "utf8")).toBe("auth\n");
    const sums = await readFile(join(dir, "SHA256SUMS"), "utf8");
    expect(sums).toContain("state/brain.db");
    expect(sums).toContain("state/brain-jobs.db");
    expect(sums).toContain("runtime-auth/auth.db");
    expect(await readFile(join(state, "brain.db"), "utf8")).toContain("migrated");
    expect(result.stdout).toContain(`RESULT_SNAPSHOT=${dir}`);
    expect(result.stdout).toContain(`--- BEGIN snapshot-sha256sums\n${sums.trimEnd()}\n--- END snapshot-sha256sums exit=0`);
    expect(result.stdout).toContain("RESULT_OUTCOME=migrated");
    expect(result.stdout).toContain("RESULT_READY=true");
  });

  test("runs every maintenance container offline, unwatched and without a health check", async () => {
    await host();
    await run("migrate");
    const flags = (await readFile(join(root, "run-flags.log"), "utf8")).split("\n").filter(Boolean);
    expect(flags).toHaveLength(4);
    for (const line of flags) {
      expect(line).toContain("--rm");
      expect(line).toContain("--no-healthcheck");
      expect(line).toContain("--label ai.rizom.brain.watchdog=false");
      expect(line).toContain("--network none");
      expect(line).toContain(":/app/brain-data:ro");
    }
  });

  test("restores the snapshot and starts the app when verify fails", async () => {
    const { state } = await host();
    await writeFile(join(state, "brain.db-wal"), "wal before\n");
    const result = await run("migrate", { FAKE_EXIT_VERIFY: "1" });

    expect(result.code).not.toBe(0);
    expect(await readFile(join(state, "brain.db"), "utf8")).toBe("original entity database\n");
    expect(await readFile(join(state, "brain.db-wal"), "utf8")).toBe("wal before\n");
    expect(result.calls.slice(-2)).toEqual(["start", "exec ready"]);
    expect(result.stdout).toContain("RESULT_OUTCOME=rolled-back");
  });

  test("restores the snapshot when the migration itself fails", async () => {
    const { state } = await host();
    const result = await run("migrate", { FAKE_EXIT_MIGRATE: "1" });

    expect(result.code).not.toBe(0);
    expect(await readFile(join(state, "brain.db"), "utf8")).toBe("original entity database\n");
    expect(result.calls.some((call) => call.startsWith("run assets:verify"))).toBe(false);
    expect(result.stdout).toContain("RESULT_OUTCOME=rolled-back");
  });

  test("migrates nothing when the dry-run reports a blocked image", async () => {
    const { state } = await host();
    const result = await run("migrate", { FAKE_EXIT_DRY_RUN: "1" });

    expect(result.code).not.toBe(0);
    expect(result.calls.filter((call) => call.startsWith("run "))).toEqual([
      "run assets:migrate --dry-run --database /data/brain.db [app-stopped]",
    ]);
    expect(await readFile(join(state, "brain.db"), "utf8")).toBe("original entity database\n");
    expect(result.calls.slice(-2)).toEqual(["start", "exec ready"]);
    expect(result.stdout).toContain("RESULT_OUTCOME=blocked");
  });

  test("refuses, and starts the app again, while any process still holds brain.db", async () => {
    const { proc } = await host();
    await symlink("/data/brain.db", join(proc, "1/fd/7"));
    const result = await run("migrate");

    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("process(es) 1 hold brain.db open");
    expect(result.calls).toEqual(["exec readiness", "stop", "start", "exec ready"]);
  });

  test("leaves the app running when its job queue is not idle", async () => {
    const { state } = await host();
    const result = await run("migrate", { FAKE_READINESS_EXIT: "1" });

    expect(result.code).not.toBe(0);
    expect(result.calls).toEqual(["exec readiness"]);
    expect(await snapshots(state)).toEqual([]);
  });

  test("refuses an ambiguous runtime", async () => {
    await host();
    await writeFile(join(root, "second"), "");
    const result = await run("migrate");

    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("expected one running brain web container, found 2");
    expect(result.calls).toEqual([]);
  });

  test("a dry-run reads a copy of the live database and never stops the app", async () => {
    const { state } = await host();
    const result = await run("dry-run");

    expect(result.code).toBe(0);
    expect(result.calls).toEqual([
      "exec readiness",
      expect.stringMatching(/^exec copy \/data\/backups\/asset-dry-run-yeehaa-io-\d{8}T\d{6}Z\/brain\.db$/),
      "run assets:migrate --dry-run --database /snapshot/brain.db --ignore-stale-heartbeat [app-running]",
      "run assets:reconcile --from /app/brain-data --dry-run --database /snapshot/brain.db --ignore-stale-heartbeat [app-running]",
      "exec ready",
    ]);
    expect(result.calls).not.toContain("stop");
    expect(result.calls).not.toContain("start");
    expect(await readFile(join(state, "brain.db"), "utf8")).toBe("original entity database\n");
    expect(result.stdout).toContain("RESULT_COPY_LEASES_CLEARED=2");
    expect(result.stdout).toContain("RESULT_COPY_REMOVED=true");
    expect(result.stdout).toContain("RESULT_READY=true");
    expect(result.stdout).toContain("RESULT_OUTCOME=dry-run-ready");
  });

  test("a dry-run mounts only the copy, never the live state, and deletes the copy", async () => {
    const { state } = await host();
    await run("dry-run");
    const flags = (await readFile(join(root, "run-flags.log"), "utf8")).split("\n").filter(Boolean);

    expect(flags).toHaveLength(2);
    for (const line of flags) {
      expect(line).toMatch(new RegExp(`-v ${state}/backups/asset-dry-run-yeehaa-io-\\d{8}T\\d{6}Z:/snapshot `));
      expect(line).not.toContain(":/data");
      expect(line).not.toContain(`${state}:`);
      expect(line).toContain("--network none");
      expect(line).toContain("--no-healthcheck");
    }
    expect(await snapshots(state)).toEqual([]);
  });

  test("a dry-run deletes its copy and leaves the app running when the copy fails", async () => {
    const { state } = await host();
    const result = await run("dry-run", { FAKE_COPY_FAILS: "1" });

    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("predates database leases");
    expect(result.calls.some((call) => call.startsWith("run "))).toBe(false);
    expect(result.calls).not.toContain("stop");
    expect(await snapshots(state)).toEqual([]);
  });

  test("a dry-run runs while jobs are queued; a migration waits for an idle queue", async () => {
    await host();
    const dryRun = await run("dry-run", { FAKE_QUEUE_BUSY: "1" });
    expect(dryRun.code).toBe(0);

    await rm(join(root, "calls.log"), { force: true });
    const migrate = await run("migrate", { FAKE_QUEUE_BUSY: "1" });
    expect(migrate.code).not.toBe(0);
    expect(migrate.stderr).toContain("job queue is not idle");
    expect(migrate.calls).toEqual(["exec readiness"]);
  });

  test("a blocked dry-run still reports reconcile and fails", async () => {
    await host();
    const result = await run("dry-run", { FAKE_EXIT_DRY_RUN: "1" });

    expect(result.code).not.toBe(0);
    expect(result.calls.filter((call) => call.startsWith("run "))).toHaveLength(2);
    expect(result.calls).not.toContain("stop");
    expect(result.stdout).toContain("RESULT_COPY_REMOVED=true");
    expect(result.stdout).toContain("RESULT_OUTCOME=dry-run-blocked");
  });

  test("fails when the app does not come back ready, without a second start", async () => {
    await host();
    const result = await run("migrate", { FAKE_NEVER_READY: "1" });

    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("did not report ready");
    expect(result.stdout).not.toContain("RESULT_READY=true");
    expect(result.stdout).not.toContain("RESULT_BOOT_REFUSED");
    expect(result.calls.filter((call) => call === "start")).toHaveLength(1);
  });

  test("waits out a fresh lease a killed brain left, then converts", async () => {
    await host();
    await writeFile(join(root, "lease-sequence"), "fresh\nfresh-maintenance\nnone\n");
    const result = await run("migrate");

    expect(result.code).toBe(0);
    expect(result.calls.filter((call) => call.startsWith("run assets:migrate --dry-run"))).toHaveLength(3);
    expect(result.calls.some((call) => call.includes("--ignore-stale-heartbeat"))).toBe(false);
    expect(result.stdout).toContain("RESULT_FRESH_LEASE_POLLS=2");
    expect(result.stdout).toContain("RESULT_OUTCOME=migrated");
  });

  test("gives up, without a snapshot or a write, while a lease stays fresh", async () => {
    const { state } = await host();
    await writeFile(join(root, "lease-sequence"), "fresh\n");
    const result = await run("migrate");

    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("a fresh lease on brain.db remains");
    expect(result.calls.filter((call) => call.startsWith("run "))).toHaveLength(3);
    expect(await snapshots(state)).toEqual([]);
    expect(await readFile(join(state, "brain.db"), "utf8")).toBe("original entity database\n");
    expect(result.calls.slice(-2)).toEqual(["start", "exec ready"]);
  });

  test("fails before any write on a refusal it does not recognize", async () => {
    const { state } = await host();
    await writeFile(join(root, "lease-sequence"), "held\n");
    const result = await run("migrate");

    expect(result.code).not.toBe(0);
    expect(result.calls.filter((call) => call.startsWith("run "))).toEqual([
      "run assets:migrate --dry-run --database /data/brain.db [app-stopped]",
    ]);
    expect(result.stdout).toContain("RESULT_OUTCOME=refused");
    expect(result.stdout).toContain("Refusing to continue: process(es) 2817 hold /data/brain.db open.");
    expect(result.stderr).toContain("refused dry-run");
    expect(await snapshots(state)).toEqual([]);
    expect(await readFile(join(state, "brain.db"), "utf8")).toBe("original entity database\n");
    expect(result.calls.slice(-2)).toEqual(["start", "exec ready"]);
  });

  test("a dry-run reports an unrecognized refusal as refused", async () => {
    await host();
    await writeFile(join(root, "lease-sequence"), "held\n");
    const result = await run("dry-run");

    expect(result.code).not.toBe(0);
    expect(result.calls.filter((call) => call.startsWith("run "))).toHaveLength(1);
    expect(result.stdout).toContain("RESULT_OUTCOME=refused");
  });

  test("leaves brain.db alone when the migration refuses to start", async () => {
    const { state } = await host();
    const result = await run("migrate", { FAKE_MIGRATE_REFUSES: "1" });

    expect(result.code).not.toBe(0);
    expect(result.stdout).toContain("RESULT_OUTCOME=refused");
    expect(result.stdout).not.toContain("RESULT_OUTCOME=rolled-back");
    expect(result.stderr).not.toContain("restoring");
    expect(result.calls.some((call) => call.startsWith("run assets:verify"))).toBe(false);
    expect(await snapshots(state)).toHaveLength(1);
    expect(await readFile(join(state, "brain.db"), "utf8")).toBe("original entity database\n");
  });

  test("ignores a stale lease only after the host checks pass, and on every command", async () => {
    await host();
    await writeFile(join(root, "lease-sequence"), "stale\n");
    const result = await run("migrate");

    expect(result.code).toBe(0);
    expect(result.calls.filter((call) => call.startsWith("run "))).toEqual([
      "run assets:migrate --dry-run --database /data/brain.db [app-stopped]",
      "run assets:migrate --dry-run --database /data/brain.db --ignore-stale-heartbeat [app-stopped]",
      "run assets:reconcile --from /app/brain-data --dry-run --database /data/brain.db --ignore-stale-heartbeat [app-stopped]",
      "run assets:migrate --database /data/brain.db --ignore-stale-heartbeat [app-stopped]",
      "run assets:verify --database /data/brain.db --brain-data /app/brain-data --ignore-stale-heartbeat [app-stopped]",
    ]);
    expect(result.stdout).toContain("RESULT_STALE_LEASE_IGNORED=true");
    expect(result.stdout).toContain("RESULT_OUTCOME=migrated");
  });

  test("starts again once a maintenance lease that refused the boot expires", async () => {
    await host();
    await writeFile(join(root, "boot-refusals"), "1");
    const result = await run("migrate");

    expect(result.code).toBe(0);
    expect(result.calls.filter((call) => call === "start")).toHaveLength(2);
    expect(result.stdout).toContain("RESULT_BOOT_REFUSED=true");
    expect(result.stdout).toContain("RESULT_READY=true");
    expect(result.stderr).toContain("refused to boot");
  });

  test("reports a boot that stays refused", async () => {
    await host();
    await writeFile(join(root, "boot-refusals"), "2");
    const result = await run("migrate");

    expect(result.code).not.toBe(0);
    expect(result.stdout).toContain("RESULT_BOOT_REFUSED=true");
    expect(result.stdout).not.toContain("RESULT_READY=true");
    expect(result.stderr).toContain("did not report ready");
  });

  test("prints each step's output between markers with its exit code", async () => {
    await host();
    const result = await run("migrate");
    expect(result.stdout).toContain(`--- BEGIN dry-run\n${await Bun.file(join(fixtures, "dry-run-ready.txt")).text()}--- END dry-run exit=0`);
    expect(result.stdout).toContain("--- BEGIN verify\n12 asset-backed image(s): 12 valid, 0 broken.\n--- END verify exit=0");
  });
});

describe("the runner", () => {
  test("accepts a fleet handle, a mode and the matching confirmation", () => {
    expect(parseInputs({ handle: "yeehaa-io", mode: "migrate", confirm: "assets:yeehaa-io" })).toEqual({
      handle: "yeehaa-io",
      mode: "migrate",
    });
    expect(parseInputs({ handle: "yeehaa-io", mode: "dry-run", confirm: "assets:yeehaa-io" }).mode).toBe("dry-run");
  });

  test("refuses another mode, an unsafe handle or a confirmation for another brain", () => {
    expect(() => parseInputs({ handle: "yeehaa-io", mode: "vacuum", confirm: "assets:yeehaa-io" })).toThrow(/mode/);
    expect(() => parseInputs({ handle: "yeehaa-io;rm", mode: "migrate", confirm: "assets:yeehaa-io;rm" })).toThrow(/handle/);
    expect(() => parseInputs({ handle: "yeehaa-io", mode: "migrate", confirm: "assets:smoke" })).toThrow(/assets:yeehaa-io/);
  });

  test("summarizes a dry-run's copy", () => {
    const summary = renderSummary(
      { handle: "yeehaa-io", mode: "dry-run" },
      parseConversionOutput(
        [
          "RESULT_COPY_LEASES_CLEARED=2",
          "RESULT_COPY=/opt/brain-state/backups/asset-dry-run-yeehaa-io-20261115T180000Z",
          "RESULT_READY=true",
          "RESULT_OUTCOME=dry-run-ready",
          "RESULT_COPY_REMOVED=true",
        ].join("\n"),
      ),
    );
    expect(summary).toContain(
      "- Copy: `/opt/brain-state/backups/asset-dry-run-yeehaa-io-20261115T180000Z`, VACUUM INTO of the live brain.db; 2 brain lease(s) cleared on the copy; removed; the app kept running",
    );
    expect(summary).toContain("- Outcome: `dry-run-ready`");
  });

  test("summarizes the outcome, the snapshot and each step's report", () => {
    const parsed = parseConversionOutput(
      [
        "RESULT_IMAGE=ghcr.io/rizom-ai/yeehaa-io:test-sha",
        "RESULT_BRAIN_VERSION=0.2.0-alpha.730",
        "RESULT_SNAPSHOT=/opt/brain-state/backups/pre-asset-migration-yeehaa-io-20261115T160000Z",
        "--- BEGIN dry-run",
        "12 inline image(s): 12 ready, 0 blocked.",
        "--- END dry-run exit=0",
        "--- BEGIN verify",
        "Verification failed.",
        "--- END verify exit=1",
        "RESULT_FRESH_LEASE_POLLS=2",
        "RESULT_STALE_LEASE_IGNORED=true",
        "RESULT_OUTCOME=rolled-back",
        "RESULT_BOOT_REFUSED=true",
        "RESULT_READY=true",
      ].join("\n"),
    );
    expect(parsed.results).toMatchObject({ OUTCOME: "rolled-back", READY: "true" });
    expect(parsed.steps).toEqual([
      { name: "dry-run", exit: 0, lines: ["12 inline image(s): 12 ready, 0 blocked."] },
      { name: "verify", exit: 1, lines: ["Verification failed."] },
    ]);

    const summary = renderSummary({ handle: "yeehaa-io", mode: "migrate" }, parsed);
    expect(summary).toContain("### Binary asset conversion: yeehaa-io (migrate)");
    expect(summary).toContain("- Outcome: `rolled-back`");
    expect(summary).toContain("- Snapshot: `/opt/brain-state/backups/pre-asset-migration-yeehaa-io-20261115T160000Z`");
    expect(summary).toContain("- Brain: `0.2.0-alpha.730`");
    expect(summary).toContain("#### verify (exit 1)\n\n```\nVerification failed.\n```");
    expect(summary).toContain("- Fresh lease: waited 2 poll(s) for it to expire");
    expect(summary).toContain(
      "- Stale lease: ignored with --ignore-stale-heartbeat, after the host showed no app container running and no process holding brain.db",
    );
    expect(summary).toContain("- Boot: refused while a maintenance lease was fresh; started again after it expired");
  });
});

describe("the workflow", () => {
  const config = Bun.YAML.parse(workflow) as Record<string, any>;
  const deployWorkflow = readFileSync(
    new URL("../.github/workflows/deploy.yml", import.meta.url),
    "utf8",
  );
  const deployConfig = Bun.YAML.parse(deployWorkflow) as Record<string, any>;
  const steps = config["jobs"]["convert"]["steps"] as { name?: string; run?: string; env?: Record<string, string> }[];
  const step = (name: string) => steps.find((candidate) => candidate.name === name);

  test("is dispatched by hand with a mode and a confirmation for this brain", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("options:\n          - dry-run\n          - migrate");
    expect(Object.keys(config["on"]["workflow_dispatch"]["inputs"])).toEqual(["mode", "confirm"]);
    expect(config["jobs"]["convert"]["env"]["HANDLE"]).toBe("${{ github.event.repository.name }}");
    expect(workflow).not.toMatch(/^\s+push:/m);
    expect(workflow).not.toMatch(/^\s+schedule:/m);
  });

  test("never races a deploy of the same brain", () => {
    const group = "deploy-${{ github.event.repository.name }}";
    expect(config["jobs"]["convert"]["concurrency"]).toEqual({ group, "cancel-in-progress": false });
    expect(deployConfig["jobs"]["deploy"]["concurrency"]).toEqual({ group, "cancel-in-progress": false });
  });

  test("reaches the host as Deploy does, and never creates a server", () => {
    for (const run of [
      "./scripts/extract-brain-config.rb",
      "bun deploy/scripts/export-varlock-env.ts /tmp/varlock-env.json",
      "bun deploy/scripts/write-ssh-key.ts /tmp/varlock-env.json",
      "bun deploy/scripts/provision-server.ts",
      'deploy/scripts/trust-ssh-host.sh "$SERVER_IP"',
    ]) {
      expect(workflow).toContain(run);
      expect(deployWorkflow).toContain(run);
    }
    expect(step("Resolve server")?.env).toEqual({ LOOKUP_ONLY: "1" });
    expect(workflow).not.toContain("StrictHostKeyChecking no");
    expect(workflow).not.toContain("UserKnownHostsFile /dev/null");
    expect(step("Convert binary assets")?.run).toContain('config.dig("ssh", "user")');
  });

  test("runs the reviewed conversion script and removes the loaded environment", () => {
    expect(workflow).toContain("bun scripts/binary-asset-conversion.ts");
    expect(step("Remove the loaded environment")).toMatchObject({ run: "rm -f /tmp/varlock-env.json" });
  });
});

/**
 * The copy program the dry-run pipes into the running app's bun, run here
 * with this bun against real SQLite files: it writes only inside the scratch
 * directory and deletes only the copy's brain leases.
 */
describe("the dry-run copy program", () => {
  const program = (() => {
    const text = readFileSync(remoteScript, "utf8");
    const start = text.indexOf("bun run - <<'JS'\n");
    const end = text.indexOf("\nJS\n", start);
    return text.slice(text.indexOf("\n", start) + 1, end + 1);
  })();

  async function scratch(): Promise<{ live: string; copyRoot: string; copy: string }> {
    const copyRoot = join(root, "backups");
    const copyDir = join(copyRoot, "asset-dry-run-yeehaa-io-20261115T180000Z");
    await mkdir(copyDir, { recursive: true });
    const live = join(root, "brain.db");
    const { Database } = await import("bun:sqlite");
    const db = new Database(live);
    db.run("CREATE TABLE entities (id TEXT PRIMARY KEY, content TEXT)");
    db.run("INSERT INTO entities VALUES ('robot', 'data:image/png;base64,AAAA')");
    db.run(
      "CREATE TABLE database_leases (id TEXT PRIMARY KEY, role TEXT NOT NULL, command TEXT, hostname TEXT NOT NULL, pid INTEGER NOT NULL, started_at INTEGER NOT NULL, heartbeat_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)",
    );
    const now = Date.now();
    db.run("INSERT INTO database_leases VALUES ('web', 'brain', NULL, 'yeehaa-io', 10, ?, ?, ?)", [now, now, now + 60_000]);
    db.run("INSERT INTO database_leases VALUES ('worker', 'brain', NULL, 'yeehaa-io', 11, ?, ?, ?)", [now, now, now + 60_000]);
    db.close();
    return { live, copyRoot, copy: join(copyDir, "brain.db") };
  }

  async function copyProgram(env: Record<string, string>): Promise<{ code: number; stdout: string; stderr: string }> {
    const file = join(root, "copy-program.ts");
    await writeFile(file, program);
    const child = Bun.spawn(["bun", file], { env: { PATH: process.env["PATH"] ?? "", ...env }, stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    return { code, stdout, stderr };
  }

  async function leases(path: string): Promise<string[]> {
    const { Database } = await import("bun:sqlite");
    const db = new Database(path, { readonly: true });
    const rows = db.query("SELECT id FROM database_leases ORDER BY id").all() as { id: string }[];
    db.close();
    return rows.map((row) => row.id);
  }

  test("copies the live database and clears only the copy's brain leases", async () => {
    const { live, copyRoot, copy } = await scratch();
    const result = await copyProgram({ LIVE_DATABASE: live, COPY_ROOT: copyRoot, COPY_PATH: copy });

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("RESULT_COPY_LEASES_CLEARED=2");
    expect(await leases(copy)).toEqual([]);
    expect(await leases(live)).toEqual(["web", "worker"]);
  });

  test("refuses to write the live database or anything outside the scratch directory", async () => {
    const { live, copyRoot } = await scratch();
    for (const target of [live, join(copyRoot, "brain.db"), join(root, "elsewhere/brain.db"), join(copyRoot, "pre-asset-migration-yeehaa-io-20261115T180000Z/brain.db")]) {
      const result = await copyProgram({ LIVE_DATABASE: live, COPY_ROOT: copyRoot, COPY_PATH: target });
      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain("refusing to write outside the scratch directory");
    }
    expect(await leases(live)).toEqual(["web", "worker"]);
  });

  test("fails when the copy has no lease table", async () => {
    const { live, copyRoot, copy } = await scratch();
    const { Database } = await import("bun:sqlite");
    const db = new Database(live);
    db.run("DROP TABLE database_leases");
    db.close();
    const result = await copyProgram({ LIVE_DATABASE: live, COPY_ROOT: copyRoot, COPY_PATH: copy });

    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("no database_leases table");
  });

  test("fails, deleting nothing, when the copy holds a maintenance lease", async () => {
    const { live, copyRoot, copy } = await scratch();
    const { Database } = await import("bun:sqlite");
    const db = new Database(live);
    db.run("INSERT INTO database_leases VALUES ('migrate', 'maintenance', 'assets:migrate', 'yeehaa-io', 12, 1, 1, 1)");
    db.close();
    const result = await copyProgram({ LIVE_DATABASE: live, COPY_ROOT: copyRoot, COPY_PATH: copy });

    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("leases other than the brain's: 1 maintenance");
    expect(await leases(copy)).toEqual(["migrate", "web", "worker"]);
  });
});
