# Object Rendering Protocol — adopted 2026-07-26

Ben's go-ahead received. This is now binding, referenced from
`references/themes.md` (1a, non-waivable by any future spec) and
`concepts/AGENT-PROMPT.md`'s status note. Not a draft any longer.

Not yet adopted into `AGENT-PROMPT.md` or `references/round-journeys.md`.
This is the consolidated fix from two independent audits: the Firefly
Summer failure itself, and a full pass over `NIGHTLY-LOG.md`, `LESSONS.md`,
`AUDIT.md`, `QUEUE.md`, and `PLAN-REVIEW-LOG.md` checking whether the fix
holds against everything else that's gone wrong in this pipeline's history,
not just the one scene it came from.

## The core fix (covers the failure that just cost 7+13 rounds)

**The noun test.** Before any code, list every named element in the brief.
For each: would a guest at 20 feet identify it by its contour or its joints
— a swing, a rope, a pond, tree bark, a sign's support armature? That's
**figurative** — generate it, and confirm in isolation that it reads as its
noun before it ever touches a scene. Is it fully specifiable in one sentence
of pure geometry — a disc, a beam, a stripe, a glowing dot, a flat gradient
plane? That's **iconic** — hand-code it, no escalation needed.

- **Two-strike cap.** A hand-coded element failing a fresh visual read twice
  escalates to generated art immediately. A third hand-coded attempt on the
  same element is a spec violation, not just bad luck.
- **Frozen pass criterion.** Before the first visual read of any figurative
  element, write one sentence: "PASS = a fresh viewer names this as ___."
  Grade every later read against only that sentence.
- **Generated art still needs the isolation check.** Recraft is not immune —
  a Y-wing sprite once collapsed to reading as an X-wing. Generating the
  asset is not the finish line; confirming it reads as its noun, alone,
  before placement, is the actual gate.
- Numeric layout assertion stays necessary, never sufficient. It certifies
  position, never identity.
- **2026-07-26 addendum, superseded below (2026-07-27): generated-first is now the enforced
  default, not a judgment call.** Figurative elements go to generated art by default; hand-coding
  one is a logged exception, not the assumed path. Iconic elements can still be hand-coded, but
  must clear `.claude/hooks/geometry-lint.mjs` (radial-gradient margin math + box-shadow-without-
  rounding) — a deterministic check that runs on every edit, independent of which agent authored
  the element or how much time pressure it was under. This exists because the noun test alone is
  still a rule an agent has to choose to apply correctly under pressure — Campfire Sing-Along's
  flame shipped as "a lit rectangle," unrendered and uncommitted, despite this exact protocol
  already existing at the time. See `concepts/design-worker-audit-handoff.md` for the full
  incident and `concepts/design-worker-p0-p2-plan.md` for what got built in response.
- **2026-07-27 addendum: generated-first is retired. Reference-first replaces it.** Ben's call,
  reviewed by an independent Fable pass: a Recraft output never ships as final geometry, full
  stop — not even for a background, non-focal, or never-animated element. The retired precedent
  is the oak tree PASS in `design-cases.json` (approach `generated-recraft`, used as the final
  shipped asset) — that PASS stays in the record as real history, but it no longer authorizes
  placing generated output directly. Reasoning: (1) "background/non-focal enough to exempt" isn't
  checkable the way geometry-lint or the rotation-angle tool are checkable, and every convention
  that's held up in this project is the one turned into arithmetic, not judgment; (2) even a small
  generated background element carries Recraft's own line weight and rendering register, which
  undermines the cross-theme visual cohesion this rework exists to establish; (3) Ben's own
  standard — "must not look AI-generated, not by any stretch" (addendum above) — fails quietest in
  unexamined background filler, which is exactly what a background exception would create more of.
  **What changes concretely:**
  - Generated art (Recraft) is now reference-only input for figurative elements — a rotoscoping
    aid, not a deliverable. The design-worker overlays it and hand-places path points along its
    actual contour (this is what fixes the oak tree's real failure mode too: "uniform bump spacing
    reading as computer-generated zigzag" — a traced, non-uniform contour doesn't have that tell;
    inventing one from imagination is what produced it three times).
  - **The two-strike cap's escalation target changes.** A hand-coded figurative element failing
    twice no longer escalates to shipping generated art directly — it escalates to tighter
    reference-tracing (a closer roto-trace pass off the Recraft reference, still hand-built, never
    a third blind invented attempt). Shipping the generated asset itself is no longer an
    escalation option at all.
  - **New checkable rule, sibling to geometry-lint:** no auto-vectorized path data ships in a
    theme file. A vectorize-API output pasted in verbatim (recognizable by point density/precision
    inconsistent with hand-placed anchors, or the absence of a provenance comment) is a violation
    the same way an unrounded box-shadow is — this is the thing that makes "hand-built" checkable
    instead of a promise.
  - **Open item, not yet resolved — needs Ben's explicit call before whole-scene pictorial
    ambients (a lakeshore, a campfire, a full illustrated setting) are treated as settled
    practice:** `references/themes.md` rule 1 says ambients should be "light, not clip-art" —
    written before whole-scene reference images were part of the pipeline. Whether a fully
    pictorial ambient scene is in-bounds at all, separate from the trace-vs-hand-build question
    resolved above, is still open and deserves a deliberate rule rewrite, not a quiet exception.
  - **Still open, lower priority:** a completeness check comparing the locked brief's element list
    against what the Recraft reference actually contains, so an omission (Campfire Sing-Along's
    reference shipped with no stars at all, despite a starry night sky being in scope) gets caught
    and hand-added rather than silently inherited as "the reference didn't have it so we didn't
    build it."

