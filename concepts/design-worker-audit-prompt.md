# Research prompt: audit and improve the Trivia OS design-worker agent

## Context

Repo: `~/Projects/baynes-trivia/trivia-os`. Two files define a newly-created standalone agent
whose entire job is Trivia OS's bespoke ambient-theme and round-journey visual work:

1. `.claude/agents/trivia-os-design-worker.md` — the agent definition (read-first list, working
   rules, verification steps, write-back-to-lessons requirement).
2. `concepts/DESIGN-WORKER-LESSONS.md` — its seeded memory: a "what has worked" list, a "what has
   failed" list, conventions distilled from both, and open/unresolved items.

Read both files in full before doing anything else.

## Why this agent exists — the track record you're auditing

This is not a hypothetical process-improvement exercise. It exists because the ad-hoc approach
(a general-purpose agent doing ambient/visual work each session with no persistent memory) has a
bad track record on this specific project, and Ben wants to know whether a dedicated agent with a
lessons file actually fixes the underlying problem or just adds ceremony around the same failure
mode. Be honest if it's the latter.

The concrete history, in full, so you're not working from a sanitized summary:

- **Firefly Summer meadow swing:** hand-coded rope/chain + bench. Passed every one of 27 locked
  numeric layout checks. Still read as a crane boom, not a hanging swing, across **7
  Fable-verified rounds**. Root causes found only after the fact: rope rendered too rigid/visible
  to read as slack cord, and it carried 0.3-0.4px blur while the rest of the scene used 1.5-9px —
  a rendering-technique mismatch nobody caught until round 7.
- **Firefly Summer pond/deck water:** full replan after the swing failure. Hand-coded water fill
  failed **6 non-converging ways** (read as a wall, then a sports court, then a pool/ice rink,
  then "the whole frame is out of focus" once blur was applied uniformly). Only fixed by
  escalating to a generated raster texture — and even that "fix" was shipped as best-achieved, not
  as a clean pass; persistent complaints (edges too clean/rectangular, water sitting "above" the
  rail rather than continuing under it) were accepted rather than resolved.
- **Campfire Sing-Along (most recent, and the worst-handled):** built, declared done, and shown to
  Ben without ever being rendered and looked at. It shipped with the fire rendering as a plain lit
  rectangle, the night sky reading as a flat monocolor screen, and stars invisible. Ben's own
  words: "what you did was pathetic." Root cause on the flame, diagnosed after the fact: radial-
  gradient stops that never reached transparent before hitting the box's own edges (basic
  center±radius math nobody had checked), plus a `box-shadow` on a plain rectangular div — which
  is structurally guaranteed to render as a blurred rectangle, not a glow. The session's own named
  review gates (`impeccable`, `emil-design-eng`) were skipped entirely, not failed — skipped.
- **The one actual success in this entire line of work: Sonora Balloons ("Sonora Sunrise").**
  That's it. One theme, out of everything attempted under this "bespoke ambient prototype" model,
  that worked without a multi-round public failure. Everything else — swing, pond water (twice,
  effectively), campfire's flame, campfire's sky, campfire's stars — required either an escalation
  to generated art, an accepted-but-not-actually-fixed shipped state, or is still broken as of the
  last session.

Sit with that ratio (1 clean win against 3+ significant failures, one of which involved skipping
verification steps entirely and damaging trust) before proposing anything. A dedicated agent with
a memory file is Ben's chosen fix for this — your job is to pressure-test whether it's sufficient,
not to assume it is.

**This section is a curated summary, not primary evidence — go read the primary evidence
yourself before drawing conclusions.** Do not treat the four paragraphs above as "the record." Go
directly to, at minimum:
- The actual component files for each attempt (search for the swing/bench code, the pond/water
  code, the Campfire flame code, and `concepts/sonora-balloons-depth.html` — the one win).
- `git log` on each of those files/directories — how many commits, over what span, what the
  commit messages actually say happened round to round.
- `concepts/OBJECT-RENDERING-PROTOCOL.md`, `concepts/ROUND-JOURNEY-FLAGSHIP-MECHANISM.md`, and any
  other process doc already written in response to an earlier failure — these already existed
  before Campfire shipped broken. Read them and form your own opinion on whether they were
  inadequate on paper or just not followed.
- The actual layout-check/assertion scripts referenced in the swing/pond history (27-check file,
  the rotation-angle assertion) — read what they actually check, not just Ben's verdict on the
  result. Judging *why* 27 checks missed an obvious visual failure requires reading the 27 checks.
- **Sonora Balloons specifically — this is the single most information-dense data point
  available and the summary above gives it one clause.** Read the actual file, its git history,
  and dissect concretely why it worked where everything else didn't. Is it that the process was
  followed correctly that one time, or is it that a balloon is a simple, near-geometric shape
  (round, soft-edged) while a swing/rope/flame/water surface is not — i.e. the confound might be
  *subject matter*, not process, and the "1 win vs 4 failures" ratio might not license any
  structural conclusion about process at all. Address this possibility explicitly; don't let it
  go unexamined just because a tidy "the new agent fixes this" narrative is more satisfying.

## What to actually investigate

0. **Whether n≈4-5 attempts is even a large enough sample to support structural conclusions, and
   whether the real variable is process or subject matter.** See the Sonora Balloons point above.
   If your honest read is "we don't have enough data to know if the new agent will help, and the
   apparent pattern is confounded with shape complexity," say that plainly rather than forcing a
   confident structural narrative onto a small, messy sample.
