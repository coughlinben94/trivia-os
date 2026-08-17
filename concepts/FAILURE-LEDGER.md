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

---

## St10 safe-box attribution — hit-test topmost-element claim vs. actual
## light contribution, not yet reconciled

**Date:** 2026-08-10
**Where:** `concepts/tools/safebox-hit-test.mjs`'s attribution method, as
applied to station 10.
**Found during:** item 3 (star peak luminance clamp), while predicting the
clamp's expected effect before building it.

### What was measured

Using the now-path-fixed `safebox-hit-test.mjs` machinery (36-turn drive +
sequential jumpTo, same as the gate), station 10's safe box measured with
`.star` elements hidden entirely (`display:none`, diagnostic only, nothing
persisted, page discarded after):

- **st10, stars hidden: mean=6.6, p99.5=81** (cap: mean<=34, p99.5<=68 — 13
  points over, with ZERO stars present).
- **st10, stars visible (real numbers going into item 3): mean=6.7,
  p99.5=84** — only ~3 points higher than the stars-hidden reading.

One of the near-p99.5 sample points (coordinate-verified, `elementsFromPoint`
at the actual pixel) landed on a 181x181px `svg.d-glow` element — the shared
glow layer `makePrim()` attaches to drawn headline primitives (blob, spikes,
lens, dots, ring, etc. — `ringPrimitives.js:1009`), not a star. Station 10's
own headline primitive is `spikes` (per ring-verify's drawn-primitive check).

### The conflict, stated plainly, not resolved

This directly conflicts with the standing attribution this project has
carried since instrument-eight-era work: "st10 attributed to stars by
coordinate-verified hit test (6/8 pixels `.star`)." That attribution is not
being overturned here — both readings are real measurements, taken by the
same *kind* of method, and they disagree on what dominates.

**The specific gap, named rather than papered over:** `elementsFromPoint()`
reports the TOPMOST element at a pixel — which DOM node is hit-testable
there — not which element is the actual SOURCE of that pixel's brightness
under CSS's additive/layered compositing. A `.star` can sit visually on top
of a bright `.d-glow` (a box-shadow or gradient glow paints through/under an
overlapping element without being hit-testable itself — the same
box-shadow-invisible-to-elementsFromPoint issue instrument nine's own tool
comment already half-acknowledges for glow halos) and get reported as "the"
contributor at a pixel whose brightness is really the glow underneath, or
partly both. The 6/8-star finding and the 81-with-stars-hidden finding could
both be locally true at different sample points and still describe a safe
box whose overall p99.5 is jointly produced by both element classes — the
existing hit-test method cannot distinguish "sits on top of" from "is the
source of" without additive-decomposition, which it does not do.

### What this does NOT resolve

- Not re-attributing st10. Not claiming the 6/8-star finding was wrong.
- Not claiming `.d-glow`/the spikes headline is definitively "the real
  cause" of the 13-point stars-hidden overage either — only that it is
  PRESENT and non-star, coordinate-verified at one sample point, and that
  removing stars entirely leaves most of the overage in place.
- **A peak-luminance clamp on headline-primitive glow (`.d-glow` or
  similar), separate from the star clamp, is a distinct, later,
  separately-scoped item — not authorized as part of this round's
  star-only clamp, and not started here.**

### Scope for the current round

Item 3 proceeds on **st4 only** — background-alone at st4 measures
p99.5=68 (right at cap) vs. 69 with stars, meaning stars are the whole
1-point overage there and a star clamp is sufficient. St10 is left FAIL,
unresolved, explicitly out of scope for this round.

---

## Item 3 — star peak clamp built, st4/html fixed, two new open issues
## (react-live gap, peak-forcing self-check regression) — NOT shipped

**Date:** 2026-08-10
**Where:** `client/src/lib/ringPrimitives.js` (`buildStars` — added `--opBase`;
new `clampSafeBoxStarPeaks`), `concepts/world-07-ring.html` (`jumpTo`/`land`),
`client/src/components/display/RingAmbient.jsx` (`jumpTo`/`unlock`).

### Predicted before building

St4 only (st10 explicitly out of scope, see the entry above this one): mean
stays ~7.0, p99.5 -> 68, matching the stars-hidden diagnostic floor already
measured. Mechanism: ramped ceiling on `--op` (never `--ob`, never count/
size/colour), computed from `--opBase` (the true authored peak, written once
at build and never touched again) every time the ring moves, scoped to stars
whose CURRENT on-screen position (read via `getBoundingClientRect()`, not
derived from offset arithmetic) falls inside `engine.SAFE`, ramped over an
80px (authored-space) margin from the box edge so there's no hard line.
`MAX_SAFE_OP = 0.30` was a starting guess, stated as a guess, not derived
analytically — the luma-from-opacity relationship isn't simple linear alpha-
over-background here (glow box-shadow and layered wash content both
contribute), so this was always going to need empirical tuning.

### Measured

**St4, html, 5 runs:** mean=6.9, p99.5=68 — matches the prediction exactly,
first try (no MAX_SAFE_OP retuning needed), stable across all 5 runs.

**St4, react-live, full regression run: mean=6.8, p99.5=69 — still 1 point
over cap.** The same shared `clampSafeBoxStarPeaks` function is wired into
RingAmbient.jsx's `unlock()`/`jumpTo()`, same as world-07-ring.html's
`land()`/`jumpTo()`, but does not fully reproduce the html build's result.
Not root-caused. Candidate difference (untested): React's render/commit
timing relative to when `unlock()`/`jumpTo()` fire and when
`getBoundingClientRect()` is called inside them — if a layout read happens
before React has committed whatever triggered it, the rect could be stale.
This is a guess, not a finding — flagging it as the next place to look, not
as an answer.

**St10 (both builds), side effect of the general (not station-scoped)
mechanism, not a fix:** html p99.5 84->82, react-live p99.5 83->83
(unchanged within measurement noise). Still massively over cap (68), exactly
as scoped — st10 needs the separate, unauthorized headline-glow work noted
in the entry above this one.

**Mean, all 12 stations, both builds:** largest shift measured was 0.1 luma
units (e.g. st4 html peak-mean 7.0->6.9), matching instrument eight's own
documented ~0.1-unit measurement noise floor for continuous checks — not
distinguishable from noise, not evidence of a global dimming pass. Full
before/after table checked station-by-station, not spot-checked.

### New regression-tier failure, not present before this round

Full 34-check regression tier (both builds) after the clamp: **4/34 FAIL**
(previously this round started from what would have been 2/34 — html cap
and react-live cap, both blaming st4+st10). The safe-box cap checks
improved (html now blames st10 only; react-live still lists st4+st10 per
the unresolved react-live gap above). But **`safe-box peak-forcing
self-check (peak must be measurably brighter than natural)` — previously
PASS on both builds — now FAILS on both**: html at st4,st6,st8,st11;
react-live at st4,st5,st6,st8,st11. Natural and forced-peak readings are
now identical (or, at st8, peak reads slightly DARKER than natural) at
those stations.

**Mechanism, understood, not yet decided on:** peak-forcing sets `--ob :=`
whatever `--op` currently computes to. The clamp narrows a station's
in-box stars' `[--ob, --op]` interpolation range. Each star's animation
runs from a random NEGATIVE `--td` delay (seeded, per-star) — `freezeFrame`
pins `currentTime = 0`, which lands each star at an essentially random
point in its OWN cycle, not necessarily the low end. With the range now
narrower for clamped stars, it's more likely that a station's specific
few stars near the cap threshold have their random natural-phase value
already at or near the (now-lower) clamped ceiling — making forced-peak
and natural genuinely indistinguishable for the pixels that set the box's
aggregate mean/p99.5, even though other stars in the same box DID change.
This is a real structural consequence of narrowing the range, not a silent
no-op bug (peak-forcing still measurably works at 8 of 12 html stations) —
but it is a genuine self-check regression this round introduced, and this
self-check exists specifically to catch "peak-forcing quietly does
nothing" as a class of failure, which is exactly what it's now correctly
flagging as *possible*, whether or not it's a real problem for the product.

### Status: NOT committed

Both open issues (react-live's incomplete clamp, the peak-forcing
self-check regression) are unresolved. Per this project's own standing
rule (never move a threshold, never paper over a red check), neither gets
silently absorbed. Reported to the user rather than decided unilaterally —
this touches how the self-check should treat a narrowed-but-legitimate
range, and diagnosing the react-live gap needs a decision on how deep to
go into React-specific timing, both judgment calls beyond "clamp star peak
luminance inside the safe box."

---

## Item 3 continued — `--op < --ob` inversion bug: wrong theory first,
## corrected theory, fix applied, self-check only partially recovers

**Date:** 2026-08-10
**Where:** `client/src/lib/ringPrimitives.js`, `clampSafeBoxStarPeaks`.

### Theory 1 (WRONG) — random phase coincidence

First explanation offered for the peak-forcing self-check regression
(previous entry): narrowing a star's `[--ob,--op]` range makes it more
likely its random negative `--td` delay places `currentTime=0` (the
natural/frozen reading) coincidentally at the same value as the new,
lower forced peak. Stated as the mechanism at the time. **This was not
the real cause**, or at least not demonstrated — it was reasoning from
the check's symptom, not from a direct measurement of the property
values involved.

### Theory 2 (CORRECTED, measured directly) — `--op` pushed below `--ob`

`STAR_ALPHA_FLOOR = 0.28`; each star's own `--ob` is `0.28 + r()*0.14`,
range **[0.28, 0.42]**. The clamp's `MAX_SAFE_OP = 0.30` sits BELOW most
of that range. Checked directly (throwaway diagnostic, station 4, real
path): **26 of 50 in-box stars had `--op < --ob`** after the original
(`min(opBase, rampCeiling)`, no floor) clamp — e.g. one sampled star read
`ob=0.41, op=0.30`. CSS interpolates between whatever two numbers are
set regardless of which is semantically "low"/"high," so an inverted
star's real animated peak during normal (non-gate, un-forced) playback is
its ORIGINAL, uncapped `--ob` — the clamp did not actually reduce that
star's real peak brightness at all. This is the real mechanism; theory 1
is superseded, kept here rather than deleted per this file's own
correction convention.

### Fix

`effectiveCeiling = Math.max(rampCeiling, ob)` — the ramped ceiling can
still push `--op` down, but never below the star's own `--ob`. Range can
collapse to zero width (a deep-in-box star ends up with `op === ob`
exactly, no breathing amplitude) but never inverts.

### Predicted before remeasuring (explicitly stated as a range, not forced)

St4 html: mean ~6.9-7.0, p99.5 likely 68-69. St4 react-live: similar,
likely 69-70. St10: drifts back toward ~83-84 (less suppression than the
buggy, over-aggressive clamp). Explicitly not tuned to land on 68.

### Measured

**St4 html: mean=6.9, p99.5=68 — numerically IDENTICAL to the buggy
version.** St4 react-live: mean=6.8, p99.5=69 — also identical to the
buggy version. St10: html mean=6.7/p99.5=82, react-live mean=6.6/p99.5=83
— both within 1-2 points of the buggy version's numbers, not the
predicted drift back to 83-84 (close, but the cap-check figures barely
moved at all, in either direction).

**Why the cap-check numbers didn't move despite a real underlying fix:**
peak-forcing (both in `ring-verify.mjs` and `safebox-hit-test.mjs`) sets
`--ob := (current computed --op)` — it reads and overwrites based on
whatever `--op` is AT THAT MOMENT, discarding the star's true original
`--ob` entirely for measurement purposes. This makes the gate's own peak
reading structurally blind to whether `--op` and `--ob` were ever
inverted — it always measures `--op` as "the peak," never surfacing that
a real, un-forced viewer might see a brighter true peak (`--ob`) for an
inverted star. The fix is real (verified: no more inverted stars), but it
is only visible in the NATURAL (un-forced) reading, not in what the cap
check reports.

**Self-check: partial recovery, not full.** Predicted (previous entry)
that st4/6/8/11 (html) and st4/5/6/8/11 (react-live) would flip back to
PASS. Actual: **st6 (html) and st5+st6 (react-live) recovered. St4, st8,
st11 remain FAIL on both builds** — `NO EFFECT: st4,st8,st11` on both.

**Why those three don't recover, and it isn't a residual bug:** at those
stations, the deepest in-box stars now hit `effectiveCeiling = ob`
exactly (since `ob` there exceeds the ramped ceiling), meaning
`op === ob` — a valid, zero-width range. There is genuinely NO breathing
amplitude left to force for those specific stars, so natural and
peak-forced readings are legitimately, correctly identical. The
self-check's own assumption ("any station with in-box content should
show a measurable forcing effect") is now violated by design at these
three stations, not by a leftover defect.

**Spec-conformance tier: unchanged, 19/31 BELOW SPEC, identical list, both
before and after this fix.** No check outside the safe-box/peak-forcing
pair moved.

### Status

Committed `19acae6` — real fix (inversion eliminated, verified by direct
property inspection: 26/50 -> 0/50 in-box stars inverted at st4), the
self-check's partial-recovery numbers, and this file's own two theories
(wrong, then corrected). St10 stays parked, unchanged, separately scoped.

---

## React-live 1-point gap (st4 p99.5=69 vs html's 68) — one bounded test,
## ruled out, gap still open

**Date:** 2026-08-10

**Predicted before running:** unlikely to help — the gate calls
`freezeFrame` immediately after `jumpTo()` with no wait, for react-live
same as html, so a `requestAnimationFrame`-deferred clamp callback would
not have fired before measurement.

**Test:** `RingAmbient.jsx`'s `jumpTo()` changed from a synchronous
`dom.clampSafeBoxStarPeaks(...)` call to `requestAnimationFrame(() =>
dom.clampSafeBoxStarPeaks(...))`, one attempt, full regression tier re-run.

**Result: st4 react-live mean=6.8, p99.5=69 — numerically IDENTICAL to
before the change.** Prediction correct. Reverted immediately (not
committed) — the deferred version adds a real race risk (whether the rAF
fires before the gate measures) for zero benefit.

**Status: gap still open, cause not diagnosed.** The rAF-timing hypothesis
is now ruled out, not just unconfirmed. Whatever separates react-live's
clamp effectiveness from html's — same shared function, same call sites
relative to `writeOffsets()`/`jumpTo()` — is something else: a genuine
numeric difference (scale, offset, or rect values differing between the
two builds) rather than a timing/ordering one. Next place to look, if this
gets picked up again: diff the actual `--op` values the clamp computes on
each build at st4, not just the final rendered luma — that would show
whether the CLAMP disagrees between builds (a real per-build numeric
difference) or whether something downstream of it does.

---

## Instrument ten — `ring-verify.mjs`'s react-live pass silently measures whatever is on port 5173, including another worktree

**Date:** 2026-08-16
**Where:** `concepts/tools/ring-verify.mjs`, `ensureViteServer()` (~line 1315).
**Found during:** the `ring-sky-lean` branch (sky-region rework replacing the
per-station wash), while taking the mandatory before/after gate readings.

### What was wrong

`ensureViteServer()` reuses an already-running dev server if anything answers
`http://localhost:5173/`, and only spawns its own if nothing does:

```js
if (await isUp(base + '/')) return { proc: null, url: base + '/ambient?ring=1' };
```

It never checks that the server it found is serving **this** checkout. This
repo routinely has several git worktrees open at once (13 live at the time of
writing) and a dev server left running in any one of them wins the port. In
this session the responder on 5173 was the MAIN checkout, sitting on branch
`ring-scaffold-absorption` — whose ring files differ from `origin/main`,
`client/src/worlds/midnightGalaxy.ring.js` among them. So every
`[react-live]` number in both the "before" and the "after" run described a
codebase neither run had edited. The `[html]` pass is unaffected: it takes an
explicit file path argument, so it always reads the file it was pointed at.

This is the same family as instruments 1-9 — the number was wrong because the
instrument was measuring the wrong thing, not because the design was wrong.
The specific hazard here is that it fails **silently and plausibly**: a
foreign worktree's ring code produces numbers in the same range, so nothing
in the output looks off. It only surfaced because the borrowed server
happened to throw (`window.__world` never appeared within 8s) and the pass
reported `[react-live] pass FAIL — threw: Cannot read properties of undefined
(reading 'station')` instead of quietly returning plausible values.

### How this session worked around it, without editing the gate

Editing the gate is STAYS-HUMAN (`references/ring-world-continuity.md` §4:
check code, thresholds, allowlists). Instead, the react-live pass was re-run
against a vite server started in the correct worktree on port 5174, by
**importing** `runChecks` from `ring-verify.mjs` rather than forking any of
its logic (`ring-world-mistakes.md`: "a sweep/tuning tool must import the
exact same check code the gate runs, never a fork"). Same checks, same
prefix (`ring-`), different `gotoUrl`.

### Open for Ben — not decided here

Options, none applied:

1. Have `ensureViteServer()` verify the responder belongs to this checkout
   (e.g. fetch a known source file through the dev server and compare it to
   the on-disk copy) and refuse rather than borrow it.
2. Always spawn its own server on an ephemeral port and never reuse 5173.
3. Leave it and make the reuse loud — print which server it attached to and
   whether it spawned it.

All three change check code, so they need Ben's sign-off. Until one lands,
**anyone taking a react-live reading in a worktree must confirm nothing else
holds 5173 first** (`lsof -nP -iTCP:5173 -sTCP:LISTEN`), or point `runChecks`
at their own port as above.

---

## St9 bleed, html 50% vs react-live 14% — NOT an instrument bug: a real,
## single-station content drift (the spanning asteroid field never synced)

**Date:** 2026-08-16
**Where:** `client/src/components/display/RingAmbient.jsx`, the station loop's
headline block.

### The disagreement, as reported

`npm run verify:ring` on `origin/main` (576b814): `[html] st9=50.0%` bleed,
flagged `ACCIDENTAL CLIP (>35%)`, centroid x=1920; `[react-live] st9=14.0%`,
in band, centroid x=327. Same station, same shared `ringPrimitives.js`, same
`midnightGalaxy.ring.js` station data, opposite sides of the frame. Carried
for several sessions as "measurement tools disagreeing," never investigated.

### Root cause — read, then rendered, then confirmed by construction

`concepts/world-07-ring.html` has an `isSpanningField` branch (added
2026-08-12, Ben: "half on one slide half on another") that touches the st9
headline in FOUR places: `hw = lerp(900,1300,rHeadline())` (line 630),
`hh = hw*0.42` (653), `headLeft = (x0+ENGINE.W) - hw/2` (690, centred ON the
st9/st10 boundary), and `bandY(..., isSpanningField)` as `skipMinBleed` (771 —
bandY's own comment already documents this exemption by name). **None of the
four ever reached `RingAmbient.jsx`.** Every other flag from that same round
(cornerLeft, bandUpper, greenWash, companionBoost, fillCorner…) did, each with
a "synced from world-07-ring.html" comment. This one branch was missed.

So the two builds were drawing genuinely different objects at st9: html a
986x414 field straddling the boundary, react-live a 641x438 corner-hugged
field at the top-LEFT. Confirmed by rendering both at rest on st9 and looking
at the PNGs, not by reading code alone — react-live additionally stacked the
`fillCorner` planet directly under its own headline (that filler exists
*because* the spanning field vacates st9's bottom-left; without the spanning
field it just crowds the same corner), leaving the right half of the frame
bare. Zero-indexed throughout: st9 = `stations[9]` = `asteroid field`.

### Which number is right

**Neither instrument is wrong.** Both passes measured, correctly, what their
own build actually renders. Independently re-derived with a throwaway script
that does its own bbox/clip math (not `ring-verify.mjs`'s), same drive path,
same freeze: html cx=1920.0 / 50.0%, react-live cx=327.1 / 14.0% — exact
match to the gate on both. All ELEVEN other stations report byte-identical
bleed AND centroid across the two passes on `origin/main`; only st9 differs.
A coordinate-space or timing bug in one pass could not be that selective.

Also worth naming: the 50% is not a defect either. `ART-DIRECTION-SPEC.md:134`
says "any crop outside that band **or outside a declared bleed** is an
accidental clip" and §12's element schema carries a `bleed?` field — but
`ring-verify.mjs` check 16 has no declared-bleed path, so a deliberately
spanning element can only ever print `ACCIDENTAL CLIP`. Adding that path is
gate pass/fail logic — **STAYS HUMAN**, not touched here.

### The fix

The four-part branch ported verbatim into `RingAmbient.jsx`, including the two
properties that matter for reasons other than geometry: the spanning `hh`
consumes NO `rHeadline()` draw and `headLeft` bypasses `cornerX()` — get
either wrong and st9's whole downstream seeded stream desyncs from the
reference build (the 2026-08-08 bandY/companion bug, same shape).

**Measured, all 12 stations, both builds, pre- and post-fix:** exactly one
line moves. `react-live st9 [6.4,-61.3,647.8,376.5] cx=327.1 bleed=14.0%` ->
`[1427,35.9,2413.1,450] cx=1920.0 bleed=50.0%` — byte-identical to the html
build's own st9 box. No other station's headline box changes by a single
pixel, in either build. Screenshots re-taken after the fix: the two builds'
st9 frames now read the same.

### Instrument ten — a concurrent session's vite silently swapped the
### [react-live] pass's target mid-run

A first post-fix `verify:ring` run showed react-live numbers moving at st0,
st3, st7, st10, st11 — stations the fix cannot reach. Cause: `verify:ring`'s
`ensureViteServer()` **reuses whatever is already listening on the hardcoded
port 5173**, whoever started it. Another Claude Code session in a different
worktree ran `pkill -f "vite --port 5173"` and started its own; the gate's
react-live pass then measured THAT worktree's `RingAmbient.jsx`, logging only
5 `ERR_CONNECTION_REFUSED` lines (caught by `console clean`, which is the only
reason this was noticed at all) as evidence. The `[html]` pass is immune — it
serves the file over its own ephemeral-port static server.

Not fixed here (changing the gate's server plumbing wasn't this task's scope,
and port selection interacts with `ship.sh`). Stated so it is not rediscovered
as "react-live is nondeterministic": **if a `[react-live]` result shifts at
stations your change cannot touch, check `pgrep -fl "vite --port 5173"` for
another session before believing the numbers.**

---

## Instrument eleven — `applySkyTints`'s `animate:false` snap never cancelled
## an in-flight CSS transition, so `freezeFrame()` rewound station 0's sky

**Date:** 2026-08-16
**Where:** `client/src/lib/ringPrimitives.js`, `applySkyTints()`.
**Found during:** the `ring-integration` branch (merging `ring-station-13` +
`jukebox-ring-fusion` onto `origin/main`, then reworking `skyRegionWeights`).
Found by reading the function's own comment and disbelieving it, then
reproducing it — not by noticing a bad number first.

### What was wrong

The function's comment claimed: *"Snapping on jump means there is no
transition object for it to rewind."* On the path that matters, that claim was
false. The snap branch set `transition-duration: 0ms` and wrote the target
opacity. Neither of those cancels a transition that is already running:

- Per CSS Transitions, changing `transition-duration` has no effect on a
  transition already in flight — the running one keeps its original timing.
- Writing a property the element is already at (which is the normal case on a
  resync, because the preceding animated turn already wrote the target as the
  element's inline value) starts no new transition either, so nothing displaces
  the old one.

`ring-verify.mjs`'s `freezeFrame()` then does `getAnimations().forEach(a => {
a.pause(); a.currentTime = 0 })` — which rewinds the surviving transition to
its PRE-transition value and screenshots that. Same family as instruments eight
and nine: the number was wrong because the instrument measured the wrong frame.

**Production was never affected** — nothing calls `freezeFrame` at runtime, and
the settled visual end state was always correct. Only gate measurements taken
through this path were wrong.

### Reproduced first, in isolation, before any fix

Headless Chromium, one `.sky-tint` div carrying the real shipped CSS
(`transition: opacity 2600ms`), no ring world involved:

1. snap to 0.5, settle → computed 0.5
2. animated call to 0.0 → transition 0.5→0 in flight, inline value already
   `'0.000'`; computed mid-flight 0.428
3. `applySkyTints(..., animate:false)` to the SAME target 0
4. `freezeFrame()`

**Before the fix: computed opacity 0.5, expected 0** — 1 live transition
survived. **After: 0, expected 0** — 0 live transitions.

### Measured on the gate's own drive path, 13 stations

Separate throwaway diagnostic (36 real animated turns, `emulateMedia`
reduced-motion, then sequential `jumpTo` + `freezeFrame` per station — the
gate's real path), reading every `.sky-tint` layer's computed opacity and
diffing it against `skyRegionWeights()`'s intended value:

| tree | stations misread |
|---|---|
| post-merge baseline (old step-lookup curve, unfixed) | **st0 only** — ember measured **0.944**, intended 0.500 |
| new continuous curve, still unfixed | **st0 only** — ember **0.948** (want 0.500), disco **0.328** (want 0.125) |
| new curve + fix | **none — 13/13 exact** |

Exactly one station, and always the same one: station 0 is the only station the
gate reaches with an animated transition still in flight, because it is the
first `jumpTo` after the 36-turn drive phase. Every later station is entered
from a previous snap, which leaves nothing running. **This is narrower than the
report that prompted the work** (which described stations 0-8 reading a stale
`ember = 0.5`); on this tree and this drive path it is st0 alone, measured, not
inferred.

### What was fixed

`t.style.transitionProperty = animate ? '' : 'none'`. Setting
`transition-property: none` makes the property non-transitionable, which
cancels the running transition — the one thing that actually makes a snap
authoritative regardless of whether the value changes. The animate branch
restores `''` so the stylesheet's own shorthand takes over again; verified in
the same browser harness that an animated turn immediately after a snap still
transitions (mid-flight 0.105 heading to 0.5, 1 live transition).

Guard left behind: two cases in `client/src/lib/skyRegions.test.js`
(`applySkyTints transition handling`) asserting the snap writes
`transition-property: none` and the animated path restores `''`. They are
structural, not visual — jsdom cannot run a real transition — so the browser
repro above is the real evidence and these only catch the cancel being dropped
again.

### Which gate numbers this moves, stated rather than absorbed

Station 0's baseline readings were inflated by a sky tint nearly twice its
true strength. Directly attributable, `[html]`: ink per station st0
**19.6% → 9.2%** (back inside its 5.6% floor / 18.0% ceiling band, so that
check's out-of-band list shrank), realised arc st0 **18.1 → 15.5**. Any earlier
conclusion that leaned on station 0 being one of the ring's brightest stations
was leaning on a measurement artefact.

No regression-tier verdict changed in either direction (still 4/34 FAIL, same
four checks).

---

## Sky-region weights — continuous cyclic falloff replaces the neighbour
## lookup; the arc-vs-atmosphere trade it exposes is Ben's call

**Date:** 2026-08-16
**Where:** `client/src/lib/ringPrimitives.js`, `skyRegionWeights()`.
Ben, on the direction: *"I'm on the side of spatial and ensuring panning
always, ALWAYS, feels connected... continue down that road."*

### What changed

The old weight table was a three-branch neighbour lookup — core 1, previous
station 0.50, next station 0.25, everything else a hard 0. On the 13-station
ring that left **st1, st2, st7 and st8 at zero weight from every region**: two
contiguous stretches where the sky carried no region colour at all, so turning
into them was a colour cliff rather than a flow.

Replaced with a geometric falloff in signed cyclic index distance, asymmetric
by direction, reusing the two existing constants as per-step ratios rather than
as table entries:

```
w(0) = 1        w(+d) = REGION_W_APPROACH^d = 0.25^d   (region ahead)
                w(-d) = REGION_W_EXIT^d     = 0.50^d   (region behind)
```

At `|d| <= 1` this is numerically identical to the lookup it replaced — every
value that lookup ever produced survives byte-for-byte (aurora st3/4/5/6 =
0.25/1/1/0.5, ember st11/12/0 = 0.25/1/0.5, disco st9/10/11 = 0.25/1/0.5).
Past that it decays instead of cutting out, and an exponential never reaches
zero. A multi-station region takes the max over its members (summing would make
a two-station region brighter at its own core, a density artefact). Regions are
still scored independently of each other, so overlapping shoulders stack.

Per-station totals across the three regions, shipped layout:

```
st       0     1     2     3     4     5     6     7     8     9    10    11    12
was    0.50  0.00  0.00  0.25  1.00  1.00  0.50  0.00  0.00  0.25  1.00  0.75  1.00
now    0.63  0.33  0.22  0.33  1.03  1.02  0.50  0.27  0.19  0.33  1.09  0.77  1.25
```

**Deliberately NOT normalized to a constant per-station total**, despite that
being part of the proposal that motivated the work. Flattening the total pulls
the quiet stations up toward core strength, which is the "uniform tint reads as
a filter over the screen" failure the `SKY_REGIONS` block says this system
exists to avoid, and it dims a core purely because a neighbouring region's
shoulder overlaps it (a constant-sum normalization takes ember's st12 core from
1.00 to 0.80 for exactly that reason). Naming the conflict instead of picking
a side: **a continuous falloff cannot be both "core reads as core" and
"constant total around the ring."**

### The real cost, measured, not hidden

Filling the dead air raises the quietest stations' rendered luma, which eats
into the value arc. One check flipped **PASS → FAIL** as a direct result:

`[html] realised span outside safe box >= 80% of target span`: **103% → 79%**
(floor 80%). `[react-live]` moved the same way but survives: 113% → 82%.

Attribution, from the per-station realised-arc numbers rather than from
reasoning: the ring's rendered **minimum rose from 8.6 (st7) to 11.1** while the
**maximum is unchanged at 20.8 (st5)** — the span compressed from the floor up,
which is the dead-air fill, not the instrument-eleven st0 correction above (st0
is mid-rank in this metric and its correction moves it DOWN, which would widen
the span, not narrow it).

Several checks improved in the same run: `[html] ink per station` 5/12 → 4/12
out of band, `[html] headline ink` 8/12 → 7/12, `[react-live] ink per station`
9/12 → 6/12, `[react-live] realised arc` 9/12 → 7/12 off target.

Full gate: **43 PASS / 2 WARN / 20 FAIL → 42 PASS / 2 WARN / 21 FAIL.**
Regression tier unchanged (4/34 FAIL, same four checks). Spec tier 16/31 → 17/31
BELOW SPEC, the one addition being the realised-span check above.

### STAYS HUMAN — open for Ben, nothing applied

The arc and the atmosphere now pull against each other, and every lever that
would buy the arc back is a threshold or an aesthetic decision, so none was
touched:

1. Accept the softer arc — atmosphere everywhere is what was asked for, and
   the realised-span floor (80%) was itself set before the sky had any
   always-on layer.
2. Lower the tint's own alpha (`skyTintBackground`'s 0.62 top stop) so a faint
   shoulder contributes less luma while still being visible. Changes the
   palette's weight, not the curve.
3. Steepen the falloff (a smaller ahead/behind ratio) so shoulders die off
   faster. Re-opens dead air at the far stations, which is the thing this
   change was made to remove.
4. Normalize per-station totals after all, accepting dimmer cores.

Not decided here: which of these, if any. Per
`references/ring-world-continuity.md` §4, threshold choice and aesthetic
acceptance are Ben's.
