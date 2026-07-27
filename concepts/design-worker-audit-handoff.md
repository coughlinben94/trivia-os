# Research prompt + full evidence bundle: audit and improve the Trivia OS design-worker agent

**You do not have file access to this repo.** Everything you need is pasted into this document —
do not assume you can read `~/Projects/baynes-trivia/trivia-os` or any path in it. If you want more
than what's here (more git history, more files), say so explicitly in your findings as a stated
limitation rather than guessing at content you can't see.

Do real external research too — this isn't a read-only-evidence exercise. Look for how other
agentic coding setups handle self-verification of visual/generative output, why "the agent grades
its own homework" loops tend to fail, and any prior art on mechanical (non-textual) enforcement of
render-before-complete discipline in AI coding agents.

---

## Why this exists

A Trivia OS session built a new ambient background theme, "Campfire Sing-Along," declared it
done, and showed it to Ben without ever rendering it and looking at the result. It shipped with
the fire rendering as a plain lit rectangle, the night sky reading as a flat monocolor screen, and
stars invisible. Ben's own words: "what you did was pathetic." This is the latest in a real pattern
of visual-build failures on this project — not a one-off.

In response, a new standalone Claude Code subagent was created (`.claude/agents/
trivia-os-design-worker.md`, full text in Appendix A) to own all future ambient/visual work for
this project, plus a persistent memory file (`concepts/DESIGN-WORKER-LESSONS.md`, full text in
Appendix B) it's supposed to read before every task and update after.

**Your job:** audit whether this fix (dedicated agent + self-maintained lessons file) is actually
sufficient given the track record below, or whether it's ceremony around the same failure mode.
Be honest if it's the latter. A prior version of this same research request was run without full
evidence attached and produced generic advice — this version exists specifically to prevent that;
use the primary evidence below, don't fall back on generic agent-hygiene platitudes.

## The track record, with primary evidence, not just a summary

### 1. Firefly Summer meadow swing — 7 Fable-verified rounds, never fixed

Hand-coded rope/chain + bench. Passed every one of **27 locked numeric layout checks** (Appendix D
is the actual assertion script — `assert-firefly-layout.mjs` — read what it actually measures).
Still read as a crane boom, not a hanging swing, across 7 rounds. Root causes found only after the
fact: rope rendered too rigid/visible to read as slack cord, and it carried 0.3-0.4px blur while
the rest of the scene used 1.5-9px — a rendering-technique mismatch nobody caught until round 7.

**Git history on this one file (30 commits, Appendix E-1)** — read the commit message sequence
yourself. Note how many are `fix:` commits chasing the same handful of elements (oak, porch, jar,
swing bench) round after round, and how late in the sequence the actual swing-specific fixes land
relative to when the swing was first built.

### 2. Firefly Summer pond/deck water — 6 non-converging failures

