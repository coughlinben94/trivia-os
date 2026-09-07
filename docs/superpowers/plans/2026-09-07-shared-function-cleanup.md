# Shared function cleanup — 4 items from /simplify audit

## Context

A `/simplify`-style whole-repo audit (4 parallel research agents, read-only) found
duplicated/near-duplicate logic across trivia-os. One confirmed active bug from that
audit (sentinel-selftest.mjs missing a path-traversal guard) is already fixed and
committed separately (`b9d3e6a`) — not part of this plan. The 4 items below are
drift-risk / maintainability cleanup, no confirmed active bug among them, approved by
Ben to execute as a batch.

## Global Constraints

- No behavior change is the default assumption for every task — this is a refactor
  pass, not a bug fix pass. Where a task explicitly names a real drift risk being
  closed (Task 4's REC709_WEIGHTS constant), that's the only sanctioned exception, and
  it must not change which formula each caller uses (gamma-corrected vs not), only
  remove magic-number duplication.
- `npm run test:unit` must stay at 741/741 pass after every task.
- Where a task touches ring/world files, run `npm run verify:ring` and confirm no new
  regression vs the documented main baseline (regression tier 34/34, spec tier
  49 PASS / 2 WARN / 14 FAIL — the same 14 pre-existing FAILs, no new ones).
- Do not touch `FACT-HUNT-PROGRESS.md` or `FACT-HUNT-BANK.txt` — unrelated in-progress
  work, not part of this plan.
- Never dispatch multiple implementation subagents in parallel — tasks run
  sequentially in this session (per subagent-driven-development's own rule).

## Task 1: Extract shared reveal-group chunking helper

Highest-value item — this exact duplication already caused a live bug once
(2026-08-25, "pyl song lyrics ... already had the first answer revealed" — see
`client/src/lib/slideStepping.js`'s own header comment around its `revealStepCount`
function for the incident note).

**Files:** `client/src/lib/slideStepping.js`, `client/src/components/display/slides/QuestionSlide.jsx`
(specifically `ShinyConcurrentQuestion`, currently ~lines 1167-1197).

**Problem:** `slideStepping.js`'s `revealStepCount()` computes
`Math.ceil(parts.length / groupSize)` (+1 for concurrent reveal) as a Next/Prev step
*count*. `QuestionSlide.jsx`'s `ShinyConcurrentQuestion` independently chunks `parts`
into `rowGroups` via a manual for-loop using the same `groupSize`, to build actual
*render* groups. A code comment at QuestionSlide.jsx:1176-1177 explicitly says
"slideStepping.js's stepCount mirrors this chunking" — i.e. two hand-synced
implementations of the same grouping law, kept aligned only by comment discipline.

**Change:** extract one shared `chunkParts(parts, groupSize)` helper — returns an
array of arrays, chunked in order, same semantics as `ShinyConcurrentQuestion`'s
existing for-loop. Put it in `slideStepping.js` (it already owns `revealStepCount`
and is the natural shared-logic home for this file pair). `revealStepCount()` derives
its count from `chunkParts(parts, groupSize).length` instead of hand-computing
`Math.ceil`. `ShinyConcurrentQuestion`'s manual chunking loop is replaced with a call
to the same `chunkParts()`, imported from `slideStepping.js`. Delete the "mirrors this
chunking" comment at QuestionSlide.jsx and replace with one line pointing at the
shared helper (why: so a future reader isn't left with a stale comment describing a
sync discipline that no longer exists once there's only one implementation).

**Tests:** run existing `slideStepping.test.js`. Add (or extend an existing test) that
asserts `revealStepCount(parts, groupSize)` and `chunkParts(parts, groupSize).length`
agree across a handful of `(parts.length, groupSize)` combinations, including a
non-even division (e.g. 7 parts, groupSize 3) — this is the exact invariant that broke
before, so the regression test should actually exercise it.

## Task 2: `sortSlides` — import instead of reimplementing inline

**Files (mechanical, one-line swap each, ~13 call sites):**
- `client/src/hooks/useShow.js` (2 sites)
- `client/src/views/Display.jsx` (3 sites)
- `client/src/views/Join.jsx` (1 site)
- `client/src/views/Shows.jsx` (2 sites)
- `client/src/views/ShowDetail.jsx` (2 sites)
- `client/src/components/host/BuildMode.jsx` (2 sites)
- `client/src/components/host/SlideEditor.jsx` (1 site)
- `client/src/lib/previewSlide.js` (1 site)
- `client/src/lib/shinyTitleMigration.js` (1 site)
- `client/src/lib/questionNumbering.js` (1 site)

**Change:** `slideStepping.js` already exports `sortSlides` (currently
`[...slides].sort((a,b) => a.order - b.order)`, `slideStepping.js:69-71`). Every site
above reimplements the identical one-liner inline instead of importing it. Replace
each inline sort with a call to the imported `sortSlides(slides)`.

**Guardrail:** the audit confirmed all 13 sites are byte-identical to the canonical
version today, so this should be a pure like-for-like substitution. If, while editing
any site, its actual sort call differs even slightly from the canonical one-liner
(different comparator, secondary sort key, etc.) — STOP editing that specific site,
leave it as-is, and report it as a real behavior question rather than silently
unifying it.

**Tests:** full test suite. Grep confirms no remaining inline
`.sort((a,b) => a.order - b.order)` (or equivalent) pattern anywhere outside
`slideStepping.js`'s own definition.

## Task 3: Jukebox rAF loop — shared `useRafLoop` hook

**Files:** `client/src/jukebox/components/AlbumGradientMesh.jsx`,
`client/src/jukebox/components/StationRingLayer.jsx`, plus a new file —
`client/src/jukebox/hooks/useRafLoop.js` (colocate with the jukebox since both
consumers live there; create the `hooks/` dir if it doesn't exist).

**Change:** both files share a near-identical rAF lifecycle: `mountedRef`/`activeRef`
refs, a `startLoop()`/`tick()` split, `cancelAnimationFrame` on unmount, and a
`prefers-reduced-motion` gate that renders one static frame instead of looping.
Extract this into `useRafLoop(callback, { active, reducedMotion })`: the hook owns
the mounted/active refs, the rAF scheduling, and the reduced-motion short-circuit;
`callback` is the per-frame draw/tick body, called by the hook each frame (or once,
for the reduced-motion static-frame case).

**Before extracting, read both files' exact reduced-motion handling in full** — do
not assume they're identical. If they diverge (e.g. one calls `draw()` with a fixed
timestamp argument and the other doesn't, or the resize-triggered redraw differs),
either parameterize the hook to cover both, or leave the divergent piece inline in
whichever file needs it and only share the common core. Do not force them into
identical behavior if the current behavior genuinely differs — that would be a
behavior change, out of scope for this task.

**Explicitly out of scope — do not touch:** `WarpTransition.jsx`, `ChestDuel.jsx`,
`BoxingRing.jsx`, `StateOfUnionSlide.jsx`, `TeamPickerSlide.jsx`, `ThemeCanvas.jsx`.
The audit already checked these and found their per-component state machines
different enough that a shared hook would only save a few lines of raf/cancel
boilerplate while adding indirection — not worth it.

**Tests:** full test suite. These are canvas animations with no direct unit coverage
of visual output — after the refactor, do a quick live check: run the dev server,
navigate to a view that mounts the jukebox (grading-break overlay), and confirm via
Playwright (screenshot before/after a short wait, or a `canvas.toDataURL()` diff) that
both `AlbumGradientMesh` and `StationRingLayer` still animate — i.e. the hook actually
calls the callback on a loop, not just once. This catches the most likely regression
class ("hook never re-schedules") without requiring a full visual/aesthetic review.

## Task 4: Color math consolidation into `oklab.js`

Run this task **last**, after Tasks 1-3 are committed — it shares
`StationRingLayer.jsx` with Task 3 (different functions in the same file: Task 3
touches its rAF lifecycle, Task 4 touches its `hexRgb` helper), and running them
sequentially avoids two subagents editing the same file in overlapping ways.

**Files:** `client/src/lib/oklab.js` (target/canonical home — already treated as the
shared "pure color math" module; `AlbumGradientMesh.jsx` already imports its OKLab
functions from here), `client/src/lib/colorTint.js`, `client/src/lib/contrast.js`,
`client/src/lib/paletteGenerator.js`, `client/src/lib/weightedPalette.js`,
`client/src/components/display/slides/TeamPickerSlide.jsx`,
`client/src/jukebox/components/StationRingLayer.jsx`,
`client/src/jukebox/components/GradientColorPicker.jsx`, and — for the
`REC709_WEIGHTS` constant only — `concepts/tools/ring-verify.mjs`.

**Explicitly out of scope — do not unify:** the three luminance formulas
(`contrast.js`'s WCAG-conformant sRGB-gamma-corrected version, `weightedPalette.js`'s
`lumaProxy` un-gamma-corrected "advisory only" version, and `ring-verify.mjs`'s
`lumaAt` raw-pixel version) are *deliberately* different for different purposes per
their own code comments. Unifying them would be a real behavior/gate change, not a
refactor, and is explicitly not part of this task. Same for the HSL↔RGB round-trip
functions in `colorTint.js` and `contrast.js` — they use incompatible scale
conventions (0-1 fractions vs 0-100 percent) and are a real, separate, deferred item;
do not touch them in this task.

**Change, scoped to hex parsing/formatting only:**
1. `hexToRgb` (array-return form with the `[8,8,8]` fallback, currently in
   `oklab.js:7-14`) becomes the one canonical implementation. Update `contrast.js`,
   `TeamPickerSlide.jsx`, and `StationRingLayer.jsx`'s `hexRgb` to import and call it
   instead of reimplementing — adapt the *call site* to whatever output shape it
   needs (array vs `{r,g,b}` object), do not change `oklab.js`'s own return shape to
   match callers.
2. `rgbToHex` similarly consolidates `GradientColorPicker.jsx`, `contrast.js`, the hex
   path inside `colorTint.js`'s `formatColor`, and `weightedPalette.js`'s `labToHex`
   onto one shared implementation in `oklab.js`. `colorTint.js`'s `formatColor` keeps
   its own wrapper (it also handles `rgb()`/`rgba()` string output, which is out of
   scope here) but calls the shared hex formatter internally instead of reimplementing
   the byte-to-hex math.
3. Add a shared `REC709_WEIGHTS = [0.2126, 0.7152, 0.0722]` constant (in `oklab.js`,
   or a small new shared constants file if that reads cleaner — implementer's call,
   document which) that `contrast.js`, `weightedPalette.js`, and `ring-verify.mjs`'s
   `lumaAt` all import instead of re-typing the magic numbers inline. This closes the
   "look interchangeable, aren't" trap the audit flagged — it does not change which
   formula (gamma-corrected vs not) each site applies, only removes the duplicated
   literal.

**Tests:** full test suite AND `npm run verify:ring` (since `ring-verify.mjs` is
touched for the constant) — confirm regression tier still 34/34 green and spec tier
still matches the documented 49 PASS / 2 WARN / 14 FAIL baseline, no new FAILs. Also
check whether any existing test asserts concrete output values from
`paletteGenerator`, `weightedPalette`, or `contrast` (hex strings, luminance numbers)
— if so, those must pass unchanged, which is direct evidence the consolidation didn't
silently alter a formula's output.

## Sequencing

Tasks 1, 2, and 3 touch disjoint file sets (confirmed against the audit's file lists)
and can run in any order relative to each other. Task 4 must run after Task 3
completes (shared file: `StationRingLayer.jsx`). Recommended order: 1, 2, 3, 4.
