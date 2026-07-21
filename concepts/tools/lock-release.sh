#!/usr/bin/env bash
# concepts/tools/lock-release.sh <run_id>
#
# Releases the nightly run lock — but only if the lock is still owned by the given run
# ID. This prevents a confused/late release from a crashed run's cleanup path from ever
# nuking a DIFFERENT, legitimately newer run's lock (e.g. run A crashes, times out,
# gets reclaimed by run B via the expiry-takeover path in lock-acquire.sh, and only
# THEN does run A's own stuck cleanup code finally execute — without this check, that
# cleanup would delete run B's live lock out from under it).
set -euo pipefail

LOCK_DIR="concepts/.nightly-lock"
OWNER_FILE="$LOCK_DIR/owner.json"
RUN_ID="${1:?usage: lock-release.sh <run_id>}"

if [ ! -d "$LOCK_DIR" ]; then
  echo "No lock directory present — nothing to release." >&2
  exit 0
fi

if [ ! -f "$OWNER_FILE" ]; then
  echo "Lock directory present but no owner file — not removing (can't verify ownership)." >&2
  exit 1
fi

if grep -q "\"runId\": \"$RUN_ID\"" "$OWNER_FILE"; then
  rm -rf "$LOCK_DIR"
  echo "Released lock for run $RUN_ID." >&2
  exit 0
else
  echo "Lock is owned by a DIFFERENT run than $RUN_ID — refusing to release someone else's lock." >&2
  exit 1
fi
