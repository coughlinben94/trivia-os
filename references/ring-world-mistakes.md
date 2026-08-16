# references/ring-world-mistakes.md — Read FIRST, before any ring-world work

**15-second version:** every instrument on this project has lied at least once. Before trusting any
number: does the check have a known-answer probe next to it? Is it a mean-shaped check judging a
p99.5 (peak) requirement? Did you actually render it and look, in the same message that claims it's
done? If any answer is no, don't trust the number yet.

> **Scope: the ring world-builder.** One continuous generated "world" per theme, split into 12
> "stations" — the world holds still and turns one station per slide, closing on itself. **Viewing
> distance is unconfirmed and two sources disagree**: the 2026-08-09 handoff says ~20ft, but
> `ART-DIRECTION-SPEC.md` §13 says its own 4px hard-edge floor assumes a 55"/12ft setup and explicitly
> flags the real distance as unmeasured. Don't cite either number as settled — confirm the real venue
> distance before treating any distance-derived threshold (the 4px floor, silhouette-at-distance
> checks) as exact. Files:
> `concepts/ART-DIRECTION-SPEC.md` (the spec — has some stale numbers itself, see below),
> `concepts/GENERATOR-AGENT-SPEC.md` (**still frames scope as 21 themes throughout — that's the old
> number, see Corrections below, don't trust its scope framing**), `RingAmbient.jsx`, `ringEngine.js`,
> `client/src/worlds/midnightGalaxy.ring.js`, `concepts/tools/ring-verify.mjs`,
> `concepts/tools/ring-spec.lock.json`. **Confirmed by Ben, 2026-08-09: the ring/loop-closure model is
> the one path.** Not the 21-theme *ring-generalization scope claim* (retired — see below; the
> underlying 21-entry theme registry itself is live production code, imported by `ThemeProvider.jsx`,
> `LiveMode.jsx`, `Join.jsx`, `useShow.js` and more — do not read this line as "the themes are dead
> code," only the claim that the ring engine must generalize across all 21 is retired). Not the
> round-transition
> journeys (`references/round-journeys.md`, separate, lower priority). Not the "no loop closure"
> lateral-scroll alternative from `DRAFT-STATE.md` (2026-07-30) — same folder and date as the other
> docs `GENERATOR-AGENT-SPEC.md` cites, but **not treated as confirmed-current even by that spec**,
> which says plainly "nothing here confirms it survived past 2026-07-30" (`GENERATOR-AGENT-SPEC.md:
> 61-67`). Don't overstate its authority in either direction — same family, unconfirmed status, not an
> unrelated one-off and not settled doctrine either. An independent architecture review (2026-08-09)
> found the ring model's real infrastructure is mostly reusable either way (~5% of verification
> thresholds are ring-topology-specific) and recommended staying the course. Do not re-litigate this
> fork without new evidence.
>
> **Process note, current as of the 2026-08-09 handoff:** the advisory design work on this system
> happens in a separate Cowork session that writes prompts for a separate Claude Code agent to paste
> and implement — the advisory session does not edit the repo directly. Whatever session reads this
> file, apply the same discipline: this is a read-first ledger, not license to freelance a fix. If you
> spot a stale claim in a concept doc while reading, **flag it to Ben — don't silently drive-by-edit
> it**, even though a few small, obviously-correct inline notes already got added this pass.
>
> **Escalation tags:** `[ENFORCED: x]` = mechanically checked today (`.claude/hooks/geometry-lint.mjs`,
> `.claude/hooks/design-done-gate.mjs`, `.claude/hooks/protect-json-stores.mjs`, the
> `trivia-os-design-critic` agent, `concepts/.design-attempt-counts.json`, `ring-verify.mjs`).
> `[PROSE]` = written rule only, nothing stops it under pressure. `[SUPERSEDED]` = retired, kept only
> so nobody re-applies it.

---

## Before shipping any ring-world change — the fast checklist, read this part every time

1. Rendered and looked at, in the same message claiming it's done — not just "arithmetic checks out"?
2. If a numeric check is involved: is it a mean-shaped check being used to judge a peak-shaped (p99.5)
   requirement? If so, distrust it until confirmed otherwise.
3. Any new automated check: does it have a known-answer probe (sentinel / calibration pair) run
   alongside it, or could it silently be broken the way instruments 1–7 below were?
4. Any threshold change: is it structurally blocked from a tuning loop's own reach, or just a comment
   asking nicely?
5. Headline primitive: drawn kind only, silhouette family ≥3 stations from its last occurrence?
6. Any reference asset (game-icons.net, Recraft): confirmed reference-only, no file, no trace, no
   vectorize, licensing tier checked if Recraft?
7. Scope check: does this generalize toward themes beyond the current space world? If so, stop — that
   generalization doesn't happen until a second world exists.

---

## Rule zero — eight instruments have lied on this project

Every major "finding" for weeks was later overturned because the thing measuring it was broken, not
because the design was wrong. This is the single most expensive lesson on the project — read all
eight before trusting any tool's output here, and before writing a new one:

1. **The gate got re-baselined to the defect** — a broken build's own output became the pass
   criterion, so the gate started certifying the bug as correct.
2. **`fillOf` was never actually wired.** Scaling the arc 10× rendered byte-identical frames — the
   parameter everyone was tuning did nothing.
3. **`makePrim` silently dropped a parameter for five rounds.** It forwarded 7 of 8 params; `fill`
   never reached the renderer, and nobody caught it because nothing asserted the full param set
   round-tripped.
4. **Contrast was measured through the exact layer built to suppress it** — the scrim. Measuring a
   contrast metric downstream of a deliberate contrast-reducer produces a number that can't mean what
   it's read to mean.
5. **A perceptibility metric was structurally blind to its own target.** `median(box) −
   median(surround)` cannot detect any shape covering less than half its box — the metric's own math
   ruled out ever measuring a large class of real objects correctly.
6. **A verification script had a hardcoded station list and stale radius math** — looked like a
   general-purpose checker, was actually silently scoped to whatever stations existed when it was
   written.
7. **A debug tool ranked candidates by the wrong statistic** — area × alpha, when the actual failing
   metric was p99.5 (a peak/outlier statistic). Fingered the wrong primitive as the cause, cost a full
   round chasing the wrong fix.
8. **[RESOLVED 2026-08-09, quantified and fixed]** the gate read un-frozen live-animation frames on
   three metrics (ink-per-station, realized-arc, mid-share). Quantified first (5 runs, unchanged code):
   12/65 checks moved, all rendered-frame checks — every discrete/count check (quadrant, bleed, star
   count) was already stable. Largest mover: mid-layer ink share, up to 4.9 points, big enough to flip a
   threshold-adjacent verdict, and it did. Root cause: `emulateMedia({reducedMotion:'reduce'})` pauses
   animations at a wall-clock-dependent instant, not a pinned one — not the `getAnimations()`-pause
   approach originally proposed above. Fixed with one shared `freezeFrame(page)` helper (pause + `
   currentTime = 0`) called once per station before its first screenshot. Re-verified, 5 more runs
   frozen: **0 variance across all 65 checks, all 5 runs**; st4/st10 byte-identical every time. One
   verdict changed as a direct, honest result of the fix, not hidden: mid-layer ink share flips
   PASS→FAIL — station 2 was 55.3% pre-freeze (a lucky pass on jitter) vs. a stable 54.8% post-freeze
   (the true, failing number). Spec tier now reads 19/31, not 20/31. This is instrument #8 confirmed
   as a real instrument failure, not a design failure — same pattern as 1–7.
9. **FAILURE-LEDGER.md didn't exist in the repo** despite three docs citing it as the place instruments
   1–7 are recorded. Created 2026-08-09 rather than fabricated from memory; instrument 8 above is
   recorded there in full with before/after tables. If you go looking for it and it's stale or missing
   again, that's the same "cited but never written" failure repeating — flag it, don't paraphrase from
   memory into a new doc.

**What survives the instrument-8 fix and what doesn't, so nobody re-checks work that's still good:**
every regression-tier verdict from earlier in this project and the station-4/10 star-attribution work
survive untouched — neither depended on frame-jitter noise. What doesn't: the mid-share check's old
PASS verdict (now correctly FAIL), and — by inference only, not re-run, so don't cite as confirmed —
the `fillMin` and nine-combination arc sweeps referenced in earlier instructions, since neither has an
on-disk record to re-check directly against the frozen gate.

**Two heuristics that recur across multiple of the above, worth holding as general rules for this
system specifically:**

- **A mean-shaped instrument pointed at a peak-shaped problem gives a wrong diagnosis.** Three
  separate wrong diagnoses trace back to this. If the spec's cap is a percentile (p99.5), the fix
  candidate must move the percentile — a change that only lowers the mean (a uniform dimmer, e.g.)
  cannot fix an outlier and will look like progress on the wrong number.
- **A prediction stated as direction becomes something the agent confirms, not tests.** Two wrong
  diagnoses in two rounds happened because a session prescribed a mechanism ("it's probably X")
  instead of demanding a measurement. Write falsifiers, not conclusions — ask "what would prove this
  wrong," not "confirm this is right."

---

## Corrections to earlier documentation — do not repeat these as facts

- **[SUPERSEDED] "Target machine is a MacBook driving an HDMI splitter to 3 TVs, extrapolate perf
  risk from that."** Wrong — measured 56–59fps at ~5,465 DOM elements, so **performance has never
  been the binding constraint** on this system regardless of the exact venue setup. (The precise
  viewing distance itself is still unconfirmed — see the scope note above — but the perf-risk framing
  this claim was used for is settled.) `concepts/SCAFFOLD-world-ring.md` and
  `concepts/HANDOFF-world-07-ring.md` both carried this and got inline correction notes added
  2026-08-09; flag any other doc found still asserting it rather than silently editing it yourself.
- **[SUPERSEDED] "21 themes, generalize the engine across all of them."** Retired. There will be
  **7–8 themes**, brainstormed from scratch **after the space world is finished**, plus one-offs for
  themed nights. Do not design for, map to, or generalize toward themes that don't exist yet. Parts
  reused across two-plus *space* objects get named as generalization candidates — no universal
  part-kit until a second world actually exists. **Not yet corrected at the source** (audited
  2026-08-09, corrected 2026-08-09 after a hyper-critique pass caught a scoping error in the first
  version of this note — see below): `concepts/GENERATOR-AGENT-SPEC.md` in full; most of
  `SCAFFOLD-world-ring.md` and `HANDOFF-world-07-ring.md`; `concepts/ART-DIRECTION-SPEC.md:194`;
  `concepts/HANDOFF-ring-thinktank.md` (lines 17-18, 276, 280, 297-298, 301, 307, and its §13 type
  census at 286-298/342-356); `docs/superpowers/plans/2026-08-06-ring-scaffold-absorption.md:399` —
  weakest of these, it says the other 20 themes are "explicitly out of scope" for now, implying rather
  than restating the old framing outright, so weight it as a softer instance. This ledger is the only
  place the correction currently lives; flag to Ben rather than silently editing the above.
  **Correction, do not repeat the original mistake:** `SKILL.md` lines 515 and 531 are **NOT** instances
  of this stale claim — they're true, current statements about the real 21-theme registry in
  `themes/index.js` (the ambient-theme system that already exists and is separately marked
  reference/unused above). The retired claim is specifically "the *ring engine* must generalize across
  21 themes" — a scope claim about ring-world work, not a fact about how many theme entries the app
  happens to have. Don't flag every "21" near the word "theme" as this drift; check which claim it
  actually is first.
- **[REINSTATED, A1 priority — overrules the entry below] `impeccable` + `emil-design-eng`, reference
  inputs on every object-form review.** An earlier pass in this ledger retired these as "wrong tools —
  UI/animation skills, not object-art skills" and proposed `canvas-design` as a replacement. Ben
  overruled that call directly (2026-08-09): he doesn't believe UI-craft judgment and background-object
  craft judgment are actually separate domains, and holds the objects currently read badly ("look like
  shit") as evidence the retirement was itself a mistake, not a fix. **Researched a genuine replacement
  first per his instruction, found none:** the internal skill registry returned zero matches for
  illustration/game-art/silhouette-critique skills; the one external candidate surfaced
  ("Game Art & Visual Design," mcpmarket.com, github.com/claudiodearaujo) is a thin, single-author,
  1-GitHub-star skill scoped to actual game-engine asset pipelines (naming conventions, animation frame
  counts, Unity/Godot-style integration) — not a fit for critiquing hand-coded CSS/SVG primitives on a
  web display. `canvas-design` itself, read in full, turned out to be a static poster/PDF-art generator
  built around an invented "design philosophy" manifesto step — not a critique tool at all, and not
  actually closer to this problem than the two retired skills were. Per Ben's explicit instruction, no
  better candidate found → both are folded back in as reference material, A1 priority, for every
  object-form review going forward. **Optimizing the object-craft pipeline is stated as non-negotiable
  — this project continues regardless of the separate, still-true finding elsewhere in this ledger that
  the original guest-attention rationale has gone undocumented; those are two different questions and
  Ben has been explicit that the craft-quality question is the one that matters to him right now.**
  **Relooked 2026-08-09, both files read in full end to end (not just their one-line descriptions), per
  Ben's "take blinders off and relook."** Confirms the honest picture rather than softening it:
  `emil-design-eng` has no relevant content at all — every section is interaction-animation timing
  (easing curves, spring physics, drag momentum, hover gating); nothing about shape, silhouette, or
  object craft. `impeccable` is almost entirely UI-layout concerns (contrast ratios, dropdown clipping,
  card grids, hero-metric templates) that don't transfer either — but one buried rule is a direct,
  concrete hit and should be the one actually cited in reviews, not the skill as an undifferentiated
  whole: its codex-defects section bans **"hand-drawn / sketchy SVG illustrations... 5-to-30 path crude
  scenes meant to depict a tangible subject (an otter, a table-and-fork, an album cover). All of these
  read as amateurish, not whimsical. If you can't render the scene with real assets, ship no
  illustration."** That is Ben's "the nouns look like shit" complaint stated independently, from an
  unrelated project, before this conversation existed — real corroboration, not coincidence. Load both
  skills per the standing instruction below, but when citing a finding in a review, cite this specific
  rule by name rather than "per impeccable" — the rest of both files doesn't apply and citing it
  vaguely will mislead the next reader into thinking it does.
- **[SUPERSEDED BY THE ABOVE — kept only as the record of what was tried and reversed]** the original
  retirement reasoning: "wrong tools — they're interface and animation skills; `impeccable`'s 'does
  this read as AI slop' reflex is useful only as one grading criterion, not the whole review." This
  reasoning wasn't wrong on its own terms, it was just overruled by Ben's product judgment, which wins.

---

## Verified good — do not touch without a specific, named reason

Ben named these explicitly as working: the colour *treatment* as currently built (Base/Field/Core
roles — separate from the *new* colour system below, which is unbuilt), the star layers and size
ramp, the §7 depth mechanics (scale ladder, drifter, anchor, occlusion, declared pairs), and the layer
surge/closure math (480/1920/2880, 12-turn closure, seeded placement). Re-litigating any of these
without a specific new failure is wasted motion on a project that has already burned real rounds this
way.

---

## Live state as of the 2026-08-09 handoff

Four objects pass full acceptance: lit planet, asteroid field, pulsar, ringed planet. Regression tier:
2/34 FAIL (safe-box luminance at stations 4 and 10, over the mean ≤34 / p99.5 ≤68 caps — **the p99.5
cap is stale in `ART-DIRECTION-SPEC.md` §2, which still says 72; `ring-verify.mjs`'s own comment says
it was retargeted 72→68 on 2026-08-09 with sound rationale, but the spec text was never updated to
match. `concepts/tools/ring-spec.lock.json` enforces 68 — that's the live number — but flag the spec
drift to Ben rather than assuming which one is "right" going forward**). Full gate:
65 checks, 43 PASS / 2 WARN / 20 FAIL. **The gate is currently non-blocking in `scripts/ship.sh`**
(verified against the live file 2026-08-09) — fixing that is a named, queued task, not yet done. The
script's own comment gives the actual reason, worth keeping straight: **`RingAmbient.jsx` is not
mounted in production yet — this is still dev-only.** Non-blocking is a deliberate, currently-correct
choice tied to that fact, not an oversight; it becomes wrong the moment the component gets mounted for
real, and flipping it to blocking should happen in the same change that mounts it, not before or long
after.

**Cross-checked against the live repo, 2026-08-09 — confirmed accurate:** commit `f5ae9f9` is real and
matches its description; `concepts/tools/ring-spec.lock.json` and `sweep-tunables.json` both exist,
timestamped minutes before that commit; `ring-verify.mjs` exports both `runChecks` and
`runStaticChecks` exactly as claimed; `.claude/hooks/design-done-gate.mjs` does call
`concepts/tools/ring-verify.mjs` as a ring-specific gate. The handoff's technical claims check out.

Known-open, not yet attributed: station 10's regression is coordinate-verified as stars (6/8 pixels
hit `.star`); station 4's is unresolved — leading hypothesis is the hit-test tool measuring raw pixels
against the gate measuring through the composited scrim, not yet tested. Do not assume either
attribution without checking.

**Nebula demotion is an unproven hypothesis, not a settled plan.** A kill test falsified the
regression diagnosis that originally motivated demoting nebula from headline tier — the aesthetic
claim now stands with no supporting evidence behind it. Treat as open, not decided.

---

## Schema conflict — mostly settled, real work still left, don't overstate it as done

Three distinct station schemas exist across this project, not two:

1. **Shipped code (ground truth):** `midnightGalaxy.ring.js`'s flat `{ key, prim, hue, accent }`,
   checked by `ring-verify.mjs`.
2. **External `validateWorld`/`s2-world-engine.js`** (outside this repo, from a 2026-07-30 session):
   declarative `{ tier, pair, cx, cy, w, h, rotDeg, noun, form.kind }`. Run once against real ring
   output, failed immediately on contact (`mid.stations: 0` — schema-incompatible).
3. **`ART-DIRECTION-SPEC.md` §11, "What a generator emits"** — a third, different-again shape
   (`primitiveParams`, `hardEdge` are in neither 1 nor 2; `alphaStops` **partially overlaps** schema
   2's "alpha floor on gradient stops" check — not a clean third schema on every field, closer on
   some). **Do not assume this is
   "just" an internal pre-emit representation that compiles down to shape 1 — nothing in the repo
   actually says that.** It's a real, unreconciled third schema, written under a section literally
   titled "what a generator emits." Flag it to Ben as still open, don't resolve it by assertion.

`concepts/HANDOFF-ring-thinktank.md` does record a real decision on the schema-1-vs-2 half of this:
**"`ring-verify.mjs` wins"** — schema 2 survives only as a possible future pre-emit validator, not the
acceptance test. `GENERATOR-AGENT-SPEC.md`'s Open Question 2 predates that decision (the doc's closing
paragraph, right after OQ2's numbered items, cites `ring-verify` at "14/14 passing," from the 2026-08-06
branch start, before the 2026-08-08 thinktank session) — it's stale, not actively wrong; OQ2's own text
already leans toward `ring-verify` as the working acceptance test, it just doesn't cite the thinktank
doc's follow-through.