This fully covers the one failure pattern it was built for. It does **not**
cover the rest of what the archaeology found — six more patterns, each of
which has burned real rounds independent of object rendering:

## What the noun test doesn't touch

1. **Unauthorized invented elements.** The porch built to hang the meadow
   swing from, never asked for, never removed even after the swing itself
   got cut — already named in `AGENT-PROMPT.md` rule 4, and it recurred
   independently in a different scene's foreground decor. **Add:** an
   element must appear by name in the locked brief before it's built. An
   element invented only to support an authorized one is itself
   unauthorized — and if the authorized element is later cut, everything
   that existed solely to serve it is cut in the same pass.

2. **Assertions that can't see the actual failure mode.** 27/27 numeric PASS
   while the swing read as a crane; a ±9° lantern swing invisible to a ±2%
   position tolerance. **Add:** state the failure mode first, in one
   sentence, then write the specific check that would catch it. A check
   that can't fail for the reason the element could fail isn't a check.

3. **Contradicting review verdicts treated as new findings instead of a stop
   signal.** The meadow swing oscillated too-detailed → too-plain → too-round
   → wrong-color → too-plain again across seven rounds. **Add:** two
   consecutive review verdicts that contradict each other's direction means
   stop — re-lock the pass criterion with Ben before a third attempt, don't
   guess again.

4. **Tool-generated findings taken as fact.** A false "dead" reading, a fake
   clock producing a false black-screen, a reduced-motion probe that missed
   the real flag. **Add:** a finding from a tool built or modified this
   session is a hypothesis, not a fact, until confirmed against the page's
   actual DOM/render state.

5. **Fixes that don't land everywhere the same mechanism appears.** A
   comment claiming a bug was handled, in a spot where it wasn't; the same
   sentinel bug recurring in a path a prior fix claimed to cover. **Add:**
   after any fix, grep every other occurrence of the same mechanism and list
   each as checked. A fix is verified mechanically (grep/count), never by
   the prose next to it.

6. **Governance gates skipped in attended sessions because "Ben is right
   here."** Claim-commit ordering skipped, a formal review pass skipped
   twice, a required notes block missing. **Add:** mandatory steps bind
   attended sessions too. Skipping one requires Ben's explicit, quoted
   go-ahead logged at the time — not a flag added after the fact.

Lower-priority, real but narrower (mostly the unattended nightly
infrastructure, already partly patched): palette/contrast drift slipping
through, duration-budget overruns, git push status misreported as "pushed"
when it was local-only. Worth folding in eventually; not blocking the next
scene attempt.

## Addendum 2026-07-26 — "must not look AI-generated" is a hard constraint

Ben's own words, unprompted, when asked what a perfect scene looks like:
warm, cozy, campy, full of personality — and, separately and non-negotiably,
it must not look AI-generated, "not by any stretch."

This changes how the noun test's escalation path should actually be used.
Evidence already in this repo: the pond was escalated to Recraft using
**`realistic_image` style** — a photorealistic raster — and dropped into a
scene where everything else (hills, deck, rail, sky) is flat hand-coded
vector. That mismatch is not a small thing. Two different rendering
paradigms sharing one frame is one of the most recognizable "this was
bolted together by AI" tells there is — regardless of whether the water
itself reads correctly in isolation. `AGENT-PROMPT.md` Step 3 already
requires generated sprites use `input_style: "icon"` for exactly this
coherence reason; the pond's escalation quietly broke that rule to solve a
different problem (water not reading as water) and traded one failure for
a subtler one.

**Add to the protocol:** any figurative element escalated to generated art
must be generated in the *same* flat/icon/graphic register as every
hand-coded element in the same scene — never photorealistic, never a
rendering style that no hand-coded neighbor could plausibly share. If a
generated asset doesn't look like it was drawn by the same hand as
everything next to it, that is itself a failed isolation check, independent
of whether it reads as its correct noun. One scene, one visual language,
always — that's what separates "illustrated" from "AI photo-bashed," and
it's the more important bar of the two.

### Normalization pass — the concrete mechanism, not just the principle

Outside research (game-art and AI-pipeline sources) converges on one
specific technique for this, worth making mandatory rather than aspirational:

- **Palette clamp.** Every generated sprite gets its colors snapped to the
  exact hex values already used by the hand-coded shapes in that scene —
  not "a similar palette," the same swatch.
- **One line weight, one light direction, flat (non-photoreal) shading** —
  set once per scene, applied to every generated sprite, no exceptions.
- **Bail-out rule:** if a sprite can't be reliably clamped to the scene's
  vector palette/line-weight/shading spec — it keeps drifting back toward
  its own generated style no matter how it's post-processed — drop
  generation for that element and hand-author it instead. Don't ship a
  sprite that's merely "close enough"; that's exactly the gap that reads as
  AI-generated even when the noun is technically correct.
- **Don't over-correct toward "flawless."** Research flags that
  gradients/detail that are *too* smooth, uniform, or symmetrical are
  themselves an AI-generated tell — increasingly the more reliable one, as
  generation quality improves. Deliberate, hand-authored imperfection and
  uneven detail density in the flat-vector layer is a feature, not sloppiness
  to clean up.

## Scope honesty, kept from the draft version

Two audits agreed the noun test is correct but narrow — it's the fix for
the loudest failure, not the only one. Treating just the noun test as "the
pipeline is fixed" would be the same mistake at smaller scale: one
confirmed finding standing in for the whole picture. The other six patterns
found in the full history (unauthorized elements, assertions blind to the
real failure mode, contradicting verdicts, untested tools producing false
findings, fixes that don't land everywhere, gates skipped in attended
sessions) are real and still need folding into governing docs over time —
adoption of the noun test today doesn't close those out.
