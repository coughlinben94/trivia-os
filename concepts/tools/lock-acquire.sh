#!/usr/bin/env bash
# concepts/tools/lock-acquire.sh
#
# Acquires the nightly run lock. Run from the repo root. On success, prints the run ID
# to stdout and exits 0 — the caller MUST capture this and pass it to lock-release.sh
# later. Installs its own cleanup trap so an interrupted/killed process still releases
# the lock rather than leaving it until its 4-hour expiry.
#
# Exit codes:
#   0  acquired (run ID on stdout)
#   2  a live (non-expired) lock is held by another run — exit cleanly, spend nothing
#   1  unexpected error
set -euo pipefail

LOCK_DIR="concepts/.nightly-lock"
OWNER_FILE="$LOCK_DIR/owner.json"
EXPIRY_HOURS=4
TRIGGER="${1:-unspecified}"
# Whitelist, not escaping (Gemini code review, finding #7 — $TRIGGER was interpolated
# unescaped into owner.json's JSON string; a value containing a literal double-quote
# would produce invalid JSON). AGENT-PROMPT.md only ever calls this with "scheduled" or
# "manual" — a whitelist is both cheaper and more honest than escaping a value that has
# exactly two legitimate forms, and it fails loudly instead of silently producing
# corrupt JSON that some future tool might choke on.
case "$TRIGGER" in
  scheduled|manual|unspecified) ;;
  *)
    echo "Refusing: trigger argument must be 'scheduled' or 'manual', got: '$TRIGGER'." >&2
    exit 1
    ;;
esac

now_iso() { date -u +%Y-%m-%dT%H:%M:%SZ; }
expiry_iso() {
  # macOS/BSD date vs GNU date, same pattern used elsewhere in this repo's tooling.
  date -u -v+${EXPIRY_HOURS}H +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d "+${EXPIRY_HOURS} hours" +%Y-%m-%dT%H:%M:%SZ
}

write_owner_file() {
  local run_id="$1"
  cat > "$OWNER_FILE" <<JSON
{"runId": "$run_id", "startedAt": "$(now_iso)", "expiresAt": "$(expiry_iso)", "trigger": "$TRIGGER", "pid": "$$"}
JSON
}

install_early_exit_cleanup() {
  # Installed immediately after a successful acquisition, cleared immediately before the
  # deliberate final `exit 0` a couple lines later. If this script dies for any reason in
  # that narrow gap (a signal, an unexpected `echo` failure, anything catchable), this
  # actually removes the lock directory it just created — a real fix, not the documented
  # no-op (`trap 'true' ...`) an earlier version of this file shipped, which claimed this
  # protection in its comments while its trap body ran the command `true` and did nothing.
  # Cleared via `trap - ...` right before the real success exit so the NORMAL path never
  # accidentally deletes the lock it's supposed to be handing off to the caller.
  # rm -rf, not rmdir: by this point owner.json has already been written INSIDE
  # $LOCK_DIR, so the directory is non-empty — rmdir would silently no-op on a
  # non-empty directory (caught by actually testing this trap, not by inspection: a
  # first version used rmdir here and left the lock behind on every simulated crash).
  trap 'rm -rf "$LOCK_DIR" 2>/dev/null || true; echo "lock-acquire.sh exiting unexpectedly between acquiring the lock and returning the run ID — released the lock it just took rather than leaving an orphan for the full 4-hour expiry window." >&2' EXIT INT TERM HUP
}

