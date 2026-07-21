---
description: Run Step 5's static code-invariant checklist plus, when available, a chrome-devtools MCP screenshot and performance-trace pass before shipping
allowed-tools: Read, Grep, Glob, Skill, Bash(node *), mcp__chrome-devtools__navigate_page, mcp__chrome-devtools__take_screenshot, mcp__chrome-devtools__performance_start_trace, mcp__chrome-devtools__performance_stop_trace, mcp__chrome-devtools__performance_analyze_insight
disable-model-invocation: true
---

# /audit — Step 5 static self-audit (Storybook Agent)

CWD is still `$WORKDIR` (the scratch checkout) — read/grep the file you built there, same as always.

Load the `anthropic-skills:impeccable` skill now, if not already loaded this run (use the exact fully-qualified name per `AGENT-PROMPT.md` Step 1 — if it's not in your available-skills listing under that name, search for one containing "impeccable" before concluding it's missing).

This is **code-invariant verification only** — no browser in this runtime, so runtime feel, actual TV banding, and motion-smoothing artifacts cannot be checked here. Say so plainly in the notes block rather than overclaiming.

Check, and fix before commit:

- **Contrast:** compute actual contrast ratios for any text-on-background pairing against the real color values used (not eyeballed).
- **Timing sums:** does the notes block's stated timing match the actual animation code's durations? Re-sync if you tuned anything after writing notes. Confirm total is within the 8–14s duration target — if not, cut content and rebuild the timeline; do not ship overlong with an apology in the notes.
- **Frame-rate independence:** for canvas/rAF pieces, is `dtn` normalization present, and is the clock reset wired to both visibility-change and replay?
- **GPU-only compliance:** grep your own file for animated `width`/`height`/`color`/`box-shadow`/`filter` (static is fine, animating is not). None should exist.
- **Silhouette legibility:** every element crossing more than one background state has real contrast against EVERY state it crosses, not just its starting state.
- **Particle pooling:** burst/spawn particles are pre-allocated/recycled from a fixed pool, never `new`'d per frame.
- **Near-black banding mitigation:** any slow gradient ramp through near-black tones has a fine noise/particle layer over it.
- **No external references:** grep for `http://`, `https://`, `img.recraft.ai` — none should appear anywhere.
- **Sanitizer-passed SVG only:** every embedded sprite went through Step 3's sanitizer; confirm none were hand-patched after.
- **postMessage contract present:** boilerplate embedded verbatim, `__journeyControls` wired to real controls, on-page Replay button calls the same `replay()`.
- **Reduced-motion branch:** verify by reading the code (not running it) that the simulate-checkbox path actually swaps out spatial motion.

If Chrome DevTools MCP is available this run, extend the audit with an actual visual pass before treating it as complete:
- `take_screenshot` at each transition's key beat (not just the resting state) — confirm the intended visual actually renders.
- `performance_start_trace` / `performance_stop_trace` / `performance_analyze_insight` across the full sequence — confirm compositor-only (transform/opacity), flag anything that isn't at the same severity as a functional bug.

Write the audit summary — what you checked, what you fixed, what remains explicitly Ben's job (runtime feel, actual venue TV check) — into the notes block. Then proceed to `/ship`.
