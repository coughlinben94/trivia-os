#!/usr/bin/env bash
# concepts/tools/guarded-commit-push.sh "<run_id>" "<commit message>" <path1> [path2 ...]
#
# The ONE shared routine for both the Step 2 claim commit, the Step 7 completion commit,
# and the Stuck Protocol's blocked-state commit in AGENT-PROMPT.md — same procedure,
# invoked up to three times a night. Never call `git commit`/`git push` directly from
# AGENT-PROMPT.md's own prose; always through this.
#
# <run_id> must be the SAME run_id returned by lock-acquire.sh for this run — it's
# forwarded to git-baseline.sh check so the baseline-drift check reads the same
# RUN_ID-scoped snapshot this run's own preflight wrote, never a different run's file.
#
# Guarantees, each closing a specific reviewed finding:
#   - Only the exact paths passed as arguments are ever committed, regardless of what
#     else might be staged in the working tree (git commit --only), not just "whatever
#     happens to be staged" (a plain `git commit` after `git add <allowlist>` would also
#     sweep up anything ELSE already staged from outside this run).
#   - Refuses to commit at all if git-baseline.sh check reports drift outside concepts/.
#   - Refuses to commit/push unless the checked-out branch is exactly `main` — a commit
#     made on any other branch would never actually reach origin/main via the push step
#     below, silently.
#   - Re-fetches and re-checks divergence immediately before pushing (not relying on a
#     preflight check made minutes/hours earlier), and only pushes if every commit ahead
#     of origin/main is itself nightly-prefixed — Ben's own unpushed day work is never
#     swept up and published.
#   - Never force-pushes. A rejected push EXITS NONZERO (see below — Gemini code review
#     correctly flagged the old exit-0-and-move-on behavior here as burying a state the
#     pipeline cannot actually recover from on its own).
#   - Enforces the `nightly:` prefix on every commit message itself (Gemini code review,
#     finding #2) rather than trusting every caller to remember it. This matters
#     specifically because the caller is an LLM agent working from prose instructions,
#     not a fixed program — "every call site in AGENT-PROMPT.md happens to say nightly:"
#     is not the same guarantee as "this is enforced." A single non-prefixed commit
#     would otherwise look exactly like Ben's own day work to every future run's
#     day-work-detection check (see below), silently blocking ALL future pushes forever.
#   - Prints exactly ONE machine-readable line to STDOUT as the last thing it does on
#     every exit path: `RESULT: <status> sha=<sha-or-none>`. status is one of:
#     pushed | committed-not-pushed-day-work | push-rejected | push-auth-failed |
#     push-failed | nothing-to-commit. (push-auth-failed and push-failed added after a
#     live run found the old code assumed EVERY push failure was non-fast-forward
#     divergence and told a human to pull/rebase even when the real cause was missing
#     git credentials — a wrong diagnosis sending them down the wrong repair path.)
#     Everything else this script prints goes to stderr (human-readable
#     narration) — only this one stdout line is meant to be parsed, so NIGHTLY-LOG.md
#     entries can record an actual outcome instead of the agent inferring one from prose.
#
# Exit codes: 0 = committed/pushed successfully OR genuinely nothing to do. 1 = refused
# outright (bad args, wrong branch, baseline drift) OR a push was rejected — non-fast-
# forward divergence does NOT resolve itself on a future run (git fetch updates the
# remote-tracking ref but never merges/rebases local main; a future run would just pile
# another commit on the still-diverged branch and fail again, forever). This script
# deliberately does NOT attempt an automatic pull/rebase to fix that — an unattended
# agent auto-rebasing onto a diverged branch it doesn't understand is a worse failure
# mode than a loud, safe stop. A rejected push is a real stuck-protocol condition, not a
# routine outcome to shrug off with exit 0 — every AGENT-PROMPT.md call site treats
# nonzero from this script as a stuck-protocol trigger.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

RUN_ID="${1:?usage: guarded-commit-push.sh \"<run_id>\" \"<message>\" <path1> [path2 ...]}"
shift
MESSAGE="${1:?usage: guarded-commit-push.sh \"<run_id>\" \"<message>\" <path1> [path2 ...]}"
shift
case "$MESSAGE" in
  nightly:\ *) ;;
  *)
    echo "Refusing: commit message must start with \"nightly: \" — got: \"$MESSAGE\". This is enforced here, not just documented, because a non-prefixed commit would be indistinguishable from Ben's own day work to every future run's day-work-detection check below, silently blocking all future pushes." >&2
    exit 1
    ;;
esac
PATHS=("$@")
if [ "${#PATHS[@]}" -eq 0 ]; then
  echo "No paths given — refusing to commit nothing." >&2
  exit 1
