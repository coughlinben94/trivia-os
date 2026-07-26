---
description: Run Step 5's static code-invariant checklist, then a real headless-Chromium visual pass via concepts/tools/visual-audit.mjs, then (per the one-attempt rule) a single Fable second-opinion pass, before shipping
allowed-tools: Read, Grep, Glob, Skill, Agent, Bash(node *), Bash(git *), Bash(./concepts/tools/*), mcp__chrome-devtools__navigate_page, mcp__chrome-devtools__take_screenshot, mcp__chrome-devtools__performance_start_trace, mcp__chrome-devtools__performance_stop_trace, mcp__chrome-devtools__performance_analyze_insight
disable-model-invocation: true
---

# /audit — Step 5 static + visual self-audit, then second opinion (Storybook Agent)

## Mode: nightly pipeline vs. standalone

This step runs in one of two modes. Pick whichever matches how you got here — everything
from the checklist onward (checklist, visual pass, one-attempt rule, Fable second opinion)
is identical in both; only the checkpoint/bookkeeping differs.

- **Nightly pipeline mode** (`/claim` already ran, a `QUEUE.md` round-journey entry is
  claimed): CWD is `$WORKDIR` (the scratch checkout). Run "Checkpoint first" below, and
  end by proceeding to `/ship`.
- **Standalone mode** (2026-07-24, per Ben's explicit request to decouple this step — you're
  auditing whatever concepts/*.html file is actively being worked on live, right now, with
  no `QUEUE.md` entry because it isn't a round journey — e.g. an ambient-theme prototype):
  CWD is the connected repo (same as `/run`'s attended mode, no scratch checkout, no
  `$WORKDIR`). **Skip "Checkpoint first" entirely** — there is no queue entry to checkpoint.
  Take the file path directly (from the conversation, not from `QUEUE.md`). End by reporting
  findings straight to Ben in the conversation, not to `NIGHTLY-LOG.md`/`manifest.js` — there
  is no `/ship` step for a file with no queue entry. If Ben later wants it in the nightly
  pipeline (e.g. promoted into a real round journey), that's a separate, explicit decision —
  don't infer it from having run this.

## Checkpoint first (nightly pipeline mode only)

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

## Visual pass — two passes, both mandatory (restructured 2026-07-24)

Ben's own framing: a single snapshot review only catches composition/color/distinctness —
it structurally cannot catch anything that only shows up over time (a loop seam, two
periods syncing up, whether it still feels alive at minute 90). Split into two passes.
**Sonnet's own documented failure mode is skipping the second pass unless forced — so it
is not optional, not "if time allows," run it every time**, even though the mechanical
snapshot pass alone will often look done.

### Pass 1 — Snapshot (composition, color, distinctness)

This is the pass already described below: run `visual-audit.mjs`, read every screenshot in
the bundle, check per-beat correctness/legibility per the checklist above.

### Pass 2 — Endurance (loops, sync, TV physics) — for anything that runs continuously

Everything in this pass requires watching real elapsed time, not a single frame — budget
`--duration` on `visual-audit.mjs` accordingly (a full loop period at minimum; several
periods when checking sync). Applies fully to ambient themes (persistent, multi-hour) and
partially to round journeys (loop-seam and TV-physics items still apply even to an 8-14s
piece; the "minute 90" / burn-in items are ambient-specific, skip them for a journey).

**Time-scale** (the biggest blind spot — a snapshot review can't see this at all):
- Watch one full loop of the longest animation. Does the seam show — snap, hitch, or
  teleport where it wraps?
- Do any two loop durations share small common multiples? Periods like 8s and 4s sync up
  and pulse together every cycle — durations should be co-prime-ish, not round multiples
  of each other.
- Would this still feel alive at minute 90, or does it read as one gimmick repeating? Name
  the second-order motion (slow drift under fast flicker) or flag its absence.
- Does anything only look good at load? Staggered entrance animations that never recur mean
  the scene runs flatter than its first 10 seconds forever after.

**Physical viewing conditions** (TV in a dark bar, 10+ ft away):
- Squint test at simulated 10 ft: does the anchor still read as its thing, or become a
  smudge?
- Dark-gradient banding: cheap TV panels band hard on slow, dark, low-saturation gradients.
  Any wash spanning less than ~10% lightness over a large area is a banding suspect.
- Near-black floor: TVs crush shadows. Anything designed to sit at 3-8% lightness will
  vanish or block up. Check the darkest intended-visible element specifically.
- Burn-in / dirt: any bright static element parked in one spot for hours? An anchor can
  glow, but its hot core should breathe position or intensity slightly.

**Coexistence** (ambient never plays alone):
- Does the busiest region collide with where question text, `QuestionCounter`, the
  watermark, or the scoreboard overlay actually land — not just the abstract safe-area
  rect drawn in a prototype?
- Test against the lightest text color across override scenarios, not just the theme
  default — the host can override text color; ambient must not assume it.
- Shiny slides swap in `shinyBg`/`shinyAccent` — does the ambient clash when a gold shiny
  slide sits on top of it?
- Motion near the safe-area edge: peripheral flicker while people are reading is worse than
  motion far from it. Rate edge-adjacent motion by frequency, not just position.

**Tint + theme-family checks:**
- Run the tint mentally at an extreme override (hue-shift 180°): does any "in-family" color
  break because it was eyeballed instead of run through `tint()`? Conversely, is any
  sanctioned literal (white core, silhouette) accidentally wrapped in tint when it
  shouldn't be?
- Twin test across all 21 themes: name the theme this one most resembles at thumbnail size.
  If the answer comes fast, it isn't distinct enough.
- Does the scene depend on the vignette to work? It shouldn't — vignette is applied after,
  and its strength varies per theme.

**Cheap-tell / craft:**
- Count distinct opacity levels. Fewer than 3 reads as a flat poster; everything sitting at
  0.3 is the classic AI-ambient tell.
- Any element with perfectly linear or default ease? Ambients need eased, organic timing
  everywhere — linear is only correct for continuous rotation/conveyor motion.
- Symmetry check: mirrored or evenly-spaced elements read as generated. Offsets should look
  placed, not distributed.
- Hard-edge count, inverted from the usual "no hard edges" instinct: zero hard edges reads
  as mush, more than ~2 reads as clip-art. There's a real target band in between.

**Engineering** (beyond the GPU-only rule already in the checklist above):
- Count composited layers, not just properties. 40 blurred divs each on their own layer
  passes the transform/opacity rule and still cooks the GPU — set a rough node budget
  (~30 animated elements) and flag if a scene blows past it.
- Large static `filter: blur()` areas are allowed but expensive at 1080p full-bleed — flag
  any blur radius above ~40px on a near-fullscreen element.
- Keyframe/class-name collision: new `@keyframes`/class names must not shadow another
  ambient's or the shared `ambient*` helpers.
- Reduced-motion isn't pass/fail-only: with animation off, is the static frame still a
  designed composition, or does it freeze mid-awkward pose?

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

## Two-attempt rule (revised 2026-07-24, supersedes the original one-attempt rule)

If the checklist or the visual pass finds an issue: fix it, re-run the relevant check(s),
and look at the result. You get **at most two** self-fix attempts on the same issue. If
it's still broken after the second attempt, **stop and ask Ben directly** — do not proceed
to the Fable second opinion as a substitute for asking him, and do not attempt a third fix.
Ben's own words: "the goal is to never have to attempt to fix something more than twice
without asking for my opinion." Fable's evidence-only pass (below) still runs regardless —
it's not a replacement for Ben's input on a stuck issue, it's a separate, always-on check.
This is a tighter, separate cap from `QUEUE.md`'s 5-iteration Ben-review cap (that one
governs revision cycles across separate mornings with Ben's own input between them); this
one governs a single run's own internal retry behavior before Ben has to get involved.

## Second opinion — exactly one Fable pass, evidence-only

Once the audit above is done (clean, or not-clean-after-one-attempt per the rule above),
dispatch **exactly one** subagent with `model: "fable"` via the `Agent` tool. Its job is
narrow: check your claims against the evidence bundle, nothing else.

- Give it: the brief (from `QUEUE.md` in nightly mode; from the live conversation's own
  context in standalone mode), your audit findings/fixes so far, and the evidence bundle
  directory path (tell it to `Read` the screenshots itself — don't just paste your own
  description of them).
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
— into the notes block.

**Nightly pipeline mode:** proceed to `/ship`.

**Standalone mode:** report the summary directly to Ben in the conversation. No `/ship`,
no `QUEUE.md`/`manifest.js`/`NIGHTLY-LOG.md` writes — those are round-journey pipeline
bookkeeping and don't apply to a file with no queue entry.
