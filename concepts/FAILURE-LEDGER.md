# FAILURE-LEDGER

## This file did not exist in the repository until 2026-08-09

Three docs cite it as authoritative and tell every reader to check it before
proposing anything: `SCAFFOLD-world-ring.md` ("18 dead approaches plus the
process failures"), `HANDOFF-world-07-ring.md` ("Five prototypes died before
this one... read FAILURE-LEDGER.md in the Cowork outputs folder"), and
`HANDOFF-ring-thinktank.md`, which cites a specific line (`FAILURE-LEDGER.md:41`)
for a named defect. That citation is the tell: `HANDOFF-world-07-ring.md`
says outright that the real file lived **in a Cowork outputs folder**, never
checked into this repo. Whoever wrote `HANDOFF-ring-thinktank.md` had it open
at the time; nobody since has.

This is not being backfilled from memory. The 18 dead approaches and their
process failures are not reproduced here — a plausible-sounding reconstruction
would be worse than an honest gap, and would defeat the entire purpose of a
ledger meant to stop repeated mistakes. If that original file resurfaces (the
Cowork outputs folder, a chat export, anywhere), merge it in and keep this
notice as a dated correction rather than deleting the history of the gap.

Real, on-disk entries start below. First one: **instrument eight**, so
numbered to match the standing count referenced in-session ("the exact bug
class... has happened seven times on this project," "seven liars") — those
seven aren't individually catalogued here for the same reason the 18 aren't:
no on-disk record of them exists to cite honestly. Only what's independently
verified in this repository's own history goes in this file from here on.

---

## Instrument eight — the verification gate itself, measuring live animation frames

**Date:** 2026-08-09
**Where:** `concepts/tools/ring-verify.mjs`, every dynamic check that reads a
rendered screenshot.
**Found during:** Task 1.5, ordered specifically because a control run (same
refactored code, run twice, zero edits between runs) surfaced unexplained
diff noise while verifying the Task 1 `runChecks()` extraction was
behavior-preserving. The control run was the right instinct — it caught
something bigger than the refactor it was built to check.

### What was wrong

`page.emulateMedia({ reducedMotion: 'reduce' })` is called once, before the
per-station measurement loop, and the CSS rule it activates
(`animation-play-state: paused !important` on `.star`/`.pf`/`.pf-breathe`/
`.shoot`) looks like a freeze. It isn't one. Chromium pauses each animation
at whatever wall-clock-dependent `currentTime` it had already reached the
moment the media query took effect — and that instant varies run to run with
ordinary Node/Playwright round-trip jitter. The safe-box luminance cap mostly
hid this: forcing `--ob === --op` (the peak-forcing trick) makes opacity a
constant function of time, so which frozen instant you land on stops
mattering for THAT specific check. Every check reading the natural
(non-peak-forced) frame — ink-per-station, realised-arc, mid-share,
headline-ink — has no such accidental invariance, and moved on every run.

### Quantified (step 1 — 5 runs, unchanged code, before any fix)

Discrete/count/rank checks (quadrant, bleed count, star count, elements-per-
station, arc absolute band membership, adjacent-gap, trough-spread, occluder
placement, drawn-subject, primitive-parity, math-random, console-clean,
scrim-boundary): **zero variance across all 5 runs.**

Continuous checks reading a rendered frame — 12 of 65 checks moved:

| Check | Spread (own units) |
|---|---|
| `[html]`/`[react-live]` safe-box peak-forcing self-check (natural half) | up to 5 luma units per station |
| `[html]`/`[react-live]` safe-box luminance cap (**peak** half — the actual gate criterion) | up to 4 luma units on some stations; st4 exactly stable all 5 runs; **st10 moved once** (mean 6.7→6.8, p99.5 84→85) |
| `[html]`/`[react-live]` ink per station | ~0.1 percentage points |
| `[html]`/`[react-live]` realised arc | ~0.1 luma / ~1 percentage point off-target |
| `[html]`/`[react-live]` headline ink | ~0.1 percentage points |
| `[html]` largest element / mid-layer ink share | **up to 4.9 percentage points** |
| `[react-live]` largest element / mid-layer ink share | up to 0.6 percentage points |
| `[html]` perceptibility (signal/extent) | signal ±1, extent ~0.2pp |

The single largest mover — mid-layer ink share — sits directly on top of a
hard 55% floor. Under the freeze (below), `[react-live]` st2 measured 55.3%
pre-freeze (PASS) and 54.8% post-freeze (FAIL) in directly comparable runs —
a 0.5-point swing that straddled the threshold. **That FAIL is not a
regression the freeze introduced. It's the true, deterministic value; the
prior PASS was jitter landing on the lucky side of the line.**

### What was fixed

One shared helper, `freezeFrame(page)`, added to `ring-verify.mjs`:

```js
async function freezeFrame(page) {
  await page.evaluate(() => {
    document.getAnimations().forEach(a => { a.pause(); a.currentTime = 0; });
  });
}
```

Called once per station, immediately after `jumpTo()` and before the FIRST
screenshot that station takes (natural/mid/safe-natural/peak all inherit the
same pinned instant — one call site, not three copies). `currentTime = 0`
pins every animation to a fixed point on its own timeline instead of
wherever real elapsed time happened to leave it paused — deterministic
regardless of Node/Playwright timing, honouring each element's own
(seeded, not random) `animation-delay`. Also applied at the separate
`jumpTo()` inside the scrim-boundary check, which takes its own two
screenshots.

### Re-verified (step 3 — 5 runs, frozen, after the fix)

`node concepts/tools/noise-quantify.mjs concepts/.audit-shots/noise5-frozen`:
**`65 distinct checks, 0 show variance` — zero, all 65, all 5 runs.**
Confirmed directly on the two checks this session cares most about: st4
`mean7.0/p99.5-69` and st10 `mean6.7/p99.5-84`, byte-identical in every one
of the 5 frozen runs (previously st10 alone had moved 1-in-5).

One check's **verdict** changed as a direct, honest result of the fix, not a
side effect to paper over: `[react-live] largest element supplies >=55% of
mid-layer ink` flips from PASS to FAIL — st2 stable at 54.8% (floor 55%)
across all 5 frozen runs. Spec-conformance tier moved from 18/31 to 19/31
BELOW SPEC. This is advisory-tier, not currently ship-blocking, and it is
reported here rather than silently absorbed, per standing instruction: never
move a threshold to make something pass, and a numeric result that only
passed on luck is not a pass.

Raw evidence: `concepts/.audit-shots/noise5/run{1-5}.txt` (before),
`concepts/.audit-shots/noise5-frozen/run{1-5}.txt` (after).

### Which past conclusions this does and does not invalidate

- **Every regression-tier PASS/FAIL verdict from this session's earlier
  rounds stands.** No regression-tier check flipped under the freeze in
  either direction (still 2/34 FAIL, same two checks, same station numbers).
- **The st4/st10 safe-box attribution work (stars, direct hit-tested) stands.**
  Both stations' peak numbers are now proven stable; the earlier finding that
  bright individual star pixels vastly exceed the cap (luma up to 221 against
  a 68 cap) was never dependent on this jitter.
- **Any past sweep or comparison that read ink-per-station, headline-ink, or
  realised-arc alone is probably fine** — those checks' pre-freeze spread was
  small (~0.1 units) relative to typical decision margins.
- **The mid-layer-ink-share check specifically cannot be trusted pre-freeze**
  — its own observed spread (up to 4.9 percentage points) is large enough to
  flip a near-boundary station's verdict either direction, and did.
- **The "fillMin sweep (ink OOB 3/12 → 7/12)" and "nine-combination arc
  sweep" results referenced in this session's own instructions cannot be
  re-adjudicated from here** — no on-disk record of either sweep's run-by-run
  numbers was found in this repository (same missing-ledger problem as
  above). Ink-per-station's own measured jitter (~0.1pp) is too small to
  explain a 3→7 station swing by noise alone, so that conclusion is more
  likely real than not — but this is inference from a different check's
  noise floor, not a re-run of the original sweep, and should be confirmed by
  actually re-running it under the freeze rather than trusted on this
  reasoning alone. The nine-combination arc sweep touched realised-arc and
  (per this session's own observation, across different points in time, not
  just this 5-run batch) the realised-span/rank-correlation aggregates, which
  are exactly the metrics proven jittery pre-freeze — any conclusion there
  that hinged on a narrow margin between combinations should be treated as
  unverified until re-run.

---

## Instrument nine — safebox-hit-test.mjs, same freeze bug as instrument
## eight, unfixed in a second location

**Date:** 2026-08-10
**Where:** `concepts/tools/safebox-hit-test.mjs`, its own animation freeze
(`document.getAnimations().forEach(a => a.pause())`, called with no
`currentTime = 0`).
**Found during:** the st4 tool/gate conflict (safebox-hit-test.mjs reports
p99.5=113 at st4, the gate reports 69). Found by reading the tool's freeze
code and recognizing it as the exact instrument-eight bug, not by running any
check — confirmed afterward with direct evidence, not inferred.

### What was wrong

Instrument eight's fix (`freezeFrame(page)` in `ring-verify.mjs`) pins every
animation to `currentTime = 0` before ANY screenshot. `safebox-hit-test.mjs`
predates that fix and was never updated to use it — it only calls
`a.pause()`, which (per instrument eight's own finding) freezes each
animation at whatever wall-clock-dependent instant Node/Playwright round-trip
jitter happened to land on, not a pinned instant. This tool's whole reason
for existing is comparing its own reading against the gate's, so the two
disagreeing was never going to look like a bug in this tool specifically —
it looked like a gate/tool "discrepancy" instead.

### Calibration first (2026-08-10, this session's item 1)

Before touching either tool: 3 synthetic frames with true-by-construction
answers (single pixel, known-fraction block, flat field) run through both
tools' percentile/mean math and the signal/extent formula. **25/25 checks
passed** — both tools' math is correct, and their safe-box crop coordinates
resolve to byte-identical pixel bounds at the scale tested. This ruled out a
calculation bug before any capture happened, and pointed at a content
difference instead — matching what instrument eight already established
about the freeze.

### Measured (step 2, before fixing anything)

Captured st4 from both tools independently, same station, same forced peak
state, neither tool modified. Diffed the two screenshots pixel-by-pixel
inside the safe-box crop:

- **99.9% of safe-box pixels differ** (237,694 / 237,880). Most of that
  (193,889 pixels, ~82%) is <=2 luma units — plausible render-level noise
  across ~211 stars' worth of antialiasing, not the interesting part.
- **16,236 pixels differ by more than 5 luma units; 9,321 by more than 20.**
  Max single-pixel diff: 89 luma units (ring-verify reads 114, the hit-test
  capture reads 203 at the same coordinate).
- These large diffs are NOT scattered noise — they cluster in small (2-4px)
  blobs at specific coordinates, the signature of a point light whose
  position differs between the two captures.

### Hit-tested (step 3, still before fixing anything)

`elementsFromPoint` on the SAME live page/paused-animation state that
produced the hit-test capture, at the 5 largest-diff coordinates:
**all 5 land directly on `DIV.star`.** A control coordinate with ~0 diff
lands on non-star layer elements. This is direct evidence, not inference —
the pixels that disagree between the two tools are star pixels, exactly what
an unpinned freeze would move.

### What was fixed

`safebox-hit-test.mjs`'s freeze changed from `a.pause()` to `a.pause();
a.currentTime = 0` (same fix as instrument eight, applied to this tool's own
copy of the same logic — it does not import `freezeFrame` from
`ring-verify.mjs`, so the fix had to be applied here directly).

### Re-verified (step 4) — the fix did NOT resolve the st4 conflict

After the fix, station 4, 5 runs: **p99.5 = 113, unchanged, and now
byte-identical across all 5 runs** (previously unverified whether it was
even stable run-to-run within one page instance — now confirmed stable,
just not correct). This is a real, useful result, reported honestly rather
than made to look like closure: the currentTime=0 pin is a genuine fix (this
tool's own repeated-run stability was never actually proven before, and now
is), but it is NOT what explains the 113-vs-69 gap. Something else does.

**A prior version of this entry stated `p99.5 = 69` here before step 4 had
actually been run.** That was wrong to write — an unrendered claim stated as
fact, exactly what this project's own standing rule ("render before you
claim") exists to prevent. Correcting it now rather than leaving it: the
number was never measured at 69, it was predicted, and the prediction was
wrong.

### What step 2/3's own evidence rules out, now that the fix didn't land

The diffing pixels (step 2) land on `.star` (step 3), and peak-forcing
(`--ob := --op`) is supposed to make star opacity time-invariant regardless
of freeze instant — per this file's own instrument-eight section and the
comments in both tools. If that's true, `.star` opacity was never the
variable, which fits step 4's result (pinning currentTime didn't change
anything) but reopens the question of what About those `.star` pixels
differs. Two candidate mechanisms noticed while reading (NOT verified — do
not treat either as the answer without the same calibrate-first discipline
item 2 just used):

- `ring-verify.mjs` calls `page.emulateMedia({reducedMotion:'reduce'})`
  before its per-station loop; `safebox-hit-test.mjs` never calls it. World-
  07's `spawnShoot()`/`shootLoop()` checks `isReduced()` and no-ops under
  reduced motion — so the gate's page can never spawn a `.shoot` element
  during measurement and the hit-test tool's page can, on its own
  wall-clock timer, independent of station or freeze. (The 5 largest diffs
  hit-tested as `.star`, not `.shoot`, so this doesn't explain THOSE specific
  pixels — but it's a real, unexamined determinism gap in its own right.)
- `ring-verify.mjs` reaches station 4 by first driving `window.__world.turn()`
  36 times (real, un-frozen, `reducedMotion` OFF during that phase) then
  calling `jumpTo(s)` for stations 0..3 in sequence before 4.
  `safebox-hit-test.mjs` calls `jumpTo(4)` once, directly, from a fresh page
  load — no 36-turn drive, no intermediate per-station stops. `jumpTo`'s own
  offset arithmetic is additive/order-independent, so this may be a red
  herring — but per-station side effects inside intermediate `jumpTo`/`turn`
  calls (if any) were not checked, and the 36-turn phase runs with real
  motion for a long time before the gate ever freezes anything.

Neither is confirmed. Both would need the same treatment step 2 just gave
the freeze hypothesis — capture, diff, hit-test — before being trusted.

### Both candidates tested in isolation, one at a time (2026-08-10)

Predictions stated first, one throwaway script per test (copy of the
currentTime=0-fixed tool, exactly one variable changed), 5 runs each,
deleted after use, never combined.

**Test A — reducedMotion.** Predicted: p99.5 stays at 113 (peak-forcing
should already be motion-state-invariant, and the diffing pixels hit-tested
as `.star`, not `.shoot`). Added `page.emulateMedia({reducedMotion:'reduce'})`
before `jumpTo(4)`, navigation path unchanged (direct jump from fresh load).
**Actual: p99.5 = 113, all 5 runs, unchanged.** Prediction correct.
Hypothesis A ruled out.

**Test B — navigation path.** Predicted: moves substantially toward 69,
plausibly landing at or very near it. Replaced the single `jumpTo(4)` with
the gate's real path — 36 real `turn()` calls (`reducedMotion` off, matching
the gate's drive phase, `SURGE_MS+200`ms wait each, ~68s total) then
`jumpTo(0)`, `jumpTo(1)`, `jumpTo(2)`, `jumpTo(3)`, `jumpTo(4)` in sequence,
no `emulateMedia` call anywhere (isolated from test A).
**Actual: mean = 7.0, p99.5 = 69 — exact match to the gate, all 5 runs
identical.** Hypothesis B confirmed. The offset arithmetic itself is
order-independent as suspected, but SOMETHING that happens during the
36-turn drive and/or the intermediate per-station stops changes what's on
screen at station 4 — not yet isolated further than "the path itself,
undifferentiated between the drive phase and the sequential jumps."

### What was fixed

`safebox-hit-test.mjs` changed to reach its target station via the same
real path the gate uses (36-turn drive + sequential `jumpTo` through every
intervening station) instead of a single direct `jumpTo(target)` from a
fresh load. Narrowest fix matching the identified mechanism — no threshold
moved, no colour/star channel touched, nothing dimmed; the tool now walks
the same path the gate always walked. Predicted post-fix reading: p99.5 = 69,
mean = 7.0, matching Test B exactly (Test B **is** this fix, run once
already as an isolated experiment). The mean drop from 10.4 (direct-jump,
pre-fix) to 7.0 (real-path, post-fix) is not a dimming side effect of the
fix — it's the tool now measuring the same real content the gate measures;
Test B established that number independently before the checked-in tool was
touched.

### Which past conclusions this does and does not invalidate

- The st4/st10 star-attribution work (direct hit-tested, instrument-eight
  era) stands — it was never based on this tool's un-pinned reading.
- **The st4 tool/gate conflict is RESOLVED, not by a math or freeze fix, but
  by a real difference in how the two tools reached the station.** st4's
  true safe-box overage is 69 vs a cap of 68 — 1 point over, not 45.
  Everything upstream of this ledger entry that assumed a 45-point overage
  at st4 (any of this session's or the handoff's framing of it as a large
  gap) should be treated as superseded by this measurement.
- The exact accumulated-state mechanism (drive phase vs. intermediate stops)
  is still unresolved at the mechanism level, only at the "which variable"
  level — do not extend this finding into a specific claim about occluders,
  star regeneration, or anything else without testing that claim the same
  way.
