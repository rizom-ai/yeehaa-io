#!/usr/bin/env bash
# Convert one brain's inline images and PDFs to durable assets, on its host, as root.
#
#   binary-asset-conversion-remote.sh <dry-run|migrate> <handle>
#
# dry-run: the app keeps running. A consistent copy of the live brain.db
#          (`VACUUM INTO`, as the pre-deploy backup takes it) goes into a
#          scratch directory under the backups root; `assets:migrate
#          --dry-run` and `assets:reconcile --dry-run` run on that copy, and
#          the copy is deleted. The live database is never mounted.
# migrate: idle check, stop, then from the host: no app container running
#          and no process holding brain.db (a maintenance container sees only
#          its own processes). The dry-run, polled while a lease on brain.db
#          is fresh, then a cold snapshot, `assets:reconcile --dry-run`,
#          `assets:migrate` and `assets:verify --brain-data`. When migrate or
#          verify fails, brain.db is restored from the snapshot. Every exit
#          after the stop starts the app again and waits for /health/ready.
#
# Machine-readable lines are RESULT_<KEY>=<value>; each brain command's report
# is printed between `--- BEGIN <step>` and `--- END <step> exit=<code>`.
set -euo pipefail
umask 077

MODE="${1:-}"
HANDLE="${2:-}"
SERVICE_NAME="${SERVICE_NAME:-brain}"
STATE_ROOT="${STATE_ROOT:-/opt/brain-state}"
RUNTIME_ROOT="${RUNTIME_ROOT:-/opt/brain-runtime}"
CONTENT_ROOT="${CONTENT_ROOT:-/opt/brain-data}"
CONFIG_ROOT="${CONFIG_ROOT:-/opt/brain-config}"
BRAIN_YAML="${BRAIN_YAML:-/opt/brain.yaml}"
PROC_ROOT="${PROC_ROOT:-/proc}"
READY_ATTEMPTS="${READY_ATTEMPTS:-90}"
READY_INTERVAL="${READY_INTERVAL:-2}"
# A brain lease is fresh for 60 s after its last renewal (brains #959): a
# killed app's lease, or a killed maintenance run's, expires within that.
LEASE_POLL_ATTEMPTS="${LEASE_POLL_ATTEMPTS:-15}"
LEASE_POLL_INTERVAL="${LEASE_POLL_INTERVAL:-5}"
LEASE_EXPIRY_WAIT="${LEASE_EXPIRY_WAIT:-75}"
BRAIN_CLI="./node_modules/@rizom/brain/dist/brain.js"
DATABASE="/data/brain.db"

say() { printf 'asset conversion: %s\n' "$*" >&2; }
fail() { say "$*"; exit 1; }

# The CLI's refusals, as @rizom/brain 0.2.0-alpha.715 printed them and
# 0.2.0-alpha.730 still prints them (see scripts/fixtures/binary-asset-conversion).
# Each command refuses before it writes; a refusal not matched here ends the
# run without retry or restore.
FRESH_LEASE='^Refusing to continue: .* is in use\.$'
STALE_LEASE='^Refusing to continue: .* holds lease\(s\) that stopped renewing without being released'
ANY_REFUSAL='^Refusing'

print_step() {
  echo "--- BEGIN $1"
  printf '%s\n' "$3"
  echo "--- END $1 exit=$2"
}

refuse_unless_ok() {
  local name="$1" code="$2" output="$3"
  if [ "$code" -ne 0 ] && grep -qE "$ANY_REFUSAL" <<<"$output"; then
    echo "RESULT_OUTCOME=refused"
    fail "the brain CLI refused $name: $(grep -m1 -E "$ANY_REFUSAL" <<<"$output")"
  fi
}

case "$MODE" in
  dry-run | migrate) ;;
  *) fail "mode must be dry-run or migrate" ;;
esac
[[ "$HANDLE" =~ ^[a-z0-9][a-z0-9-]*$ ]] || fail "unsupported handle"

mapfile -t containers < <(docker ps --filter "label=service=${SERVICE_NAME}" --filter label=role=web --format '{{.ID}}')
if [ "${#containers[@]}" -ne 1 ]; then
  fail "expected one running ${SERVICE_NAME} web container, found ${#containers[@]}"
