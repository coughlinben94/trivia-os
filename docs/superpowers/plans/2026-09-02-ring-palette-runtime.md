# Ring palette — finish the colour system (runtime per-show palette, honest ladder, seeded generator)

**Date:** 2026-09-02, evening. Written by Fable 5.1 as a named consult, for a Sonnet agent to run
unattended tomorrow. Ben reviews this file first; nothing in it is committed or started.
**Base:** local `main` at `00d8359` (two unpushed commits: `2e77ff3` sky+backdrop, `00d8359` tints).
**Not touched by this plan, ever:** `concepts/tools/ring-verify.mjs` pass/fail logic,
`concepts/tools/ring-spec.lock.json`, any cap or threshold, `scripts/ship.sh`. The 14 pre-existing
spec-tier FAILs stay exactly as they are — none of this work is allowed to chase them, and none of it
should move them (Phase 2's falsifier checks that it doesn't).

---

## The goal, in Ben's words

"The colors can flow into each other in theory?" — "I wish there were more stations so it can be
more varied week to week" — "even round to round" — "like that's the goal??"

So the requirement this plan serves: **the colours flow into each other across the ring rather than
sitting in blocks, and the world looks different every show and every round.** Customisability is
the means, variety is the metric. Everything below is ordered by how much variety it buys per line
of risk.

## Verdict, up front

**Build, in this order:**

1. **Fix the hue ladder in OKLCH** (`weightedPalette.js`, pure, ~40 lines + tests). Needed by
   everything after it. Fixes the green amber planet (station 3 at 68°). Does **not** make yellow a
   clean anchor — see "What the olive actually is."
2. **The palette becomes a per-show runtime value, not a file rewrite.** One pure
   `recolorWorld(baseWorld, palette, baseTheme)` in `ringRecolor.js`, built from the logic
   `scripts/ring-recolor.mjs` already has; the display builds its world from
   `theme_overrides.worldPalette` at mount; the picker's Apply writes it. No agent, no commit, no
   gate run per show. This is the foundation every variety axis sits on. The script survives only
   to move the certified *base* world.
3. **Drift — the colours flow around the ring.** Station i's anchors are rotated by a closed bump
   `rot(i)` that returns to 0 at the wrap, so the loop closes and no two neighbours differ by more
   than ~15° from the drift. It is a property of the world *at build time*: `derivePalette` emits
   13 hues from a moving anchor instead of a fixed one. None of the ~100 live colour sites are
   touched. Full analysis in "Drift" below — it is seam-free, it composes with the assignment DP,
   and it is a spec amendment (§4/§10 say the anchor windows are constant across the ring), which
   is Ben's to make.
4. **A seeded palette generator** (`paletteGenerator.js`, pure): random palette + random drift arc
   per seed, hard constraints, never a yellow-green anchor, deterministic. Seed = show id for per-show,
   show id + round index for per-round. "Surprise me" in the picker uses the same function.
5. **Per-round rotation** (Ben said yes, twice): a new seed each round, the world rebuilt while the
   jukebox overlay covers the screen. Needs a one-line RingAmbient remount fix first (a real hazard
   found while reading — below). Plus one cheap extra axis: a per-show **start station**, so the
   round opens on a different object each week. Not `phase` — that one is a certified constant
   (see "Variety space").

**Do not build:**

