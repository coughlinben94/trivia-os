# HANDOFF — ring gate sentinel (TASK 2), stopped mid-verification

**Date:** 2026-08-09. Stopped by explicit user request ("stop the shell, give
a handoff") mid-run, not because of a blocker — the work was going fine, just
needed to hand off to a fresh agent/session.

## Read first

1. `concepts/FAILURE-LEDGER.md` — "instrument eight," the gate
   non-determinism bug this whole thread of work is downstream of. Read this
   before touching anything below; it explains why a sentinel is needed at
   all.
2. This file.
3. `git log --oneline -10` in this repo for the full recent sequence:
   `a723faa` (latest) back through `b9ac8a7`. Each commit message is
   detailed — they're the actual record, not just this doc.

## Where things stand right now (verified, not assumed)

- `concepts/world-07-ring.html` is at its baseline `fillMin:0.35`. **Verified
  clean** — `git status --short` shows no diff on this file, confirmed
  immediately after stopping the background process. No cleanup needed.
- `git log` HEAD is `a723faa` — a small, complete, already-committed fix
  (pointer comment at the mid-share check site, per user's Note 2 this
  round). Nothing else from this round is committed.
- `concepts/tools/sweep-sentinel.mjs` — **new, untracked, code complete**.
  Exports `runSentinel({measure, applyKick, restore, direction, floor, label})`
  implementing the a/noise-floor, b/kick, c/restore sequence the user
  specified. Hardened this round (see "bugs found" below) so a throwing
  `restore()` can never crash the caller uncaught.
- `concepts/tools/sentinel-selftest.mjs` — **new, untracked, code complete,
  bugs fixed, but the FIXED version has not yet completed a full clean run.**
  This is the actual gap to close.

## What's proven vs. not

**Proven** (real run, `concepts/.audit-shots/sentinel-selftest.txt`, the
FIRST attempt, before fixes):
- Noise floor step works and is genuinely zero: `measure()` #1 and #2 both
  read `2.12x` exactly, epsilon=0, confirming the 2026-08-09 `freezeFrame`
  fix (instrument eight) holds under direct sentinel use, not just the
  standalone noise-quantify check.
- The kick step's DIRECTION LOGIC works correctly: it kicked `ARC.fillMin`
  0.35→0.55 and measured `1.94x` (down from 2.12x). My original assumption
  (`direction: 'up'`) was wrong — raising `fillMin` raises the floor under
  quiet stations, which *compresses* the loud/quiet gap, so the realised-span
  ratio goes DOWN, not up. The sentinel correctly detected this mismatch and
  reported a kick failure instead of a false pass. This is the sentinel doing
  exactly its job — catching a bad assumption, not a sentinel bug.

**Broke, then fixed, not yet re-verified with a full run:**
- The kick-failure path calls `restore()`. My `sentinel-selftest.mjs`'s own
  `setFillMin()` helper had a guard bug — `!src.includes(BASELINE) && text
  === BASELINE` — that is true (and threw) on EVERY restore-to-baseline call
  by construction (the file never contains BASELINE text right before a
  restore; that's the whole point of restoring). The throw propagated out of
  `runSentinel` uncaught and crashed the process, **leaving
  `world-07-ring.html` sitting at the kicked `fillMin:0.55` on disk**. Caught
  immediately via `git diff`/`git status`, reverted with `git checkout --
  concepts/world-07-ring.html`, confirmed clean.
- Fixed the guard: correct check is "throw only if the file contains NEITHER
  known value" (see the corrected comment in `setFillMin()` — it documents
  its own bug for whoever reads it next).
- Also hardened `sweep-sentinel.mjs` itself: every `restore()` call now goes
  through an internal `safeRestore()` wrapper (try/catch), so a broken
  `restore()` in ANY future caller (the real sweep driver included) produces
  a typed `{pass:false, failedStep:'restore', restoreOk:false, reason}`
  instead of an uncaught crash that skips whatever safety net the caller
  had planned to run after (which is exactly what happened here — the
  self-test's own bottom-of-file safety-net re-check never got a chance to
  run, because the crash happened before reaching it).
- Also corrected `sentinel-selftest.mjs`'s expected direction to `'down'`
  (empirically confirmed, see above) so the NEXT run should reach step (c)
  and actually exercise restore-on-success, not just restore-on-failure.

Re-ran once after both fixes (`concepts/.audit-shots/sentinel-selftest-2.txt`)
but the process was stopped (per this handoff request) partway through —
output shows only `measure() #1: rendered 2.12x` before termination, i.e. it
was stopped during the noise-floor step's SECOND measurement, **before
`applyKick()` ever ran**. Nothing to clean up from that run either — confirmed
via the same `git status` check above.

## Exact next step

```
cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os
node concepts/tools/sentinel-selftest.mjs
```

Takes ~10-12 minutes (4 full `runChecks()` passes — noise-floor x2, kick x1,
restore-confirm x1; each pass drives the full 36-turn arithmetic sequence
plus all 12 stations, same cost as one `npm run verify:ring` html-only pass).
Run it via a backgroundable shell with a long timeout, don't block on it
synchronously.

**Expected clean result**, given the fixes above and the first run's real
numbers: noise-floor epsilon=0, kick delta ≈ `1.94 - 2.12 = -0.18` (well past
the `-0.02` floor in the `'down'` direction), restore reproduces `2.12x`
exactly. Exit code 0, `result.pass === true` printed as JSON.

**If it does NOT come back clean**, do not paper over it — that's real
signal about either the sentinel module or the freeze fix, and this project
has been burned exactly that way seven-plus times (`FAILURE-LEDGER.md`).
Read the JSON `reason` field, it's written to explain the specific failure
mode (noise-floor nonzero / kick didn't move enough / restore didn't
reproduce / restore threw).

**After a clean pass:** commit `sweep-sentinel.mjs` and
`sentinel-selftest.mjs` together, with the real numbers from the clean run
in the commit message (this project's own convention throughout this
session's commits — every commit cites the actual measured numbers, not
"tests pass").

## What's still queued after Task 2 lands clean

Per the standing infra-round instructions (see git log, especially the
messages on `f5ae9f9` and `9224b31` for full context):

- **TASK 3** — `concepts/tools/ring-sweep.mjs`. Design already specified in
  conversation, not yet started: pure-code inner loop, imports `runChecks()`
  from `ring-verify.mjs` (never forks it — that's the whole point of Task
  1's refactor), coordinate descent over coarse grids (5-7 values/parameter)
  plus one refinement pass, hash-fence over `ring-spec.lock.json` + the check
  code re-verified every iteration (any drift → POISONED, abort), writes
  `restore.json` before iteration 1, appends each iteration to JSONL BEFORE
  evaluating the result, halts immediately on any previously-green check
  going red, human-typed `allowedToMove` allowlist printed in the report
  (never defaults), proposes only — writes `sweep-result.json` with
  `applied:false`, never wired into `ship.sh` or `verify:ring` directly.
  **No sweep may start without a green sentinel** — that's this file's whole
  reason for existing.
- **First real sweep target once the driver works**: `ARC.fillMin`, currently
  `0.35`. It was chosen from span/rho readings on the UNFROZEN gate; no
  on-disk record of that original sweep survives. Re-run it against the now-
  frozen oracle. If 0.35 still wins, nothing lost, a verified number gained.
  If not, that tells you how much the old noise was worth.
- Visual grader (two-grader design: numeric loop, then a one-shot visual
  grade gate — blind pass naming the silhouette, rule pass, comparison
  pass against st9's ring [known good] and a blob [known bad], calibration
  entries in every run, ship/revise/reject verdict).
- `concepts/SWEEP-LEDGER.md` — one block per sweep run: date, target, space
  searched, iterations, best value+metric, guard status, applied yes/no,
  run-dir path. Include POISONED and failed runs.
- The project skill (skill-creator, written LAST, after 1-5 all work) —
  four engine channels, nine house rules with tests, budgets, clean-room
  rule, named parts, both loops (numeric + visual). Cross-link from the
  `trivia-os` skill, don't fold in, don't put in `round-journeys.md`.
- Separately, in `ship.sh`: make the regression tier BLOCKING (currently
  non-blocking — "a gate that cannot stop a ship is a log line"). Leave
  spec-conformance advisory.
- STAYS HUMAN (encode in the eventual skill): choosing target metrics/
  thresholds, editing the lock file or check code, typing the
  `allowedToMove` allowlist, interpreting POISONED runs, aesthetic
  acceptance.

Also still open from earlier rounds, lower priority than the above: bleed
fix (st5/st8/st10/st1), quadrant rebalance (LT=1 RT=7 LB=3 RB=1 against a
2-4 band), new headline nouns for st0/st8's duplicate nebula.

## Housekeeping notes for whoever picks this up

- The working tree has **unrelated concurrent changes** present throughout
  this session that are NOT mine and were never touched: `SKILL.md`,
  `concepts/HANDOFF-world-07-ring.md`, `concepts/SCAFFOLD-world-ring.md`,
  `references/round-journeys.md`, `references/themes.md`, a deleted
  `references/ambient-design-law.md`, and a new `references/ring-world-
  mistakes.md`. Check `git status` fresh before assuming this file's picture
  is still current — someone else (another session) is actively working in
  this same repo.
- `concepts/.audit-shots/` is gitignored (screenshots + raw run logs live
  there, never deleted, never committed) — the sentinel self-test's raw
  output (`sentinel-selftest.txt`, `sentinel-selftest-2.txt`) and the 5x
  noise-baseline runs (`noise5/`, `noise5-frozen/`) are all there for
  reference.
- Standing rules for this whole thread of work, unchanged: render before you
  claim, keep screenshots, label anything unrendered unverified, never move
  a threshold to make something pass.
