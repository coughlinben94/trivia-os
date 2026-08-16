# Ring World Production Mount Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mount `RingAmbient.jsx` into live `/display` as the `midnight-galaxy` ambient theme (replacing the old `MidnightGalaxyAmbient`), advancing one station per question change, verified against real consecutive-question renders before shipping.

**Architecture:** `RingAmbient` gains a `slideKey` prop and a small internal effect that calls its own `turn()` when it changes. `ParticleBackground` special-cases `midnight-galaxy` to render `RingAmbient` with `worldData`+`slideKey` instead of the generic `tint`-only call. `Display.jsx`'s live-render call site threads `currentSlide?.id` down as `slideKey`.

**Tech Stack:** React (hooks, forwardRef/useImperativeHandle already in place), no new dependencies.

Spec: `docs/superpowers/specs/2026-08-14-ring-world-production-mount-design.md`

---

### Task 1: RingAmbient advances on slideKey change

**Files:**
- Modify: `client/src/components/display/RingAmbient.jsx:586` (component signature) and `~line 716` (after the mount-only build effect, before the `turn`/`jumpTo`/`unlock` function declarations block that starts ~line 850)

- [ ] **Step 1: Accept the new prop**

Change the component signature at line 586 from:
```js
const RingAmbient = forwardRef(function RingAmbient({ worldData }, ref) {
```
to:
```js
const RingAmbient = forwardRef(function RingAmbient({ worldData, slideKey }, ref) {
```

- [ ] **Step 2: Add the advance-on-change effect**

Add this new effect immediately after the closing of the existing mount-only build `useEffect` (the one ending around line 720-724 with `return () => { ro.disconnect(); ... }`), and before the `unlock`/`turn`/`jumpTo` function declarations:

```js
// Advances one station per question change. Separate from the mount-only
// build effect above — this only ever calls turn() (imperative mutation of
// existing DOM/refs), never rebuilds anything, so it's safe to depend on a
// prop that changes every question. Skips the very first slideKey (mount,
// or the pre-show states where slideKey is undefined) so no turn fires
// before a real question is on screen.
const firstSlideKeyRef = useRef(true)
useEffect(() => {
  if (slideKey === undefined) return
  if (firstSlideKeyRef.current) { firstSlideKeyRef.current = false; return }
  turn()
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [slideKey])
```

`turn` is a function declaration in this component's body (hoisted), so it's already callable here even though it's defined further down — same pattern the file's own comments note for the `window.__world` exposure a few lines up.

- [ ] **Step 3: Verify build**