attempt_broken_lock_takeover() {
  # Shared by BOTH "no owner file at all" and "owner file present but unparseable"
  # (Gemini code review, finding #1): the old code only gave the ownerless case a
  # grace-window-then-takeover recovery path; a malformed-but-present owner file (e.g.
  # from a process SIGKILLed mid-write, leaving a truncated JSON file — an uncatchable
  # signal, so even this script's own early-exit trap can't prevent it) fell into a
  # completely separate dead-end that exited 2 forever with no path back, ever, short
  # of a human manually removing the directory. Both cases are really the same
  # situation — "this lock directory is broken, of unknown but boundable age" — so both
  # now go through the identical mtime-based grace-then-takeover logic.
  local reason="$1"
  local suffix="$2"
  local grace_seconds=300
  local dir_mtime_epoch now_epoch age quarantine
  # Same two-separate-assignments pattern as before (see the cross-platform stat -f
  # comment history in PLAN-REVIEW-LOG.md) — GNU stat -f and BSD/macOS stat -f are
  # different flags entirely; gluing both attempts inside one command substitution
  # corrupts the result if the first one fails but still emits stdout.
  dir_mtime_epoch="$(stat -f %m "$LOCK_DIR" 2>/dev/null)" || dir_mtime_epoch="$(stat -c %Y "$LOCK_DIR" 2>/dev/null)" || dir_mtime_epoch=""
  now_epoch="$(date -u +%s)"
  if [ -z "$dir_mtime_epoch" ]; then
    echo "Lock directory is broken ($reason) and its mtime couldn't be read. Treating as live rather than guessing. Exiting without acquiring." >&2
    exit 2
  fi
  age=$(( now_epoch - dir_mtime_epoch ))
  if [ "$age" -lt "$grace_seconds" ]; then
    echo "Lock directory is broken ($reason), ${age}s old (within ${grace_seconds}s grace window) — likely a genuine in-progress acquisition or a just-crashed run. Treating as live. Exiting without acquiring." >&2
    exit 2
  fi
  echo "Lock directory is broken ($reason) and ${age}s old, past the ${grace_seconds}s grace window — permanently abandoned, not a live acquisition. Taking over." >&2
  quarantine="${LOCK_DIR}.stale-${suffix}.$(now_iso | tr -d ':-')"
  mv "$LOCK_DIR" "$quarantine" 2>/dev/null || {
    echo "Failed to quarantine broken lock (possible concurrent takeover). Exiting without acquiring." >&2
    exit 2
  }
  rm -rf "$quarantine"
  if try_acquire "$RUN_ID"; then
    install_early_exit_cleanup
    echo "$RUN_ID"
    trap - EXIT INT TERM HUP
    exit 0
  else
    echo "Broken-lock takeover failed (lost race to another process). Exiting without acquiring." >&2
    exit 2
  fi
}

try_acquire() {
  local run_id="$1"
  if mkdir "$LOCK_DIR" 2>/dev/null; then
    write_owner_file "$run_id"
    # Verify our own write actually landed and is parseable before declaring success —
    # closes the "mkdir succeeded but owner.json write raced/failed" gap (finding #4/#5):
    # a lock directory that exists but has no valid owner file must never be treated as
    # "acquired" by its own creator either.
    if [ -f "$OWNER_FILE" ] && grep -q "\"runId\": \"$run_id\"" "$OWNER_FILE"; then
      return 0
    else
      # rm -rf, not rmdir: found by Gemini code review, confirmed real. If
      # write_owner_file died partway through (disk full, interrupted), OWNER_FILE can
      # exist but be malformed/truncated — the directory is then non-empty, so `rmdir`
      # silently no-ops and leaves a permanently wedged lock behind: no valid owner
      # means no parseable expiresAt, so even the expiry-recovery path can never trigger
      # on it. Same class of bug as the early-exit trap fixed earlier this session —
      # rmdir is only safe when the directory is guaranteed empty, and by this point it
      # generally isn't.
      rm -rf "$LOCK_DIR" 2>/dev/null || true
      return 1
    fi
  fi
  return 1
}

RUN_ID="$(now_iso | tr -d ':-')-$$-$RANDOM"

if try_acquire "$RUN_ID"; then
  # Trap installed AFTER successful acquisition, covering the remainder of THIS script's
  # own execution only — the calling agent process is a separate shell invocation per
  # command in practice, so the durable guarantee for the whole night's run is the
  # explicit lock-release.sh call at the very end of AGENT-PROMPT.md's Step 7/Stuck
  # Protocol, not this trap. This trap's job is narrower and still real: it prevents
  # THIS script itself from ever leaving a lock behind if it dies between acquiring and
  # printing the run ID out.
  install_early_exit_cleanup
  echo "$RUN_ID"
  trap - EXIT INT TERM HUP
  exit 0
fi

# mkdir failed — a lock directory already exists. Determine whether it's live or expired.
if [ ! -f "$OWNER_FILE" ]; then
  # No owner file at all — either a genuine in-progress acquisition caught in the
  # narrow window between mkdir and the owner.json write (normally sub-second), or a
  # crashed run that died in that exact window, permanently. See
  # attempt_broken_lock_takeover for the shared grace-then-takeover handling.
  attempt_broken_lock_takeover "no owner file present" "ownerless"
fi