- **Per-station live CSS vars for the ~100 `hsla()` sites (the parent's step 2).** A trap, buys
  nothing. Reasons in "Why step 2 is a trap." Every variety axis above is resolved when the world is
  built (per show, per round); station colours can stay baked.
- **Discrete palette swaps every 2–3 stations.** A hard swap at a station boundary shows two palettes
  side by side for the 1.2s glide between the last station of one block and the first of the next,
  and through the 3–5 headlines that bleed across a frame edge. The drift gives Ben the thing he
  asked for — colours that flow — without a cut anywhere. (Correction to my first draft: I claimed the
  far layer would show a four-station-wide seam. Wrong — I checked `buildLayerContent`: far and near
  carry only stars and the drifter, all tint-coloured, not station-hued. Only the mid layer, 1920px
  per turn, carries station hue. The objection to a discrete swap is the glide and the bleed, which is
  smaller than I said, but still a cut the drift doesn't have.)
- **More stations, this week.** Engine arithmetic allows it; the object-craft pipeline is what it
  costs. Sized in "What more stations would actually cost" — out of the phase plan.
- **Luma-preserving colour emission (rotating every colour in OKLab inside `hsla()`).** The right
  upgrade if Phase 2b's sweep shows palettes blowing the safe-box cap; it edits the colour treatment
  Ben named "verified good, do not touch," so it stays an option, not a task.

**Sessions.** Session 1 = Phases 1 and 2 (stop after Phase 2's verification). Session 2 = Phase 2.5
(drift), Phase 2b (sweep, drifted worlds included), Phase 3 (generator, per-show wired). Session 3 =
Phase 4 (per-round + start station), after Ben has seen a per-show palette on the real TV.

---

## What I verified myself (and where the brief was off)

- `git log`: `00d8359`, `2e77ff3` are local-only, as stated. **The tree is NOT clean.** `git status`
  shows another session's work: `client/src/components/host/SlideCanvasEditor.jsx`,
  `e2e/drag-reorder.spec.js`, `e2e/wizard-create-verify.spec.js` modified; `client/src/lib/canvasPreview.js`,
  `canvasPreview.test.js`, `e2e/authed-client.js` untracked. The three ring-recolor targets are clean,
  which is what `ring-recolor.mjs`'s guard checks. **Stage by explicit filename only. Never `git add -A`.**
- The olive bug is real. `node scripts/ring-recolor.mjs --colors '#ff2200,#ffd400' --weights '0.55,0.45'`
  (dry) assigns the 50° anchor's six stations the HSL rungs 32/39/46/54/61/68. Station 3 (amber
  planet) got 68 — rendered green (`scratchpad/all-03.png`, ring and planet are chartreuse). Station
  11 (aurora ribbon) got 54 — rendered olive (`all-11.png`).
- **The olive is only partly the ladder.** Measured, not guessed (probe script, OKLab conversions from
  `client/src/lib/oklab.js`):
  - HSL hue is badly non-uniform. 18 HSL degrees near green (90→108) is 8° in OKLCH; near yellow
    (50→68) it's 18°; near orange (30→48) it's 31°; near cyan (180→198) it's 34°. So a fixed ±18 HSL
    ladder is ±8 perceptual degrees on green and ±34 on cyan. Around yellow, +18 HSL crosses from gold
    (50) into chartreuse (68).
  - The primitives add their own authored offsets on top: the ribbon strokes are `hue + 14` and
    `hue + 18`, the ring band `hue + 10..16`, binary-pair stars `hue - 18`/`hue + 28`. A 54° ribbon
    strokes at 72°. No ladder fix reaches those — they are the shipped world's own arithmetic.
  - **Yellow at object lightness is olive by physics.** `hsl(50,56%,30%)` (the `LB(30)` dark stop
    every object has) is `#776922`, a brown-olive. `hsl(50,72%,62%)` is `#e4cd58`, mustard. Yellow
    only reads as yellow near white. In any colour space, a yellow anchor puts olive in every object's
    shadow side. The ladder fix makes the *hue* right; it cannot make dark yellow not-olive.
  - Hue also moves brightness: at the same S72/L62, hue 50 has Rec.709 luma 201, hue 230 has 115
    (1.75×; the 2026-08-31 plan measured 2.21× across the full circle). The safe-box cap is a luma cap.
    A palette is not luma-neutral, and `lumaProxy` is advisory only (its own header says so).
- ~100 `hsla(` lines in `ringPrimitives.js` (104 lines match, several with 2–3 calls), plus three
  derived hues (`sHue`, `rockHue`, `hue + 20` into `makeOccluder`). Hue is mixed into arithmetic with
  seeded jitter (`hue - 4 + r() * 10`), so a CSS var would need a `calc()` at every site or a
  helper-level rewrite. The brief's "92" is the right order of magnitude; the exact count is not
  load-bearing.
- **`RingAmbient.jsx` cannot be remounted mid-show today and land on the right station.**
  `lastSlideIndexRef = useRef(slideIndex)` (line ~856) and `ringNavAction(prev, next)` returns `'none'`
  when `prev === next` (`ringStationIndex.js:30`). A fresh mount with a numeric `slideIndex` therefore
  never jumps: `stationRef` stays 0. It works in production only because the persistent ring mounts
  during pre-show, before any numeric slide index. This blocks "Apply recolours the live TV" and
  per-round rotation until fixed (Phase 4, first task). Not touched in Session 1.
- `ring-verify.mjs` has **no hue-anchor check** (grep confirms; the 2026-08-31 plan found the same).
  Spec §4's ±25° window is enforced only by `weightedPalette.test.js`. The OKLCH ladder must keep that
  test true (it clamps to ±25 HSL).
- `references/ring-world-mistakes.md` "Live state" is stale on two points the 2026-08-31 plan already
  flagged: the ring IS mounted in production (`ParticleBackground.jsx:1167`), and `scripts/ship.sh`
  DOES block on the regression tier. Flag again, don't edit.
- The 2026-08-31 plan's Scope section explicitly deferred "a live, per-show, instantly-saved ring hue
  override … its save step bypasses `ring-verify` entirely" as **Ben's call, still not built.** Phase 2
  of this plan is that thing. Ben's "varied week to week, even round to round" is that yes in
  substance; the certification half (STAYS HUMAN 3) still needs saying out loud.
- Which layers carry station hue (`RingAmbient.jsx` `buildLayerContent`): **far = stars + the
  drifter, near = stars, mid = every station object.** Stars and drifter are tint-coloured (already
  hue-rotated in OKLab). So station hue is on one layer that moves exactly one frame per turn; the
  only moments two stations' hues share the frame are the 1.2s glide and the declared bleeds.
- Open problem 3 in the brief (sky-region tintSat/tintLight fixed) is not a bug. They are near-black
  tints; hue follows the source station already. Leave them.
- Open problem 4 (region offsets can leave every window): the script warns. Clamping changes the
  shipped ember sky (26° sits outside every current anchor window). Not clamped here; the generator
  re-rolls instead (Phase 3), the picker keeps the warning. STAYS HUMAN question 5.

---

## Colour science, stated concretely

**Ladder in OKLCH, output in HSL.** The primitives consume an HSL hue angle and must keep doing so
(the S/L values at ~100 sites were tuned in HSL; converting them is the colour-treatment rewrite this
plan refuses). So: compute the rung *offsets* as perceptual (OKLCH hue) degrees, apply each offset to
the anchor colour by rotating its OKLab (a,b) at constant L and C (same trick as `withHueOf`), gamut-map
by shrinking C only, convert the result to an HSL hue with the existing `hexToHslHue`, take the signed
cyclic delta to the anchor's HSL hue, and clamp to ±25 (spec §4). Measured projections of ±18 OKLCH:

| anchor | HSL hue | rungs as HSL hues (−18…+18 OKLCH) |
|---|---|---|
| `#ffd400` yellow | 50 | 45 47 49 50 53 57 63 |
| `#ff2200` red | 8 | 340 346 354 8 10 12 15 |
| `#3b82f6` blue | 217 | 204 205 210 217 223 230 238 |
| `#a855f7` purple | 271 | 252 258 264 271 277 284 292 |

Yellow's ladder stops at 63 (was 68); it no longer reaches chartreuse. Blue's spans 34 HSL degrees for
the same perceptual step, which is right — and still inside ±25 of 217.

**What a random generator needs to never produce mud:**

1. **A dead band for anchors: HSL hue in [45°, 80°).** Yellow through chartreuse. Reason above: dark
   yellow is olive, and the primitives' own `+14..+18` offsets push a yellow anchor into green. Greens
   (120–170) are fine — the shipped world uses 120/140/160/170 and their shadows are dark green, not
   mud. Oranges/ambers (≤ 42) are fine. The band edges are aesthetic — Ben's (STAYS HUMAN 2).
2. **Anchor separation ≥ 60° HSL** (windows are ±25, overlap warns below 50; 60 gives margin).
3. **Chroma floor.** Spec §4 failure mode 1: a near-neutral has no stable hue. Sample S ∈ [0.70, 0.95],
   L ∈ [0.50, 0.65] in HSL for the anchor hex, so `hexToHslHue` is stable and the fold/tints get a real
   hue direction. The anchor's own lightness only affects the sky fold (`atLightness` clamps it to the
   theme's near-black) and the tints (`withHueOf` uses only its hue direction) — so this floor is
   about hue stability, not brightness.
4. **Weights:** heaviest 0.55–0.70, remainder split; 2 colours by default, 3 one time in four.
5. **Reject and re-roll (bounded, 64 tries) if:** `derivePalette().warnings` contains the overlap
   warning; `regionHueWarnings()` is non-empty (a sky region would land outside every window); or the
   max per-station `lumaProxy` rise over the base world exceeds `LUMA_RISE_MAX`. Fall back to the base
   palette (the shipped purple) if 64 tries fail, and say so in the console.
6. **Seeded, never `Math.random`.** `rng()` from `ringEngine.js` (hash32-based). Seed = FNV-1a of the
   show id (+ round index for Phase 4). Same seed, same palette, forever — the show reproduces on any
   reload and any preview.

**Keeping the luminance gate honest across a palette change.** State the truth: the gate certifies
one world — the base in the two world files. A runtime palette is not gate-run. What we can do
honestly:

- Every near-white (stars, cores, glare) is already rotated hue-only in OKLab (`withHueOf`), so the
  thing that historically blew the safe box (star peaks, headline glow) keeps its lightness. That is a
  real, mechanical guarantee, not a hope.
- Station hues are HSL hue swaps, which do change luma (up to ~2×). The safe box is under the scrim
  at frame centre; objects sit in corners; spill reaches the box through glow. Bounded, not zero.
- So Phase 2b **measures** it: a sweep tool that imports `runChecks` (the exact gate code, never a
  fork) and runs the regression tier over the six presets plus N generated palettes, on both builds,
  with a known-answer probe (the base palette must reproduce today's verdicts exactly, or the sweep is
  broken, per rule zero). From those numbers Ben picks `LUMA_RISE_MAX` and decides whether sampled
  certification is enough (STAYS HUMAN 3 and 4). `lumaProxy` never becomes a verdict.
- If the sweep shows the cap failing on ordinary palettes, the fix is the luma-preserving emission
  (rotate each authored colour onto the target hue at constant OKLab L inside the `hsla()` helper).
  Named here so nobody rediscovers it; not built here, because it edits the protected colour treatment.

---

## Why step 2 (live per-station vars) is a trap

- ~100 emission sites, hue folded into arithmetic with seeded jitter. A var means `calc()` at every
  site, or a helper that knows the station's base hue — which is a module-global set by the station
  loop, in both builds, with `r()`-stream discipline riding on top.
- Changing a var re-resolves every gradient on ~5,465 elements at once — the same cost as a rebuild,
  without the black frame to hide it in.
- The luminance gate measures a mounted world. Live vars don't make per-palette certification any
  more possible; they just make the uncertified change reachable at any moment of the show.
- There is no product outcome that needs it. Per-show = build the world from the palette at mount.
  Per-round = rebuild while the jukebox overlay covers the screen. Per-station = don't (premise).
- `world-07-ring.html` would need the identical change (both builds in lockstep) and the gate's
  `freezeFrame`/peak-forcing already assumes station colour is static per station.

---

## Drift — the colours flow around the ring (answers to the four questions)

**The mechanism.** For palette colour c with base anchor `A_c`, station i's anchor is
`A_c + rot_c(i)`, with `rot_c(i) = dir_c · arc_c · (1 − cos(2π·i/PANES)) / 2`. A closed bump: 0 at
station 0, `±arc_c` at the far side of the ring, back to 0 at station 13 ≡ 0. So the wrap is
continuous by construction and the loop-closure premise is untouched. `derivePalette` gets one new
option, `drift: { arc }` (default 0 = today's output, byte-identical), and emits per-station anchors
alongside the 13 hues. `recolorWorld` carries them onto the world. Nothing live changes; the hues are
still 13 numbers baked at build.

**1. Seam-free? Yes, with three things handled.**
- *Per-step size.* The bump's steepest step is `arc·π/13 ≈ 0.24·arc` — 14° per station at arc 60,
  29° at arc 120. Today's ladder hands rungs to ring-consecutive same-colour stations **outside-in**
  (neighbours get the furthest-apart rungs, up to 36° apart) — that is the opposite of flow. With
  drift on, hand rungs out **in ring order** instead (a one-line change in the `pick` expression), so
  the drift and the ladder move the same way and neighbours differ by 6° + the drift step. Adjacent
  hue delta is then ~10–35° everywhere, smaller than the shipped world's own 256→170 jump at st0→st1.
- *Accent companions.* `accentCompanionHue(st.hue, world.hueAnchors)` picks the farthest **world**
  anchor. Under drift the right answer is the farthest anchor **at that station**, otherwise a
  companion can land 60° from where the palette actually is at that station (rotated purple vs
  unrotated blue). Fix: `derivePalette` emits `hueAnchorsAt[i]`; `recolorWorld` writes
  `stations[i].hueAnchors` on accent stations; both builds read
  `st.hueAnchors ?? world.hueAnchors` at the companion line (`RingAmbient.jsx` ~533,
  `world-07-ring.html` ~1028 — a one-token edit each, no `r()` draw, no DOM change; still a RingAmbient
  edit, so it goes in Session 2 with its own falsifier, not Session 1).
- *Sky regions.* `skyRegionHues` = source station hue + fixed offset, so a region follows its source's
  rotated hue automatically — that is the correct behaviour (the aurora stays the pulsar's colour).
  `regionHueWarnings` must compare each region against its **source station's** rotated anchors, not
  the world's — pass `hueAnchorsAt[sourceIndex]`. Same failure class as today (aurora's +32 can still
  leave a ±25 window); drift adds no new way to fail it.
- *The arc/loudness curve, `phase: 5`.* Untouched by hue. What drift does add is a hue→luma ride on
  top of the value arc (hue alone moves luma up to ~2× at fixed S/L). A drift through blue→cyan
  brightens the drifted stations; if that lands on the arc's crest, the safe box sees it. Not a
  seam — a certification question; the Phase 2b sweep runs drifted worlds too.
- *Family spacing.* Not hue. Unaffected.

**2. Arc width vs the dead band and the ±25 window.** The station hues of colour c occupy
`A_c ± (arc_c + 18)` (ladder half-width). They must avoid HSL [45°, 80°). Compute per colour, per
direction: `gap_up = cyclic distance from A_c up to 45`, `gap_down = from A_c down to 80`. A
**symmetric** ±arc is capped at `min(gap_up, gap_down) − 18`: purple 271 → 116, blue 217 → 119,
teal 170 → 72, magenta 330 → 57, green 140 → 42, **red 8 → 19, orange 25 → 2**. Warm anchors can
barely drift symmetrically. So the bump is **one-sided**: `dir_c` points toward the larger gap, and
`arc_c = min(requested, gap_dir − 18)`. Red then drifts toward magenta up to ~270° (capped by
taste, not by mud); orange toward red. The world drifts *away* from yellow by construction. Print the
clipped arcs in the dry run and the picker ("red can drift 19° toward orange, 270° toward magenta;
using magenta").
The ±25 invariant: with drift, "inside its anchor window" means inside the **rotated** anchor's
window at that station — `hueAnchorsAt[i]`. The existing test becomes that check; at `drift: 0` it is
the same test. Spec §4 ("1–3 anchors, ±25 windows") and §10 ("the hue anchor window(s)" constant
across the ring) are **amended**, not satisfied, by a drifting world: the world's *anchor curve* is
constant and declared, its anchors are not. That is the honest framing to give Ben — it is his spec.
"The most Ben can have": the per-colour cap above, and beyond ~120° a two-colour palette stops
reading as two colours (purple drifted 120° is cyan-green; the eye reads a rainbow, not a place).
Suggested picker range 0–90 with 60 as the "flow" default; the exact number is aesthetic — his.

**3. The assignment DP composes cleanly.** `minCostRingAssignment`'s cost is
`hueDelta(currentHues[i], anchors[c].deg)`; with drift it is `hueDelta(currentHues[i], A_c + rot_c(i))`
— one expression. The adjacency floor (BIG penalty on same-colour neighbours) is unchanged and still
meaningful: it keeps the two palette colours interleaved; the drift moves both colours together, so
interleaving is still what stops a 5-station smear of one family. Allocation counts unchanged.

**4. Where it lands.** Phase 2.5, Session 2, right after the runtime palette exists and before the
sweep, so the sweep certifies drifted worlds. It is ~40 lines in `weightedPalette.js`, ~10 in
`ringRecolor.js`, one token in each build, plus a slider in the picker. It does not change Session 1.
**Is it a bad idea?** Only in one way: it is the first thing on this project that makes the hue set a
per-world *curve* instead of a constant, so the spec's anchor discipline needs a sentence added by
Ben, and the certified base world (the files, the script's `--write`) stays **drift 0** — drift is a
runtime property the script never writes. Everything else composes.

---

## Variety space — what "different every week and every round" actually has to draw from

Per world build (per show, and per round in Phase 4), independent axes:

| axis | space | cost | certified how |
|---|---|---|---|
| palette hues | 2–3 anchors from ~325° of wheel (minus the dead band), pairwise ≥ 60° | Phase 3 | Phase 2b sweep, sampled |
| weights | heaviest 0.55–0.70 | Phase 3 | same |
| drift arc + direction | 0…cap per colour (one-sided, away from yellow) | Phase 2.5 | same, drifted rows |
| start station | which of 13 objects the round opens on | Phase 4.1b, one line at mount | none needed — loudness/ink per station unchanged |
| seed per round | new draw of all of the above at each grading break | Phase 4.1 | same as per-show |
| `phase` (arc crest) | **no** | one number, but… | **every** station's loudness moves; `companionBoost` on st6/st7, `maxDetail` counts, the supernova on "a louder arc slot" are all tuned to phase 5; safe-box glow spill follows the crest. Varying it per show means 13 separate certifications, not one. Treat as a certified constant. |

That is a large space on the existing 13 nouns. Week-to-week variety is a palette/drift/start problem,
not a station-count problem.

---

## What more stations would actually cost (out of the phase plan)

The coordinator checked `assertLayerPeriods`: PANES 13–20 tile in whole pixels. Confirmed — the
engine arithmetic is not the block. What is:

1. **Each new station is a drawn object.** Spec §6.0 / the drawn-subject gate: the headline must be a
   drawn kind (`sprite`/`ring`/`ground`/`nebulaCloud`) with a unique noun, silhouette family ≥ 3
   stations from its nearest relative, through `OBJECT-RENDERING-PROTOCOL` (geometry-lint, attempt
   counts, design critic, figurative-vs-iconic classification). History: the amber planet took four
   constructions over two days; the rose nebula three rounds; eight objects were "still crude" on
   2026-08-09; the 13th station (the record) was its own branch. Realistic: **one session per object,
   with Ben's eye in the loop each time.**
2. **Changing PANES moves every existing station.** `arcAt` is `cos(2π(i+phase)/PANES)`, so every
   station's loudness, fill and ink target shift; the per-station flags tuned against the measured
   numbers (`maxDetail` 2026-08-26, `companionBoost`, `fillCorner` removal, the record/supernova swap
   for arc slots) all re-open; the regression tier is safe (`separateArc` is tested across PANES
   8–16) but the spec tier (14 FAIL today) gets re-rolled and the safe box re-measured. Plus: both
   builds, the hue pin, `MUSIC_STATION`, `skyRegionWeights`' shoulders, family-spacing arithmetic
   redone (which relieves the current "no slot ≥ 3 from all radial masses at 13" problem, a real
   upside). **One session of re-tuning and re-certification per PANES change**, so add stations in one
   batch, never one at a time.
3. Rough size for +3 stations: 4–6 sessions, after the colour system lands and after the TV test.
   Not tomorrow's work. Say to Ben: the variety he wants this month comes from the table above; more
   nouns is a later, separate project with its own protocol.

---

## Phase 1 — perceptual hue ladder (Session 1)

**Files:** `client/src/lib/weightedPalette.js`, `client/src/lib/weightedPalette.test.js`.

**Change.** Keep `hueLadder(k, halfWindow)` exactly as is (it's the offset spacing; its test pins it).
Add:

```js
// Rotate a colour's OKLab hue by `deg`, holding L and C; shrink C only as far
// as sRGB needs (same discipline as withHueOf — never clip channels).
export function rotateOklabHue(hex, deg) { ... }   // → '#rrggbb'

// An OKLCH ladder offset, expressed as the HSL-hue delta the ring engine
// consumes. Perceptual step in, HSL step out, clamped to spec §4's window.
export function projectLadderOffset(anchorHex, oklchDeg, clampDeg = ANCHOR_WINDOW) {
  const base = hexToHslHue(anchorHex)
  const h = hexToHslHue(rotateOklabHue(anchorHex, oklchDeg))
  let d = ((h - base + 540) % 360) - 180          // signed cyclic delta
  return Math.max(-clampDeg, Math.min(clampDeg, d))
}
```

In `derivePalette`, replace
`const ladders = counts.map(k => hueLadder(k, LADDER_HALF))` with
`const ladders = counts.map((k, c) => hueLadder(k, LADDER_HALF).map(off => projectLadderOffset(colors[c], off)))`.
Nothing else in `derivePalette` changes. `rotateOklabHue` shares the gamut binary search with
`withHueOf`/`atLightness` — extract that loop into one private `fitChroma(L, a, b)` helper rather
than pasting it a third time.

**Tests to add** (`weightedPalette.test.js`):
- `projectLadderOffset('#ffd400', +18)` ≤ 13 and `(… , -18)` ≥ −6 — yellow's ladder never reaches 65.
- For each of the six `PRESETS` in `WorldPaletteEditor.jsx` (copy the hexes into the test as a frozen
  literal), every offset in `[-18,-12,-6,0,6,12,18]` projects to |delta| ≤ 25.
- `projectLadderOffset(x, 0) === 0` for any x.
- Blue `#3b82f6`: `projectLadderOffset(.., +18) - projectLadderOffset(.., -18)` ≥ 25 (the projection
  is not collapsing steps).
- `rotateOklabHue('#ffffff', 90) === '#ffffff'` (no hue to rotate).
- The existing "keeps every station inside its own anchor window" and "matches identity" tests must
  still pass unchanged.

**Verify.**
```
cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os
npm run test:unit
node scripts/ring-recolor.mjs --colors '#ff2200,#ffd400' --weights '0.55,0.45'     # dry run
```
Read the table: the six yellow-family stations must now sit in 44…64, none at 68. Then render it for
real: `--write`, start vite, screenshot stations 3 and 11 the same way today's `scratchpad/ringshot.mjs`
did (copy that script into `concepts/tools/` if it isn't there; it must use the bundled Playwright
Chromium, never Ben's Chrome), save as `concepts/.audit-shots/ladder-oklch-2026-09-03/st03.png` and
`st11.png`, look at them, then `git checkout --` the three targets. The red/yellow palette does not
ship.

**Falsifier.** *If station 3 still reads green at a rung ≤ 63, the ladder was not the cause; the
primitive's own offsets are — stop and report, don't widen the fix.* Predict before looking: st3 gold,
not green; st11 still olive-ish (its authored `+18` strokes and its dark stops; this is the "yellow is
olive at object lightness" fact, not a Phase 1 failure). If st11 comes out clean yellow, my physics
claim above is wrong — say so in the report either way.

**Rollback.** `git checkout -- client/src/lib/weightedPalette.js client/src/lib/weightedPalette.test.js`.

**Commit** (stage by name): `Ladder station hues in OKLCH, emit HSL — yellow no longer walks into chartreuse`.

---

## Phase 2 — the palette is a per-show runtime value (Session 1)

Goal: `theme_overrides.worldPalette = { colors: [...], weights: [...] }` on the show row; the display
builds its ring world from it at mount; the picker's Apply writes it. No script, no commit, no gate run
per show. Shipped default (no `worldPalette`) renders byte-identical to today.

### 2a. One recolour function, used by the script and the app

**File:** `client/src/lib/ringRecolor.js` (pure, node-importable — keep it that way).

```js
import { derivePalette } from './weightedPalette.js'
import { skyFromTheme } from './ringEngine.js'
import { BASE_TINTS } from './ringPrimitives.js'

// A NEW worldData built from the BASE world (never from a recoloured one —
// that is what keeps it idempotent) and one weighted palette. hues, anchors,
// sky sources and tints all move together; everything else is the base's.
export function recolorWorld(base, palette, baseTheme) {
  const { colors, weights } = normalizePalette(palette)      // 2-3 hexes, weights → sum 1, throws on junk
  const derived = derivePalette({
    colors, weights, stationCount: base.stations.length,
    currentHues: base.stations.map(s => s.hue), baseTheme,
  })
  return {
    ...base,
    hueAnchors: derived.hueAnchors,
    stations: base.stations.map((s, i) => ({ ...s, hue: derived.hues[i] })),
    sky: skyFromTheme({ colors: { bg: derived.themeColors.bg, bgDeep: derived.themeColors.bgDeep } }),
    tints: deriveTints(BASE_TINTS, colors),
    palette: { colors, weights },        // carried so consumers can key on it
  }
}
```

`scripts/ring-recolor.mjs` then calls `recolorWorld(midnightGalaxyRing, {colors, weights}, BASE_THEME)`
and takes hues/anchors/sky/tints off the result instead of computing them inline (delete the inline
`derivePalette`/`deriveTints`/`sky` lines; the printed plan, warnings, region table are unchanged).
The script's `--write` path still rewrites the three files — that is its job now: **changing the
certified base world**. Its header comment says so in one sentence.

`normalizePalette` = the validation `parseArgs` does today (2–3 `#rrggbb`, positive weights, normalise)
moved into `ringRecolor.js` so the app and the script validate the same way. `parseArgs` calls it.

**Test** (`ringRecolor.test.js`):
- `recolorWorld(midnightGalaxyRing, {colors:['#ff2200','#ffd400'], weights:[0.55,0.45]}, THEME)` →
  the 13 station hues equal the Phase 1 dry-run table for the same inputs (pin them as a dated literal).
- `tints` deep-equals `deriveTints(BASE_TINTS, colors)`; `sky` has 4 stops; `hueAnchors` has 2 entries.
- The base object is not mutated (deep-equal before/after; its `stations[i]` are not the same references).
- `normalizePalette` throws on 1 colour, 4 colours, a non-hex, a zero weight, a weight-count mismatch.
- `recolorWorld` must always take the AUTHORED module as `base`: `currentHues` drives which station gets
  which colour, so recolouring a recoloured world gives a different (wrong) assignment. Document that
  in the function header; the app satisfies it by construction (`ParticleBackground` imports
  `midnightGalaxyRing` directly). Assert it the cheap way: `recolorWorld(recolorWorld(base, p), p)` is
  NOT required to equal `recolorWorld(base, p)`, and the test says so in its name so nobody "fixes" it.

### 2b-prep. Both builds and the audit route accept a palette from the URL

So the gate's own `runChecks` can measure a palette without any file rewrite (used by Phase 2b's sweep;
also handy by hand).

- `concepts/world-07-ring.html`: right after `const WORLD = { ... }` becomes `let WORLD = { ... }`, add
  ```js
  // 2026-09-03: `?colors=%23ff2200,%23ffd400&weights=0.55,0.45` builds this
  // reference world from that palette, via the SAME recolorWorld the app uses.
  // No params → the authored base, byte-identical to before. Synced with
  // AmbientAudit.jsx's ?colors= handling.
  {
    const q = new URLSearchParams(location.search)
    if (q.get('colors')) WORLD = recolorWorld(WORLD, { colors: q.get('colors').split(','), weights: (q.get('weights') ?? '').split(',').filter(Boolean).map(Number) }, { colors: { bg: SKY_BG, bgDeep: SKY_BG_DEEP } })
  }
  ```
  plus the import (`recolorWorld` from `../client/src/lib/ringRecolor.js`). The `baseTheme` argument
  here is the world's own two sky sources — they already carry the theme's lightness, so the fold lands
  in the same place the script's does. No `Math.random` anywhere (the static check scans this script).
- `client/src/views/AmbientAudit.jsx` (`?ring=1`): same params → `worldData={recolorWorld(midnightGalaxyRing, palette, getTheme('midnight-galaxy'))}` when present, else the base. Compute once with `useMemo` keyed on the search string.

### 2c. The show carries the palette; the display builds from it

- `client/src/components/shared/ThemeProvider.jsx` `applyOverrides`: pass it through untouched —
  `worldPalette: overrides?.worldPalette ?? undefined` on the merged object (one line; the
  `floorReadableColors` path never sees it). No-override branch returns `baseTheme` as today, so
  `theme.worldPalette` is `undefined` → base world.
- `client/src/components/display/ParticleBackground.jsx`: replace `const ringWorld = RING_WORLDS[theme.id]` with

  ```js
  // The ring world is FROZEN at mount. RingAmbient builds its DOM once and
  // never re-runs on worldData change (its own header rule), and a remount
  // mid-show would land on station 0 (RingAmbient's lastSlideIndexRef starts
  // equal to slideIndex, so ringNavAction says 'none'). So a palette applied
  // while /display is open shows on the next reload, not live — stated in
  // the picker. Phase 4 of docs/superpowers/plans/2026-09-02-ring-palette-runtime.md
  // is where that changes.
  const ringWorldRef = useRef(null)
  if (ringWorldRef.current === null) {
    ringWorldRef.current = ringWorldFor(theme) ?? false
  }
  const ringWorld = ringWorldRef.current || null
  ```
  with, at module scope, a memo so `WarpTransition` gets the same object:

  ```js
  const worldCache = new Map()
  export function ringWorldFor(theme) {
    const base = RING_WORLDS[theme.id]
    if (!base || !theme.worldPalette) return base
    const key = theme.id + '|' + JSON.stringify(theme.worldPalette)
    if (!worldCache.has(key)) {
      try { worldCache.set(key, recolorWorld(base, theme.worldPalette, getTheme(theme.id))) }
      catch (err) { console.warn('[ring] bad worldPalette, using base:', err.message); worldCache.set(key, base) }
    }
    return worldCache.get(key)
  }
  ```
  A malformed saved palette must never blank the TV — fall back to base, warn once.
- `client/src/components/display/WarpTransition.jsx`: `BG`, `GROUND`, `COOL_REF`, `WARM_REF`, `BANDS`
  (and the warm grade that uses `WARM_REF`) move from module scope into the component, computed with
  `useMemo` from `const world = ringWorldFor(theme)` (`useTheme()`). The rest of the file is untouched.
  The `midnightGalaxyRing` import goes away. Falsifier below covers "no change with no palette."
- `client/src/components/host/ThemePickerModal.jsx` `applyPaletteColors` (line ~133): accept
  `{ themeColors, worldPalette }` and write `{ ...overrides, colors: {...}, worldPalette }`. Find the
  Reset path (`onReset` in `ThemeCustomizeControls`'s caller) and make sure it drops `worldPalette`
  too — a Reset that leaves the ring recoloured is a bug.
- `client/src/components/host/WorldPaletteEditor.jsx`:
  - `previewWorldData` → `recolorWorld(midnightGalaxyRing, committed, baseTheme)` so the preview shows
    sky and tints too (today it only swaps hues/anchors).
  - Apply calls `onApply({ themeColors: derived.themeColors, worldPalette: { colors, weights } })`.
  - The explanatory sentence: "Apply recolours this show's theme AND its ring world. The TV picks it
    up when /display loads — reload the display if it's already open." Keep the copy-command panel,
    retitled "Change the built-in default (needs a code change and a gate run)".
  - Header comment: the "palette-fixed by design" paragraph is now false; rewrite it in two lines.
- `references/themes.md` line 24 ("Ring worlds are palette-fixed by design") — **flag in the report, do
  not edit** (docs rule: flag, don't drive-by).
- Per global CLAUDE.md: Context7 before editing any React file. Do it.

**Verify.**
```
npm run test:unit
npm run build
lsof -nP -iTCP:5173 -sTCP:LISTEN            # must be empty or YOUR checkout (instrument ten)
npm run verify:ring                          # both passes
```
Regression tier: all 34 green. Spec tier: **49 PASS / 2 WARN / 14 FAIL, the same 14 names as before
Phase 2** — copy the FAIL list from a pre-Phase-2 run into the report and diff it. Then a real palette,
no file rewrite:
```
npx vite --port 5199 --strictPort &   # your own port, never 5173
# /ambient?ring=1&colors=%23ff2200,%23ffd400&weights=0.55,0.45
```
Screenshot all 13 stations (reuse today's `ringshot.mjs` pattern), read `window.__world.WORLD.stations.map(s=>s.hue)`
and the 12 `--t-*` vars off `.ring-stage`. They must equal the Phase-1 dry-run table exactly. Then a
show-level test: set `theme_overrides.worldPalette` on a **test show, never a live one** (production
data rule — create a throwaway show or use the preview route), open `/display`, confirm the ring is
recoloured; remove it, reload, confirm base. Delete the throwaway show.

**Falsifiers.**
- *No `worldPalette` → nothing changes.* Frozen-frame screenshot of station 0 on both builds, before
  and after Phase 2, md5-identical (freeze with `getAnimations().forEach(a=>{a.pause();a.currentTime=0})`,
  same as the gate). If they differ, `ringWorldFor`/`WarpTransition` moved something in the no-palette
  path — find it, don't accept "close enough". Label the before/after directories by commit hash and
  checksum both (the 2026-09-02 memory records exactly this mislabel).
- *One implementation, not two.* The URL-param build's hues, the app's hues, and the script's dry-run
  table for the same palette must match to the degree. Any drift means the script stopped calling
  `recolorWorld`.
- *The warp matches the world.* With the red/yellow palette applied, drive the grading-break warp on the
  preview route and screenshot mid-warp: motes warm/red, ground dark red-black, no blue.

**Rollback.** `git checkout --` each file above; `worldCache` and the URL params are additive and inert
without a palette.

**Commit** (stage by name): `Ring palette is a per-show runtime value — Apply recolours the world, the
script now only moves the certified base`.

**STOP here for Session 1.** Report: the three screenshot dirs, the gate lines verbatim, the FAIL-list
diff, the four flags below.

---

## Phase 2.5 — drift (Session 2, first)

**Files:** `client/src/lib/weightedPalette.js` (+test), `client/src/lib/ringRecolor.js` (+test),
`client/src/components/display/RingAmbient.jsx` (one token), `concepts/world-07-ring.html` (one token
+ `&drift=` param), `client/src/views/AmbientAudit.jsx` (`&drift=`), `scripts/ring-recolor.mjs`
(`--drift N` for the dry-run table only — `--write` refuses a non-zero drift: the certified base is
drift 0), `client/src/components/host/WorldPaletteEditor.jsx` (slider 0–90, default 0 for existing
shows, plus the clipped-arc readout).

**`derivePalette({ ..., drift = { arc: 0 } })`:**
```js
const DEAD_BAND = [45, 80]                       // shared with paletteGenerator.js — export it from here
function driftPlan(anchorDeg, requestedArc) {    // → { dir, arc }
  const up = ((DEAD_BAND[0] - anchorDeg) + 360) % 360      // room before yellow, going up
  const down = ((anchorDeg - DEAD_BAND[1]) + 360) % 360    // room before chartreuse, going down
  const dir = up >= down ? +1 : -1
  return { dir, arc: Math.max(0, Math.min(requestedArc, (dir > 0 ? up : down) - LADDER_HALF)) }
}
const rot = (c, i) => plans[c].dir * plans[c].arc * (1 - Math.cos(2 * Math.PI * i / stationCount)) / 2
```
Cost function: `hueDelta(currentHues[i], anchors[c].deg + rot(c, i))`. Hue: `anchors[c].deg + rot(c,i)
+ ladder[c][pick]`, with `pick = j` (ring order) when `drift.arc > 0`, the existing outside-in
alternation when 0. Emit `hueAnchorsAt: stations.map(i => anchors.map((a, c) => ({ deg: norm(a.deg +
rot(c, i)), window: a.window })))` and `driftPlans`. `recolorWorld` sets `stations[i].hueAnchors =
hueAnchorsAt[i]` for every station (cheap, uniform) and `palette.drift`. `regionHueWarnings` gets the
source station's anchors.

**Tests:** `drift: {arc: 0}` → output deep-equals today's for the frozen fixture (byte-identical
guarantee); `arc: 60` on purple/blue → every station inside its own `hueAnchorsAt[i]` window; station
0 and station 12 anchors within `0.24·60` of each other (closure); no station hue in the dead band for
purple/blue, red/magenta, red/blue (red gets `dir = −1`, arc clipped ≥ 0, printed); adjacent
same-colour rungs 6° apart under drift (ring order); `driftPlan(8, 60)` → `{ dir: -1, arc: 60 }` and
`driftPlan(25, 60).dir === -1`; `driftPlan(271, 200).arc === 116`.

**Verify.** `npm run test:unit`; `npm run build`; `npm run verify:ring` with **no params** must be
byte-identical to the Phase 2 result (the base has drift 0). Then render purple/blue at drift 60 via
`?colors=…&weights=…&drift=60` on the audit route, screenshot all 13, look at the sequence as a strip
(`montage` or just open them in order): the hue must walk, not jump.

**Falsifier.** *Pick any adjacent pair in the drift-60 strip and read the two headline hues off
`window.__world.WORLD.stations`; if any pair differs by more than the ladder step (6°) + the bump's
local step (≤ 15° at arc 60) + the two-colour interleave (the palette's own separation), the rung
handout is still alternating or the closure is broken. And: the accent stations' companions must be
the far palette colour **as rotated at that station** — read the companion's rendered hue at st3, st6,
st12 and compare with `hueAnchorsAt[i]`; a companion at the unrotated anchor means the one-token
build edit didn't land in that build.* Also predict before rendering: the drifted purple/blue world at
arc 60 goes violet→blue→teal→blue→violet around the lap; if it goes toward magenta, `dir` is inverted.

**Rollback.** `git checkout --` the files; `drift` defaults to 0 everywhere.

**Commit:** `Drift: station anchors walk a closed bump around the ring, away from yellow — the colours
flow instead of sitting in blocks`.

---

## Phase 2b — sweep the gate over palettes (Session 2, after drift)

**File (new):** `concepts/tools/palette-sweep.mjs`. Imports `runChecks` from `ring-verify.mjs` — the
gate's own code, never a fork. Needs its own 20-line static file server and its own vite on a free
port (`startStaticServer`/`spawnViteOn` are not exported from the gate and this plan does not edit the
gate to export them; copying a static-file shim is not copying check logic). One palette per
invocation: `node concepts/tools/palette-sweep.mjs --label 'crimson-gold' --colors '#dc2626,#eab308'
--weights '0.6,0.4' [--html-only]`. Appends one row per build to
`concepts/.audit-shots/palette-sweep-<date>/summary.md`: label, regression FAIL count and names, the
safe-box mean/p99.5 per station (from `runChecks`'s returned results' detail strings — parse, don't
recompute), and the max `lumaProxy` rise over the base for that palette.

**Run order (known-answer probe first, rule zero):**
1. `--label base --colors '#a855f7,#3b82f6' --weights '0.65,0.35'`? **No** — the base is the file's
   own hues, not a palette. Run the base as **no params at all** and assert the summary row equals
   today's verdicts (34/34 green; safe-box numbers identical to `npm run verify:ring`'s). If it
   doesn't, the sweep is broken; stop.
2. A deliberately bad palette inside the dead band: `--colors '#ffe000,#c8ff00' --weights '0.5,0.5'`.
   Predict before running: safe-box p99.5 rises at the stations whose headline glow overlaps the box
   (st11, st3, st0 per the 2026-08-17 ledger entry). If nothing moves, the sweep isn't measuring
   station colour — stop.
3. The six `PRESETS`, drift 0.
4. Three of them again at drift 60 and one at its per-colour cap (`--drift`), so the hue→luma ride on
   the arc crest is in the table.
5. Ten generated palettes (Phase 3's generator, seeds 1–10, each with its own drawn drift) — so run
   Phase 3's pure module first, wire the button after.

Each run is ~2–3 minutes per build; ~22 rows × 2 builds ≈ 2 h of wall time. Run them in the
foreground one at a time (no background agents on this project). Nothing else may save into this
checkout while the react-live pass runs (instrument ten, second shape: HMR).

**Falsifier.** *If the base row differs from `npm run verify:ring`'s numbers by more than the ~0.1
noise floor (ledger, instrument eight), the sweep is lying — fix the instrument before reading any
palette row.*

**STAYS HUMAN, from the summary:** Ben picks `LUMA_RISE_MAX` (the generator's reject threshold) from
the palettes that stayed green vs. went red, and decides whether "base certified + N sampled palettes
green" is an acceptable substitute for per-palette gating. Write both questions and the table into the
report; don't pick.

---

## Phase 3 — seeded random palette generator (Session 2)

**Files:** `client/src/lib/paletteGenerator.js` (new, pure), `client/src/lib/paletteGenerator.test.js`
(new), `client/src/components/host/WorldPaletteEditor.jsx` ("Surprise me").

```js
import { rng, hash32 } from './ringEngine.js'
import { derivePalette, hexToHslHue } from './weightedPalette.js'
import { regionHueWarnings } from './ringRecolor.js'
import { skyRegionHues } from './ringPrimitives.js'

export const DEAD_BAND = [45, 80]          // HSL degrees — yellow through chartreuse; olive at object lightness
export const MIN_SEPARATION = 60           // ±25 windows + margin
export const LUMA_RISE_MAX = null          // STAYS HUMAN — set from the Phase 2b sweep, null = check disabled

export function seedFrom(text) { /* FNV-1a 32-bit of a string */ }

// Deterministic: same seed → same palette. Returns { colors, weights, seed, tries }.
// Never Math.random. Bounded re-roll; falls back to BASE_PALETTE after 64 tries.
export function generatePalette(seed, base, baseTheme) {
  const r = rng(seed, 0xC0105)
  for (let t = 0; t < 64; t++) {
    const k = r() < 0.25 ? 3 : 2
    const hues = pickHues(r, k)           // uniform outside DEAD_BAND, pairwise ≥ MIN_SEPARATION
    const colors = hues.map(h => hslHex(h, 0.70 + r() * 0.25, 0.50 + r() * 0.15))
    const weights = pickWeights(r, k)     // heaviest 0.55–0.70
    const drift = { arc: Math.round(DRIFT_MIN + r() * (DRIFT_MAX - DRIFT_MIN)) }   // 30–90 by default; driftPlan clips per colour
    if (accept({ colors, weights, drift }, base, baseTheme)) return { colors, weights, drift, seed, tries: t + 1 }
  }
  return { ...BASE_PALETTE, seed, tries: 64, fallback: true }
}
```
`DRIFT_MIN`/`DRIFT_MAX` = 30/90 to start; the picker's slider and Ben's eye set the real range.
`accept` = no overlap warning from `derivePalette`, `regionHueWarnings` empty for the derived stations,
and (when `LUMA_RISE_MAX` is set) max `lumaProxy` rise ≤ it. `BASE_PALETTE` = `{ colors: ['#a855f7',
'#3b82f6'], weights: [0.65, 0.35] }` (the picker's default).

**Tests:** property test over seeds 1…1000 — every anchor outside `DEAD_BAND`, all pairs ≥ 60° apart,
zero overlap warnings, zero region warnings, weights sum to 1 with the heaviest in [0.55, 0.70],
`generatePalette(s) deep-equals generatePalette(s)`, `fallback` never set across those 1000 (if it is,
the constraints are too tight — report the seed, don't loosen silently). `seedFrom('abc') !== seedFrom('abd')`.

**UI:** a "Surprise me" button next to the presets: `applyPalette(...generatePalette(seedFrom(String(Date.now())), midnightGalaxyRing, baseTheme))`.
It writes plain `colors`/`weights` — the store never needs to know a seed existed. Show the seed in the
technical-details panel so a palette Ben likes can be recreated.

**Verify:** `npm run test:unit`; `npm run build`; click it five times in the picker, screenshot the
preview at station 3 and 11 each time, look for olive. Then run five of them through Phase 2b's sweep.

**Falsifier.** *A generated palette that produces olive at station 3 or 11 in the preview means the dead
band is wrong or the ladder is leaking — report the seed and the rendered hue, don't widen the band by
feel; that edge is Ben's.*

**Rollback.** Delete the two new files; revert the button.

**Commit:** `Seeded palette generator with a dead band for yellow-green — "Surprise me" in the picker`.

---

## Phase 4 — per-round rotation + start station (Session 3; Ben said yes)

**Premise.** 12 turns close the loop; a round is roughly one lap. A new seed per round — new palette,
new drift arc, new start station — while the jukebox overlay covers the screen, so the rebuild is
never seen. Within a lap the world stays one place (the drift flows, nothing cuts); between laps it
is a different night. That is "varied round to round" without a seam.

**Task 4.0 — remount landing (RingAmbient.jsx, one line, its own falsifier).** `lastSlideIndexRef =
useRef(null)` instead of `useRef(slideIndex)`, so a mount with a numeric `slideIndex` jumps to it
(`ringNavAction(null, n) === 'jump'` — the behaviour its own comment already claims: "align even if Go
Live resumed mid-show"). Also audit the `stationOverride` effect on a fresh mount: `returnStationRef`
must record the slide's station, not 0 — with 4.0 the layout effect runs first, so read the order and
prove it with a Playwright check: mount with `slideIndex=7` → `window.__world.station === 7`; mount
with `slideIndex=7, stationOverride=10` → station 10 and, on `RING_RETURN`, back to 7. Then the full
gate (this touches production ring code). **Falsifier:** if the persistent ring in a real show now
turns twice on Go Live, 4.0 changed first-mount behaviour — revert and stop.

**Task 4.1 — the round seam.** `Display.jsx` computes `roundIndex` for the current slide and passes
`paletteEpoch = roundIndex + (breakActive ? 1 : 0)` down; `ParticleBackground` (with the mount-freeze
from Phase 2 replaced by `key={theme.id + '|' + JSON.stringify(palette)}`) picks
`palette = generatePalette(seedFrom(show.id + ':' + paletteEpoch))` when `theme.worldPalette.mode === 'per-round'`.
The key changes the moment the break starts → RingAmbient remounts under the jukebox overlay → 'back'
warp reveals the new world already built. The `mode` flag and seed are set by a per-show toggle in
the picker ("New palette every round").

**Task 4.1b — start station (the cheap extra axis).** `worldData.startStation` (0–12, drawn from the
same seed) and, at the end of RingAmbient's mount effect, `if (worldData.startStation) jumpTo(worldData.startStation)`
before `writeOffsets()`. Loudness, ink, sky regions per station are untouched — the ring just opens
on a different object. With Task 4.0's jump-on-mount, the slide-index alignment then adds
`startStation` inside `jumpTo`'s modulo (`(slideIndex + startStation) % PANES`) — read `jumpTo` and
`turn`'s wrap arithmetic before deciding where the offset goes; it must be applied in exactly one
place or the break round-trip drifts by it. Gate-neutral: the gate drives its own `jumpTo` from 0 and
never sets `startStation`. **Falsifier:** slide 1 of a show with `startStation: 4` shows the lit planet;
after 13 slides it shows it again; the break returns to the same station it left.

**Falsifier.** Drive a real preview show through a break with the display screenshotted every 250ms;
no frame between warp-out end and warp-back start may show a half-built or wrong-palette ring, and the
station after the break must equal the station before it (the round-trip contract in RingAmbient's
own comment).

**STAYS HUMAN before starting:** Ben accepts that the first slide after a break shows a world the gate
never measured one-by-one (question 3, per round), and has seen a per-show palette on the real TV first.

---

## STAYS HUMAN — questions for Ben, not agent decisions

1. **Cadence — settled by Ben:** per-show yes, per-round yes. **Per-station = the drift, and the open
   question is its width:** "How far should the colours travel around the lap — a gentle 30°, the
   default 60° (purple walks to blue-teal and back), or up to the per-colour cap (~120°, where a
   two-colour world starts to read as a rainbow)? And do you sign off that the spec's 'anchor windows
   constant across the ring' becomes 'the anchor *curve* is constant' — that is a change to §4/§10."
   Discrete swaps every 2–3 stations are not offered (glide/bleed cut); the drift is that idea done
   without the cut.
2. **The dead band.** Anchors in HSL [45°, 80°) are rejected by the generator and warned in the picker.
   Accept, or allow yellow and accept olive shadows on every object? (The picker's warning text: "This
   yellow will read olive on the darker parts of objects. #ffb000 reads gold.")
3. **Certification.** Per-show palettes are not gate-run one by one. The base world stays certified;
   Phase 2b samples the generator's output space. Is that enough to ship per-show palettes? (The
   2026-08-31 plan left this exact question open.)
4. **`LUMA_RISE_MAX`** — pick from the sweep table, or leave the check off.
5. **Region hue clamp** — leave as warn/re-roll (my recommendation) or clamp (changes the shipped
   ember sky from 26° to a window edge).
6. **Aesthetic acceptance** of any palette on the real TV — the TV test is still outstanding on this
   project; none of the screenshots here substitute for it.
7. **Task 4.0** changes when RingAmbient jumps on mount — a production ring behaviour change even
   though it matches the documented intent. Yes/no.
8. **Live Apply.** With Phase 2 as written, Apply mid-show shows on the next display reload. Fine for
   now (palette is set in Build Mode), or is live apply required (then Task 4.0 moves into Session 2)?
9. **Drift range in the generator** (`DRIFT_MIN`/`DRIFT_MAX`, 30–90 proposed) and whether the base
   world in the files should ever carry a drift (my answer: no — the certified base stays drift 0,
   drift is a per-show property).
10. **More stations** — a separate project, sized above; not this month unless he says otherwise.

---

## Do not do this (traps specific to this codebase)

- Do not edit `ring-verify.mjs` pass/fail logic, `ring-spec.lock.json`, `ship.sh`, or any cap. Do not
  chase the 14 spec-tier FAILs. Do not "fix" the WARNs.
- Do not convert the `hsla()` sites to CSS vars or to OKLCH. Do not touch `ringPrimitives.js` at all
  in Sessions 1–2 (Phase 1 needs nothing from it; Phase 2 only imports `BASE_TINTS`).
- Do not edit `RingAmbient.jsx` in Session 1. Session 2's only edit to it is the one-token
  `st.hueAnchors ?? world.hueAnchors` (Phase 2.5); nothing else until Phase 4. Do not add a `key` to
  it in Phase 2 (remount → station 0).
- Do not recolour from a recoloured world. `recolorWorld` takes the authored module; `ring-recolor.mjs`
  reads the file's current hues only to print the "from" column.
- Do not add or remove an `r()`/`rHeadline()`/`rCompanion()`/`rDetail()` draw anywhere. Nothing in this
  plan needs one.
- Do not use `Math.random` in anything `world-07-ring.html` imports (the static gate check).
- Do not run the react-live pass with anything else on 5173 or any session saving into this checkout;
  `lsof -nP -iTCP:5173 -sTCP:LISTEN` and `pgrep -fl vite` first; own port for your own vite.
- Do not point Playwright at Ben's Chrome. Bundled Chromium only.
- Do not mutate a live show's `theme_overrides` to test. Throwaway show or the preview route; delete after.
- Do not label a directory "before" unless it was rendered from the pre-change commit; checksum both.
- Do not treat `lumaProxy` as a verdict. Do not treat a gate number as real without the known-answer
  base row next to it.
- Do not `git add -A`; another session's files are dirty in this tree. Do not push.
- Do not edit `references/ring-world-mistakes.md`, `references/themes.md`, or the spec — flag in the
  report.
- Do not dispatch subagents for the rendering/verification steps; do them in the foreground.

---

## Flags for Ben (found while reading, not fixed)

1. `references/themes.md:24` "Ring worlds are palette-fixed by design" becomes false after Phase 2.
2. `references/ring-world-mistakes.md` "Live state" still says the gate is non-blocking and the ring
   is dev-only; both stale since at least 2026-08-31.
3. `RingAmbient.jsx` first-mount jump: with a numeric `slideIndex` at mount it does not jump (Task 4.0).
   Today's persistent-ring path is fine because it mounts pre-show; the `isDemo`/`isPreview` paths
   that mount with a numeric index may be off by the initial station — worth a look, unrelated to colour.
4. `midnightGalaxy.ring.js`'s `qColours` are computed at module load from the base theme, so per-show
   text-colour overrides never reach the ring's question colours either. Same class as the palette
   problem; separate task.
5. The yellow physics: no colour-space trick makes a yellow anchor read as bright yellow on a dark
   world without blowing the luminance cap. The honest product answer is "gold/amber, not lemon."