fi
container="${containers[0]}"
status="$(docker inspect "$container" --format '{{.State.Status}}')"
health="$(docker inspect "$container" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}')"
if [ "$status" != running ] || [ "$health" != healthy ]; then
  fail "the app is not running and healthy"
fi

# The app must be ready. Before a migration, which stops it, its queue must
# also be idle, by the pre-deploy backup's rule: no pending job, nothing
# processing beyond leases that already expired.
require_idle=0
[ "$MODE" = migrate ] && require_idle=1
docker exec -e REQUIRE_IDLE="$require_idle" "$container" bun -e '
const response = await fetch("http://127.0.0.1:8080/health/ready");
const health = await response.json();
const queue = health.resources?.queue;
if (response.status !== 200 || health.status !== "ready") {
  console.error("asset conversion: the app is not ready");
  process.exit(1);
}
const abandoned = queue?.staleLeaseCount ?? 0;
if (process.env.REQUIRE_IDLE === "1" && queue && (queue.totals?.pending !== 0 || queue.totals?.processing !== abandoned)) {
  console.error("asset conversion: job queue is not idle (" + (queue.totals?.pending ?? "?") + " pending, " + (queue.totals?.processing ?? "?") + " processing); rerun once it drains");
  process.exit(1);
}
'

image="$(docker inspect "$container" --format '{{.Config.Image}}')"
brain_version="$(docker exec "$container" bun -e 'const pkg = await Bun.file("/app/node_modules/@rizom/brain/package.json").json(); process.stdout.write(pkg.version)')"
echo "RESULT_IMAGE=$image"
echo "RESULT_BRAIN_VERSION=$brain_version"

# The dry-run's scratch copy, deleted on every exit; only a directory under
# the backups root by that name is ever removed.
copy_dir=""
remove_copy() {
  case "$copy_dir" in
    "$STATE_ROOT"/backups/asset-dry-run-*) rm -rf -- "$copy_dir" && echo "RESULT_COPY_REMOVED=true" ;;
  esac
}

if [ "$MODE" = dry-run ]; then
  [ -f "$STATE_ROOT/brain.db" ] || fail "no entity database at $STATE_ROOT/brain.db"
  install -d -m 700 "$STATE_ROOT/backups"
  copy_dir="$STATE_ROOT/backups/asset-dry-run-${HANDLE}-$(date -u +%Y%m%dT%H%M%SZ)"
  [ ! -e "$copy_dir" ] || fail "scratch directory $copy_dir already exists"
  trap remove_copy EXIT
  database_bytes="$(du -cb "$STATE_ROOT"/brain.db* | tail -1 | cut -f1)"
  available_bytes="$(df --output=avail -B1 "$STATE_ROOT" | tail -1 | tr -d ' ')"
  if [ "$available_bytes" -lt $((database_bytes * 2 + 268435456)) ]; then
    fail "insufficient disk for a copy of brain.db"
  fi
  install -d -m 700 "$copy_dir"

  # Inside the running app, which owns the database, with the image's bun: a
  # read-only VACUUM INTO is one consistent read. The copy carries the live
  # brain's lease, fresh as of the copy (--ignore-stale-heartbeat does not
  # pass a fresh lease), and no process holds the copy, so the copy's brain
  # leases are deleted. The program writes only a path inside the scratch
  # directory, never the live database.
  copy_path="/data/backups/${copy_dir##*/}/brain.db"
  case "$copy_dir" in
    "$STATE_ROOT"/backups/asset-dry-run-*) ;;
    *) fail "refusing a copy outside the scratch directory: $copy_dir" ;;
  esac
  [ "$copy_path" != "$DATABASE" ] || fail "refusing to write the live database"
  docker exec -i -e COPY_PATH="$copy_path" "$container" bun run - <<'JS'
