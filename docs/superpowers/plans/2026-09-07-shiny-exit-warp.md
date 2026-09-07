# Shiny Question Exit: Warp Transition + Skip the Title Slide — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every shiny question's exit (any shiny type — grid/visual/audio/list/wager/plain) reuses the jukebox's proven vortex (`WarpTransition.jsx`) instead of the current instant opaque-panel cut, and advancing forward off a shiny series never lands the host/TV on the standalone `shiny-title` announce slide as its own dead stop — the format name instead plays as a brief beat on the group's first content slide.

**Architecture:** Two independent changes, safe to land and verify separately:
1. **Display-side reveal:** `Display.jsx` detects "the slide we just left was shiny," and mounts `<WarpTransition dir="back" .../>` over the moment of the slide swap — same mechanism the grading-break→jukebox return already uses, just pointed at an ordinary forward advance instead of the jukebox handoff. `WarpTransition.jsx` gets a `durationMs` prop (default unchanged) so the shiny case can run faster than the jukebox's tuned-for-drama 2.5s.
2. **Navigation-side skip:** `computeNextStep` (the one function both the host's Next button and `/display`'s own TV-side stepping call) is taught that landing on a `type: 'shiny-title'` slide via a forward step isn't a real stop — it continues one more step onto that slide's first content sibling. That sibling announces the format name itself, once, on mount (a small shared overlay component), using a pure helper that answers "is this slide the first content slide of its shiny group" — reused by both `QuestionSlide.jsx` and `GridSlide.jsx` so every shiny type gets the same beat.

This explicitly does **not** touch `withShinyTitleSlide`, `buildShinyTitleSlide`, sidebar grouping, `resolveJumpIndex` (PYL board jumps), or `idsToDeleteWith` (delete cascade) — the `shiny-title` slide keeps existing exactly as today in the data model and in Prev/Go-Live-picker navigation (revisiting one on purpose still shows it). Only a *forward* Next press that would land on one is redirected past it.

**Tech Stack:** React 18, Framer Motion, vanilla Canvas 2D (`WarpTransition.jsx`), Vitest (`npm run test:unit`), Playwright (`npm run test:smoke` pattern) for live `/display` verification.