**Separate drift, found on a second critique pass, corrected after a third pass showed it was
understated — flag, don't silently patch:** `concepts/tools/ring-spec.lock.json`'s `src` citation
comments pointing at `ART-DIRECTION-SPEC.md` line numbers are badly rotted, not lightly. Checked all 18:
only 3 are correct (`inkPerStation`, `perceptibility`, `drawnSubject`). **15 of 18 point at the wrong
line**, most off by 30-40 lines into an unrelated section — `safeBox` cites `:76` for a cap actually at
`:96-97`, `quadrant`/`balance` similarly land on the wrong rule or a section heading, and the pattern
repeats through `arcBand`, `arcSpan`, `stars`, `occluderPlacement`, and the rest. The *enforced values*
themselves are still correct (the lock file is data the code trusts, not the comments) — this is
citation-provenance rot, not a live-behavior bug — but at this scale it's the same "one fact, one home,
went stale" failure this ledger names throughout, now confirmed severe inside the enforcement file
itself. Worth a real re-citation pass, not a quick patch.

**Real, concrete work this does NOT close out — don't read "schema 1 wins" as "nothing left to do":**
`HANDOFF-ring-thinktank.md` itself calls for porting `validateWorld`'s ~15 static `WORLD.stations`-level
checks into `ring-verify.mjs` (estimated ~80 lines) so schema 2's genuinely useful structural checks
aren't just discarded along with the schema. That port hasn't happened. Flag both the schema-3
reconciliation and this port as open work to Ben — this section is "mostly settled," not "done."

