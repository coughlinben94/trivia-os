---
description: Run Step 5's static code-invariant checklist, then a real headless-Chromium visual pass via concepts/tools/visual-audit.mjs, then (per the one-attempt rule) a single Fable second-opinion pass, before shipping
allowed-tools: Read, Grep, Glob, Skill, Agent, Bash(node *), Bash(git *), Bash(./concepts/tools/*), mcp__chrome-devtools__navigate_page, mcp__chrome-devtools__take_screenshot, mcp__chrome-devtools__performance_start_trace, mcp__chrome-devtools__performance_stop_trace, mcp__chrome-devtools__performance_analyze_insight
disable-model-invocation: true
---

# /audit — Step 5 static + visual self-audit, then second opinion (Storybook Agent)

CWD is still `$WORKDIR` (the scratch checkout) — read/grep the file you built there, same as always.

## Checkpoint first

Before running any checks, set the claimed entry's `QUEUE.md` status to `audit-pending`
and commit that (same guarded-commit pattern as `/claim`'s checkpoint):
```bash
./concepts/tools/guarded-commit-push.sh "$RUN_ID" "nightly: audit-pending <id>" concepts/QUEUE.md
```
Why: if this run dies during the checks below, the next run's preflight finds
`audit-pending` instead of a stale `building` entry, and knows to re-run the audit
against the already-built file rather than re-building it from scratch.

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
node concepts/tools/visual-audit.mjs <path-to-built-file> --duration=<total-ms> --slug=<id>
```

- `--duration` should cover the file's full stated runtime, slightly past the stated
  total, not just up to it (e.g. a 4-stop ~40s combined review artifact needs
  `--duration=40500` or so) — so you don't miss a payoff that lands right at the end.
- Sampling is adaptive by default — it polls the page's own `#phaseLabel` text and
  screenshots on every phase change plus periodic hold-gap samples, so short beats (down
  to ~1s) get caught automatically without you hand-tuning an interval. Only pass
  `--step`/`--min-hold-gap` if you have a specific reason to override the defaults (see
  the script's own header comment before changing either — both values were derived from
  a real ground-truth comparison, not guessed).
- **This script computes every wait from real elapsed time each iteration, never a
  running tally — do not "optimize" this back to a tally-based loop.** An earlier version
  did exactly that, drifted, and produced a false bug report by missing a 1.1s beat
  entirely (see QUEUE.md's space-road-trip 2026-07-22 [CORRECTION] entry). A later attempt
  to speed this up with Playwright's mocked-clock seeking was also tried and reverted —
  verified empirically to introduce its own drift once screenshot calls were interleaved
  with it. Both false starts are documented in the script's own header; don't repeat
  either without re-verifying against ground truth first, the same way both were caught.
- The script writes an **evidence bundle** to `concepts/.audit-shots/<slug>-<timestamp>/`:
  every screenshot, `index.json`, and a human-readable `INDEX.md` table (requested vs.
  real elapsed ms, phase label, why each frame was captured). This bundle — not your
  prose summary of it — is what gets handed to the Fable second-opinion pass below and
  referenced from `QUEUE.md`.
- A non-empty `pageErrors` array in the script's final JSON line is a real bug, treat it
  like any other functional failure, not a warning to note and move past.
- First run this sandbox lifetime will build `concepts/tools/.cache/libXdamage.so.1` via
  `ensure-xdamage-stub.sh` automatically (sub-second, see that file for why it's needed).
- **Never delete inside `concepts/`** — this script already follows that rule (every run
  writes to a fresh directory, never touches a prior run's output). Don't "clean up" old
  audit-shot directories yourself either — same delete-permission wall that blocked git
  before applies here too.

Then use the `Read` tool on every screenshot in the bundle and actually evaluate what you
see, per beat:
- Does the intended visual action actually happen (a burst looks like a burst, not more
  of the same dim particles)? Compare against the brief's own description of that beat.
- Legibility: is anything meant to read as bright/climactic actually bright against its
  background, or is it near-black-on-near-black and technically present but invisible?
- Anything that looks broken, static when it should move, or absent when the brief
  promises it, is a real finding — but see the one-attempt rule below before looping on it.

If Chrome DevTools MCP also happens to be available this run, you can additionally use
`performance_start_trace` / `performance_stop_trace` / `performance_analyze_insight` for
compositor-only verification (transform/opacity) — but `visual-audit.mjs` is the primary,
always-available path and is not conditional on that MCP being connected.

## One-attempt rule (Ben's explicit instruction, 2026-07-22)

If the checklist or the visual pass finds an issue: fix it, **once**, then re-run the
relevant check(s) one time. Whatever the result of that single re-check — clean or still
broken — **do not attempt a second self-fix.** Proceed straight to the second opinion
below either way. If something is still broken after the one attempt, say so plainly in
the notes handed to Fable and to `QUEUE.md` — do not keep silently retrying. This is a
tighter, separate cap from `QUEUE.md`'s 5-iteration Ben-review cap (that one governs
revision cycles across separate mornings with Ben's own input between them); this one
governs a single run's own internal retry behavior, which has no new information between
attempts and is exactly the sunk-cost loop Ben is guarding against.

## Second opinion — exactly one Fable pass, evidence-only

Once the audit above is done (clean, or not-clean-after-one-attempt per the rule above),
dispatch **exactly one** subagent with `model: "fable"` via the `Agent` tool. Its job is
narrow: check your claims against the evidence bundle, nothing else.

- Give it: the brief (from `QUEUE.md`), your audit findings/fixes so far, and the
  evidence bundle directory path (tell it to `Read` the screenshots itself — don't just
  paste your own description of them).
- Explicitly tell it NOT to rebuild, NOT to re-run its own visual-audit pass, NOT to
  propose a full redesign — its only job is: does the evidence actually support "this is
  ready for Ben" (or, if you're passing along an unresolved issue, does the evidence
  actually show that issue)? A second full audit from scratch is redundant cost, not
  independent signal — see NIGHTLY-LOG.md's 2026-07-22 entry for why (two reviewers using
  the same method catch the same blind spot, not a different one).
- Fold its response into the notes block verbatim-ish (attributed to Fable, not silently
  merged into your own voice) — Ben should be able to tell which findings are yours and
  which are Fable's.
- This is the only cross-model step in the loop right now. Do not add a third agent or a
  second Fable pass without checking with Ben first — see NIGHTLY-LOG.md's 2026-07-22
  entry for the cost/reliability tradeoff already discussed and decided.

Write the audit summary — what you checked, what you fixed, what the visual pass found,
what Fable said, what remains explicitly Ben's job (runtime feel, actual venue TV check)
— into the notes block. Then proceed to `/ship`.