**Spec:** No separate spec doc — requirements captured directly in this plan from the working session that produced it (2026-09-07, Ben + Claude, session `session_01MoDt6X9Zd1Ya7pkPJfJ3z2`). Key prior-art precedent found during investigation: `slideStepping.js:466-474` documents that a "closing beat" pan-back-to-the-announce-card was tried between 2026-08-17 and 2026-09-01 and was explicitly *removed* as "a dead Next press for the host" — this plan is a variant of the same instinct (kill the dead press), scoped smaller (skip forward past the title, don't resurrect a pan-back).

## Global Constraints

- GPU-only animation rule: no new code may animate `width`/`height`/`color`/`box-shadow`/`filter` in a `@keyframes` block (Critical Rule 2, SKILL.md). `WarpTransition.jsx` is canvas-drawn, not CSS keyframes, so this constrains only Task 4's overlay.
- Every animated element needs a `prefers-reduced-motion: reduce` guard (Critical Rule 3). `WarpTransition.jsx` already has this (`isReduced()` — instant cut, `onDone` still fires); Task 4's overlay needs its own.
- `ParticleBackground` must never remount (Critical Rule 1) — nothing in this plan touches its mount point.
- Supabase project must be `qwtbgusqfoypvehnungr` (Baynes Trivia) — read-only work here, no migrations, so this is a sanity check only.
- No unreviewed pushes; live `/display` verification required before calling any task done (project standing rule).

---

## File Structure

- **Modify:** `client/src/components/display/WarpTransition.jsx` — add `durationMs` prop (Task 1).
- **Modify:** `client/src/lib/shinySeries.js` — add `isFirstOfShinyGroup(sortedSlides, slide)` pure helper (Task 2).
- **Create:** `client/src/lib/shinySeries.test.js` — unit tests for the new helper, and for `computeNextStep`'s skip-forward addition if that file has no adjacent test (Task 2/3 verification — check first, this may already exist).
- **Modify:** `client/src/lib/slideStepping.js` — skip-forward over a `shiny-title` landing in `computeNextStep` (Task 3).
- **Create:** `client/src/components/display/ShinyGroupAnnounce.jsx` — small shared overlay: format name + icon, fades in/out once over ~1.2s, reduced-motion guarded (Task 4).
- **Modify:** `client/src/components/display/slides/QuestionSlide.jsx` — mount `ShinyGroupAnnounce` in the shiny content wrapper when `isFirstOfShinyGroup` (Task 4).
- **Modify:** `client/src/components/display/slides/GridSlide.jsx` — same mount (Task 4).
- **Modify:** `client/src/views/Display.jsx` — detect shiny-slide exit, mount `<WarpTransition dir="back" durationMs={SHINY_WARP_MS} .../>` (Task 5).

---

## Task 1: Parameterize WarpTransition's duration

**Files:**
- Modify: `client/src/components/display/WarpTransition.jsx:150,353` (and the doc comment at `142-149`)

**Interfaces:**
- Produces: `WarpTransition({ dir, onDone, durationMs })` — `durationMs` optional, defaults to the existing `2500`. Every existing call site (`Display.jsx:1003`, the jukebox one) is unaffected because it omits the prop.

- [ ] **Step 1: Change the module constant into a prop with the same default**

In `WarpTransition.jsx`, keep `const DURATION_MS = 2500` as the *default* value but stop using it directly inside the effect — thread it through the prop instead:

```jsx
export default function WarpTransition({ dir = 'out', onDone, durationMs = DURATION_MS }) {
```

Then inside the `useEffect` body, every place that currently reads the bare module constant `DURATION_MS` (the `p = Math.min(1, (now - start) / DURATION_MS)` line and the watchdog `setTimeout(finish, DURATION_MS + 400)`) reads `durationMs` instead:

```jsx
const p = Math.min(1, (now - start) / durationMs)
```

```jsx
const watchdog = setTimeout(finish, durationMs + 400)
```

Also add `durationMs` to the effect's dependency array (it currently closes over module-level `DURATION_MS`, so this is new): `}, [dir, durationMs])`.

- [ ] **Step 2: Update the doc comment**

The comment at line 142-149 currently says "Was 1250ms... doubling it here stretches the whole choreography proportionally." Add one line noting the value is now a prop with this as its default, so a future reader doesn't go hunting for a hardcoded `2500` that no longer exists in the body:

```
// durationMs is a prop (default below) so a faster non-jukebox use of this
// same vortex (the shiny-question exit) can run a shorter choreography
// without touching this tuned default.
```

- [ ] **Step 3: Verify the jukebox path is byte-identical**

Run the app locally (`vercel dev` or the project's normal dev command) and trigger a real grading-break → jukebox warp (fastest: Space/ArrowRight on `/display` while a grading-break slide is up). Confirm it looks and times exactly as before — this step has no prop passed at its call site, so `durationMs` defaults to `2500` and nothing should visibly change.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/display/WarpTransition.jsx
git commit -m "feat(warp): make WarpTransition's duration a prop, default unchanged

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MoDt6X9Zd1Ya7pkPJfJ3z2"
```

---

## Task 2: `isFirstOfShinyGroup` helper

**Files:**
- Modify: `client/src/lib/shinySeries.js` (add near `resolveJumpIndex`, which already does a similar "slide immediately before me in sorted order" check at line 310-316 — model this the same way)
- Test: `client/src/lib/shinySeries.test.js` (check if this file already exists before creating — `shinySeries.js` has several pure functions already, e.g. `resolveJumpIndex`/`idsToDeleteWith`, likely already covered)

**Interfaces:**
- Consumes: nothing new — plain data (`sortedSlides: Slide[]`, `slide: Slide`).
- Produces: `isFirstOfShinyGroup(sortedSlides, slide): boolean`, consumed by Task 4.

- [ ] **Step 1: Check for an existing test file**

```bash
ls client/src/lib/shinySeries.test.js
```

If it exists, add to it. If not, create it with the header the other `lib/*.test.js` files use (check `client/src/lib/autoFitText.test.js` for the exact import/describe style used in this repo and match it).

- [ ] **Step 2: Write the failing test**

```js
import { describe, it, expect } from 'vitest'
import { isFirstOfShinyGroup } from './shinySeries.js'

describe('isFirstOfShinyGroup', () => {
  it('is true for the slide immediately after its group\'s shiny-title', () => {
    const sorted = [
      { id: 'a', type: 'shiny-title', data: { shinyGroupId: 'g1' } },
      { id: 'b', type: 'question', data: { shinyGroupId: 'g1', isShiny: true } },
      { id: 'c', type: 'question', data: { shinyGroupId: 'g1', isShiny: true } },
    ]
    expect(isFirstOfShinyGroup(sorted, sorted[1])).toBe(true)
  })

  it('is false for a later slide in the same group', () => {
    const sorted = [
      { id: 'a', type: 'shiny-title', data: { shinyGroupId: 'g1' } },
      { id: 'b', type: 'question', data: { shinyGroupId: 'g1', isShiny: true } },
      { id: 'c', type: 'question', data: { shinyGroupId: 'g1', isShiny: true } },
    ]
    expect(isFirstOfShinyGroup(sorted, sorted[2])).toBe(false)
  })

  it('is false when the preceding slide is a shiny-title from a DIFFERENT group', () => {
    const sorted = [
      { id: 'a', type: 'shiny-title', data: { shinyGroupId: 'g1' } },
      { id: 'b', type: 'question', data: { shinyGroupId: 'g2', isShiny: true } },
    ]
    expect(isFirstOfShinyGroup(sorted, sorted[1])).toBe(false)
  })

  it('is false for a slide with no shinyGroupId', () => {
    const sorted = [
      { id: 'a', type: 'shiny-title', data: { shinyGroupId: 'g1' } },
      { id: 'b', type: 'question', data: {} },
    ]
    expect(isFirstOfShinyGroup(sorted, sorted[1])).toBe(false)
  })

  it('is false for the group\'s own shiny-title slide', () => {
    const sorted = [
      { id: 'a', type: 'shiny-title', data: { shinyGroupId: 'g1' } },
    ]
    expect(isFirstOfShinyGroup(sorted, sorted[0])).toBe(false)
  })

  it('is false when the slide is first in the whole show (no predecessor)', () => {
    const sorted = [
      { id: 'a', type: 'question', data: { shinyGroupId: 'g1', isShiny: true } },
    ]
    expect(isFirstOfShinyGroup(sorted, sorted[0])).toBe(false)
  })
})
```

- [ ] **Step 3: Run it to verify it fails**

```bash
npx vitest run client/src/lib/shinySeries.test.js
```

Expected: FAIL — `isFirstOfShinyGroup` is not exported.

- [ ] **Step 4: Implement it**

Add to `client/src/lib/shinySeries.js`, near `resolveJumpIndex` (reuses the exact same "find index, check the immediate predecessor" shape that function already established at line 310-316 — keep the two consistent rather than inventing a second pattern):

```js
// Is `slide` the first CONTENT slide of its shiny group — i.e. does a
// `shiny-title` for the same shinyGroupId sit immediately before it in show
// order? Used to decide whether to play the format-name announce beat on
// mount (ShinyGroupAnnounce.jsx) instead of on every slide in the group.
export function isFirstOfShinyGroup(sortedSlides, slide) {
  const groupId = slide?.data?.shinyGroupId
  if (!groupId || slide.type === 'shiny-title') return false
  const idx = sortedSlides.findIndex(s => s.id === slide.id)
  if (idx <= 0) return false
  const prev = sortedSlides[idx - 1]
  return prev.type === 'shiny-title' && prev.data?.shinyGroupId === groupId
}
```

- [ ] **Step 5: Run it to verify it passes**

```bash
npx vitest run client/src/lib/shinySeries.test.js
```

Expected: PASS, all 6 cases.

- [ ] **Step 6: Commit**

```bash
git add client/src/lib/shinySeries.js client/src/lib/shinySeries.test.js
git commit -m "feat(shiny): add isFirstOfShinyGroup helper

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MoDt6X9Zd1Ya7pkPJfJ3z2"
```

---

## Task 3: Skip forward over a `shiny-title` landing

**Files:**
- Modify: `client/src/lib/slideStepping.js:474-476`
- Test: `client/src/lib/slideStepping.test.js` (check whether this exists — `computeNextStep` is exported and already has real behavior worth covering; if a test file for this module already exists, add to it, matching its existing mock/setup style for `fetchTeamCount` etc.)

**Interfaces:**
- Consumes: nothing new.
- Produces: `computeNextStep` unchanged signature/return shape, just a corrected `target` index before the existing baking/patch logic runs.

- [ ] **Step 1: Check for an existing test file and its mock conventions**

```bash
ls client/src/lib/slideStepping.test.js
```

If present, read it first to match its existing `show`/`fetchTeamCount` fixture shape before adding a new case.

- [ ] **Step 2: Write the failing test**

```js
it('skips forward past a shiny-title landing onto its first content slide', async () => {
  const slides = [
    { id: 'q1', order: 0, type: 'question', data: {} },
    { id: 'title', order: 1, type: 'shiny-title', data: { shinyGroupId: 'g1' } },
    { id: 'q2', order: 2, type: 'question', data: { shinyGroupId: 'g1', isShiny: true } },
  ]
  const show = { slides, currentSlideIndex: 0, currentSlideId: 'q1' }
  const patch = await computeNextStep(show, async () => 0)
  expect(patch.current_slide_index).toBe(2)
  expect(patch.current_slide_id).toBe('q2')
})

it('does NOT skip when Next lands on an ordinary slide (no regression)', async () => {
  const slides = [
    { id: 'q1', order: 0, type: 'question', data: {} },
    { id: 'q2', order: 1, type: 'question', data: {} },
  ]
  const show = { slides, currentSlideIndex: 0, currentSlideId: 'q1' }
  const patch = await computeNextStep(show, async () => 0)
  expect(patch.current_slide_index).toBe(1)
  expect(patch.current_slide_id).toBe('q2')
})
```

- [ ] **Step 3: Run it to verify the first case fails**

```bash
npx vitest run client/src/lib/slideStepping.test.js
```

Expected: the new skip-forward case FAILs (`current_slide_index` is `1`, landing on `title`, not `2`); the no-regression case already PASSes.

- [ ] **Step 4: Implement the skip**

In `slideStepping.js`, at the "Last part reached... advance to the next slide" block (line 465-476), change:

```js
const target = Math.min(cur + 1, sorted.length - 1)
if (target === cur) return null
const targetSlide = sorted[target]
```

to:

```js
let target = Math.min(cur + 1, sorted.length - 1)
if (target === cur) return null
// A shiny-title slide is never a real stop when arrived at going FORWARD —
// see the "closing beat" history note above: a dead Next press here was
// already fought and removed once (2026-09-01). Its first content slide is
// guaranteed to exist immediately after it (buildShinyTitleSlide/
// withShinyTitleSlide always insert the title as slides[0] of its group,
// content following), so target+1 is always safe. Going BACKWARD
// (computePrevStep, unchanged) still lands on the title on purpose — a host
// revisiting a shiny series intentionally is a different action.
if (sorted[target]?.type === 'shiny-title' && target + 1 < sorted.length) {
  target = target + 1
}
const targetSlide = sorted[target]
```

- [ ] **Step 5: Run it to verify both pass**

```bash
npx vitest run client/src/lib/slideStepping.test.js
```

Expected: PASS.

- [ ] **Step 6: Run the full unit suite (project's deploy gate also runs this — catch any other regression now, not at ship time)**

```bash
npm run test:unit
```

Expected: PASS, no new failures anywhere else.

- [ ] **Step 7: Commit**

```bash
git add client/src/lib/slideStepping.js client/src/lib/slideStepping.test.js
git commit -m "fix(slides): skip a shiny-title landing on a forward Next press

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MoDt6X9Zd1Ya7pkPJfJ3z2"
```

---

## Task 4: `ShinyGroupAnnounce` mount beat

**Files:**
- Create: `client/src/components/display/ShinyGroupAnnounce.jsx`
- Modify: `client/src/components/display/slides/QuestionSlide.jsx` (the shiny content wrapper — the file already imports `useTheme`/renders per-shinyType components; mount this alongside them)
- Modify: `client/src/components/display/slides/GridSlide.jsx` (same)

**Interfaces:**
- Consumes: `isFirstOfShinyGroup` from Task 2, `slide.data.shinyFormatName` / `slide.data.shinyFormatIcon` (already present on content slides — verify by inspecting one real shiny question's `data` in Supabase or the host editor before writing this, don't assume).
- Produces: `<ShinyGroupAnnounce name={string} icon={string}/>` — self-contained, renders nothing after its first ~1.2s.

- [ ] **Step 1: Confirm content slides actually carry `shinyFormatName`/`shinyFormatIcon`**

Before writing the component, verify the field actually exists on a real content slide's `data` (not just the title slide's) — grep:

```bash
grep -n "shinyFormatName" client/src/components/host/AddSlideWizard.jsx client/src/lib/shinySeries.js
```

If content slides do NOT already carry these fields independently, this step's scope grows (thread the name through some other way) — stop and re-check with Ben before continuing; don't guess silently.

- [ ] **Step 2: Write the component**

```jsx
import { useRef, useEffect, useState } from 'react'

// Brief format-name beat on a shiny group's first content slide — replaces
// the standalone shiny-title slide as a "dead Next press" for a forward
// advance (see slideStepping.js's skip-forward and its history comment).
// Mount-scoped only: a useRef gate means this never replays on a re-render
// of the same slide instance (answer reveal toggling, etc), only on a
// genuinely fresh mount.
export default function ShinyGroupAnnounce({ name, icon }) {
  const played = useRef(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (played.current) return
    played.current = true
    setVisible(true)
    const t = setTimeout(() => setVisible(false), 1200)
    return () => clearTimeout(t)
  }, [])

  if (!name) return null

  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        top: '6%',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 5,
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.4s ease',
        pointerEvents: 'none',
      }}
    >
      {icon && <span style={{ fontSize: '1.4rem' }}>{icon}</span>}
      <span style={{
        fontFamily: "'Boogaloo', sans-serif",
        fontSize: '1.1rem',
        color: '#f9e2a8',
        letterSpacing: '0.02em',
      }}>{name}</span>
    </div>
  )
}
```

Reduced-motion: this only fades opacity via CSS `transition`, no `@keyframes`, no transform/scale motion — the existing project-wide `prefers-reduced-motion` CSS guards (Critical Rule 3) apply automatically if the project's global stylesheet already disables `transition` under that media query; **verify this in Step 4 rather than assuming** — check `client/src/index.css` (or wherever the project's global reduced-motion rule lives, per SKILL.md's ".el-anim { animation: none !important }" pattern) actually also catches plain `transition`, not just `animation`. If it only catches `animation`, add an inline guard here (`useReducedMotion()` from framer-motion, skip the timeout/fade entirely and just never render).

- [ ] **Step 3: Mount it in QuestionSlide.jsx**

Find the shiny content wrapper (`ShinyContent`, per earlier investigation around line 1490) and add, alongside whatever it already renders for the matched shinyType:

```jsx
{isFirstOfShinyGroup(sortedSlidesFromShow, slide) && (
  <ShinyGroupAnnounce name={slide.data?.shinyFormatName} icon={slide.data?.shinyFormatIcon} />
)}
```

`sortedSlidesFromShow` needs to be derived from the `show` prop `QuestionSlide` already receives (sort `show.slides` by `.order`, same as every other sort site in this codebase — grep `sortSlides` in `slideStepping.js` and reuse that exact helper rather than re-implementing sort logic here).

- [ ] **Step 4: Mount it in GridSlide.jsx the same way, and verify the reduced-motion question from Step 2**

Same pattern. Also resolve the reduced-motion open question from Step 2 here, live, with the OS-level "reduce motion" setting on.

- [ ] **Step 5: Live-verify on `/display`**

Start the dev server, build a throwaway show with a shiny series (grid or any type), go live, advance onto it: confirm the name/icon beat fades in and out once on the first content slide, does NOT reappear on the group's second content slide (if the format is multi-part), and does NOT appear on the standalone `shiny-title` slide when reached via Prev/Go-Live-picker (it shouldn't — `ShinyGroupAnnounce` is only mounted from `QuestionSlide`/`GridSlide`, never from `ShinyTitleSlide.jsx`).

- [ ] **Step 6: Commit**

```bash
git add client/src/components/display/ShinyGroupAnnounce.jsx client/src/components/display/slides/QuestionSlide.jsx client/src/components/display/slides/GridSlide.jsx
git commit -m "feat(shiny): announce format name on group's first content slide

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MoDt6X9Zd1Ya7pkPJfJ3z2"
```

---

## Task 5: Warp the shiny-slide exit itself

**Files:**
- Modify: `client/src/views/Display.jsx` (near the existing `warp` state at line 697-714, and the render block at line 990-1012)

**Interfaces:**
- Consumes: `WarpTransition` with the new `durationMs` prop (Task 1).
- Produces: a second, independent warp trigger (`shinyWarp` state) alongside the existing jukebox `warp` state — deliberately NOT reusing the same state variable, since the two need different `dir` semantics and must never collide if a break slide and a shiny slide are somehow adjacent.

- [ ] **Step 1: Add the tunable duration constant**

Near `BREAK_DELAY_MS`/`HEAD_START_DELAY_MS` (line 663-679):

```js
// Duration for the shiny-question-exit warp — same vortex as the jukebox
// handoff (WarpTransition.jsx), much shorter: this fires on every shiny
// exit, potentially several times a round, where the jukebox's 2.5s
// cinematic pacing would feel slow. Start conservative; this is the one
// number to retune live if it reads too fast or too slow.
const SHINY_WARP_MS = 1100
```

- [ ] **Step 2: Track the previous slide's shininess and the cover state**

Near the existing `breakWasActiveRef`/`lastSlideIdRef` (line 703-704), add:

```js
const [shinyWarp, setShinyWarp] = useState(null) // null | 'active'
const prevWasShinyRef = useRef(false)
```

- [ ] **Step 3: Trigger on the slide-id-change effect, using useLayoutEffect not useEffect**

This is the one genuinely delicate part of this whole plan. The existing slide-id-change effect for the jukebox return (line 768-803) is a plain `useEffect`, which is fine there because nothing on THAT slide's content actually changes across the break→return boundary (same grading-break slide, just an overlay toggling). Here, the underlying slide really does change — from the shiny slide to a genuinely different next slide — so a plain `useEffect` risks one already-painted frame of the new slide showing before the cover mounts (a flash). `useLayoutEffect` runs after DOM mutation but before the browser paints, which is the right primitive to close that gap — but this MUST be verified empirically in Step 5, not assumed correct from reasoning alone.

Add a new, separate effect (do not fold this into the existing break-return effect — different trigger, different state, different `dir`):

```js
useLayoutEffect(() => {
  const wasShiny = prevWasShinyRef.current
  prevWasShinyRef.current = !!currentSlide?.data?.isShiny
  // Only fires leaving a shiny slide for a genuinely different slide that
  // is NOT the standalone announce card (that one gets its own
  // ShinyGroupAnnounce beat instead of a vortex over a vortex — Task 4).
  if (wasShiny && currentSlide?.type !== 'shiny-title') {
    setShinyWarp('active')
  }
}, [currentSlide?.id])
```

Import `useLayoutEffect` at the top of the file alongside the existing `useState`/`useEffect`/`useRef` import line.

- [ ] **Step 4: Render the warp**

Near the existing jukebox warp render block (line 990-1012), add a sibling block (same `ErrorBoundary` pattern, same `key`-by-state-value reasoning documented in the existing comment there):

```jsx
{shinyWarp && (
  <ErrorBoundary fallback={null}>
    <WarpTransition
      key={shinyWarp}
      dir="back"
      durationMs={SHINY_WARP_MS}
      onDone={() => setShinyWarp(null)}
    />
  </ErrorBoundary>
)}
```

- [ ] **Step 5: Live-verify — this is the step that actually determines if the plan works**

Start the dev server. Build (or reuse) a throwaway show with: a shiny question, followed by an ordinary question. Go live, advance off the shiny question, and watch closely (screen-record or Playwright-capture frame-by-frame if the eye isn't enough) for:

1. No single frame where the next question's plain content is visible BEFORE the vortex covers it (the flash this task's Step 3 comment warns about).
2. The vortex actually plays (not skipped/instant).
3. `onDone` fires and the vortex unmounts cleanly — no stuck cover, no console error.
4. Reduced-motion (OS setting on): instant cut, `onDone` still fires promptly (this is `WarpTransition.jsx`'s own existing `isReduced()` guard — confirm it still applies unchanged since `dir`/`durationMs` are the only things this task added).
5. Two shiny questions back to back (no ordinary question between): confirm the vortex still plays once per shiny→shiny transition too, not just shiny→ordinary.

If #1 fails (a visible flash), the fix is almost certainly that `useLayoutEffect`'s synchronous state update doesn't finish before paint in this specific batching context — the next thing to try is moving the `setShinyWarp('active')` call so it happens in the SAME render pass as the slide change rather than a subsequent effect at all (e.g., derive it during render with a ref comparison, calling `setShinyWarp` conditionally during render is a React anti-pattern normally allowed specifically for "reset state when a prop changes" cases — see React's own docs on "adjusting state when a prop changes" for the sanctioned pattern before reaching for anything more exotic). Do not ship this task with a visible flash; come back and iterate rather than accepting it.

- [ ] **Step 6: Commit**

```bash
git add client/src/views/Display.jsx
git commit -m "feat(shiny): warp-transition the exit off any shiny question

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MoDt6X9Zd1Ya7pkPJfJ3z2"
```

---

## Task 6: Full-suite regression + end-to-end live pass

**Files:** none new — verification only.

- [ ] **Step 1: Full unit suite**

```bash
npm run test:unit
```

Expected: PASS. This is the project's deploy gate (`scripts/ship.sh`) — a red suite here blocks shipping regardless of how good the live demo looked.

- [ ] **Step 2: Existing e2e smoke, unmodified**

```bash
npm run test:smoke
```

Expected: PASS — confirms this plan didn't regress the host/display smoke path incidentally.

- [ ] **Step 3: One real walkthrough, start to finish, on `/display`**

Using a throwaway show covering: an ordinary question → a shiny question (any type) → back-to-back shiny question → ordinary question again → Prev back onto the shiny-title slide on purpose (confirm it still shows, unskipped, going backward) → Go Live picker jump directly to a shiny-title row (confirm still reachable and still plays its full entrance, per `ShinyTitleSlide.jsx`'s existing "always plays its full entrance" comment — Task 3 only touches forward Next, not this).

- [ ] **Step 4: Report back to Ben with the live walkthrough result before considering this shipped**

Per project standing rules: session reports are claims, not facts — the walkthrough in Step 3, actually run this session, is what "done" is based on, not a description of what the code should do.