**Minor, same-pattern drift, lower stakes:** `ring-verify.mjs`'s own code comment near the arc-band
check (§6a) still cites the pre-2026-08-08 arc numbers (14–22/40–66); the code itself correctly reads
`ring-spec.lock.json`'s current values (8–13/26–34), so nothing is functionally wrong — but the comment
is stale in the same way the p99.5 spec text was.

---

## Design rationale for the infrastructure now being built — preserve these, they came from a real consult

- **A sweep/tuning tool must import the exact same check code the gate runs, never a fork.** A forked
  copy of verification logic going stale is instrument #6 above, generalized.
- **Thresholds must be structurally unreachable, not merely forbidden by instruction.** An
  optimization loop finds the cheapest lever available to it, and the cheapest lever is always editing
  the cap itself if that's on the table. Lock thresholds in a file the sweep loop cannot write to.
- **A visual grader is a gate, never an optimization objective.** Optimizing against an LLM judge
  produces objects that satisfy the judge and still look wrong — this is a distinct failure mode from
  "the judge is wrong," it's "anything optimized directly against a judge learns to satisfy the judge."
- **Every automated grader — numeric or visual — needs a known-answer probe on every run.** A sentinel
  case for numeric checks (known noise floor, a known-direction kick past epsilon, confirm restore);
  a calibration pair for the visual grader (one known-good object, one known-bad) run alongside every
  real grade, so a broken grader is caught by its own probe instead of silently producing garbage
  verdicts that look like real ones.

