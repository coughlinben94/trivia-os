#!/usr/bin/env bash
# concepts/tools/nightly-checkout.sh <path-to-connected-repo>
#
# Sets up (or refreshes) a scratch git checkout OUTSIDE the Cowork-connected
# trivia-os folder, and prints its path on stdout as the LAST line. This exists
# because a normal `git commit` creates+deletes `.git/index.lock` as an
# unavoidable part of its own operation, and Cowork's connected-folder
# delete-permission wall blocks 100% of deletes there for an unattended
# scheduled task (confirmed live, documented, unattended-unresolvable — see
# NIGHTLY-LOG.md 2026-07-20/21 entries). The fix is architectural, not a
# permission tweak: an unattended nightly run must never delete ANYTHING
# inside the connected folder. So as of tonight, it doesn't touch the
# connected folder's .git at all — every git operation (lock, commit, push)
# happens in this scratch checkout instead, where deletes are unrestricted.
#
# The connected folder is read exactly twice by this script (the remote URL,
# and the existing credentials-store file's CONTENT, copied — not referenced
# — into scratch) and never written to. Earlier version of this script
# pointed the scratch checkout's credential.helper directly at the connected
# folder's own credentials-store file — which is wrong: git's store-based
# credential helper rewrites that file via a lock-then-rename on every single
# auth (fetch/push/ls-remote), so it was silently writing back into the
# connected folder's .git on every git operation despite this comment's
# original claim otherwise. That rename is exactly the class of operation
# the delete-permission wall blocks, and matches stale .lock/.stale fossils
# found sitting in the connected repo's .git from a prior run. Copying the
# credentials into scratch once, up front, closes this for good — every
# later auth's lock+rename churn happens in scratch, never in the connected
# folder.
# Ben's own local copy / `/morning-review` picks up new commits via a normal
# `git pull`, run interactively, where Cowork's delete-permission prompt CAN
# actually be answered by a live human — that's the one context where this
# permission model was ever designed to work.
#
# Known, judged-acceptable residual limitation (documented, not hidden): the
# nightly run-lock (`concepts/.nightly-lock/`) is untracked, local-only state
# in this scratch checkout. It survives a `fetch` + `reset --hard` refresh
# (neither touches untracked files) as long as this scratch path itself
# persists across separate scheduled-task invocations. If the sandbox behind
# scheduled tasks turns out to be fully ephemeral run-to-run (unconfirmed
# either way), a fresh clone starts with no lock directory at all — meaning
# cross-run overlap protection would only be as strong as "two runs happen to
# execute in the same sandbox lifetime." At an actual cadence of one nightly
# firing plus occasional Ben-triggered manual runs, this is an accepted
# tradeoff, not a silently swallowed gap — flag it plainly in NIGHTLY-LOG.md
# if a stale lock is ever NOT found where one should be.
set -euo pipefail

CONNECTED_REPO="${1:?usage: nightly-checkout.sh <path-to-connected-repo>}"
SCRATCH="${TMPDIR:-/tmp}/trivia-os-nightly-checkout"
CONNECTED_CRED_FILE="$CONNECTED_REPO/.git/credentials-store"
# Lives in scratch, NOT in the connected folder — see the header comment.
# Overwritten (not appended) fresh each run so a rotated PAT is always picked
# up; this file itself never needs deleting, only ever replaced wholesale,
# and it lives entirely outside the connected folder either way.
SCRATCH_CRED_FILE="${TMPDIR:-/tmp}/trivia-os-nightly-credentials"

if [ ! -f "$CONNECTED_CRED_FILE" ]; then
  echo "No credentials-store found at $CONNECTED_CRED_FILE — cannot push without it. Stopping." >&2
  exit 1
fi

# A plain read + a write to a scratch-only path — never a write back into
# the connected folder.
cat "$CONNECTED_CRED_FILE" > "$SCRATCH_CRED_FILE"
chmod 600 "$SCRATCH_CRED_FILE"

REMOTE_URL="$(git -C "$CONNECTED_REPO" remote get-url origin)"

if [ -d "$SCRATCH/.git" ]; then
  git -C "$SCRATCH" remote set-url origin "$REMOTE_URL"
  git -C "$SCRATCH" fetch origin
  git -C "$SCRATCH" checkout main
  # reset --hard only touches TRACKED files — the untracked .nightly-lock
  # directory (if present from a prior run in this same scratch lifetime)
  # survives this. Never run `git clean` here for exactly that reason.
  git -C "$SCRATCH" reset --hard origin/main
  echo "Reused existing scratch checkout at $SCRATCH, reset to origin/main." >&2
else
  rm -rf "$SCRATCH" 2>/dev/null || true   # scratch space, not the connected folder — deletes are unrestricted here
  git clone "$REMOTE_URL" "$SCRATCH"
  # Explicit checkout, not a reliance on the clone's default HEAD — defends
  # against a remote whose default branch isn't `main` for any reason (a test
  # fixture, a future repo change, etc.), same defensiveness as the reused-
  # checkout branch below.
  git -C "$SCRATCH" checkout main
  echo "Fresh scratch checkout cloned to $SCRATCH." >&2
fi

git -C "$SCRATCH" config credential.helper "store --file=$SCRATCH_CRED_FILE"
git -C "$SCRATCH" config user.email "coughlinben94@gmail.com"
git -C "$SCRATCH" config user.name "Trivia OS Nightly Agent"

# Sanity check: confirm push auth actually works before handing back control,
# rather than discovering an auth problem 6 steps later at the Step 7 push.
# `git ls-remote` with the configured credential helper is a real auth probe
# and touches nothing — and now, whatever internal lock+rename it does on
# $SCRATCH_CRED_FILE happens purely in scratch space.
if ! git -C "$SCRATCH" ls-remote origin main > /dev/null 2>&1; then
  echo "Could not authenticate to origin from the scratch checkout — check $CONNECTED_CRED_FILE is still valid." >&2
  exit 1
fi

echo "$SCRATCH"