Full replan after the swing failure. Hand-coded water fill failed 6 non-converging ways (wall →
sports court/pool with "lane line" streaks → still pool/ice-rink-reading blob reflections →
correctly-graduated blur that still didn't register as intentional). Only fixed by escalating to a
generated raster texture — and even that was shipped as best-achieved, not a clean pass;
persistent complaints (edges too clean/rectangular, water sitting "above" the rail rather than
continuing under it) were accepted rather than resolved.

### 3. Campfire Sing-Along flame — shipped as "a lit rectangle," never rendered before shipping

Root cause, diagnosed after the fact (Appendix C has the exact JSX): three stacked `GlowLayer`
radial-gradient divs inside a `width:7%, aspectRatio:0.62` box. The gradient stops' `center ± radius`
(computed per axis against the box's own width/height) overran the box's left/right/top edges by
4-20% on two of the three layers — worst on the brightest, most-visible one — so the color never
faded to transparent before the box's edge cut it off. The dimmest layer additionally carried a
`box-shadow` on a plain, non-rounded div, which is structurally guaranteed to render as a blurred
rectangle rather than a glow, independent of the gradient-math bug. The session's own named review
gates (`impeccable`, `emil-design-eng`) were skipped entirely, not failed — skipped.

**New finding, not in the original summarized version of this prompt:** as of this bundle, the
entire Campfire build — the broken version Ben saw AND the in-progress fix — has **zero commits**.
`git status` on this repo shows `client/src/components/display/ParticleBackground.jsx` as merely
*modified*, uncommitted, alongside five other modified tracked files and over a dozen untracked
new files. Compare this to the swing's 30 real commits, one per fix, or the balloons' single
clean commit below. Whatever discipline produced incremental, reviewable commits on every other
build in this project's history did not happen here at all — the flame was declared "done" and
shown to Ben while sitting as an uncommitted local diff. Decide for yourself whether this is a
separate, additional failure (a process/discipline gap distinct from the geometry-math bug) or a
symptom of the same root cause (rushing past every checkpoint, of which "commit your work" is one
more that got skipped alongside render-and-look and the review gates).

### 4. The one actual clean success: Sonora Balloons ("Sonora Sunrise")

Full file in Appendix F. **This is the single most information-dense data point available and
deserves real scrutiny, not a one-line mention.** Concrete facts, not summary:
- **One commit** (`282e7f3 feat: Sonora Balloons ambient theme — background depth layers +
  balloons`, Appendix E-2) for the parts of this file that are still live — contrast this against
  the swing's 30 commits and the pond's 6-round non-convergence.
- The file's own in-page notes (read them in Appendix F, lines ~62-86 and ~145-157) are explicit
  that it went through real failure too: an entire foreground concept (terraced mesa, hero cacti,
  ground-decor spawner) was built, broken, and re-fixed across several passes and never got it
  right — floating decor, floating cacti, terrain-shape bugs kept resurfacing even after each fix
  verified clean — and Ben's call was to **squash the whole foreground concept** rather than keep
  chasing it, keeping only what already worked (3 background ridge layers + 5 balloons).
- Form your own view: is "Sonora Balloons succeeded" actually true, or is the more accurate
  statement "the abstract/geometric half of Sonora Balloons succeeded and the figurative half
  (cacti, decor) failed and was cut," which is the *same* pattern as everywhere else (abstract
  shapes survive, figurative/contour shapes don't) rather than a counterexample to it?

### Sit with the actual sample before proposing anything

One file with a genuinely clean single-commit build (balloons' background layers). One file that
took 30 commits and still reportedly reads wrong in places even after "shipping" (the swing/full
meadow scene). One file that failed 6 non-converging ways before an escalation (pond water). One
file that never got rendered at all before being shown to Ben, and never got committed either
(campfire). Decide honestly whether n≈4 is enough to support a structural claim about *process*, or
whether the more defensible reading is that outcome correlates with *subject matter* (abstract
geometric shapes vs. organic/figurative contour) almost regardless of what process was nominally
followed — since the swing followed a heavily numerically-gated process and still failed 7 times,
while balloons' background layers succeeded in one shot with a comparatively lighter process.

---

## What to actually investigate

0. **Whether n≈4 attempts is even a large enough sample to support structural conclusions, and
   whether the real variable is process or subject matter.** See the section above. If your honest
   read is "not enough data, and the apparent pattern is confounded with shape complexity," say
   that plainly rather than forcing a confident structural narrative onto a small, messy sample.
1. **Is the failure pattern structural or procedural, to whatever extent the sample supports an
   answer at all?** The lessons file's own "what has failed" list (Appendix B) is dominated by
   hand-coded figurative/organic shapes and "what has worked" by generated assets plus simple
   abstract shapes. Is the honest conclusion that this class of agent — text/code-generating, no
   visual feedback loop inside its own generation step — is fundamentally bad at hand-authoring
   anything with organic contour, no matter how well-written the rules are? Should the design-
   worker agent's default flip harder toward "generate first, hand-code only the genuinely trivial
   remainder," rather than trusting it to self-classify correctly under the noun test every time?
2. **Where did the review-gate process actually break on Campfire, mechanically?** Not "gates were
   skipped" as a verdict — trace why, using the zero-commits finding above as part of the evidence.
   Is it a structural gap (the agent has no way to see its own rendered output mid-task without a
   tool call it can choose to skip), a sequencing gap (verification is a step at the end that's
   easy to rush past), or an incentive gap (nothing forces render-and-look, or even a commit,
   before the agent can claim completion)? Propose a concrete mechanism, not just a written rule.
3. **Is a single generalist "design worker" the right shape at all**, or should this split further
   — e.g. a narrow "geometry/math checker" that runs mechanically regardless of which agent
   authored the visual, decoupled from the creative/authoring step? Would that have caught the
   campfire flame's gradient-margin bug even under time pressure, since it wouldn't depend on the
   authoring agent remembering to do the math itself?
4. **Model/tooling fit — treat as open, not leading.** The agent (Appendix A) specifies
   `model: sonnet`. It's tempting to conclude "the failures are geometric/spatial reasoning,
   therefore opus" — check that this isn't presupposing its own answer. More basic and possibly
   more consequential: **the agent's declared tool list is `Read, Write, Edit, Glob, Grep, Bash,
   WebSearch, WebFetch`.** Does that list actually give it a way to invoke the `impeccable` and
   `emil-design-eng` skills its own instructions tell it to run, or a way to take a screenshot of
   its own rendered output? If the agent's rules describe capabilities its tool list doesn't grant,
   that's a literal capability gap no amount of rule-tightening fixes.
5. **Audit Appendix A and B directly, adversarially.** Does the lessons file's structure make the
   right things unmissable under pressure, or is it already at risk of being too long/soft (compare
   to how thoroughly `OBJECT-RENDERING-PROTOCOL.md` and `ROUND-JOURNEY-FLAGSHIP-MECHANISM.md`
   already existed before Campfire shipped broken, and didn't prevent it)? Specifically check: the
   "two-strike rule" referenced in both files never defines its own scope — two strikes within one
   session? Tracked across sessions, and if so tracked where, by whom? As written it's a phrase,
   not an enforceable mechanism. Also check the lessons file's own maintenance model: the same
   agent that might fail a task is also the one trusted to accurately write up why it failed and
   update its own memory afterward. That is a self-policing loop — and self-policing (trusting the
   agent to run its own verification step) is arguably what already failed on Campfire. Does
   anything in the current design audit the write-back itself, or is it "the agent grades its own
   homework" all the way down?

## Deliverable

A concrete, prioritized set of changes — not general advice, and not purely more documentation.
For each recommendation, name which specific incident above it would have caught or prevented.

Two hard requirements:

1. **At least one recommendation must be mechanical, not textual.** A rule added to a markdown file
   is exactly the intervention type that already existed for Campfire (`OBJECT-RENDERING-
   PROTOCOL.md`, `ROUND-JOURNEY-FLAGSHIP-MECHANISM.md`) and still didn't prevent it shipping
   unrendered, unreviewed, and uncommitted. Propose something that doesn't depend on the agent
   choosing to follow a written instruction under pressure — e.g. a gate script that must produce
   and save a screenshot artifact (and/or a git commit) before a "done" status is even writable, an
   enforced tool-call sequence, a separate mechanical geometry-check step that runs regardless of
   what the authoring step did. For every doc-only recommendation you do make, state explicitly why
   it won't share `OBJECT-RENDERING-PROTOCOL.md`'s fate.
2. **Explicitly consider, as a first-class possible answer, that the current approach (a dedicated
   hand-authoring agent plus a self-maintained lessons file) is the wrong fix entirely** — not just
   under-tuned. If your research leads there, say so plainly and propose what should replace it
   (e.g. generated-assets-by-default with hand-coding as a rare, gated exception; a separate
   non-self-policed verification agent that the authoring agent cannot skip or overrule; dropping
   fully-bespoke ambient scenes as a format for this project). Recommending termination of the
   current approach is an acceptable and equally valid outcome of this research if the evidence
   supports it — do not default to "tune the existing plan" just because that's the shape of what
   you were handed.

---

## Appendix A — `.claude/agents/trivia-os-design-worker.md` (full text)

```markdown
---
name: trivia-os-design-worker
description: The only agent that touches Trivia OS ambient-theme and round-journey visual/design work — bespoke ambient scenes, hand-coded shapes, Recraft asset briefs, /display animation polish. Dispatch this agent (not a general-purpose one) for anything under that scope, so lessons from past failed/succeeded attempts actually accumulate instead of being re-derived from scratch each session. Do not use for backend, scoring logic, Supabase, or non-visual work.
tools: Read, Write, Edit, Glob, Grep, Bash, WebSearch, WebFetch
model: sonnet
---

You are the standing design worker for Trivia OS. You own every ambient-theme and round-journey
*visual* build in this repo. Your entire reason to exist is to stop this project from re-making
the same visual mistakes across sessions — so the read-first and write-back steps below are not
optional process theater, they are the point of dispatching you instead of a general-purpose agent.

## Before writing a single line

Read, in this order:
1. `concepts/DESIGN-WORKER-LESSONS.md` — what has actually worked and actually failed in this
   project, with root causes. This is the most important file. If your planned approach matches
   something in "What has failed," do not do it anyway "just to check" — that guess is exactly
   what has already cost this project multiple multi-round failures (the swing: 7 rounds; the
   pond: 6 rounds).
2. `concepts/OBJECT-RENDERING-PROTOCOL.md` — the noun test, the two-strike cap, escalation rules.
3. `references/themes.md` and `references/round-journeys.md` — house style, hero-beat spec,
   the ambient design system this all has to fit into.
4. `~/.agents/skills/emil-design-eng/SKILL.md` and `~/.agents/skills/emilkowal-animations/SKILL.md`
   (or the equivalent skill invocations) for animation/motion philosophy and technique.

## While working

- **Classify every element with the noun test before coding it.** Anything a guest would identify
  by contour or joints (rope, literal flame, treeline, water surface, railings with visible
  joinery) escalates to a generated + isolation-validated asset. Only true one-sentence-of-geometry
  shapes (disc, beam, flat gradient plane, glowing dot) get hand-coded directly.
- **If you build a radial-gradient shape inside a box, do the margin math.** Compute
  `center ± radius` per axis against the box's own width/height before you consider it done. See
  `DESIGN-WORKER-LESSONS.md`'s Established Conventions for the exact method — this is the single
  most common concrete failure recorded so far (it's what broke Campfire Sing-Along's flame).
- **Never use `box-shadow` for a glow effect on a non-rounded element.**
- **Blur floor is a minimum, not a flat target** — graduate it by depth, don't apply one value
  uniformly across the whole scene.
- **If motion is supposed to be subtle (sway, swing, breathe), assert the actual transform/angle
  over time, not just position.** A position-only check missed the meadow swing's near-motionless
  sway for 27 straight rounds.
- **Two-strike rule:** if the same hand-coded approach to the same element fails a real visual
  look twice, stop. Do not attempt a third blind guess. Re-lock scope with Ben explicitly instead.

## Verification — non-negotiable, every time

1. Actually render the result and look at it (Chrome MCP navigate + screenshot against the running
   dev server, or a real headless capture via this repo's `concepts/tools/visual-audit.mjs`
   convention). "Code parses / timing hits spec / safe-area math clears" is NOT verification for
   visual work and must never be reported as if it were.
2. Run the project's named review gates for real — `impeccable` and `emil-design-eng` — against
   the actual rendered frames, not just cite that the gates exist.
3. Only after both of the above pass (or you've hit the two-strike stop condition) report status.

## After finishing (success or failure — this step is mandatory either way)

Update `concepts/DESIGN-WORKER-LESSONS.md`:
- If something genuinely new failed: add it to "What has failed," with the concrete root cause
  (not just the symptom), under Active Directives if it's not yet re-verified/resolved.
- If something genuinely new worked (survived a real visual look, not just shipped): add it to
  "What has worked."
- If neither — you followed an already-documented convention and it behaved exactly as documented
  — do not add a new entry. The file grows only from genuinely new information, per its own
  10-directive cap discipline (fold the oldest into Established Conventions, per the file's own
  header rule, when a new entry would push past 10).

## Reporting back

Be specific about what you actually checked (which files, what you rendered, what the gates said),
not just "done." If you hit the two-strike stop condition on an element, say so plainly and name
what scope decision you need from Ben before continuing — don't quietly keep guessing.
```

## Appendix B — `concepts/DESIGN-WORKER-LESSONS.md` (full text)

```markdown
# Design Worker — Lessons

Read this file in full before starting any visual/ambient/design task in Trivia OS. Update it
after every real failure or fix — not every task, only when something actually went wrong or a
genuinely new pattern got confirmed. Same cap discipline as `concepts/LESSONS.md`: at most 10
active directives below "Established Conventions." When a normal run would push past 10, fold
the oldest into a one-line addition to Established Conventions and drop the verbatim original.

This file is scoped to the design worker only (ambient themes, round-journey visuals, hand-coded
shapes, Recraft assets). It does not replace `concepts/LESSONS.md` (the nightly round-journey
storybook pipeline's own feedback loop) — that one stays as-is.

## What has worked (confirmed-good, keep doing this)

Short list on purpose — most attempts in this project's history have failed or partially failed.
Don't read the shortness as "nothing works"; read it as "these are the few load-bearing patterns,
lean on them before trying anything new."

- **Recraft-generated art for anything figurative/contour-identifiable, isolation-validated before
  it touches a scene.** Firefly Summer's oak: 3 hand-coded attempts failed, 1 Recraft pass fixed
  it outright. Pond water: hand-coded fill failed 6 non-converging ways, 1 generated raster
  texture (plus a dark scrim) was the only version that stopped reading as "a wall/court/pool."
- **A single soft glow blob as an abstract fire/light stand-in** (autumn-harvest theme) — this
  project's one other real fire, confirmed good, never re-litigated. The lesson taken from it for
  Campfire Sing-Along was narrower: keep this abstract-glow approach, don't upgrade to a literal
  animated flame silhouette (that's the swing's failure category, not this one's).
  Note this is one theme's element, not the flame's own full solution — Campfire's flame is still
  mid-fix as of 2026-07-26; see Active Directives.
- **Asymmetric pairs beat matched pairs.** Firefly Summer's two pond-deck lanterns (different
  height/size/sway amplitude/period) passed Fable checkpoint B outright — the first checkpoint in
  either build to pass without surfacing a real defect. A prior matched/mirrored version would
  have repeated the "dead-center/mirror composition" mistake this project explicitly flags.
  Full-width rail + baluster occlusion did the same job for "selling the vantage" that the earlier
  under-scoped single-corner rail stub couldn't.
- **Rotation-angle-over-time sampling for anything that's supposed to swing/sway subtly.** The
  only assertion technique in this project's history proven to catch a real invisible-motion bug
  (the meadow swing's near-motionless sway went undetected across 27/27 position-only PASSes for
  many rounds; the same swing, once resampled by rotation angle, immediately showed the gap).
- **A ground-anchored light-pool that lags the light source instead of strobing in sync with it**
  (Campfire's ember-lit ground glow, per an Opus review that found a single strobing blob wasn't
  convincing on its own).

## What has failed (confirmed-bad, do not retry as-is)

- **Hand-typed rope/cord that stays thick, wood-toned, and visible its whole run.** Reads as a
  rigid post/crane boom, not slack cord — failed across all 7 Fable-verified rounds of the meadow
  swing. A written rule requiring "vertical, parallel, visible whole run" forecloses the sag/taper
  that would have sold rope; don't write that rule again for a cord/rope element.
- **Hand-coded flat rectangular/trapezoid water fill for a pond/lake/ocean surface.** Failed 4
  distinct, non-converging ways (wall → sports court/pool with "lane line" streaks → still
  pool/ice-rink-reading blob reflections → correctly-graduated blur that still didn't register as
  intentional). Start any future water surface with generated raster texture, not a hand-coded
  fill.
- **A single blur value applied uniformly across an entire scene ("blur floor" applied too
  literally).** Firefly Summer's pond attempt 3 used uniform 1.5px blur everywhere and it read as
  "the whole frame is out of focus," not a deliberate depth style — the floor is a *minimum*, not
  a target; foreground/background still need to graduate (attempt 4 tried ~1.6-2.4px foreground /
  ~3.4-4.5px background, which fixed the "out of focus" complaint even though the underlying pond
  shape complaint was separate and unresolved).
- **`box-shadow` as a stand-in for a soft radial glow on a non-rounded element.** Renders a
  blurred rectangle, not a glow — see the box-shadow convention below. Confirmed as (at minimum) a
  contributing cause of Campfire's flame reading as "a lit rectangle."
- **Radial-gradient ellipse radii sized without checking `center ± radius` against the box's own
  edges.** Same Campfire flame bug, independent of the box-shadow issue above — the gradient
  stops themselves never reached transparent before the box's edges cut them off on 2 of 3 layers,
  worst on the brightest/most-visible one.

## Established Conventions

- **Radial-gradient-in-a-box must be checked with real math, not eyeballed.** A `radial-gradient`
  ellipse's percentage radii are relative to the element's own box width/height. If
  `center ± radius` (computed per axis) falls outside the box on any side the design needs to
  taper (usually top/left/right; bottom is often fine to leave open if it's the object's anchor
  point), that side never reaches `transparent` before the box edge cuts it off — the box's own
  rectangular boundary becomes visible as a hard edge. This reads as "a lit rectangle," not the
  intended shape. Compute `center_x ± (radius_x% * width)` and `center_y ± (radius_y% * height)`
  explicitly for every stop before shipping; leave real margin (aim for 5-15%), don't rely on the
  gradient stop reaching exactly 100%.
- **`box-shadow` on a plain (non-rounded) div follows that div's rectangular shape.** A soft glow
  effect built as `box-shadow: 0 0 <blur> <spread> <color>` on an element with no `border-radius`
  renders a blurred rectangle, not a blurred glow. If the intent is an ambient soft-glow halo, use
  a separate radial-gradient layer (own box, own margin math above) or set `border-radius: 50%`
  on that specific element first.
- **Hand-typed figurative shapes (rope, swing, treeline, literal flame silhouette) are the highest
  failure-rate category in this project.** Firefly Summer's swing passed 27/27 locked numeric
  checks and still read as a crane boom after 7 rounds; two Recraft-generated replacements (oak,
  pond water) each fixed on the first or near-first pass what hand-coding couldn't converge on in
  3-6 rounds. Classify every element with the noun test (`concepts/OBJECT-RENDERING-PROTOCOL.md`)
  before writing a line of code. Anything a guest would identify by contour or joints escalates to
  generated + isolation-validated art. Only truly one-sentence-of-geometry shapes (disc, beam, flat
  gradient plane, glowing dot) get hand-coded.
- **Blur-floor rule: every element in a bespoke ambient scene needs ≥1.5px blur, no exceptions.**
  A rendering-technique mismatch (one sharp-vector element next to everything-else-soft) reads as
  visibly wrong even when the shape itself is correct — this is a separate failure mode from a bad
  shape, and needs its own explicit check.
- **A position-only assertion cannot verify motion that's supposed to be subtle.** Small-angle
  swings/sways can move a bounding box only 1-2% of stage width — inside typical position
  tolerance — and pass numerically while being visually motionless. Any assertion covering
  rotation/sway must sample the actual transform (e.g. `getComputedStyle(...).transform` converted
  to an angle) over multiple real-time points across a full period, not just position.
- **Verification-before-completion is not optional for visual work, ever.** "Code parses, timing
  hits spec, safe-area math clears" is not the same claim as "I rendered this and looked at it."
  Do not report a visual task done without an actual render + look step (Chrome MCP screenshot,
  or a real headless capture) in the same turn.

## Active Directives

- 2026-07-26: Campfire Sing-Along's flame rendered as "a lit rectangle" on first ship. Root cause,
  found by applying the box-margin math above retroactively: all three flame `GlowLayer` radial
  gradients had `center ± radius` overrunning the flame wrapper's own left/right/top edges by
  4-20% (worst on the brightest, most visible layer), so the color never faded to transparent
  before the box cut it off — plus the dimmest layer additionally carried a `box-shadow` on a
  plain rectangular div (see the box-shadow convention above), which is its own independent
  rectangle-tell. Fix applied same session: recomputed all three gradients' radii/centers with
  real margin, removed the box-shadow in favor of a separate wide/blurred ambient bloom layer, and
  added `filter: blur()` as a mechanical safety net. **Not yet re-verified by an actual render +
  look** — do not report this fixed until that happens. If a fresh visual check still fails on
  this same hand-coded flame approach, that is strike two on this element; stop and re-lock scope
  with Ben rather than guessing a third time, per the two-strike rule.
```

## Appendix C — Campfire's flame block, the exact broken code (`ParticleBackground.jsx`, uncommitted)

```jsx
{/* Flame body — three independently-flickering layers on non-matching
    periods, nested inside a slow scaleY breathe (fire changes shape,
    not just brightness) which is itself nested inside the hero-beat
    scale wrapper. */}
<div style={{ position: 'absolute', left: '46%', bottom: '10%', width: '7%', aspectRatio: '0.62',
  animation: 'ambientHeroFlare 200s ease-in-out infinite', transformOrigin: '50% 100%' }}>
  <div style={{ position: 'absolute', inset: 0,
    animation: 'ambientStretchY 4.4s ease-in-out infinite', transformOrigin: '50% 100%' }}>
    <GlowLayer lo={0.55} hi={0.92} duration="2.3s" flicker style={{ inset: 0,
      background: `radial-gradient(ellipse 70% 85% at 50% 78%, ${tint('rgba(255,250,230,0.95)')} 0%, ${tint('rgba(255,196,80,0.9)')} 30%, ${tint('rgba(255,140,40,0.82)')} 58%, ${tint('rgba(200,50,20,0.5)')} 82%, transparent 100%)` }}/>
    <GlowLayer lo={0.45} hi={0.85} duration="3.7s" flicker style={{ inset: 0,
      background: `radial-gradient(ellipse 58% 72% at 50% 82%, ${tint('rgba(255,240,210,0.85)')} 0%, ${tint('rgba(255,170,60,0.78)')} 36%, ${tint('rgba(240,110,30,0.6)')} 66%, transparent 100%)` }}/>
    <GlowLayer lo={0.35} hi={0.7} duration="5.9s" flicker style={{ inset: 0,
      background: `radial-gradient(ellipse 46% 60% at 50% 86%, ${tint('rgba(255,255,240,0.7)')} 0%, ${tint('rgba(255,150,50,0.55)')} 42%, transparent 100%)`,
      boxShadow: `0 0 5vw 1.5vw ${tint('rgba(255,140,50,0.30)')}` }}/>
  </div>
</div>
```

`GlowLayer` (the shared helper component all three layers use) is a plain absolutely-positioned
`<div>` with no `border-radius`, opacity-only animation, and whatever `style` is passed in:

```jsx
function GlowLayer({ style, lo, hi, duration = '4s', delay = '0s', flicker = false, buzz = false }) {
  const animName = buzz ? 'ambientNeonBuzz' : flicker ? 'ambientFlicker' : 'ambientBreathe'
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute', pointerEvents: 'none', willChange: 'opacity',
        '--lo': lo, '--hi': hi,
        animation: `${animName} ${duration} ${delay} ease-in-out infinite`,
        ...style,
      }}
    />
  )
}
```

## Appendix D — `concepts/tools/assert-firefly-layout.mjs` (full text, the swing's 27-check gate)

```javascript
#!/usr/bin/env node
// concepts/tools/assert-firefly-layout.mjs
//
// Machine-checkable layout gate for firefly-summer-meadow.html against the
// 2026-07-26 locked layout spec. Loads the file headless, forces rm-force
// (strips all .sd-anim animation so every measurement is taken at REST pose,
// not mid-sway/mid-flash), reads real getBoundingClientRect() geometry off
// the actual rendered DOM, and prints a PASS/FAIL table. This is the
// authority — "does it match" is this script's output, not a visual opinion.
//
// Tolerance: ±2% of stage dimension (spec's own number), applied as absolute
// percentage points. Range-type spec values (e.g. "26-30%") pass if the
// measured value falls within [min-2, max+2].
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FILE = resolve(HERE, '..', 'firefly-summer-meadow.html');
const TOL = 2; // ±2% of stage dimension, per spec

function within(actual, expected, tol = TOL) { return Math.abs(actual - expected) <= tol; }
function withinRange(actual, lo, hi, tol = TOL) { return actual >= lo - tol && actual <= hi + tol; }

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto(`file://${FILE}`, { waitUntil: 'load' });

// Freeze every .sd-anim animation at rest pose before measuring anything.
await page.evaluate(() => document.getElementById('stage').classList.add('rm-force'));
await page.waitForTimeout(150);

const data = await page.evaluate(() => {
  const stage = document.getElementById('stage');
  const sRect = stage.getBoundingClientRect();
  const pct = (rect) => rect && ({
    xL: (rect.left - sRect.left) / sRect.width * 100,
    xR: (rect.right - sRect.left) / sRect.width * 100,
    yT: (rect.top - sRect.top) / sRect.height * 100,
    yB: (rect.bottom - sRect.top) / sRect.height * 100,
    wPct: rect.width / sRect.width * 100,
    hPct: rect.height / sRect.height * 100,
  });
  const bbox = (sel) => { const el = document.querySelector(sel); return el ? pct(el.getBoundingClientRect()) : null; };
  return {
    oak: bbox('#oakImg'), swingSeat: bbox('#swingSeat'), rope1: bbox('#rope1'), rope2: bbox('#rope2'),
    jar: bbox('#jarImg'), pondWater: bbox('#pondWater'),
    // ...hill/horizon/color-luminance/reflection-count fields omitted here for length; see checks below
  };
});
await browser.close();

// ── SWING checks (this is the category that passed 27/27 and still failed visually) ──
if (data.swingSeat) {
  const seatTopY = data.swingSeat.yT;
  const seatSpanX = data.swingSeat.wPct;
  const seatBottomY = data.swingSeat.yB;
  const trunkBaseY = data.oak ? data.oak.yB : 68;
  // checks: seat top y == 55%, seat x-span == 14%, ground clearance >= 6% stage height
}
if (data.rope1 && data.rope2) {
  const r1Vertical = data.rope1.wPct < 1.2;   // rope's own x-span must stay near-zero (i.e. "vertical")
  const r2Vertical = data.rope2.wPct < 1.2;
  const tieSeparation = Math.abs(((data.rope1.xL + data.rope1.xR) / 2) - ((data.rope2.xL + data.rope2.xR) / 2));
  // checks: rope1 vertical, rope2 vertical, two distinct tie points >5% apart
  // NOTE: nothing in this script measures blur, color/texture, or rope THICKNESS —
  // it only checks x-span-near-zero (bounding-box "verticalness") and tie-point separation.
  // A rope that is bounding-box-vertical and well-separated at its ties can still be thick,
  // sharp-edged, and wood-toned — exactly what happened. The script's own check design is why
  // 27/27 numeric PASS coexisted with "reads as a crane boom."
}
// ...remainder of file: oak/jar/pond/hills checks, all the same bounding-box-percentage style.
```

## Appendix E — Git history, raw

**E-1. `git log --oneline -- concepts/firefly-summer-meadow.html` (30 commits, oldest last):**
```
084e123 feat: rebuild Firefly Summer to a locked, machine-verified layout spec
e817333 fix: porch fade reads as shadow, remove oak-reflection glitch, boost jar's focal glow
51019e4 fix: buildJarChain now derives CHAIN_BOTTOM from JAR_BOUNDS instead of a hardcoded literal
ae30167 chore: Task 8 verification pass — reduced-motion coverage check, endurance capture, hoist duplicated coordinate constants
52cff5f fix: rebuild swing bench with visible scale, rim-light, and perceptible sway
61e2559 feat: Firefly Summer swing bench (hand-coded, amplitude-reroll sway)
0266c12 docs: fix incorrect clearance number in jar hook comment
4d425fa fix: give jar its own hook/chain, free both porch chains for Task 7 swing bench
e59cc8b fix: hang jar from porch chain instead of floating near post
497a4a1 feat: Firefly Summer jar (Recraft asset, fireflies inside, the theme's real anchor)
49f31da fix: precisely match porch post-extension color/width/stripe at seam
447b4ef fix: replace porch hard-cut edges with soft opacity fades
2757ed2 fix: ground porch post and hide razor-straight roof crop edge
f8aa954 fix: replace porch backdrop with corrected asset (ceiling plane, muted colors, clean alpha)
201a247 docs: note porch chain/rail coordinates for Task 6-7
b40eca4 fix: tighten porch mask to clear safe-area intrusion
f109ebe feat: Firefly Summer porch backdrop (Recraft asset, cropped composite)
52c24ce fix: clamp firefly spawn height below treeline, raise dim-state glow visibility
7fd9d4f fix: exclude fade-tier fireflies from lake reflections (stale ghost bug)
c7da383 feat: Firefly Summer fireflies (hero+filler, flash+J-stroke+drift, lake reflections)
3f77a65 feat: Firefly Summer lake (static reflection + shimmer)
5724d37 fix: oak tile-wrap seamlessness, edge halo, and oversized scale
390d399 feat: replace hand-coded oak silhouette with Recraft-generated asset
84ed051 fix: oak trunk/canopy geometry and front-layer compound crowns per 2nd Fable critique
0efd0b7 docs: correct stale notes/gate text after Task 1-2 commits
c74c1a8 fix: oak middle-lobe proportions and distinct fill per spec review
da9b5a8 fix: Firefly Summer treeline — curved clustered crowns per Fable design critique
0076f4c feat: Firefly Summer treeline (3 layers + oak landmark)
0d87e6e feat: Firefly Summer sky gradient + star field
00cf865 scaffold: Firefly Summer concept file, harness only
```
(30th commit not shown above is the branch base; count is 30 including the rebuild at top.)

**E-2. `git log --oneline -- concepts/sonora-balloons-depth.html`:**
```
282e7f3 feat: Sonora Balloons ambient theme — background depth layers + balloons
```
One commit, full stop, for everything still live in that file today.

**E-3. `git status --short` on this repo, taken while assembling this bundle:**
```
 M SKILL.md
 M client/src/components/display/ParticleBackground.jsx
 M client/src/themes/index.js
 M concepts/AGENT-PROMPT.md
 M references/build-state.md
 M references/themes.md
?? .claude/agents/
?? .claude/settings.local.json
?? concepts/.recraft-cache/pond-water-texture.b64
?? concepts/.recraft-cache/pond-water-texture.webp
?? concepts/DESIGN-WORKER-LESSONS.md
?? concepts/OBJECT-RENDERING-PROTOCOL.md
?? concepts/ROUND-JOURNEY-FLAGSHIP-MECHANISM.md
?? concepts/design-worker-audit-prompt.md
?? concepts/firefly-summer-deck-spec.md
?? concepts/firefly-summer-pond-deck-v1.html
?? concepts/mockup-mascot-character.html
?? concepts/mockup-neon-marquee.html
?? concepts/mockup-paper-diorama.html
?? concepts/mockup-retro-travel-poster.html
```
`ParticleBackground.jsx` — the file containing the entire Campfire flame implementation, broken and
fixed versions both — is listed as **modified, not committed.** (178 insertions, 4 deletions per
`git diff --stat` at bundle time.) The broken version Ben saw was never committed at all.

## Appendix F — `concepts/sonora-balloons-depth.html` (full text, the one clean win)

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Living Diorama v3 — Sonora Balloons (continuous idle life, no round mechanic)</title>
<style>
  :root{ --text:#f5e8d0; --ease-out: cubic-bezier(0.23, 1, 0.32, 1); --ease-in-out: cubic-bezier(0.77, 0, 0.175, 1); }
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  body{background:#0a0510;color:#f5e0d0;font-family:system-ui,sans-serif;padding:28px}
  .stage{position:relative;width:min(1100px,92vw);aspect-ratio:16/9;margin:0 auto;overflow:hidden;border-radius:10px;container-type:size}
  @media (prefers-reduced-motion: reduce){ .sd-anim{ animation:none !important } }
  .rm-force .sd-anim{ animation:none !important }
  @keyframes sdRidgeLoopR { from{transform:translateX(0)}   to{transform:translateX(-50%)} }
  @keyframes sdRidgeLoopL { from{transform:translateX(-50%)} to{transform:translateX(0)} }
  @keyframes sdBalloonDrift { 0% { transform: translate(0, 0); } 50% { transform: translate(var(--dx,50vw), var(--dy,0)); } 100% { transform: translate(0, 0); } }
  @keyframes sdSway { 0%,100% { transform: rotate(-2.4deg); } 50% { transform: rotate(2.4deg); } }
  @keyframes sdGoreSlide { to { transform: translateX(calc(-1 * var(--rep, 120px))); } }
  @keyframes sdStar { 0%,100%{opacity:0} 50%{opacity:.9} }
  @keyframes sdBalloonFade { 0%,100%{opacity:0} 12%{opacity:var(--fadeOp,0.7)} 45%{opacity:var(--fadeOp,0.7)} 58%{opacity:0} }
  @keyframes sdBreathe { 0%,100%{ transform:scale(var(--breatheMin,0.9)) } 50%{ transform:scale(var(--breatheMax,1.1)) } }
</style>
</head>
<body>

<div class="wrap">
<h1>Living Diorama v3 — Sonora Balloons, continuous idle life</h1>
<div class="sub">
Direction changed mid-build, on purpose: "instead of the depth transititons round to round, we can just have
the baloons get bigger, then smaller, then bigger, as the show goes on. the bottom scrolling mountain with
cactus's and hte occationsal fencepost and barbed wire can just scroll idly by... making hte scene feel ALIVE!!!
that's the whole point." This version deletes the entire round-boundary depth-traversal mechanic from the prior
draft (stepper UI, tier-promotion, crossfade choreography) — per two independent Fable design passes, that
machinery was the source of nearly every bug in this file's history, and it isn't what actually sells "alive."
What's here instead: 3 background terrain layers, permanently concurrent, each at a fixed depth, each idly
auto-scrolling forever, each with two alternating bump layouts so the loop doesn't repeat one silhouette forever.
5 balloons, permanently tiered (1 far / 2 mid / 2 near), each breathing bigger/smaller on its own distinct cycle
so they never sync.
</div>
<div class="sub" style="margin-top:8px;font-size:.78rem">
The foreground (a terraced mesa, embedded hero cacti, a ground-decor spawner) went through several rework
passes this session and never got it right — floating decor, floating cacti, and terrain-shape bugs kept
resurfacing in new forms even after each fix verified clean. Ben's call: squash the whole foreground concept
rather than keep chasing it, keep the background depth layers and balloons that were already working.
</div>

<div class="stage" id="stage">
  <div id="world" style="position:absolute;inset:0;overflow:hidden">
    <div style="position:absolute;inset:0;background:linear-gradient(180deg, #180a28 0%, #22103a 20%, #341444 40%, #6a2a3c 57%, #b0442a 71%, #e8863a 82%, #896856 87%, #635c61 89%, #2a4a72 92%, #163a63 96%, #0e2c50 100%)"></div>
    <div id="stars"></div>
    <div id="ridgeR1" style="position:absolute;inset:0;z-index:1"></div>
    <div id="balloonFar" style="position:absolute;inset:0;z-index:2"></div>
    <div id="ridgeR2" style="position:absolute;inset:0;z-index:3"></div>
    <div id="balloonMid" style="position:absolute;inset:0;z-index:4"></div>
    <div id="ridgeR3" style="position:absolute;inset:0;z-index:5"></div>
    <div id="balloonNear" style="position:absolute;inset:0;z-index:6"></div>
  </div>
  <div class="safe-area"></div>
</div>

<div class="notes">
  <h2>Foreground squashed (2026-07-24)</h2>
  The R4 terraced mesa, its embedded hero cacti, and the ground-decor spawner (fence/rocks/ocotillo) were
  built, broken, and re-fixed across several passes this session — floating decor, floating cacti, ridge
  depth-occlusion, and a terrain-shape pop each got fixed in turn, but a new variant of the same class of bug
  kept resurfacing. Ben's call: stop chasing it and squash the whole foreground concept rather than ship
  something that still isn't right. What's left (3 background ridge layers + 5 balloons) was already solid
  before any of that foreground work started. The deleted code is in git history if it's ever worth
  revisiting with a different approach.
</div>
</div>

<script>
(function(){
  const stage = document.getElementById('stage');
  const els = {
    R1: document.getElementById('ridgeR1'), R2: document.getElementById('ridgeR2'), R3: document.getElementById('ridgeR3'),
    far: document.getElementById('balloonFar'), mid: document.getElementById('balloonMid'), near: document.getElementById('balloonNear'),
  };

  // Stars: 22 dots, random size/duration, reroll position on every fade cycle while invisible
  // (opacity dips to exactly 0 at cycle boundary — a silent teleport, never a visible jump).
  const starsEl = document.getElementById('stars');
  for (let i=0;i<22;i++){
    const s = document.createElement('div');
    const dur = (5+Math.random()*8).toFixed(2), delay = -(Math.random()*10).toFixed(2);
    s.className = 'sd-anim';
    s.style.cssText = `position:absolute;left:${(2+Math.random()*96).toFixed(2)}%;top:${(1.5+Math.random()*25).toFixed(2)}%;width:${1+Math.random()*1.6}px;height:${1+Math.random()*1.6}px;border-radius:50%;background:#f6e6ff;animation:sdStar ${dur}s ${delay}s ease-in-out infinite`;
    s.addEventListener('animationiteration', () => {
      s.style.left = `${(2+Math.random()*96).toFixed(2)}%`; s.style.top = `${(1.5+Math.random()*25).toFixed(2)}%`;
    });
    starsEl.appendChild(s);
  }

  // Terrain: three plain rolling-mountain-outline silhouettes, no flat tops, no secondary forms —
  // deliberately the SIMPLEST possible shape once the figurative foreground (mesa/cacti) was cut.
  const RIDGE_SHAPE_VARIANTS = {
    R1: ['0,100 0,86 30,84.7 55,85.6 80,84.2 100,86 100,100', '0,100 0,86 22,85.3 42,84.5 65,85.8 88,84.9 100,86 100,100'],
    R2: ['0,100 0,90 25,88.6 50,89.8 75,88.2 100,90 100,100', '0,100 0,90 20,89.3 45,88.4 68,89.7 85,88.7 100,90 100,100'],
    R3: ['0,100 0,94 20,92.8 40,93.9 60,92.3 80,93.6 100,94 100,100', '0,100 0,94 15,93.4 35,92.5 55,93.8 75,92.4 90,93.5 100,94 100,100'],
  };
  const RIDGE_TIERS = [
    { key:'R1', shape:'R1', fill:'#8a6090', blur:2, sat:0.55, op:0.85, dur:216, dir:'R' },
    { key:'R2', shape:'R2', fill:'#6a4070', blur:1, sat:0.70, op:0.88, dur:135, dir:'L' },
    { key:'R3', shape:'R3', fill:'#402050', blur:0, sat:1.00, op:0.92, dur:81,  dir:'R' },
  ];
  function buildRidge(tier){
    const variants = RIDGE_SHAPE_VARIANTS[tier.shape];
    const copies = 4, tileWidthPct = 25, trackWidthPct = 400, effectiveDur = tier.dur * 2;
    const track = document.createElement('div');
    track.className = 'sd-anim';
    track.style.cssText = `position:absolute;top:0;left:0;height:100%;width:${trackWidthPct}%;display:flex;animation:${tier.dir==='R'?'sdRidgeLoopR':'sdRidgeLoopL'} ${effectiveDur}s linear infinite`;
    track.style.filter = (tier.blur>0 || tier.sat<1) ? `blur(${tier.blur}px) saturate(${tier.sat})` : 'none';
    for (let i=0;i<copies;i++){
      const wrap = document.createElement('div');
      wrap.style.cssText = `flex:0 0 ${tileWidthPct}%;width:${tileWidthPct}%;height:100%;position:relative`;
      const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
      svg.setAttribute('viewBox','0 0 100 100'); svg.setAttribute('preserveAspectRatio','none');
      svg.style.cssText = 'position:absolute;bottom:0;left:0;width:100%;height:100%';
      const poly = document.createElementNS('http://www.w3.org/2000/svg','polygon');
      poly.setAttribute('points', variants[i % 2]); poly.setAttribute('fill', tier.fill); poly.setAttribute('opacity', tier.op);
      svg.appendChild(poly); wrap.appendChild(svg); track.appendChild(wrap);
    }
    const holder = document.createElement('div');
    holder.style.cssText = 'position:absolute;left:-8%;width:116%;bottom:0;height:100%;overflow:hidden';
    holder.appendChild(track);
    return holder;
  }

  // Balloons: SVG stripe-gore envelope + basket, unchanged construction since the very first
  // draft — this part of the file was never the source of a real complaint.
  const STRIPE_W = 20;
  const PALETTES = {
    RAINBOW: ['#e04028','#ff8830','#ffd028','#38b048','#3080e0','#9038e0'],
    SUNSET:  ['#c81f4a','#ff7a30','#ffb040','#e05028'],
    OCEAN:   ['#38b0a0','#3080e0','#5060d0','#8040c8'],
    BERRY:   ['#d84090','#8c3068','#ff6090','#c05480'],
    FOREST:  ['#c86028','#d8a838','#6b8020','#3d5c2a'],
  };
  const TIER_SPEC = {
    far:  { scale:0.55, durMult:1.5, sat:0.70, blur:0.5, op:0.85, breathePeriod:50, breatheAmp:0.10 },
    mid:  { scale:1.00, durMult:1.0, sat:1.00, blur:0,   op:1.0,  breathePeriod:64, breatheAmp:0.14 },
    near: { scale:1.30, durMult:0.7, sat:1.00, blur:0,   op:1.0,  breathePeriod:73, breatheAmp:0.18 },
  };
  const BASE_BALLOONS = [
    { key:'rainbow', cols:PALETTES.RAINBOW, tier:'far',  breathePeriod:50, goreDur:15, base:4.19, cy:30, sx:8,  ex:78, dy:1.4,  dur:62, swayDur:8.0 },
    { key:'sunset',  cols:PALETTES.SUNSET,  tier:'mid',  breathePeriod:64, goreDur:11, base:4.19, cy:12, sx:82, ex:14, dy:-1.6, dur:72, swayDur:6.5 },
    { key:'ocean',   cols:PALETTES.OCEAN,   tier:'near', breathePeriod:73, goreDur:13, base:4.19, cy:6,  sx:10, ex:90, dy:0.5,  dur:58, swayDur:9.0 },
    { key:'berry',   cols:PALETTES.BERRY,   tier:'mid',  breathePeriod:86, goreDur:12, base:4.19, cy:14, sx:78, ex:8,  dy:-1.8, dur:68, swayDur:7.0 },
    { key:'forest',  cols:PALETTES.FOREST,  tier:'near', breathePeriod:97, goreDur:14, base:4.19, cy:9,  sx:14, ex:88, dy:0.8,  dur:80, swayDur:7.5 },
    { key:'rainbow2', cols:PALETTES.RAINBOW, tier:'far', breathePeriod:53,  goreDur:16, base:3.2, cy:22, sx:5,  ex:45, dy:1.1,  dur:66, swayDur:8.4, fade:true, fadePeriod:17 },
    { key:'sunset2',  cols:PALETTES.SUNSET,  tier:'far', breathePeriod:59,  goreDur:12, base:3.4, cy:26, sx:70, ex:20, dy:1.3,  dur:70, swayDur:6.9, fade:true, fadePeriod:20 },
    { key:'ocean2',   cols:PALETTES.OCEAN,   tier:'far', breathePeriod:67,  goreDur:14, base:3.3, cy:31, sx:15, ex:65, dy:0.7,  dur:60, swayDur:8.8, fade:true, fadePeriod:22 },
    { key:'ocean3',   cols:PALETTES.OCEAN,   tier:'far', breathePeriod:79,  goreDur:15, base:3.5, cy:24, sx:88, ex:40, dy:-1.2, dur:95, swayDur:6.4, fade:true, fadePeriod:15 },
    { key:'berry2',   cols:PALETTES.BERRY,   tier:'far', breathePeriod:71,  goreDur:12, base:3.2, cy:20, sx:50, ex:10, dy:1.5,  dur:73, swayDur:7.8, fade:true, fadePeriod:19 },
  ];

  function buildBalloon(cfg){
    const spec = TIER_SPEC[cfg.tier];
    const rep = cfg.cols.length * STRIPE_W;
    const stripes = [];
    for (let x=-rep, k=0; x<120+rep; x+=STRIPE_W, k++) stripes.push({x, color: cfg.cols[((k%cfg.cols.length)+cfg.cols.length)%cfg.cols.length]});
    const driftDur = (cfg.dur*spec.durMult).toFixed(2);
    const driftDelay = `${(-Math.random()*driftDur).toFixed(2)}s`;
    const wrap = document.createElement('div');
    wrap.className = 'sd-anim';
    const fadeAnim = cfg.fade ? `, sdBalloonFade ${cfg.fadePeriod}s ease-in-out infinite ${(-Math.random()*cfg.fadePeriod).toFixed(2)}s` : '';
    wrap.style.cssText = `position:absolute;left:${cfg.sx}%;top:${cfg.cy}%;width:${cfg.base}cqw;height:${(cfg.base*1.6).toFixed(2)}cqw;opacity:${spec.op};filter:${spec.sat<1||spec.blur>0?`saturate(${spec.sat}) blur(${spec.blur}px)`:'none'};--dx:${cfg.ex-cfg.sx}cqw;--dy:${cfg.dy}cqh;--fadeOp:${spec.op};animation:sdBalloonDrift ${driftDur}s ease-in-out infinite ${driftDelay}${fadeAnim}`;

    // Random drift-in/out: reroll --dx/--dy on every 'animationiteration', gated so the reroll
    // only ever fires at a genuine rest point (drift's own keyframe, not the fade/breathe/sway
    // siblings' independent iteration boundaries bubbling up). Speed scales via WAAPI
    // playbackRate, never by touching animation-duration directly — the fix for a real bug
    // where changing duration on a running CSS animation remaps elapsed time and snaps position.
    const dx0 = cfg.ex - cfg.sx, dy0 = cfg.dy;
    wrap.addEventListener('animationiteration', (e) => {
      if (e.animationName !== 'sdBalloonDrift') return;
      const mag = 0.5 + Math.random()*0.9;
      const flip = Math.random() < 0.18 ? -1 : 1;
      wrap.style.setProperty('--dx', `${(dx0*mag*flip).toFixed(2)}cqw`);
      wrap.style.setProperty('--dy', `${(dy0*(0.4+Math.random())*(Math.random()<0.25?-1:1)).toFixed(2)}cqh`);
      const driftAnim = wrap.getAnimations().find(a => a.animationName === 'sdBalloonDrift');
      if (driftAnim) driftAnim.playbackRate = 1/mag;
    });

    const tierScaleWrap = document.createElement('div');
    tierScaleWrap.style.cssText = `position:absolute;inset:0;transform-origin:50% 65%;transform:scale(${spec.scale})`;
    const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('viewBox','0 0 120 192');
    svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;overflow:visible';
    const clipId = `sdClip${cfg.key}${Math.random().toString(36).slice(2,7)}`;
    const goreAnim = cfg.fade ? '' : ` class="sd-anim" style="animation:sdGoreSlide ${cfg.goreDur}s linear infinite;--rep:${rep}px"`;
    svg.innerHTML = `
      <defs><clipPath id="${clipId}"><path d="M60 6 C 24 6 6 40 6 74 C 6 106 28 132 48 144 L 72 144 C 92 132 114 106 114 74 C 114 40 96 6 60 6 Z"/></clipPath></defs>
      <g clip-path="url(#${clipId})">
        <g${goreAnim}>${stripes.map(s => `<rect x="${s.x}" y="0" width="${STRIPE_W}" height="152" fill="${s.color}"/>`).join('')}</g>
        <rect x="0" y="0" width="120" height="152" fill="rgba(232,134,58,0.10)"/>
      </g>
      <path d="M60 6 C 24 6 6 40 6 74 C 6 106 28 132 48 144 L 72 144 C 92 132 114 106 114 74 C 114 40 96 6 60 6 Z" fill="none" stroke="#2a1020" stroke-width="1.4" opacity="0.85"/>
      <rect x="46" y="141" width="28" height="8" rx="1.5" fill="#8c2020"/>
      <line x1="48" y1="149" x2="52" y2="170" stroke="#241016" stroke-width="1.4"/>
      <line x1="72" y1="149" x2="68" y2="170" stroke="#241016" stroke-width="1.4"/>
      <rect x="48" y="170" width="24" height="16" rx="2" fill="#6b4a26"/>
      <rect x="48" y="170" width="24" height="4.5" rx="2" fill="#4a3018"/>
    `;
    if (cfg.fade){
      tierScaleWrap.appendChild(svg);
    } else {
      const breatheWrap = document.createElement('div');
      breatheWrap.className = 'sd-anim';
      breatheWrap.style.cssText = `position:absolute;inset:0;transform-origin:50% 65%;--breatheMin:${(1-spec.breatheAmp).toFixed(2)};--breatheMax:${(1+spec.breatheAmp).toFixed(2)};animation:sdBreathe ${cfg.breathePeriod}s ease-in-out infinite alternate ${(-Math.random()*cfg.breathePeriod).toFixed(2)}s`;
      const swayWrap = document.createElement('div');
      swayWrap.className = 'sd-anim';
      swayWrap.style.cssText = `position:absolute;inset:0;transform-origin:50% 10%;animation:sdSway ${cfg.swayDur}s ease-in-out infinite ${(-Math.random()*cfg.swayDur).toFixed(2)}s`;
      swayWrap.appendChild(svg); breatheWrap.appendChild(swayWrap); tierScaleWrap.appendChild(breatheWrap);
    }
    wrap.appendChild(tierScaleWrap);
    return wrap;
  }
  BASE_BALLOONS.forEach(cfg => els[cfg.tier].appendChild(buildBalloon(cfg)));
  RIDGE_TIERS.forEach(t => els[t.key].appendChild(buildRidge(t)));
})();
</script>
</body>
</html>
```
