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

## Build state — the product, not the tooling

Everything below this heading is infrastructure. Read this section first so you
know what the actual thing looks like, because the tooling queue has twice grown
large enough to stall the build.

- **One world exists:** `client/src/worlds/midnightGalaxy.ring.js`. The old
  21-theme list is RETIRED. There will be 7-8 themes, brainstormed from scratch
  AFTER space is finished. Do not design for, map to, or generalize toward themes
  that do not exist.
- **Engine is good and PROTECTED — do not modify:** the colour treatment, the
  star layers and size ramp, and the §7 depth mechanics. The owner named these
  explicitly as the parts that work.
- **Four objects pass full acceptance:** lit planet, asteroid field, pulsar,
  ringed planet. The ring reads as a ringed planet for the first time.
- **Eight objects are still crude** — CSS radial gradients with no edge, reading
  as smudges. A bead chain that looks like a bracelet, a capsule that looks like
  a progress bar. This is the real remaining debt.
- **Regression tier is 2/34 RED.** Safe-box luminance at st4 (mean 7.0 / p99.5
  69) and st10 (mean 6.7 / p99.5 84), against caps mean <=34 / p99.5 <=68.
  Attributed at st10 to **stars** by coordinate-verified hit test (6/8 pixels
  `.star`). **st4 attribution is UNRESOLVED** — `safebox-hit-test.mjs` computes
  p99.5 = 113 there while the gate says 69. Leading untested hypothesis: the tool
  reads raw pixels, the gate reads through the composited scrim. Proposed fix
  once attributed: clamp star PEAK luminance inside the safe box with a ramped
  boundary. Do not reduce density — mean is 7.0 against a cap of 34.
- Spec tier is 19/31 after the freeze. Bleed on 8/12 stations. Quadrant
  distribution LT=1 RT=7 LB=3 RB=1 against a 2-4 band.
- **The owner has never seen this on the actual TV.** Every judgment for weeks
  has come off a laptop at two feet, for a thing viewed at twenty. The
  perceptibility floor is still unset because that test has not been run.

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

## What's queued after Task 2 lands clean — REVISED 2026-08-09

**This supersedes the infra queue in the `f5ae9f9` / `9224b31` commit messages.**
Three items on that list were CUT after a design review. If you are reading the
old queue, you will spend your first session building a sweep driver nobody
needs.

**CUT — do not build:**

- **TASK 3, the sweep driver (`ring-sweep.mjs`).** There is exactly one queued
  sweep. One sweep is not a backlog. Run the fillMin re-sweep by hand. Build a
  driver at sweep three, if ever.
- **The visual grader.** You cannot calibrate a grader while 8 of 12 objects are
  still smudges — you do not yet know what "good" scores. Grade by eye, using the
  `ring-object-craft` skill, until those eight pass.
- **The project skill.** It would document a process still mutating. Write it in
  the first week of theme two, from what actually transferred.

**KEEP:**

- **The fillMin re-sweep, run by hand.** `ARC.fillMin` is `0.35`, chosen from
  span/rho readings on the UNFROZEN gate, with no on-disk record surviving. Five
  values against the now-frozen oracle. If 0.35 still wins, a verified number is
  gained; if not, that measures what the old noise was worth.
- **`concepts/SWEEP-LEDGER.md`** — one block per sweep, including failed and
  POISONED runs. Cheap, and it is measurement.
- **`ship.sh`: make the regression tier BLOCKING.** Currently non-blocking; a
  gate that cannot stop a ship is a log line. Leave spec-conformance advisory.

**Then go back to the build.** This is the actual priority order, and it is
higher priority than any remaining tooling:

1. **The two red regression checks.** A red referee poisons every verdict
   downstream. Resolve the st4 tool/gate discrepancy first, then clamp star peak
   luminance inside the safe box.
2. **The colour system.** Currently near-monochrome purple; the reference is
   high-chroma multi-hue. Rules, written but unbuilt: one shared near-neutral
   dark base; 3-4 hue families as LARGE spatial zones; chroma peaks in the
   midtones; emissive layers composite additively (screen / plus-lighter) while
   solid objects composite normally; prefer 2-3 large wash layers to per-element
   blending; shade by hue rotation plus saturation, not lightness. Washes sit
   BELOW the scrim. `mix-blend-mode` blends only within its stacking context and
   transforms create stacking contexts, so this needs `isolation: isolate` and an
   explicit answer to where a wash sits relative to the parallax layers. "Wash
   layer" is a NEW concept distinct from "parallax layer" and must be defined.
3. **The eight remaining crude objects.** Colour comes first: build them in the
   wrong palette and you touch all eight twice. Use the `ring-object-craft`
   skill for form work — NOT `impeccable` or `emil-design-eng`, which are
   interface and animation skills and were misapplied here before.
4. **Bleed** (8/12 stations) — partly caused by object footprints, so it follows
   the rebuilds.
5. **Quadrant rebalance** (LT=1 RT=7 LB=3 RB=1 against a 2-4 band) — cheap once
   footprints are final.
6. **The live show test.** The only acceptance that counts.

**STAYS HUMAN:** choosing target metrics and thresholds, editing the lock file or
the check code, typing any `allowedToMove` allowlist, interpreting POISONED runs,
and aesthetic acceptance. (Canonical copy of this list now lives at
`references/ring-world-continuity.md` §4 — this is the origin, not a second live source; update
there, not here.)

## The off-course detector

Added because the tooling queue has stalled the build twice.

**No round ships zero pixel change.** Capture the 12 stations at round start and
round end. If they are byte-identical, the round failed regardless of what got
refactored. Any commit touching `concepts/tools/` must name, in its message, the
visible task it unblocked. Two consecutive rounds with no pixel movement means
freeze all tooling work until pixels move.

**The generalization rule, so this does not recur:** a thing earns being made
reusable after three *manual repetitions of the same procedure, each performed
while shipping a visible change*. Not three shapes, not three anticipated sweeps.
The test is "name three commits where someone did this by hand and each changed a
screenshot." Measurement infrastructure may precede its instances; production
infrastructure waits for three.

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