import { Database } from "bun:sqlite";
const live = process.env.LIVE_DATABASE ?? "/data/brain.db";
const root = process.env.COPY_ROOT ?? "/data/backups";
const target = process.env.COPY_PATH ?? "";
const fail = (message) => {
  console.error(`asset conversion: ${message}`);
  process.exit(1);
};
const relative = target.startsWith(`${root}/`) ? target.slice(root.length + 1) : "";
if (target === live || !/^asset-dry-run-[a-z0-9-]+-\d{8}T\d{6}Z\/brain\.db$/.test(relative)) {
  fail(`refusing to write outside the scratch directory: ${target}`);
}
if (await Bun.file(target).exists()) fail(`the copy ${target} already exists`);
const source = new Database(live, { readonly: true });
source.run(`VACUUM INTO '${target.replaceAll("'", "''")}'`);
source.close(false);
const copy = new Database(target);
const check = Object.values(copy.query("PRAGMA quick_check").get() ?? {})[0];
if (check !== "ok") fail(`the copy of brain.db failed quick_check (${check})`);
const table = copy.query("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'database_leases'").get();
if (!table) fail("the copy has no database_leases table: this brain predates database leases");
const roles = copy.query("SELECT role, COUNT(*) AS count FROM database_leases GROUP BY role").all();
const unexpected = roles.filter((row) => row.role !== "brain");
if (unexpected.length > 0) {
  fail(`the copy holds leases other than the brain's: ${unexpected.map((row) => `${row.count} ${row.role}`).join(", ")}`);
}
const expected = roles.reduce((sum, row) => sum + row.count, 0);
const { changes } = copy.run("DELETE FROM database_leases WHERE role = 'brain'");
const left = copy.query("SELECT COUNT(*) AS count FROM database_leases").get().count;
copy.close();
if (changes !== expected || left !== 0) {
  fail(`clearing the copy's leases deleted ${changes} of ${expected} row(s) and left ${left}`);
}
console.log(`RESULT_COPY_LEASES_CLEARED=${changes}`);
JS
  echo "RESULT_COPY=$copy_dir"

  # Only the copy is mounted: --ignore-stale-heartbeat never reaches the live
  # database.
  brain_on_copy() {
    docker run --rm --no-healthcheck --label ai.rizom.brain.watchdog=false --network none -w /app \
      -v "$CONTENT_ROOT:/app/brain-data:ro" \
      -v "$copy_dir:/snapshot" \
      -v "$CONFIG_ROOT:/config:ro" \
      -v "$BRAIN_YAML:/app/brain.yaml:ro" \
      --entrypoint bun "$image" "$BRAIN_CLI" "$@" --database /snapshot/brain.db --ignore-stale-heartbeat
  }
  copy_step() {
    local name="$1" code=0 output
    shift
    output="$(brain_on_copy "$@" 2>&1)" || code=$?
    print_step "$name" "$code" "$output"
    refuse_unless_ok "$name" "$code" "$output"
    return "$code"
  }
  dry_run=0
  reconcile=0
  copy_step dry-run assets:migrate --dry-run || dry_run=$?
  copy_step reconcile-dry-run assets:reconcile --from /app/brain-data --dry-run || reconcile=$?
  if docker exec "$container" curl -fsS -o /dev/null http://127.0.0.1:8080/health/ready 2>/dev/null; then
    echo "RESULT_READY=true"
  fi
  if [ "$dry_run" -ne 0 ] || [ "$reconcile" -ne 0 ]; then
    echo "RESULT_OUTCOME=dry-run-blocked"
    exit 1
  fi
  echo "RESULT_OUTCOME=dry-run-ready"
  exit 0
fi

app_stopped=false

wait_ready() {
  for _ in $(seq 1 "$READY_ATTEMPTS"); do
    if docker exec "$container" curl -fsS -o /dev/null http://127.0.0.1:8080/health/ready 2>/dev/null; then
      echo "RESULT_READY=true"
      return 0
    fi
    sleep "$READY_INTERVAL"
  done
  return 1
}