1. **Is the failure pattern structural or procedural, to whatever extent the sample supports an
   answer at all?** The lessons file's own "what has failed"
   list is dominated by hand-coded figurative/organic shapes (rope, water, a literal flame) and
   the "what has worked" list is dominated by generated assets plus a small number of genuinely
   simple abstract shapes (a glow blob, a disc). Is the honest conclusion here that this class of
   agent — text/code-generating, no visual feedback loop inside its own generation step — is
   fundamentally bad at hand-authoring anything with organic contour, no matter how well-written
   the rules are? If so, does the current agent definition still let too much through the
   "hand-code it" door, and should the default flip harder toward "generate first, hand-code only
   the genuinely trivial remainder," rather than relying on the agent to correctly self-classify
   under the noun test every time?
2. **Where did the review-gate process actually break on Campfire**, mechanically? Not "gates were
   skipped" as a verdict — trace why. Is it a structural gap (the agent has no way to actually see
   its own rendered output mid-task without a separate tool call it can skip), a sequencing gap
   (verification is a step at the end that's easy to rush past under any pressure), or an incentive
   gap (nothing forces the render-and-look step before the agent is allowed to claim completion)?
   Propose a concrete mechanism — not just a written rule — that makes skipping this step harder,
   e.g. a required tool-call order, a self-check the agent must paste evidence of before it's
   allowed to write "done," etc.
3. **Is a single generalist "design worker" the right shape at all**, or should this split further
   — e.g. a narrow "geometry/math checker" step (radial-gradient margin math, rotation-angle
   assertions) that runs mechanically regardless of which agent authored the visual, decoupled
   from the creative/authoring step? Would that have caught the campfire flame bug even under
   time pressure, since it wouldn't depend on the authoring agent remembering to do the math?
4. **Model/tooling fit — treat this as an open question, not a leading one.** The agent
   definition currently specifies `model: sonnet`. It would be easy to conclude "the recurring
   failure is geometric/spatial reasoning, therefore opus" — but check that this isn't
   presupposing its own answer. Also check something more basic and possibly more consequential:
   **does the agent's declared tool list (`Read, Write, Edit, Glob, Grep, Bash, WebSearch,
   WebFetch`) actually include a way to invoke the `impeccable` and `emil-design-eng` skills, or a
   way to take its own screenshot to look at rendered output?** If the agent's definition tells it
   to run gates or render-and-look but its tool list can't actually do either, that's not a
   discipline problem to fix with stronger wording — it's a literal capability gap, and no amount
   of rule-tightening in the prompt closes it.
5. **Audit the two files directly, adversarially.** Does `DESIGN-WORKER-LESSONS.md`'s structure
   actually make the right things unmissable to a future instance of this agent, or is it already
   at risk of being too long/soft to actually change behavior under pressure (compare to how
   thoroughly the process docs already existed for Campfire — `OBJECT-RENDERING-PROTOCOL.md`,
   `ROUND-JOURNEY-FLAGSHIP-MECHANISM.md` — and still didn't prevent that session's failure)? Does
   the agent definition's verification section have enough teeth, or does it read as another
   well-intentioned checklist that's easy to skip under the same pressure that caused Campfire's
   skip? Specifically check: the "two-strike rule" referenced in both files never defines its own
   scope — two strikes within one session? Tracked across sessions, and if so tracked where, by
   whom? As written it's a phrase, not an enforceable mechanism. Also check the lessons file's
   own maintenance model: the same agent that might fail a task is also the one trusted to
   accurately write up why it failed and update its own memory afterward — that's a
   self-policing loop, and self-policing is arguably what already failed on Campfire (the agent
   was trusted to run its own verification step and didn't). Does anything in the current design
   actually audit the write-back, or is it "the agent grades its own homework" all the way down?

## Deliverable

A concrete, prioritized set of changes — not general advice, and not purely more documentation.
For each recommendation, name which specific past failure it would have caught or prevented, using
the incidents above (go find more incidents in the git history if the four given are incomplete).

Two hard requirements on the deliverable:

1. **At least one recommendation must be mechanical, not textual.** A rule added to a markdown
   file is exactly the intervention type that already existed for Campfire
   (`OBJECT-RENDERING-PROTOCOL.md`, `ROUND-JOURNEY-FLAGSHIP-MECHANISM.md`) and still didn't
   prevent it shipping unrendered and unreviewed. Propose something that doesn't depend on the
   agent choosing to follow a written instruction under pressure — e.g. a gate script that must
   produce and save a screenshot artifact before a "done" status is even writable, an enforced
   tool-call sequence, a separate mechanical geometry-check step that runs regardless of what the
   authoring step did. For every doc-only recommendation you do make, state explicitly why it
   won't share `OBJECT-RENDERING-PROTOCOL.md`'s fate.
2. **Explicitly consider, as a first-class possible answer, that the current approach
   (a dedicated hand-authoring agent plus a self-maintained lessons file) is the wrong fix
   entirely** — not just under-tuned. If your research leads there, say so plainly and propose
   what should replace it (e.g. generated-assets-by-default with hand-coding as a rare, gated
   exception; a separate non-self-policed verification agent; dropping fully-bespoke ambient
   scenes as a format for this project). Do not default to "tune the existing plan" just because
   that's the shape of what you were handed — recommending termination of the current approach is
   an acceptable and equally valid outcome of this research if the evidence supports it.
