#!/usr/bin/env bash
# Configure the SSH client for the deploy key and trust the brain's host only
# when its ed25519 key matches the pinned fingerprint.
#
#   deploy/scripts/trust-ssh-host.sh <server-ip>
#
# Writes ~/.ssh/config (deploy key, batch mode, strict host checking) and
# ~/.ssh/known_hosts with the scanned key. Deploy and the binary asset
# conversion both reach the host this way.
set -euo pipefail

SERVER_IP="${1:-}"
[ -n "$SERVER_IP" ] || { echo "usage: trust-ssh-host.sh <server-ip>" >&2; exit 1; }
FINGERPRINT_FILE="${FINGERPRINT_FILE:-deploy/ssh-host-key.sha256}"
KEYSCAN_ATTEMPTS="${KEYSCAN_ATTEMPTS:-18}"
KEYSCAN_INTERVAL="${KEYSCAN_INTERVAL:-5}"

mkdir -p ~/.ssh
cat > ~/.ssh/config <<'EOF'
Host *
  IdentityFile ~/.ssh/id_ed25519
  IdentitiesOnly yes
  BatchMode yes
  ConnectTimeout 5
  StrictHostKeyChecking yes
  UserKnownHostsFile ~/.ssh/known_hosts
EOF
chmod 600 ~/.ssh/config

expected="$(tr -d '\r\n' < "$FINGERPRINT_FILE")"
scanned=""
for attempt in $(seq 1 "$KEYSCAN_ATTEMPTS"); do
  scanned="$(ssh-keyscan -T 5 -t ed25519 "$SERVER_IP" 2>/dev/null || true)"
  if [ -n "$scanned" ]; then
    break
  fi
  echo "SSH host key not available yet (attempt $attempt/$KEYSCAN_ATTEMPTS); retrying in ${KEYSCAN_INTERVAL}s..."
  sleep "$KEYSCAN_INTERVAL"
done
if [ -z "$scanned" ]; then
  echo "Could not retrieve the SSH host key for $SERVER_IP." >&2
  exit 1
fi
actual="$(printf '%s\n' "$scanned" | ssh-keygen -lf - | awk 'NR == 1 {print $2}')"
if [ "$actual" != "$expected" ]; then
  echo "SSH host identity mismatch for $SERVER_IP: expected $expected, received $actual" >&2
  exit 1
fi
printf '%s\n' "$scanned" > ~/.ssh/known_hosts
chmod 600 ~/.ssh/known_hosts