Run: `cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os && npm run build`
Expected: exits 0, no new errors/warnings referencing `RingAmbient.jsx`.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/display/RingAmbient.jsx
git commit -m "ring: RingAmbient advances one station per slideKey change"
```

---

### Task 2: Wire RingAmbient into ParticleBackground via a ring-world registry (plug-and-play for future worlds)

**Scope change from the original design (Ben, 2026-08-14 follow-up):** don't hardcode a single `theme.id === 'midnight-galaxy'` check. Add a small registry mapping theme id -> ring worldData module, so a future world (a new `client/src/worlds/*.ring.js` file built the same way `midnightGalaxy.ring.js` was) plugs in as one new registry entry and zero other `ParticleBackground.jsx` changes — no new special-case branch per world, no touching `AMBIENT_MAP`'s structure further.

**Files:**
- Modify: `client/src/components/display/ParticleBackground.jsx` (imports near top, new registry near `AMBIENT_MAP` around line 1345, main render around line 1400)

- [ ] **Step 1: Import RingAmbient and declare the ring-world registry**

Near the top of `client/src/components/display/ParticleBackground.jsx`, alongside the other ambient-component imports, add:
```js
import RingAmbient from './RingAmbient.jsx'
import { midnightGalaxyRing } from '../../worlds/midnightGalaxy.ring.js'
```

Immediately after the `AMBIENT_MAP` declaration (~line 1345-1352), add a new registry, same shape/spirit as `AMBIENT_MAP` and `GRADIENT_MOODS` right below it:
```js
// ─── Ring-world registry ──────────────────────────────────────────────────
// Plug-and-play: every ring-based ambient (built on RingAmbient.jsx +
// ringEngine.js/ringPrimitives.js, the same way midnightGalaxyRing was)
// registers here by theme id -> its worldData module. Adding a new one is
// exactly one entry, no other change in this file — RING_WORLDS[theme.id]
// below is what routes a theme to RingAmbient instead of AMBIENT_MAP.
const RING_WORLDS = {
  'midnight-galaxy': midnightGalaxyRing,
}
```

- [ ] **Step 2: Remove midnight-galaxy from the generic map, delete the old component**

In `AMBIENT_MAP` (~line 1345), delete this line:
```js
  'midnight-galaxy':    MidnightGalaxyAmbient,
```

Find the `MidnightGalaxyAmbient` function definition elsewhere in this file (search `function MidnightGalaxyAmbient`) and delete the whole function — it's fully replaced, not kept as a fallback.

- [ ] **Step 3: Accept slideKey on ParticleBackground and route through RING_WORLDS**

Change the export signature (~line 1380) from:
```js
export default function ParticleBackground({ theme }) {
```
to:
```js
export default function ParticleBackground({ theme, slideKey }) {
```

Add this line near the top of the function body, alongside the existing `gradientMood`/`AmbientComponent` lookups:
```js
  const ringWorld = RING_WORLDS[theme.id]
```

Find the render line (~line 1402):
```js
          : AmbientComponent && <AmbientComponent tint={tint} />}
```
Replace with:
```js
          : ringWorld
            ? <RingAmbient worldData={ringWorld} slideKey={slideKey} />
            : AmbientComponent && <AmbientComponent tint={tint} />}
```

(`AmbientComponent` will be `undefined` for any theme id present in `RING_WORLDS`, since none of them are in `AMBIENT_MAP` — that's fine, the `ringWorld` branch is checked first.)

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: exits 0. Grep the build output / source for any other reference to `MidnightGalaxyAmbient` to confirm nothing else imports it:
Run: `grep -rn "MidnightGalaxyAmbient" client/src/`
Expected: no matches.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/display/ParticleBackground.jsx
git commit -m "ring: wire RingAmbient into ParticleBackground via a plug-and-play RING_WORLDS registry"
```

**Future-world note (not part of this plan's tasks, just documenting the payoff):** once this lands, adding another ring-based theme is: build `client/src/worlds/<name>.ring.js` the way `midnightGalaxy.ring.js` was built, add one line to `RING_WORLDS`, done — `RingAmbient.jsx`, the `slideKey` advancement effect, and every other wiring in this plan is already fully general and needs no changes per-world.

---

### Task 3: Thread slideKey down from Display.jsx

**Files:**
- Modify: `client/src/views/Display.jsx` (4 call sites at lines 25, 131, 237, 368)

- [ ] **Step 1: Pass slideKey only where a real slide exists**

At line 368 (the live-render call site, inside the branch that has `currentSlide` in scope — confirm by checking the surrounding function has `currentSlide` defined, it's set at line 342: `const currentSlide = sortedSlides[show.current_slide_index ?? 0] ?? null`), change:
```jsx
      <ParticleBackground theme={theme} />
```
to:
```jsx
      <ParticleBackground theme={theme} slideKey={currentSlide?.id} />
```

Leave the other 3 call sites (lines 25, 131, 237) unchanged — they render in states before a slide exists, so `slideKey` stays `undefined` there by omission, which `RingAmbient`'s Task 1 effect already handles (it no-ops on `undefined`).

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add client/src/views/Display.jsx
git commit -m "ring: thread currentSlide.id into ParticleBackground as slideKey"
```

---

### Task 4: Verify against real consecutive-question renders (3 parallel Fable-5 agents)

This is a verification task, not a code-writing one — only touch code if an agent finds a real defect, and if so treat that as a new small task (render before/after, same discipline as every prior ring-world round) rather than editing blind.

**Setup shared by all 3 agents:** the app needs to run with a real (or realistically faked) show so `/display` has actual consecutive questions to advance through. Use `vercel dev` (per this repo's CLAUDE.md: "Local dev: `vercel dev`") pointed at a test/dev show with the `midnight-galaxy` theme active, or if no suitable test show exists, a minimal Playwright harness that mounts `Display.jsx` (or drives `/display?show=<test-id>`) and advances `show.current_slide_index` a few times via direct Supabase writes or the host controls, freezing/screenshotting around each transition boundary.

- [ ] **Step 1: Dispatch 3 Fable-5 agents in parallel, each checking a different angle:**

  - **Agent A — fade-in vs Ring's turn:** does the question's fade-in (140-600ms, `SlideRenderer.jsx`) read clean while Ring's 1.7s (`SURGE_MS`) turn transition is mid-flight? Screenshot at t=0, t=200ms, t=800ms, t=1700ms after a slide change. Look for any brightness pop/flicker/scrim discontinuity competing with the text.
  - **Agent B — legibility while staying:** once a question is fully faded in and Ring's turn has completed, does text stay legible for the remainder of time it's on screen (i.e., does the new station's scrim/brightness settle to something that doesn't wash out the text)? Compare against the existing `p99.5` legibility cap this repo already measures for other stations (check `concepts/FAILURE-LEDGER.md` / `concepts/tools/` for the exact instrument/threshold used elsewhere in this repo, reuse it rather than inventing a new metric).
  - **Agent C — rapid advance / edge cases:** what happens if a host advances two questions in quick succession (before Ring's prior `turn()` has finished)? `RingAmbient`'s existing `busyRef`/`queuedTurnsRef` queuing (in `turn()`) is supposed to handle this — confirm it actually does under the real `slideKey`-driven path (not just the standalone harness), and that no turn is silently dropped (station should always end up at `slideIndex-count % PANES`, matching the file's own documented invariant).

  Each agent renders BEFORE forming a verdict (don't reason from code alone), reports concretely (screenshots + numeric measurements where applicable, not just "looks fine"), and does not commit anything itself — reports findings back.

- [ ] **Step 2: Triage findings**

If any agent reports a real defect: render it yourself to confirm, fix it with the smallest change that addresses the actual measured problem (following this repo's established render-before/after-compare discipline), then re-run that one agent's check to confirm the fix. If all 3 report clean, proceed to Task 5.

---

### Task 5: Final review and push

- [ ] **Step 1: Full build + existing gate**

Run: `npm run build`
Run: `node concepts/tools/ring-verify.mjs` if it supports checking the live-mounted component (check its CLI flags/usage first — `HANDOFF-ring-2026-08-12.md` references a "live pass" mode); if it only checks the standalone harness, note that as a gap rather than skipping verification silently.

- [ ] **Step 2: Push the branch**

```bash
git push
```

Do NOT merge to `main` or open a PR without asking first — this repo's standing rule (`[[feedback-trivia-os-standing-rules]]`) is no unreviewed pushes straight to `main`, and this is a user-facing production behavior change (deletes an existing theme's look for anyone who picks "Midnight Galaxy").

---

## Self-review notes

- Every task lists exact files and line numbers as currently read; if the file has shifted by the time this executes (e.g., another concurrent session touched it, a real risk in this repo per its own standing rules), search for the named function/line content rather than trusting the line number blindly.
- Task 4 deliberately has no fixed line-by-line code steps, since it's a render-and-diagnose task by nature (same as every other ring-world round in this repo's history) — a prescribed fix would likely be wrong before the agents actually look.