# Read the owner file ONCE into a variable, then derive both fields from that single
# snapshot — not two separate `grep ... "$OWNER_FILE"` calls at two different moments.
# Two separate reads would reopen exactly the TOCTOU gap the runId check below exists to
# close: if a different process's write landed in between them, both reads would
# consistently see ITS fresh data and appear to "agree" with each other, defeating the
# whole point of comparing them.
OWNER_SNAPSHOT="$(cat "$OWNER_FILE" 2>/dev/null || true)"
EXPIRES=$(printf '%s' "$OWNER_SNAPSHOT" | grep -o '"expiresAt": *"[^"]*"' | cut -d'"' -f4 || true)
if [ -z "$EXPIRES" ]; then
  # Owner file EXISTS but has no parseable expiresAt — e.g. a process that got
  # SIGKILLed mid-write (uncatchable, so even this script's own trap can't prevent a
  # truncated file). This used to be a dead end with no recovery path at all (exit 2
  # forever, unlike the ownerless case, which already had grace-then-takeover). Same
  # underlying situation as the ownerless case — a broken lock directory of unknown
  # but boundable age — so it goes through the identical recovery path.
  attempt_broken_lock_takeover "owner file present but malformed/unparseable expiresAt" "malformed"
fi
RUN_ID_OF_LOCK_BEING_EVALUATED=$(printf '%s' "$OWNER_SNAPSHOT" | grep -o '"runId": *"[^"]*"' | cut -d'"' -f4 || true)

NOW="$(now_iso)"
if [[ "$NOW" < "$EXPIRES" ]]; then
  echo "Live lock held (expires $EXPIRES, now $NOW). Another run is active. Exiting cleanly." >&2
  exit 2
fi

# Expired. Take over. This is the ONE explicit exception to "only the owner classifies
# its own claim." Move the stale directory aside first rather than deleting-then-
# recreating in two separate steps, to minimize the window.
#
# TOCTOU guard (Gemini code review, finding #4): between this process evaluating the
# lock as expired and the `mv` below actually running, a DIFFERENT process could have
# done the exact same evaluation, won the race, quarantined+deleted the old lock, and
# acquired a brand-new LIVE lock at this same path — `mv` on a known path can't tell a
# stale directory from a live one that happens to occupy the same name a moment later.
# Cheap verification closes this rather than heavier locking machinery (still correctly
# judged not worth the complexity at this pipeline's actual scale — one nightly run plus
# occasional manual runs): compare against the runId captured in OWNER_SNAPSHOT above
# (the SAME read that produced EXPIRES, not a fresh one — see the comment there for why
# that distinction is load-bearing) to confirm the QUARANTINED directory still holds
# that same expired lock before treating it as ours to delete. A mismatch means someone
# else's live lock landed here in the gap — restore it and abort rather than destroying it.
QUARANTINE="${LOCK_DIR}.stale.$(now_iso | tr -d ':-')"
mv "$LOCK_DIR" "$QUARANTINE" 2>/dev/null || {
  echo "Failed to quarantine stale lock (possible concurrent takeover). Exiting without acquiring." >&2
  exit 2
}

ACTUAL_QUARANTINED_RUN_ID=$(grep -o '"runId": *"[^"]*"' "$QUARANTINE/owner.json" 2>/dev/null | cut -d'"' -f4 || true)
if [ -z "$RUN_ID_OF_LOCK_BEING_EVALUATED" ] || [ "$ACTUAL_QUARANTINED_RUN_ID" != "$RUN_ID_OF_LOCK_BEING_EVALUATED" ]; then
  echo "Quarantined lock's runId ('$ACTUAL_QUARANTINED_RUN_ID') doesn't match the expired lock evaluated a moment ago ('$RUN_ID_OF_LOCK_BEING_EVALUATED') — a different process's live lock landed here in the gap. Restoring it rather than deleting someone else's live lock, and exiting without acquiring." >&2
  mv "$QUARANTINE" "$LOCK_DIR" 2>/dev/null || echo "Could not restore — the other process's own logic should recover from this on its own; not attempting further recovery here." >&2
  exit 2
fi

echo "Took over expired lock (was: $(cat "$QUARANTINE/owner.json" 2>/dev/null || echo 'unreadable'))." >&2
rm -rf "$QUARANTINE"

if try_acquire "$RUN_ID"; then
  install_early_exit_cleanup
  echo "$RUN_ID"
  trap - EXIT INT TERM HUP
  exit 0
else
  echo "Takeover failed (lost race to another process). Exiting without acquiring." >&2
  exit 2
fi
