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
