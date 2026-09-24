# Ring World Night Color Evolution — Design

**Status:** draft, awaiting Ben's review before writing-plans.

## Goal

The midnight-galaxy ring world's color palette should visibly evolve over the course of a night
instead of staying one fixed duo the whole show. Ben, in his own words across this conversation:

- "in theory i want the random world to be colorful. like the space is in guardians of the galaxy"
- "and it goes from ice to blue to red etc etc etc"
- Trigger: **every X slides** (a slide-advance counter, not a clock or a manual button)
- Sequence: **10-12 curated 2-color "duos"**, connected by a **branching pairing graph** — a duo can
  have more than one valid next-duo, and an edge exists only because that specific transition "looks
  good" (his words: "ie look good" / "good") — an aesthetic call, not a formula
- Vividness ask, clarified: **more hue *variety*** ("i want more color to make the build feel more
  alive. im already tired of the current show color duos we have"), not more saturation/brightness.
  This explicitly keeps the fixed saturation/lightness color treatment (`ring-world-mistakes.md`'s
  "verified good, do not touch") out of scope for this project.
- Transition, clarified: **visible, mid-round**, not hidden inside a grading break. And specifically
  a **live two-world split-screen** at the moment of transition — two `RingAmbient` instances
  rendering simultaneously side by side, not a covering beat, not a pre-baked "bridge" palette.

This is the "build it correctly, the bigger version" path, chosen explicitly over two smaller/safer
alternatives that were offered and declined: (a) once-per-round changes hidden under the grading-break
black warp, and (b) a pre-baked "half old duo / half new duo" bridge palette (a real, certifiable,
allocate-don't-blend world-state) used as a single ordinary slide.

## What already exists — do not rebuild

An independent critique pass (Opus 5.5, full session, cited file/line throughout) found the palette
*certification* side of this is largely already built:

- `client/src/lib/paletteGenerator.js`'s `PRESETS` already holds 11 named palettes (10 duos + 1 trio):
  Purple & Blue, Violet & Pink, Amber & Rose, Crimson & Gold, Plum & Ember, Purple & Crimson,
  Violet & Coral, Purple & Teal, Solar Flare, Amazon Dusk, Violet / Teal / Rose.
- `ring_palettes` (Supabase) is a certification shelf — 17 certified rows as of this session, each
  independently run through the real Playwright gate (`concepts/tools/ring-verify.mjs`) via
  `concepts/tools/palette-sweep.mjs`.
- `WorldPaletteEditor.jsx` already has Presets, a shelf strip, "Surprise me," and Apply (shelf-match
  only).
- The seeded-recompute pattern this project already uses elsewhere for "randomized but must survive
  host back-nav/reload without re-rolling" is `TeamPickerSlide.jsx`'s `seededShuffle(names, slide?.id
  ?? show.id)` — it stores nothing, it recomputes from a stable seed every render.

**Decision: reuse this shelf as the graph's node set.** The 10-12 duos are (mostly) already certified
presets. This project does not need a new certification model — it needs (1) more certified duo
*variety* than the current shelf has (see "Duo variety" below), (2) a graph of which certified duos
may follow which, and (3) the transition mechanism.

## Architecture

### 1. Duo graph + seeded walk

- An adjacency list over certified shelf rows: `{ duoId: [validNextDuoId, ...] }`. Ben authors the
  edges — "looks good" is an aesthetic call (STAYS-HUMAN, `ring-world-continuity.md` §4), an agent
  only validates graph *structure* (every node has ≥1 out-edge, the graph is strongly connected so a
  walk can't get trapped in a small cluster, no accidental self-loops).
- At Go Live (or show creation), pick a starting node from a seed derived from `show.id` (same
  `seedFrom()` helper `paletteGenerator.js` already exports). **Do not precompute and store a full
  "at slide N, duo X" sequence** — my first draft of this design proposed that, and it's wrong: it
  goes stale the moment a host adds a slide mid-show, and this app's own established pattern for
  exactly this class of problem (survive reload/back-nav without re-rolling) is a **pure recompute
  from a stable seed**, not a stored array. Store `{ mode: 'evolving', seed, graphVersion,
  ringVersion }` inside the existing `shows.theme_overrides` jsonb — already carried on both Host and
  Display (`useShow.js`, `ThemeProvider.jsx`), so this needs **no new column** and sidesteps the
  "two independent show-shape implementations drift" failure mode this app has already been bitten by
  once (`SKILL.md`, useShow.js section).
- A pure function, `client/src/lib/duoWalk.js`: `duoWalk(seed, graph, stepIndex) -> duoId`, walking
  the graph deterministically off the seed (same `rng()` helper `ringEngine.js` already exports —
  never `Math.random`). Both Host (picker preview) and Display import it; neither computes an
  independent answer.
- **The index must be the ring-visible slide count, not raw `current_slide_index`.** `Display.jsx`
  already computes this exact thing (`ringVisibleStationIndex`, ~line 973) for the ring's own station
  panning — reuse it, don't recompute a second slide-counting scheme.
- Nodes are filtered to shelf rows certified at the *current* `RING_VERSION` before the walk runs,
  falling back to the base world if none qualify — the same graceful-degradation pattern
  `ringWorldFor.js` already uses. A `RING_VERSION` bump (which invalidates the whole shelf at once,
  per `ringCertification.js`) must not be able to crash or blank the display.

### 2. Trigger: every X slides

X is a pacing/aesthetic value — STAYS-HUMAN, Ben's call, not chosen here. Counted in ring-visible
slides (see above), so it tracks what the ring is actually doing, not raw slide-authoring structure
(bonus/custom/team-picker slides etc. that don't drive the ring at all shouldn't silently change the
cadence).

### 3. Duo variety — a real prerequisite, not a nice-to-have

A second independent pass (Codex, read-only, given the real `ring_palettes` history) found *why* the
current shelf clusters around purple/violet and red/orange/gold: it's not the generator's own hue-
separation band (`MIN_SEPARATION = 60°` in `paletteGenerator.js`) — a generated blue/green pair at
~70° separation still failed certification, while the certified "Purple & Blue" preset is only ~54°
apart. The real cause is **downstream**: `derivePalette`'s station-identity-aware assignment can land
a blue/green anchor on station 0 (ringed planet, fixed base hue 256°) at its lowest drift rung, which
pushes that station's glow past the safe-box luminance cap at certification time (`ring-verify.mjs`).
It's a disadvantage, not a hard ban — "Amazon Dusk" (55% green) is certified proof the space isn't
empty, three similarly-shaped candidates just failed in the same sweep session.

**Highest-leverage fix, per that same pass:** `palette-sweep.mjs` currently takes the *first*
candidate a seed produces that passes the generator's cheap checks, certifies-or-bins it, and moves
on — a gate failure doesn't make that seed retry with a different candidate. Change the sweep to
retry multiple candidates per seed, sampling across more hue families/weights/drift, keeping whatever
newly-certified duos add real hue variety to the shelf. This does not touch `DEAD_BAND`,
`ANCHOR_WINDOW`, or any verification threshold — all explicitly off-limits (Ben's prior calls, cited
in `weightedPalette.js`'s own comments and `ring-world-continuity.md` §4).

**This is a real prerequisite for the graph, not parallel work**: a 10-12 node branching graph needs
10-12 actually-distinct certified duos to be worth building at all. Recommend running (and if needed,
improving) the sweep tool *before* authoring the graph, so Ben is picking edges between genuinely
different-feeling duos rather than five purple variants.

### 4. Transition mechanism: live two-world split-screen

This is the highest-risk, least-precedented part of this design, and it should be named as such
rather than smoothed over.

**What's already ruled out, on record:** true live per-station recoloring of one already-mounted
world (`docs/superpowers/plans/2026-09-02-ring-palette-runtime.md`, "Why step 2 (live per-station
vars) is a trap") — costs exactly the same as a full rebuild (~5,465 elements re-resolving at once)
with no black frame to hide it in, so it buys nothing over a real remount. That's why every existing
palette-change path in this app (per-show, and the planned-but-unbuilt per-round) works by rebuilding
a *whole world* behind something that covers the screen — the grading-break's black warp is the only
place that currently exists.

**What Ben wants instead:** no cover, no cut. Two `RingAmbient` instances mounted and rendering
*simultaneously*, side by side, showing the outgoing duo and the incoming duo at once, with the
split itself presumably moving/resolving over the transition (exact visual shape — a hard vertical
line, a diagonal wipe, something organic — is undecided, STAYS-HUMAN, Ben's call once he's seen
options).

**What's genuinely unknown and needs validation before this is designed further, let alone built:**
- Perf: this app's ring-render cost has only ever been measured for *one* mounted world (~5,465
  elements, 56-59fps per prior benchmarking). Two at once is untested. If real frame rate drops
  during the transition, that's the worst possible moment for it to happen — visually.
- Pan/drift sync: both worlds' ambient panning must stay phase-locked to each other, or the split
  reads as two unrelated scenes glued together rather than one world becoming another — directly
  against this subsystem's own standing "panning always feels connected" principle.
- Mount/unmount choreography: which world is "new" and takes over the single ring-visible-slide-index
  bookkeeping once the transition resolves; what happens if the host navigates backward mid-transition
  (Stream Deck back button exists and is used).
- Where the split boundary's geometry comes from, given the ring is a circular/radial scene, not a
  naturally bisectable rectangle — a literal left/right screen split doesn't map onto "half the
  stations" the way it might for a linear scene.

**Spike run 2026-09-24 — findings, not a final answer.** Two `RingAmbient` instances mounted
side-by-side (static 50/50 split, no pan-sync, no animation), measured via Playwright the same way
`assert-performance-budget.mjs` measures this app's own perf elsewhere:

- Two worlds cost **~2.14x** one world (13,824 DOM nodes vs. 6,924) — near-linear with element count,
  no nonlinear blowup. Mechanically sound at this scale.
- Headless measurement: 79.4fps (one world) vs. 37.1fps (two). Headless Chromium isn't vsync-capped
  like a real display, so this absolute number reads high — **the ratio is the trustworthy part, not
  the fps number itself.**
- Applying that same ~2.14x cost to this doc's cited real-hardware baseline (56-59fps, one world)
  extrapolates to **~26-27fps for two worlds on the actual target TV** — above the app's hard floor
  (24fps, `assert-performance-budget.mjs`) but thin margin for the single moment the spec already
  named as the worst possible time for a stutter. **Not yet confirmed on real hardware.**
- Naive static split: a hard seam, no blend, reads as "two scenes glued together" — exactly the
  concern this section already named. Expected for an untuned first pass; split geometry is still
  Ben's call.
- Pan/drift sync was not exercised — neither instance was animated. Still genuinely unknown.

**Real-hardware confirmation, same day, headed (on-screen) Chromium on the actual show laptop
(not headless):** ~86.6fps one world, ~33-34.6fps two worlds (min 29-33fps across two runs) —
comfortably above the 24fps floor, better than the earlier headless-derived extrapolate. Full-
fidelity worlds on both sides is confirmed viable; the lighter-weight fallback above was not needed.

**v2-v4 — live iteration against real feedback, same day, in `client/src/views/AmbientAudit.jsx`'s
`?split=1` branch (throwaway spike code, not production):**
- v1 (static hard `width:50%` clip): rejected live — "there is absolutely no flow at all," "the hard
  cut off isnt good."
- v2 (full-bleed overlap, static CSS `mask-image` gradient feather on both layers): "closer," but
  flagged as needing an angled boundary whose angle/position/feather change over time, and the
  underlying worlds' own drift should be part of what changes — "literally feeling random" (organic,
  not mechanical).
- v3 (`requestAnimationFrame`-driven mask angle/center/feather via summed non-commensurate sine
  waves; independent jittered `turn()` schedules per world): visually closer, but a read-only Codex
  review (model `gpt-6-astra`) against the real v3 code found two real defects, not aesthetic notes:
  1. **Compositing math bug** — complementary masks on two layers painted over black
     double-attenuate the overlap (source-over: midpoint is 50% top + 25% bottom + 25% black, not a
     true 50/50) — a real brightness trough, not just a hard edge.
  2. **Independent panning was structurally wrong** — each world advancing on its own schedule means
     the two can land on different stations with unrelated content meeting at the seam; no mask
     blending fixes misaligned content underneath it. The spec's own §4 draft already named
     phase-locked panning as a requirement; v3 didn't have it yet.
- v4 (current): bottom world left fully opaque/unmasked, only the top world masked (fixes #1); one
  shared scheduler calls `turn()` on both refs at the same moment so both worlds share one camera
  (fixes #2) — the boundary's own motion is now the only thing that "feels alive," decoupled from
  panning. Live review: "better."

**Known accepted gap, not fixed, explicitly deferred (Ben: "it wont ever be perfect in theory,
continue working"):** each mounted `RingAmbient` instance still runs its own independent
twinkle/breathe/shooting-star timers — same review flagged these can still mismatch phase right at
the seam even with panning now synced (a meteor crossing the boundary, a star twinkling out of phase
with its mirror on the other side). Worth a look if the seam still reads as "two things" once this
is actually built, not blocking the build.

## Open questions — Ben's call, not decided here (STAYS-HUMAN)

1. X (the slide-count interval) — pacing, needs to be seen live, not guessed at in a spec.
2. The actual 10-12 duos and the graph's edges — "looks good" is aesthetic, his to author, once the
   sweep tool has produced more real variety to choose from.
3. The split-screen's visual shape (line, wipe, something else) — pending the perf spike above.
4. Whether a host mid-transition back-nav should abort/reverse the split or let it resolve.

## Explicitly out of scope for this project

- Any change to `DEAD_BAND`, `ANCHOR_WINDOW`, or any `ring-verify.mjs` pass/fail threshold.
- Saturation/lightness/"more vivid" color treatment changes — a separate, protected project per
  Ben's own clarification in this conversation ("more color," not "more saturated").
- Any theme other than midnight-galaxy — it's the only theme on the ring engine today.

## Suggested build order

1. ✅ **DONE** — improved `palette-sweep.mjs` to retry-for-diversity (`6ede832`, pushed); a real
   batch run confirmed the fix works (seeds that failed attempt 1 certified on attempt 2, which
   never happened before this fix).
2. ✅ **DONE** — technical spike, real-hardware confirmed viable (86.6fps / 33-34.6fps, real headed
   Chromium on the actual show laptop). Transition visuals iterated live through v1-v4 (see spike
   findings above) — v4 is the current validated direction: shared single camera, corrected
   compositing, animated angled boundary. Known accepted gap: per-instance twinkle/star timers not
   yet synced (deferred, not blocking).
3. **Next** — move v4's approach from throwaway spike code (`AmbientAudit.jsx`'s `?split=1`,
   currently only in the spike worktree) into real building blocks: `duoWalk.js` (pure, tested) +
   `theme_overrides` wiring + a real two-world transition component, informed by v4 but not a copy
   of throwaway spike code.
4. Ben authors the actual duo graph — needs the sweep's expanded shelf (step 1) to have real variety
   to pick from.
5. Full `ring-verify.mjs` gate run before anything here reaches production, per this subsystem's
   standing rule.
