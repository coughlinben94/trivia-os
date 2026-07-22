---
description: Run Step 5's static code-invariant checklist, then a real headless-Chromium visual pass via concepts/tools/visual-audit.mjs, before shipping
allowed-tools: Read, Grep, Glob, Skill, Bash(node *), Bash(./concepts/tools/*), mcp__chrome-devtools__navigate_page, mcp__chrome-devtools__take_screenshot, mcp__chrome-devtools__performance_start_trace, mcp__chrome-devtools__performance_stop_trace, mcp__chrome-devtools__performance_analyze_insight
disable-model-invocation: true
---

# /audit — Step 5 static + visual self-audit (Storybook Agent)

CWD is still `$WORKDIR` (the scratch checkout) — read/grep the file you built there, same as always.

Load the `anthropic-skills:impeccable` skill now, if not already loaded this run (use the exact fully-qualified name per `AGENT-PROMPT.md` Step 1 — if it's not in your available-skills listing under that name, search for one containing "impeccable" before concluding it's missing).

The checklist below is code-invariant verification — it catches things you can confirm by reading the file. It does NOT confirm the thing actually looks right when it renders. For that, the mandatory second half of this step is a real visual pass (below) — do not skip it and do not substitute "I read the animation code and it looks correct" for actually looking at rendered frames. That gap (built but never watched) is exactly how a dead-looking finale shipped undetected once already — see LESSONS.md / QUEUE.md's space-road-trip 2026-07-22 entry.

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

## Visual pass — mandatory, not conditional

Run the file through real headless Chromium and actually look at what renders:

```bash
node concepts/tools/visual-audit.mjs <path-to-built-file> --duration=<total-ms> --interval=<sample-ms> --slug=<id>
```

- `--duration` should cover the file's full stated runtime (e.g. a 4-stop ~40s combined
  review artifact needs `--duration=41000` or so — always sample slightly past the
  stated total, not just up to it, so you don't miss a payoff that lands right at the end).
- Pick `--interval` so you get at least 2-3 frames per distinct stop/phase, not just one
  per file. A single frame per 10s stop is not enough to judge a "converge-burst-settle"
  style beat — you will miss the burst if you only sample its start or its rest state.
- The script prints one screenshot path per line, then a final JSON line with any
  `pageErrors`/`consoleErrors` — a non-empty `pageErrors` array is a real bug, treat it
  like any other functional failure, not a warning to note and move past.
- First run this sandbox lifetime will build `concepts/tools/.cache/libXdamage.so.1` via
  `ensure-xdamage-stub.sh` automatically (sub-second, see that file for why it's needed).
- **Never delete inside `concepts/`** — this script already follows that rule (every run
  writes to a fresh `concepts/.audit-shots/<slug>-<timestamp>/` directory, never touches
  a prior run's output). Don't "clean up" old audit-shot directories yourself either —
  same delete-permission wall that blocked git before applies here too.

Then use the `Read` tool on every screenshot it produced and actually evaluate what you
see, per beat:
- Does the intended visual action actually happen (a burst looks like a burst, not more
  of the same dim particles)? Compare against the brief's own description of that beat.
- Legibility: is anything meant to read as bright/climactic actually bright against its
  background, or is it near-black-on-near-black and technically present but invisible?
- Anything that looks broken, static when it should move, or absent when the brief
  promises it — write it as a revision note in `QUEUE.md`, same specificity standard as
  any other note (the concrete thing, not "polish the ending").

If Chrome DevTools MCP also happens to be available this run, you can additionally use
`performance_start_trace` / `performance_stop_trace` / `performance_analyze_insight` for
compositor-only verification (transform/opacity) — but `visual-audit.mjs` is the primary,
always-available path and is not conditional on that MCP being connected.

Write the audit summary — what you checked, what you fixed, what the visual pass found,
what remains explicitly Ben's job (runtime feel, actual venue TV check) — into the notes
block. Then proceed to `/ship`.