# A brain refuses to boot while a maintenance run's lease is fresh, which a
# killed maintenance container leaves behind: wait for it to expire, start
# again, and report it.
start_app() {
  local since
  since="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  docker start "$container" >/dev/null
  app_stopped=false
  wait_ready && return 0
  if docker logs --since "$since" "$container" 2>&1 | grep -q "Refusing to start: a maintenance command"; then
    echo "RESULT_BOOT_REFUSED=true"
    say "the app refused to boot while a maintenance lease was fresh; starting again in ${LEASE_EXPIRY_WAIT}s, once it expires"
    sleep "$LEASE_EXPIRY_WAIT"
    docker start "$container" >/dev/null
    wait_ready && return 0
  fi
  say "the app did not report ready after its start"
  return 1
}

on_exit() {
  local code=$?
  trap - EXIT
  if [ "$app_stopped" = true ]; then
    start_app || code=1
  fi
  exit "$code"
}
trap on_exit EXIT

docker stop --time 60 "$container" >/dev/null
app_stopped=true

if [ -n "$(docker ps --filter "label=service=${SERVICE_NAME}" --format '{{.ID}}')" ]; then
  fail "a ${SERVICE_NAME} container is still running"
fi
# Host /proc sees every container's processes; a link names the path in that
# process's own mount namespace (/data/brain.db in the app container).
holders="$(
  find "$PROC_ROOT" -mindepth 3 -maxdepth 3 -path "$PROC_ROOT/[0-9]*/fd/*" \
    \( -lname '*/brain.db' -o -lname '*/brain.db-wal' -o -lname '*/brain.db-shm' \) 2>/dev/null \
    | sed "s#^$PROC_ROOT/##; s#/.*##" | sort -un | paste -sd, - || true
)"
if [ -n "$holders" ]; then
  fail "process(es) ${holders//,/, } hold brain.db open; refusing to continue"
fi

brain() {
  docker run --rm --no-healthcheck --label ai.rizom.brain.watchdog=false --network none -w /app \
    -v "$CONTENT_ROOT:/app/brain-data:ro" \
    -v "$RUNTIME_ROOT:/app/data" \
    -v "$STATE_ROOT:/data" \
    -v "$CONFIG_ROOT:/config:ro" \
    -v "$BRAIN_YAML:/app/brain.yaml:ro" \
    --entrypoint bun "$image" "$BRAIN_CLI" "$@"
}

# Set once the host checks above have passed and the CLI reports only leases
# that stopped renewing; every later command then carries it.
ignore_stale=()

step() {
  local name="$1" code=0 output
  shift
  output="$(brain "$@" "${ignore_stale[@]}" 2>&1)" || code=$?
  print_step "$name" "$code" "$output"
  refuse_unless_ok "$name" "$code" "$output"
  return "$code"
}

# The dry-run, polled while a lease on brain.db is still fresh (a container
# killed at its stop timeout leaves one). A lease that stopped renewing is
# ignored only here, after the host showed no app container running and no
# process holding brain.db.
dry_run_step() {
  local output code fresh_polls=0
  for _ in $(seq 1 "$LEASE_POLL_ATTEMPTS"); do
    code=0
    output="$(brain assets:migrate --dry-run --database "$DATABASE" "${ignore_stale[@]}" 2>&1)" || code=$?
    if [ "$code" -ne 0 ] && grep -qE "$FRESH_LEASE" <<<"$output"; then
      fresh_polls=$((fresh_polls + 1))
      sleep "$LEASE_POLL_INTERVAL"
      continue
    fi
    if [ "$code" -ne 0 ] && [ "${#ignore_stale[@]}" -eq 0 ] && grep -qE "$STALE_LEASE" <<<"$output"; then
      ignore_stale=(--ignore-stale-heartbeat)
      echo "RESULT_STALE_LEASE_IGNORED=true"
      say "ignoring a stale lease: no ${SERVICE_NAME} container runs and no process holds brain.db"
      code=0
      output="$(brain assets:migrate --dry-run --database "$DATABASE" "${ignore_stale[@]}" 2>&1)" || code=$?
    fi
    echo "RESULT_FRESH_LEASE_POLLS=$fresh_polls"
    print_step dry-run "$code" "$output"
    refuse_unless_ok dry-run "$code" "$output"
    return "$code"
  done
  echo "RESULT_FRESH_LEASE_POLLS=$fresh_polls"
  fail "a fresh lease on brain.db remains after $((LEASE_POLL_ATTEMPTS * LEASE_POLL_INTERVAL))s; refusing to continue"
}

