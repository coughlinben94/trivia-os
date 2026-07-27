# Flagship ambient + round-journey mechanism — adopted 2026-07-26

This is the design doc the brainstorming session should have produced before
the first Firefly Summer mock ever got built. It exists now instead.

**Current status:** ambient-as-primary is approved and active — build
against it now. The round-journey material below (3-beat recipe, timing,
novelty-decay variant) is written and ready, but stays optional/secondary
until the behavioral go/no-go test (real heads-turned count, multiple
nights) clears its threshold. Don't build a round-journey speculatively
before that test exists.

## STATUS UPDATE, 2026-07-26 — the vehicle flipped

Per Ben's own stated rule ("if guests might miss it, the journey is out and
the ambient background is the new forerunner") and the second research pass
on attention/perception science, the verdict came back clear: a silent
7-10s transition is structurally likely to be missed by anyone not already
looking at the screen (attentional capture of a brief, unattended, silent
event is unreliable without sound or an external cue — TV-gaze studies show
median glances under 2 seconds; the sports "score bug" exists precisely
because broadcasters solved this same problem with persistence, not a
one-off graphic). Multiple independent lines converged: attention science,
DOOH/digital-signage metrics, second-screen studies, and broadcast/casino
precedent all point the same direction.

**Ambient background is now the primary/forerunner format.** Round-journey
is demoted to an optional secondary layer — everything below about the
3-beat recipe and timing only applies *if* that secondary layer gets built,
and only cued to something that already makes guests look up (the host's
verbal round announcement, a leaderboard/score reveal — which is also,
honestly, the one moment guests already tend to glance at anyway, since
they just submitted an answer and are waiting), never played silent and
alone.

**The real argument for ambient-as-primary, corrected after Opus/Fable
pressure-tested the research: it's a duty-cycle argument, not a blindness
argument.** The borrowed lab attention-capture percentages don't transfer
cleanly to a full-screen TV animation, and the one vendor-commissioned bar-
TV study (Atmosphere/Chive) should carry zero weight, not "directional"
weight — both agents flagged this plainly. The argument that actually holds
regardless: ambient is on screen roughly 100% of the night; a round-journey
is on screen roughly 1% of it (10s out of a ~15-minute round). Expected
total eyeballs favor ambient by something like two orders of magnitude at
any plausible per-instance capture rate. That's robust even if the exact
lab statistics aren't.

**Go/no-go test, corrected — the original design (ask a few tables if they
noticed) is not usable.** Both agents independently flagged three real
flaws: asking "did you see it?" is a leading question that inflates yes;
a handful of tables is statistically meaningless (a 3-of-5 result has a 95%
confidence interval spanning roughly 15-95% — it cannot distinguish a 40%
true rate from a 70% one); and tables aren't independent observations (one
person notices and points, others turn to look, contaminating the count).
**Corrected test:** film the room during a real, host-cued test transition
and count heads that actually turn toward the screen — a behavioral
measure, not self-report. Repeat across multiple nights, not one shot, so
habituation decay is visible too. If self-report is used at all, funnel it
— "what stood out to you tonight?" before any direct probe naming the
transition — never lead with the answer.

**The "ambient system was never broken, wrong pipeline was used" idea —
checked, and it's half true, the convenient half.** Both agents found the
same hard evidence in the repo: `docs/superpowers/specs/2026-07-24-firefly-
summer-bespoke-ambient-design.md` is itself an *ambient*-path spec — it
cites the real ambient design law, `AMBIENT_MAP`, the GPU rule — and it
explicitly imported the porch, the hand-coded swing, and the jar into that
path, with a written waiver of the in-family-color rule to allow it. So the
failure wasn't "the wrong system got used" — it's that **the right
system's own rules get waived in writing whenever someone decides a
specific story needs it, and nothing currently stops that.** `themes.md`'s
"light, not clip-art" law would have forbidden a literal swing outright; a
spec waived it instead of enforcing it. The actual fix: adopt
`OBJECT-RENDERING-PROTOCOL.md` as a real, non-waivable rule inside
`references/themes.md` itself, not a separate optional draft that a future
spec can route around again.

Two smaller things surfaced worth knowing, not urgent: `themes.md` is
internally stale (line 41 still calls `firefly-summer` a canonical bespoke
exemplar; line 11 correctly lists it as a retired-bespoke gradient theme —
these contradict). And more substantively: `themes.md` line 43 defines
"bland" as a pure breathing-gradient wash with no anchor and nothing to
track — and 12 of the app's 21 shipped themes are exactly that. Making
ambient the flagship doesn't automatically fix those 12; it's a separate,
bigger question for later, not something this pivot resolves on its own.

## Decisions locked this session (2026-07-26)

- **Vehicle: round-journey** — a 7–10 second story beat between rounds —
  not a persistent ambient background. Ben's call: a journey is more fun
  than a background; the ambient-background idea can go by the wayside
  entirely if this is done right.
- **Consistency lives in the mechanism, not the mood.** Themes and nights
  vary in content and palette. The recipe — structure, technique, timing,
  review gates — stays identical across every single one of them.
- **One flagship mechanism**, not a different bespoke system per mood.
- **Anti-"AI generated" bar**, non-negotiable, enforced by two named review
  gates before anything ships: `impeccable` (does this read as deliberately
  designed) and `emil-design-eng` (does the motion have real timing and
  personality, not generic AI-motion).
- **Time budget:** 60–90 minutes per new night once the mechanism exists,
  and every build is reusable — not a one-off thrown away after one show.
- **Scope:** get the scaffolding right over preserving any existing asset.
  Ben is genuinely fine rebuilding from scratch; none of the 21 existing
  themes carry special protection if the process is what's actually broken.

