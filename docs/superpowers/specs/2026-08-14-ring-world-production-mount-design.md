# Ring World Production Mount — Design

**Goal:** Mount `RingAmbient.jsx` (the 12-station ring-world ambient scene) into the live `/display` route as the real `midnight-galaxy` ambient theme, replacing the current bespoke `MidnightGalaxyAmbient`, with station advancement tied to question changes.

## Context

`RingAmbient.jsx` already exists and is reachable standalone at `/ambient` (via `AmbientAudit.jsx`), but is not wired into `ParticleBackground.jsx`, which is what actually renders behind live `/display` slides. `ParticleBackground` routes each theme id to a bespoke ambient component via `AMBIENT_MAP`; `midnight-galaxy` currently maps to a simpler, older `MidnightGalaxyAmbient`.

`RingAmbient` exposes `turn()`/`jumpTo()` imperatively (never as a station prop, to preserve its mount-once/never-rebuild DOM guarantee) but nothing currently calls them in production — its station only advances when driven externally.

## Decisions (Ben, 2026-08-14)

1. **Replace, don't add.** Ring World becomes the `midnight-galaxy` theme outright. The old `MidnightGalaxyAmbient` component is deleted, not kept as an alternate option.
2. **Advance on question change, not a timer.** Station advances once per new question/slide, tying the scene's motion to game pacing rather than a fixed interval.
3. **Scope is the mount, not a full 12-station polish pass.** RingAmbient has been actively maintained (many commits since the Aug-12 "known drift" note that flagged it lagging `world-07-ring.html`) — treat it as reasonably current, not blocked on a full parity/aesthetic re-audit of all 12 stations.

## Architecture

- `Display.jsx`'s live-render `ParticleBackground` call site (the one with an actual `currentSlide`) passes a new `slideKey={currentSlide?.id}` prop. The other 3 call sites (pre-show/other states with no slide yet) don't pass it — `undefined` is fine, Ring just stays on station 0 until a real slide exists.
- `ParticleBackground.jsx`: `AMBIENT_MAP['midnight-galaxy']` now points at `RingAmbient` instead of `MidnightGalaxyAmbient`. Because Ring needs different props (`worldData`, `slideKey`) than the other 8 bespoke ambients (`tint` only), the render branch special-cases Ring rather than trying to unify the call signature.
- `RingAmbient.jsx`: add one new `useEffect` (separate from the existing mount-only DOM-build effect) that watches `slideKey` and calls the component's own internal `turn()` on change, skipping the first value (mount) so no spurious turn fires before a real question is showing.

## Data flow

Host advances a question → `show.current_slide_index` changes → `Display.jsx` re-renders with new `currentSlide.id` → `slideKey` prop changes → Ring's new effect fires `turn()` → station advances over `SURGE_MS` (1700ms), independent of the question's own fade animation (140–600ms, framer-motion, in `SlideRenderer.jsx`).

## Known risk / verification target

Ring's 1.7s turn transition and the question's <0.6s fade have never run concurrently in production before. Nothing today verifies Ring's transition doesn't cause a brightness pop/flicker that competes with question legibility right as it fades in, or that legibility holds while the question stays on screen through and after Ring's turn completes.

**Verification:** 3 parallel Fable-5 agents, each rendering real consecutive-question sequences on the live-wired component (not just the standalone `world-07-ring.html` harness), checking: question fade-in reads clean against Ring's turn, text stays legible while it stays on screen, and the transition to the next question is not visually disrupted by Ring's own station change. Findings drive fixes before this ships; this is a pre-ship check, not a formality.

## Out of scope

- Re-auditing all 12 stations' aesthetic feedback (separate, already-flagged cleanup work, not part of "wire it in").
- A timer-based advancement mode (rejected in favor of question-tied advancement — see Decisions).
- Adding Ring World as a second, separate theme alongside the old `MidnightGalaxyAmbient` (rejected — replace, don't add).