---

## Clean-room / licensing rule — non-negotiable, this is a commercial business

- **game-icons.net (CC BY 3.0) is silhouette reference only.** No icon file enters the repo, no
  tracing, no `vectorize_image` on it. A text note describing the reference survives per noun; the
  actual asset never does.
- **Recraft output is reference imagery only, never a shipped asset** — consistent with the
  reference-first rule below. Additionally: Recraft's free tier prohibits commercial use and claims
  output ownership. This matters specifically because Baynes Trivia is a commercial operation — verify
  licensing tier before treating any Recraft output as usable even as a reference input, not just
  before shipping it.

---

## Object rendering — current rule (the retired version is listed so it's never re-applied)

- **[SUPERSEDED] "Two hand-coded failures escalate to shipping generated Recraft art directly."**
  Retired 2026-07-27.
- **[ENFORCED: geometry-lint.mjs + design-attempt-counts.json] Current rule:** classify every named
  element before writing code. **Figurative** (identifiable by contour/joints) is generated as
  *reference only*, then hand-traced along its real contour — never shipped as generated pixels
  directly. **Iconic** (one sentence of pure geometry) is hand-coded straight away. A hand-coded
  figurative element failing a fresh visual read twice escalates to a *tighter reference trace*, never
  to shipping the generated asset. A third hand-coded attempt without escalating is a protocol
  violation.
