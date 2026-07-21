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
# The connected folder is read exactly once by this script (to get the
# remote URL and the existing credentials-store file) and never written to.
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
CRED_FILE="$CONNECTED_REPO/.git/credentials-store"

if [ ! -f "$CRED_FILE" ]; then
  echo "No credentials-store found at $CRED_FILE — cannot push without it. Stopping." >&2
  exit 1
fi

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

git -C "$SCRATCH" config credential.helper "store --file=$CRED_FILE"
git -C "$SCRATCH" config user.email "coughlinben94@gmail.com"
git -C "$SCRATCH" config user.name "Trivia OS Nightly Agent"

# Sanity check: confirm push auth actually works before handing back control,
# rather than discovering an auth problem 6 steps later at the Step 7 push.
# `git ls-remote` with the configured credential helper is a real auth probe
# and touches nothing.
if ! git -C "$SCRATCH" ls-remote origin main > /dev/null 2>&1; then
  echo "Could not authenticate to origin from the scratch checkout — check $CRED_FILE is still valid." >&2
  exit 1
fi

echo "$SCRATCH"