fi
for p in "${PATHS[@]}"; do
  case "$p" in
    concepts/*) ;;
    *) echo "Refusing: path '$p' is outside concepts/ — this script only ever commits inside concepts/." >&2; exit 1 ;;
  esac
done

BRANCH="$(git symbolic-ref --short HEAD 2>/dev/null || echo "")"
if [ "$BRANCH" != "main" ]; then
  echo "Checked-out branch is '$BRANCH', not 'main'. A commit here would never reach origin/main via this script's push step. Refusing." >&2
  exit 1
fi

if ! "$SCRIPT_DIR/git-baseline.sh" check "$RUN_ID"; then
  echo "Baseline check failed — refusing to commit. This should be treated as a serious anomaly, not a routine blocked night." >&2
  exit 1
fi

# Stage the given paths (creates them in the index if new), then commit with --only so
# the actual commit CONTENT is restricted to exactly these paths regardless of anything
# else sitting in the index from outside this run's own actions.
git add -- "${PATHS[@]}"
COMMIT_MADE=false
if git diff --cached --quiet -- "${PATHS[@]}"; then
  echo "Nothing to commit for the given paths (no changes) — treating as a no-op success." >&2
else
  git commit --only -m "$MESSAGE" -- "${PATHS[@]}"
  COMMIT_MADE=true
  echo "Committed: $MESSAGE" >&2
fi

git fetch origin

# Every commit ahead of origin/main must itself be nightly-prefixed, or Ben has unpushed
# day work mixed in — skip the push, leave everything local, log it, never force.
AHEAD="$(git log origin/main..main --pretty=format:'%s' 2>/dev/null || true)"
if [ -z "$AHEAD" ]; then
  echo "Nothing ahead of origin/main — nothing to push." >&2
  echo "RESULT: nothing-to-commit sha=none"
  exit 0
fi

CURRENT_SHA="$(git rev-parse HEAD)"

NON_NIGHTLY="$(printf '%s\n' "$AHEAD" | grep -v '^nightly:' || true)"
if [ -n "$NON_NIGHTLY" ]; then
  echo "Unpushed non-nightly commit(s) on main — Ben's day work. Skipping push, leaving commit(s) local:" >&2
  printf '%s\n' "$NON_NIGHTLY" >&2
  echo "RESULT: committed-not-pushed-day-work sha=$CURRENT_SHA"
  exit 0
fi

PUSH_ERR_FILE="$(mktemp)"
if git push origin main:main 2>"$PUSH_ERR_FILE"; then
  cat "$PUSH_ERR_FILE" >&2
  rm -f "$PUSH_ERR_FILE"
  echo "Pushed." >&2
  echo "RESULT: pushed sha=$CURRENT_SHA"
  exit 0
else
  PUSH_ERR="$(cat "$PUSH_ERR_FILE")"
  rm -f "$PUSH_ERR_FILE"
  echo "$PUSH_ERR" >&2
  # Classify WHY the push failed instead of assuming every failure is non-fast-forward
  # divergence (a live run found the old unconditional message told a human to
  # pull/rebase when the real cause was missing git credentials in the sandbox — a
  # completely different, unrelated problem that pulling/rebasing cannot fix). Exit 1
  # in every branch below (Gemini code review, finding #3): a future run must never
  # treat any of these as self-resolving. `git fetch` updates the remote-tracking ref
  # but never merges/rebases local main, and no branch here involves an automatic
  # credential fix either — never force-pushing, never auto-rebasing, never
  # auto-provisioning credentials. All three need a human; they just need a DIFFERENT
  # human action depending on which this is.
  case "$PUSH_ERR" in
    *"could not read Username"*|*"Authentication failed"*|*"could not read Password"*|*"403"*|*"Permission denied (publickey)"*)
      echo "Push failed: no working git credentials for origin in this sandbox (not a divergence problem — do NOT pull/rebase). Needs a human to configure push credentials (e.g. a scoped PAT via a credential helper, or an SSH key) for this environment. Commit remains local." >&2
      echo "RESULT: push-auth-failed sha=$CURRENT_SHA"
      ;;
    *"non-fast-forward"*|*"fetch first"*|*"rejected"*)
      echo "Push rejected (non-fast-forward — origin/main has commits this run's local main doesn't). This does NOT resolve itself on a future run; it needs a human to pull/rebase main. Never force-pushing. Commit remains local." >&2
      echo "RESULT: push-rejected sha=$CURRENT_SHA"
      ;;
    *)
      echo "Push failed for an unrecognized reason (raw git stderr above) — treat as a stuck-protocol condition, do not guess at a fix. Commit remains local." >&2
      echo "RESULT: push-failed sha=$CURRENT_SHA"
      ;;
  esac
  exit 1
fi

# Note on $COMMIT_MADE: intentionally unused past this point beyond documenting intent
# above (whether THIS invocation itself created a commit, vs. one already sitting ahead
# of origin from an earlier partial run) — the RESULT status is about the end-to-end
# outcome (is main's tip pushed or not), which the AHEAD/CURRENT_SHA logic above already
# captures correctly regardless of which invocation created the tip commit.