- **No auto-vectorized path data ships** — point density inconsistent with hand-placed anchors, or no
  provenance comment, is the tell.
- **Glow primitives are never a station's headline subject.** `blob/dots/spikes/lens/streak/ribbon/
  binary` are atmosphere only; a headline must be a drawn kind (`sprite`/`ring`/`ground`) —
  **[ENFORCED: ring-verify.mjs's drawn-subject check]**. Fixed as a one-station patch once already;
  the failure just moved to a different station. It's structural, not per-station judgment.
- **Noun uniqueness is tiered and cyclic, not flat.** Headline nouns appear exactly once across the
  12. Companions may repeat 2–3× deliberately. Ambient repeats freely. **Same silhouette family must
  be ≥3 stations apart** — unique names wearing the same shape still read as repetition at 20 feet.
  Station 11 neighbours station 0 (the ring wraps).
- **Signal/extent balance is silhouette-family dependent, not one fixed ratio.** Cored objects
  (planet, pulsar, ring) lead with signal; clustered objects (asteroid field) lead with extent. A
  cluster's high-extent/lower-signal profile is correct for that family, not a defect to chase toward
  a cored object's numbers.

---

## Standing instruction to any implementation agent, every prompt

*Render before you claim. Keep screenshots. Label anything unrendered as unverified in the same
message that delivers it. Never move a threshold to make something pass. Report and stop.*

**Also load `impeccable` and `emil-design-eng` as reference inputs before any object-form review pass**
— A1 priority, per Ben's explicit 2026-08-09 reinstatement above. Not the whole review (still run the
noun test, the drawn-subject check, and `ring-verify.mjs`'s mechanical gates), but a required additional
lens, not an optional one.

---

## Working with Ben on this system specifically

- He is deep in this and tired of it. Lead with the answer, not the explanation of the answer. He
  asks for prompts to paste, not prose about prompts.
- He has been wrong-footed repeatedly by confident reports resting on broken tooling (rule zero,
  above). He values a flagged unknown far above a smoothed-over one — say "unresolved" plainly rather
  than implying a diagnosis that hasn't been tested.
- He asks for named consult agents (Fable-5, Opus-5) when he wants a second opinion. Don't dispatch
  extra agents unprompted — a subagent burned 240k tokens producing nothing earlier this project, and
  it generated an explicit usage complaint. Match the ask, don't over-provision it.
- **The TV test is still outstanding**: putting the build on the real taproom screen and sorting the
  12 stations into reads-as-present / reads-as-empty by eye, written down before looking at any
  number. This is the only honest way to set the perceptibility floor, and nothing above substitutes
  for it. (This would also settle the ~20ft-vs-~12ft viewing-distance disagreement above, for free.)

*(The pre-flight checklist lives at the top of this file, right after the scope note — read it there,
every time, before starting.)*
