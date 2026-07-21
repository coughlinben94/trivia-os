#!/usr/bin/env bash
# concepts/tools/git-baseline.sh save|check <run_id>
#
# save:  snapshot content hashes of every out-of-scope (non-concepts/) dirty or
#        untracked file, to a RUN_ID-scoped tmp file. Run at preflight, AFTER lock
#        acquisition (see below for why the ordering matters).
# check: recompute the same snapshot and diff against the saved one. Exits 1 (with a
#        diff on stdout) if anything outside concepts/ changed since save. Run right
#        before every commit.
#
# <run_id> is REQUIRED for both modes and scopes the baseline file's path
# (/tmp/nightly-baseline-hashes.<run_id>.txt). Two reasons, both from adversarial code
# review: (1) a single globally-shared path meant a second process — even one that's
# about to fail the lock check a moment later — could overwrite the FIRST process's
# baseline mid-run if their preflight steps interleaved at all, corrupting the very
# comparison meant to catch out-of-scope drift; (2) this is defense in depth on TOP of
# reordering AGENT-PROMPT.md's Step 0 so `lock-acquire.sh` always runs BEFORE
# `git-baseline.sh save` — the lock is what actually prevents concurrent runs, but a
# global path meant even a narrow pre-lock race window was live. Scoping by run_id means
# even if that ordering were ever violated again, two runs literally cannot clobber each
# other's baseline file.
#
# NUL-delimited throughout (`git status --porcelain=v1 -z`) — a plain newline-split
# porcelain parse breaks on filenames with spaces, quotes, or (critically) on rename
# entries, which have a different field layout ("R  old -> new") that a naive substring
# slice mis-parses entirely, silently dropping the file from the baseline.
set -euo pipefail

MODE="${1:?usage: git-baseline.sh save|check <run_id>}"
RUN_ID="${2:?usage: git-baseline.sh save|check <run_id> — run_id is required, not optional, so concurrent runs can never share a baseline file}"
BASELINE_FILE="/tmp/nightly-baseline-hashes.${RUN_ID}.txt"

hash_file() {
  local f="$1"
  if [ -f "$f" ]; then
    sha256sum "$f" 2>/dev/null || shasum -a 256 "$f"
  else
    # The path doesn't exist right now, but git status JUST reported it as needing
    # attention at this snapshot moment (deleted, or a rename target that vanished
    # again, etc.) — emit an explicit sentinel line rather than silently producing
    # nothing. Silence here is the exact asymmetric-invisibility bug found in code
    # review: a file that was CLEAN (and thus absent from git status, and thus never
    # even considered) at save-time, then DELETED before check-time, would otherwise
    # produce zero lines in both the baseline and the current snapshot — an absent
    # line looks identical to an absent line, so the deletion is invisible to `diff`.
    # Emitting a sentinel means: baseline has 0 lines for this path (it was clean, so
    # this function was never called for it at save-time) but current has exactly 1
    # ("MISSING  path"), so the two snapshots provably differ and check correctly
    # fails. A file already-dirty at save-time and later deleted still works too —
    # baseline has a real hash line, current has "MISSING", still correctly differs.
    echo "MISSING  $f"
  fi
}

compute_hashes() {
  local out_file="$1"
  : > "$out_file"
  # -z NUL-terminates each record; porcelain v1 -z format has no quoting/escaping to
  # undo (that's specifically what -z buys us) and renames appear as two NUL-separated
  # path fields after an "R " status instead of a single " -> " string — read three
  # fields defensively and just hash whichever paths are real files under our scope.
  while IFS= read -r -d '' entry; do
    status="${entry:0:2}"
    rest="${entry:3}"
    case "$status" in
      R*|C*)
        # Rename/copy: two NUL-separated paths follow this status entry as SEPARATE -z
        # records (not embedded in this one) per git's own documented -z format — so
        # `rest` here is just the "old" path; read the next NUL record for "new".
        old_path="$rest"
        IFS= read -r -d '' new_path
        for p in "$old_path" "$new_path"; do
          case "$p" in concepts/*) continue ;; esac
          hash_file "$p" >> "$out_file"
        done
        ;;
      *)
        case "$rest" in concepts/*) continue ;; esac
        hash_file "$rest" >> "$out_file"
        ;;
    esac
  done < <(git status --porcelain=v1 -z --untracked-files=all)
  sort -o "$out_file" "$out_file"
}

case "$MODE" in
  save)
    compute_hashes "$BASELINE_FILE"
    echo "Baseline saved: $(wc -l < "$BASELINE_FILE" | tr -d ' ') out-of-scope file(s) hashed." >&2
    ;;
  check)
    if [ ! -f "$BASELINE_FILE" ]; then
      echo "No baseline found — was git-baseline.sh save run at preflight? Refusing to proceed." >&2
      exit 1
    fi
    # Same run_id scoping as BASELINE_FILE, for the same reason (Gemini code review,
    # finding #5): this was still a single global path even after BASELINE_FILE was
    # scoped, leaving the exact same collision class open for the check-time snapshot —
    # a stray concurrent invocation would overwrite this file out from under a
    # legitimate run's own diff.
    CURRENT_FILE="/tmp/nightly-current-hashes.${RUN_ID}.txt"
    compute_hashes "$CURRENT_FILE"
    if diff -q "$BASELINE_FILE" "$CURRENT_FILE" > /dev/null 2>&1; then
      echo "Baseline check: no out-of-scope changes detected." >&2
      exit 0
    else
      echo "OUT-OF-SCOPE CHANGE DETECTED since preflight baseline:" >&2
      diff "$BASELINE_FILE" "$CURRENT_FILE" >&2 || true
      exit 1
    fi
    ;;
  *)
    echo "Unknown mode: $MODE" >&2
    exit 1
    ;;
esac
