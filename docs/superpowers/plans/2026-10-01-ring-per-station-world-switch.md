# Ring per-station world switch (replaces the duo wipe / fade)

**Date:** 2026-10-01. **Branch:** `feat/ring-duo-organic-transition`.
**Supersedes:** the animated SVG wipe (`4309141`) and the fade-through-black overlay (`331d448`). Ben rejected both.

## Ben's design (his words, in order)

- No wipe. Not a hard cut. It must "flow seamlessly."
- "Why not just have the ring switch mid question? In the background it goes from world X to world Y. There is a black space that distinguishes the two."
- "This empty slide should have bleed from the old world and bleed from the new world, to show there is a shift."
- Static composition. Nothing animates beyond the existing camera glide. No timers of our own.
- Color evolution stays OFF by default. Ben makes the final aesthetic call.

## Model

ONE `RingAmbient`. One continuous ring of panes (13). Each pane (station) is colored by the duo of the slide that lands on it. World changes every seeded 3-4 slides (`stepIndexForSlide`). The first slide of each new duo lands on an EMPTY pane (stars over plain dark). Its left edge carries the old duo's corner bleed (from the previous pane), its right edge the new duo's (from the next pane). That bleed is the existing deliberate corner bleed; each pane keeps its own colors, so it falls out for free as long as bleed objects keep their own pane's duo.

Pure function of (showId, slide, ring station counter). No stored state. Back-nav, jump, reload recompute.

## Opus scoping findings (2026-10-01, unverified by me until built)

- Hues are written into inline styles at build time; shape/position come from `rng(i, ...)`, not hue. So repainting a pane changes color only.
- Pane p hosts slides p, p+13, ...; must repaint when its occupying slide's duo changes. Pane to repaint is 6-7 stations from the camera, off screen.
- Mid layer holds two copies of the strip: repaint both or the 12->0 wrap jumps.
- Sky is stage-wide (`--sky-1..4`, star tint, region tints): cannot be per pane. Open aesthetic call, see below.
- Use the ring's own station counter, not `slide % 13` (grading breaks leave the ring one station behind).
- Jukebox jump repaints pane 10 (eclipse) to the current duo, never the gap.

## Files

- `client/src/components/display/RingAmbient.jsx`: wrap each station in a group; extract `buildStation(...)`; optional per-pane world prop; repaint only changed panes (both strip copies); sky follows current duo.
- NEW `client/src/lib/ringPanePlan.js`: pure fn -> 13 entries, each a duo id or `'gap'`.
- `client/src/components/display/EvolvingRingAmbient.jsx`: reduce to ONE `RingAmbient` + the plan. Delete `DuoLayer`, neighbor instances, fades. Keep `worldForDuo` (used by `WarpTransition`).
- `client/src/lib/duoTransition.js`: delete `transitionWipeFor` + `WIPE_SALT`.
- Tests: rewrite `EvolvingRingAmbient.test.jsx`, `.glide.test.jsx`, `.onscreen.test.jsx`; add `ringPanePlan.test.js` (back-nav, jump, wrap, gap placement, jukebox offset); add a test that default single-world DOM is unchanged.

## Risks / STAYS HUMAN

- Any `RingAmbient.jsx` edit must bump `RING_VERSION` (`ringCertification.js`), making every certified row stale. Re-run `certify-duos.mjs` and `palette-sweep.mjs` BEFORE shipping, or the host picker is empty. Do not re-run until Ben approves the look on a preview.
- `runChecks()` measures single worlds only. Gap pane and mixed ring are unmeasured. Whether they need a gate is Ben's call. No gate code edits.
- Prove through the real `runChecks` that the group wrapper leaves single-world output unchanged.
- Open Bug B (same-color neighbor stations inside a duo) is unchanged by this.

## Open decisions for Ben

1. Sky: DECIDED 2026-10-01 (Ben: "i dont want it to be plain dark") — the sky follows the world painted on the pane in frame (own colour ramp + region tints per world, crossfaded by opacity); the gap pane lights none, so the sky dips to dark exactly at the black space.
2. Empty pane = first slide of each new duo (about 1 in 3-4 slides is stars over dark). Ben accepted this on 2026-10-01 provided it shows bleed from both worlds.

## Update 2026-10-01 (later)

- Gap pane = two real objects (never the neighbour's own headline kind), 30-70% of each object's width visible. Colour-haze version rejected ("not natural").
- Planet-glow boundary mask feathers 240px in per-pane mode (24px made a straight line mid-glide).
- Verified in real engine: fresh mount mid-show, grading-break jump (incl. on a gap slide), return restores the gap. Mutation-checked.