## The recipe

Fixed structure, every night. Content changes; the shape doesn't. Validated
2026-07-26 against outside research (attract-mode/in-engine-cutscene
precedent, broadcast bumper/button convention, After Effects Master
Properties/package systems) — see `research-prompt-ambient-and-journey.md`
findings, folded in below.

1. **Arrival** (~2–3s) — hold at a legible starting state, then move.
   Revised up from an earlier ~1–1.5s draft: broadcast practice has the
   branded element "parked" by ~2–3s in, and the 3-phase animation
   principle (preparation/action/termination) treats anticipation as
   "the longest and most important part" — don't rush it.
2. **The turn** (~4–6s) — the actual story beat. Every brief names its turn
   in one sentence before any code: "the turn is ___" — the reversal or
   payoff, not a mood drift.
3. **Button** (~1.5–2.5s) — a held tableau, long enough to read, before the
   cut back to gameplay. This is a real, named beat in both animation and
   broadcast practice ("reveal → hold" for recall; a comedy/scene "button"
   as the final accent before a hard cut) — not just "stop moving."

Total 7–10s on first use. **Novelty-decay variant, new:** research flags
7–10s as workable for a narrated story beat but on the long side if repeated
every single round — broadcast practice shortens repeated elements. Build a
second, ~3–4s compressed cut of the same journey (arrival + button only, or
a fast version of the turn) and swap to it after the first 2–3 uses in a
show, so it stays a beat instead of becoming a wait.

**Same world, two intensities — the ambient/journey relationship, made
concrete:** keep palette, easing curves, and shape primitives *identical*
between the ambient background and the journey transition. Vary only
composition, speed, and cut density. The journey should read as "the
ambient world we've been looking at all night, now accelerating" (the
attract-mode/in-engine-cutscene precedent), never as a different asset set
wearing the same color scheme. Concretely: if the ambient layer is a
starfield at a given density/twinkle rate, the journey's warp beat reuses
those exact star sprites and palette, just faster and with added camera
motion — it does not swap in new star art.

**Architecture, borrowed from broadcast "packages" and After Effects Master
Properties/.mogrt systems:** build the journey as one master
engine/template with a small, strict, named set of per-journey content
slots (hero motif, palette override, turn text/beat timing) — never a
duplicated one-off file per theme. The failure mode these systems warn
against is exactly what sank Firefly Summer: an undisciplined one-off build
with no registry, no reuse, everything hand-tuned from scratch each time.

Technique layer — identical every night, this is the scaffolding itself,
not the art:

- Every named element is classified before any code: **figurative**
  (identified by contour or joints) is generated and isolation-validated,
  icon style only, never photorealistic; **iconic** (pure geometry — a
  disc, a beam, a glowing dot, a flat gradient) is hand-coded. Full detail,
  now including a concrete normalization pass and a bail-out rule:
  `concepts/OBJECT-RENDERING-PROTOCOL.md`.
- **One visual language per piece.** Hand-coded and generated elements must
  read like the same hand made them. No photoreal texture next to flat
  vector — research confirms mismatched rendering/lighting logic in one
  frame is one of the most reliable "AI-generated" tells there is.
- **New, from research:** the opposite failure also reads as AI-generated —
  gradients and detail that are *too* smooth/uniform/symmetrical. "Flawless"
  is itself becoming a detection signal. Keep deliberate, hand-authored
  imperfection and uneven detail density in the flat-vector world; don't
  over-polish it trying to compensate for the sprite risk.
- GPU-only motion (transform/opacity), reduced-motion branch required —
  same baseline as every other slide in the app.

## Flagged, not yet acted on: the biggest finding outside original scope

Research on "what actually makes a bar trivia night feel alive" (steelman
question) came back with a clear, evidence-backed answer that isn't about
visuals at all: host energy, an audio shift on every answer reveal, and
per-round score/comeback drama are the most-cited, best-evidenced levers —
ahead of any animation. The recommendation was to keep round-journeys, but
as the *secondary* amplifier, not the primary lever, and to invest in
host cues + sound design + scoring drama at equal or higher priority.
This doesn't change the mechanism above, but it's worth Ben deciding
explicitly whether that gets picked up alongside this work or after it —
not left as background because the visual system happened to be what was
already in flight.

## Review gates, in order

Three checkpoints, not the many-round grind that sank Firefly Summer:

1. **Object list + noun-test classification + the one-sentence turn** —
   written before any code. Cheapest place to catch an unauthorized element
   or a brief that contradicts its own premise.
2. **First figurative sprite, checked alone** — does it read as its noun,
   and does it match the flat/icon register of every other element? This is
   where the noun test actually gets enforced, not after the scene is built.
3. **First full assembled render, watched start to finish for real** — then
   run through `impeccable` and `emil-design-eng` before it's called done.

Ben's own preference, honestly stated: in theory he'd rather it just run to
completion before he looks. He also said, correctly, that isn't the better
way to do it — these three checkpoints are the compromise, chosen to be as
few as defensible, not as many as possible.

## Still open

Which world goes through this mechanism first, as the actual proof. Two
candidates survive from the earlier five-direction pass: Neon Marquee and
Roadside Kitsch. Recommendation: Neon Marquee first — lowest technical risk
(no thin jointed elements needing escalation, per the earlier audit), so the
first real build proves the *mechanism*, not a hard art problem at the same
time. Roadside Kitsch — the one Ben called "awesome" — is the natural
follow-up once the mechanism's proven, this time routing its sign armature
through generation correctly from round one instead of hand-coding it and
hoping.