# The dry-run writes nothing, so it runs before the snapshot: a lease still
# fresh, or a blocked image, ends the run before any copy is made.
if ! dry_run_step; then
  echo "RESULT_OUTCOME=blocked"
  exit 1
fi

# Cold snapshot: byte copies of a database no process holds, checked against
# their sources before anything writes.
install -d -m 700 "$STATE_ROOT/backups"
snapshot="$STATE_ROOT/backups/pre-asset-migration-${HANDLE}-$(date -u +%Y%m%dT%H%M%SZ)"
if [ -e "$snapshot" ] || [ -e "$snapshot.incomplete" ]; then
  fail "snapshot $snapshot already exists"
fi
shopt -s nullglob
state_files=("$STATE_ROOT"/*.db "$STATE_ROOT"/*.db-wal "$STATE_ROOT"/*.db-shm)
auth_files=("$RUNTIME_ROOT"/auth/*.db "$RUNTIME_ROOT"/auth/*.db-wal "$RUNTIME_ROOT"/auth/*.db-shm)
shopt -u nullglob
[ -f "$STATE_ROOT/brain.db" ] || fail "no entity database at $STATE_ROOT/brain.db"
copy_bytes="$(du -cb "${state_files[@]}" "${auth_files[@]}" | tail -1 | cut -f1)"
available_bytes="$(df --output=avail -B1 "$STATE_ROOT" | tail -1 | tr -d ' ')"
if [ "$available_bytes" -lt $((copy_bytes * 3 + 1073741824)) ]; then
  fail "insufficient disk for the snapshot and the migration"
fi
install -d -m 700 "$snapshot.incomplete/state" "$snapshot.incomplete/runtime-auth"
cp -a "${state_files[@]}" "$snapshot.incomplete/state/"
[ "${#auth_files[@]}" -eq 0 ] || cp -a "${auth_files[@]}" "$snapshot.incomplete/runtime-auth/"
for file in "${state_files[@]}"; do cmp -s "$file" "$snapshot.incomplete/state/${file##*/}" || fail "snapshot copy of ${file##*/} differs"; done
for file in "${auth_files[@]}"; do cmp -s "$file" "$snapshot.incomplete/runtime-auth/${file##*/}" || fail "snapshot copy of ${file##*/} differs"; done
(
  cd "$snapshot.incomplete"
  sums="$(find . -type f ! -name SHA256SUMS -printf '%P\n' | sort | xargs -d '\n' sha256sum)"
  printf '%s\n' "$sums" > SHA256SUMS
  sha256sum --check --quiet SHA256SUMS
)
mv "$snapshot.incomplete" "$snapshot"
echo "RESULT_SNAPSHOT=$snapshot"
print_step snapshot-sha256sums 0 "$(cat "$snapshot/SHA256SUMS")"

restore_snapshot() {
  say "restoring brain.db from $snapshot"
  rm -f "$STATE_ROOT/brain.db" "$STATE_ROOT/brain.db-wal" "$STATE_ROOT/brain.db-shm"
  cp -a "$snapshot"/state/brain.db* "$STATE_ROOT/"
  local file
  for file in "$snapshot"/state/brain.db*; do
    cmp -s "$file" "$STATE_ROOT/${file##*/}" || fail "restored ${file##*/} differs from the snapshot"
  done
  echo "RESULT_OUTCOME=rolled-back"
}

if ! step reconcile-dry-run assets:reconcile --from /app/brain-data --dry-run --database "$DATABASE"; then
  echo "RESULT_OUTCOME=blocked"
  exit 1
fi
if ! step migrate assets:migrate --database "$DATABASE"; then
  restore_snapshot
  exit 1
fi
if ! step verify assets:verify --database "$DATABASE" --brain-data /app/brain-data; then
  restore_snapshot
  exit 1
fi
echo "RESULT_OUTCOME=migrated"
start_app
