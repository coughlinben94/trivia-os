# Art Direction Spec — the ring ambient system

**Status: canonical, supersedes `S1-art-direction.md`.** That file (in an orphaned Cowork
outputs folder, never in this repo) measured world-06 and drafted a first spec. This document
is a full critique-and-rebuild of that draft: three independent design passes (motion/depth,
color/legibility, form/composition), each reading the CURRENT build (`world-07-ring.html`,
`RingAmbient.jsx`, `midnightGalaxy.ring.js`, `ringEngine.js`), each doing real research, each
told to keep what's right, fix what's close, cut what's redundant or unmeasurable, and add
what's missing. This is the merge. Written 2026-08-06.

Tags: **[auto]** = mechanically checkable from emitted world data or a headless render.
**[eye]** = a human has to look, ideally on the real taproom TVs.

---

## 0. Engine guarantees — solved, not art-spec content

These used to be findings. They're now arithmetic, verified by `concepts/tools/ring-verify.mjs`
(14/14 passing) and don't need re-litigating in every world's spec:

- The ring closes: every layer's cylinder = 12 × its own surge; all layers hit phase 0
  together at turn 12; no float ever reaches a transform.
- `mid` surge = exactly one frame (1920px) — a station is the frame you authored, always.
  `far` ≤ 40% of frame width per turn; `near` ÷ `far` ≥ 4.5. Reference: 480 / 1920 / 2880,
  ratio 1 : 4 : 6.
- One transform per layer (`.surge`), never nested — this is what makes the turn pop-free.
- Content-repeat factor `m` (a layer's content repeating `m`× around the ring) must divide 12,
  and `m` > 1 only on layers whose content is anonymous — an identifiable form repeating is
  visible, a star field is not.
- One seeded hash (`hash32`/`rng`), no `Math.random` anywhere in world construction — the
  world must be identical on every reload, or no automated check means anything.

If a new world needs something outside this list, that's a real engine change — name it, don't
route around it.

---

## 1. Frame occupancy — tiers and ink

Every element belongs to exactly one tier. Tier decides size, alpha, edge requirement, and
where it may sit. "Ink" = fraction of frame pixels whose luma exceeds `paneMedianLuma + 20`.

| tier | longest dimension | % of frame width | peak alpha | per station |
|---|---|---|---|---|
| **Headline** | 576–880px | 30–46% | 0.34–0.55 | 0 or 1 |
| **Feature** | 230–420px | 12–22% | 0.30–0.48 | 1–2 |
| **Detail** | 58–154px | 3–8% | 0.34–0.60 | 0–3 |
| **Atmosphere** | < 30px | < 1.6% | 0.25–0.45 | unlimited, uncounted |

- **[auto] Peak-alpha floor is 0.25, measured at each element's brightest stop only** — not
  every stop. A soft radial form legitimately fades through low alpha on its way to
  `transparent`; the floor was always about whether the form is visible at all, not about every
  gradient step. (The original draft's literal wording — "no stop below 0.25" — is
  unsatisfiable by any radial gradient and would fail every soft falloff in the vocabulary.)
- **[auto] Ink per station: 6–18% of the frame.**
- **[auto] The station's largest element supplies ≥ 55% of the mid (composition) layer's ink**
  — scoped to the composition layer specifically, since far-layer washes and the star field
  both contribute ink at every station and would make the rule unmeasurable otherwise.
- **[auto] Headline ink, when present: 4–9% of the frame.** This is the number behind "it
  feels small" — a reasonable bounding box with translucent content can carry a twelfth of the
  ink its box size implies. Box size alone will not fix it; alpha and edge structure will.
- **[auto] Elements per station, excluding atmosphere: 2–5.** Every station has at least one
  element at Feature tier or above. No station is ever empty.

---

## 2. Placement grammar — legible centre, no dead stripe, no dead side

Constrain centroid and luminance. Never a geometric exclusion zone — that's what produces a
dead stripe evacuated of content.

- **[auto] Centroid rule.** No element's centroid may fall inside the safe box (x 384–1536,
  y 302–778). That's the whole geometric constraint.
- **[auto] Overlap is allowed.** An element's *area* may cross the safe box freely, provided
  the luminance cap (below) holds.
- **[auto] Safe-box luminance cap, measured under the scrim, at the worst animation frame** —
  not a static authored-frame snapshot. Mean ≤ 34, 99.5th percentile ≤ 72. Measure at each
  element's breathe/twinkle peak, not its resting alpha; a gate that only checks the authored
  frame certifies nothing about what a viewer actually sees over 75 seconds of motion.
- **[auto] The scrim is part of the spec, not an implementation detail.** An elliptical
  (never a rectangular band — a hard horizontal edge reads as a horizon or a letterbox)
  scrim behind the question text, alpha tracking the station's own brightness target
  (`0.20 ≤ alpha ≤ 0.62`, keyed to that station's arc value). This is what lets the centroid
  rule stay permissive: the scrim, not an evacuated stripe, is what protects legibility.
- **[auto] Quadrant rotation.** Split the frame at x = 960, y = 540. Over twelve stations each
  quadrant hosts the largest element **at least twice, at most four times.**
- **[auto] Horizontal balance.** Mean centroid x over a full turn must land within **960 ±
  96px.** This single number is the regression gate for a specific defect that has now shipped
  twice: a placement formula whose random draw is capped below the frame's actual width (e.g.
  `left = lerp(0.06, 0.44, r()) × (W − w)` can never place a centroid right of ~x 900).
  **[auto] The generator gate must additionally reject any per-station placement code whose
  draw range caps below 0.90 of available width** — this catches the *cause*, not just the
  averaged symptom, so it can't ship a third time under a seed that happens to average out.
- **[auto] Vertical spread.** At least 6 of 12 stations place ≥ 15% of their largest element's
  area inside the horizontal band y 302–778 (still governed by the luminance cap). Presence by
  area, not a narrow centroid slot — a seeded generator can satisfy a slot-based rule and a
  balance rule simultaneously only by fighting itself; area presence doesn't have that problem.
- **[auto] Bleed.** Exactly 3–5 of 12 stations have their largest element cropped by a frame
  edge, by 10–35% of that element's own size, **computed after rotation.** A world where every
  object sits fully inside the frame reads as stickers on a card, not a window onto a place.
  Any crop outside that band or outside a declared bleed is an accidental clip and fails.
- **[auto]** No two elements in a station may have centroids closer than a combined-radius
  overlap threshold **unless declared as a related pair (§7.5)** — this only governs
  *unrelated* proximity; occlusion (§7.2) and declared pairs are exempt by design, not by
  accident.

---

## 3. The value arc

- **[auto] Formula.** `base = lo + (hi−lo)·t^1.6`, where
  `t = 0.5 − 0.5·cos(2π·(i+phase)/12)`. The 1.6 exponent is what makes most stations quiet so
  two or three can be loud.
- **[auto] The cosine trough is symmetric by construction — stations equidistant from the
  minimum get an identical `base` before any jitter.** This is not a hypothetical: it shipped
  as a real, confirmed-live defect (three consecutive stations rendering at near-identical
  weight) and the first fix attempt — a jitter sized as a percentage of the local `base` — made
  it *worse* on the numeric gate while leaving the visual defect fully intact (near the trough,
  `base` ≈ 18, so ±10% is only ±1.8 — nowhere near enough to separate two already-identical
  numbers on an 18–52 range). **The jitter must scale to the arc's own range (`hi−lo`), not to
  the local base value**, and the result must be clamped back into the absolute band below —
  an unclamped range-scaled jitter can push the trough or the peak outside the band depending
  on seed.
  ```
  jitter = (±14% of seed draw) × (hi − lo)
  result = clamp(base + jitter, lo, hi)
  ```
  Reference values that satisfy every rule below: seed producing loudness separation
  ≥ 0.07 between any two trough-adjacent stations, span 2.2–4.0×, absolute band intact.
- **[auto] Absolute band.** Quietest station mean 14–22; loudest 40–66.
- **[auto] Span: 2.2–4.0× (max ÷ min).** Below 2.2 nothing is a moment; above 4.0 the quiet
  stations look broken.
- **[auto] Adjacent-station minimum gap, not rank distance.** The original draft's rank-based
  "no flat neighbours" check (adjacent rank distance ≥ 2, at least 8 of 12 steps) **passed the
  exact defect it was written to catch** — any single-peaked arc naturally interleaves its rise
  and fall, so adjacent stations differ by ~2 ranks almost everywhere by construction, trough
  included. Replace with an absolute measure: **adjacent stations must differ by ≥ 6% of
  (hi−lo)** (~2 units at the current band), checked **cyclically** (station 12 → station 1 is a
  real transition on a ring and must be checked like any other adjacent pair). Additionally,
  the three stations nearest the trough must span ≥ 12% of the full range in normalized
  loudness — this is the number that actually verifies "not visually flat," where the rank
  check never did.
- **[auto] Chroma must move too.** Mean chroma of the loudest station ≥ 1.8× the quietest.
  Unenforced today — value and color both went flat together in every prior failure, and
  fixing only value leaves the other half of "nothing is a moment" untouched.
- **[auto] Pane-invariant light is capped.** Luminance contributed by elements identical across
  all twelve stations ≤ 35% of the luminance contributed by station-varying content, measured
  by ablation (render with/without the element, take the difference).
- **[auto] Close the loop: verify the arc actually renders.** A target luma per station is only
  a promise until measured. Rendered station mean luma must land within ±30% of that station's
  arc target — the exact class of bug ("a number that's written but never measured is a number
  that's wrong") that produced world-06's flat panes in the first place. Gate it, don't trust it.

---

## 4. Color rules per world type

Three color roles hold twenty-one themes in one family:

1. **Base** — from the theme's `bg`/`bgDeep`. Geometry set by world type (below).
2. **Field** — the large soft masses. Derived through the app's real `deriveTint()`, anchored
   on the theme's declared hue anchor(s) (below) — not a raw literal.
3. **Core** — hot near-white. Literal, never tinted. Sanctioned exception, one per element.

### Hue anchors, not a single window

- **[auto] A world declares 1–3 hue anchors, each governing a ±25° window**, not a single
  ±34°-of-`highlight` window for the whole world. Three real failure modes this fixes:
  1. **A theme's `highlight` can be a near-neutral** (chroma < 48) — hue of a near-white or
     near-grey is numerically unstable, and a window around it is unmeasurable. A world whose
     natural anchor is hueless must declare its anchor(s) explicitly rather than deriving one.
  2. **Some themes are genuinely two-hue identities** (a pink/cyan neon theme, a red/green
     holiday theme) — capping a second hue at "3 panes, 25% of ink" as a mere accent deletes
     the theme's actual identity. A world may declare a **dyad**: two anchors, each with its
     own ±25° window, no single-anchor "complementary accent" cap applied to either.
  3. **Verify against real data before shipping**, not after — a hand-tuned reference build can
     honor a rule its own generated data ignores. Run this check against the actual per-station
     hue list before calling a world done.
- **[auto] For a single-anchor world**, one complementary accent (150–210° from the anchor) is
  allowed on **at most 3 of 12 stations**, and may not exceed 25% of that station's ink. One
  deliberate opposite reads as authored; five unrelated hues across 300° reads as noise.

### Per-type geometry

| type | base geometry | internal range (absolute luma delta, not ratio) | notes |
|---|---|---|---|
| **space** | radial only, centre 46–52% height. **No vertical gradient anywhere in the base** — a vertical ramp always implies a horizon. | center-to-corner Δ ≤ 12 luma (the base is *supposed* to be flat; light comes from objects, not the sky) | ≤ 1 complementary accent (single-anchor) |
| **terrestrial** | vertical, horizon required | ≥ 60 luma top-to-bottom | objects rest on a ground plane |
| **aquatic** | vertical, inverted (bright above), caustics allowed | ≥ 50 luma | objects float/rise |
| **aerial** | vertical, horizon required | ≥ 90 luma — this is the Sonora band, the one working reference this whole spec keeps returning to | up to 5 objects may be fully saturated, opaque, drawn (the balloon precedent), each internally consistent even if off-family |
| **interior** | implied horizon, depth haze | ≥ 45 luma | light sources are the anchor |

Ratios were the wrong unit near black — a base running luma 11.8 → 1.5 is nominally "7.9×,"
wildly over any reasonable cap, while reading as uniformly black to a viewer. Luma deltas don't
have that failure mode.

- **[auto] Space worlds: zero linear gradients anywhere in the base geometry.**
- **[auto] Terrestrial/aquatic/aerial worlds: a horizon must exist and be findable** — a row
  where luminance changes ≥ 25% between adjacent 20px bands.
- **Hue windows and geometry minimums for terrestrial/aquatic/aerial/interior are not yet
  tested against a real world of those types** (only space exists). Derive them by the same
  anchor method the first time each type is built, and re-verify against real data before
  trusting the numbers above as more than a starting point — this is explicitly stated so
  nobody quotes them as settled.

---

## 5. The star field

The star field's *behaviour* is right and locked. This section is scoped to space-type worlds
only — a firefly-summer or under-the-sea world carries its ambient-motion ink budget in motes,
fireflies, or bubbles instead, using the same *targets* below with different literal content.

- **[auto] Density: 150–260 visible per frame.**
- **[auto] Size distribution by count: 62–70% at 1.2–2.2px, 24–30% at 2.4–4.0px, 5–9% at
  4.5–8.0px.**
- **[auto] Stars ≥ 5px carry a static `box-shadow`, sized proportional to the star. Never a
  blur filter** — a blur wider than about a quarter of an element deletes it.
- **[auto] Every star twinkles.** `lo` uniform in 0.28–0.42; `hi = lo + 0.40…0.55`, clamped to
  1.0; period 5–13s; phase offset spans the **full** period (a delay drawn from a narrower
  window than the period range clusters phases and risks a visible cohort pulse).
- **[auto] Alpha floor 0.28** for every star at every point in its twinkle cycle.
- **[auto] Colour: the literal 5-stop temperature ramp** (near-white dominant, one warm, one
  cool, evenly weighted) — a percentage-based rule ("≥60% near-white") is unmeasurable without
  a warm/cool boundary definition; the ramp itself is the spec.
- **[auto] Star-field ink target: 0.6–1.2 luma of frame mean contribution**, measured by
  ablation (render with/without the star layer, take the difference).
- **[auto] At least three star layers, surge distances differing per §0's ratio.**

---

## 6. The primitive vocabulary — nine primitives, not six

Six primitives (`blob dots spikes lens streak ribbon`) can carry one theme *type* — glow
phenomena. They cannot carry object-nouns (a pumpkin, a balloon, a scarecrow, a lantern),
because none of them can produce a closed opaque outlined silhouette, and object-nouns read by
silhouette. The working reference for why this matters is already in this codebase: Sonora's
balloons read at distance *because they're drawn* — opaque fill, stroke, interior stripe
pattern — not because they're big.

**Add three primitives:**

- **`sprite`** — a closed opaque path from a small per-noun path library (5–10 authored anchor
  points), filled at alpha 1, stroked ≥ 4px, 0–3 interior detail bands. Generalizes the balloon.
  Carries every object-noun a glow can't: pumpkin, balloon, scarecrow, campfire flame, lantern.
- **`ring`** — closed ellipse stroke, thickness ≥ 4px, optional gap. Carries ringed planet,
  wreath, ferris wheel, halo, moon-ring — nouns the current lens primitive claims but can't
  actually render (see §6.1).
- **`ground`** — a horizon-anchored band mass with an edge treatment, one per station max,
  terrestrial/aerial/aquatic types only. No current primitive can be "stood on," and §4's
  per-type table requires exactly that for three of five world types.

Sprite paths are **human-authored in the noun atlas**, not generated — a noun's silhouette is
precisely the thing a procedural generator can't be trusted to invent from scratch. Everything
else about how it's used (placement, size, alpha, arc position) stays generated and gated like
every other primitive.

### 6.1 Hard-edge requirement — with a real thickness and contrast floor

- **[auto] Every element ≥ 12% of frame width must contain a hard sub-element that is:**
  - **thickness ≥ 4px**, not 2px — at a 55" 1080p panel viewed from ~12 feet, one design pixel
    subtends roughly 0.6 arcmin; a 2px line at low alpha sits below the physical detection
    threshold for a bar-distance viewer. 4px at real contrast is the floor, not an aesthetic
    choice.
  - **peak luma ≥ local background + 40** (not just "an alpha step") — a rim can satisfy an
    alpha-delta rule while still being physically invisible against a bright-enough local
    background; the absolute contrast is what actually reads.
  - **longest dimension ≥ 15% of the parent's longest dimension.**
  - **geometry that traces the parent's own silhouette** — a rim shares ≥ 60% of its arc with
    the parent's outer boundary. A fixed-inset shape floating inside an irregular cloud is not
    an edge on that cloud; it's a second, smaller, unrelated shape. **[eye]** for the tracing
    quality; the rest is [auto].

### 6.2 Distinctness — the silhouette test

- **[auto] Silhouette-distinctness across the ring.** Render all twelve stations with content
  filled solid black; count distinct silhouette classes. Must be **≥ 8 of 12.** Hue is not
  allowed to carry noun identity by itself — if two stations are only distinguishable by color,
  they fail this test, fail for colorblind viewers, and fail the fill-black check that
  game/character design uses as ground truth for at-a-glance readability.
- **[eye] The squint/fill-black authoring check.** Before a station ships: silhouette it, and
  confirm the noun is still guessable. This is the actual mechanism behind "nameable at 12
  feet" — silhouette is what survives distance and a dark room; interior detail mostly doesn't.
- **[auto] No primitive may be the headline more than 3 times in 12, never on cyclically
  adjacent stations** (mod 12 — the ring wraps, station 12 → station 1 is adjacent). **Two
  stations sharing a primitive must differ in at least one non-hue parameter by ≥ 25%** (lobe
  count, dot count, aspect ratio, size) — four different-hued blobs are still one noun, four
  times, wearing different shirts.
- **[auto] Noun-atlas entries are recipes, not tokens.** An atlas entry is a primitive *plus*
  parameter overrides — `{ primitive: 'dots', count: 2, sizeRatio: 1.6, sharedHalo: true }` for
  a binary pair, `{ primitive: 'ring', gapDeg: 40 }` for a ringed planet. A bare
  `"noun": "primitive-name"` string mapping is banned — it's the exact shape of bug that let a
  "binary pair" render as an undifferentiated star cluster with no parameters distinguishing it
  from any other cluster on the ring.
- **[auto] Two distinct nouns must not share an anatomy.** A persistent streak (comet) and a
  transient streak (shooting star) must differ in ≥ 2 of: scale (≥ 3× apart), presence of a
  coma, tail broadening. If they're anatomically identical, they're one noun with two names.

---

## 7. Depth — what makes a station a place, not stickers on a backdrop

- **[auto] §7.1 Differential surge** — governed by §0; the largest single lever available.
- **[auto] §7.2 Occlusion, measured by ablation, not by z-order.** Translucent glow primitives
  stacked front-to-back don't occlude anything — "in front of" only means something if it
  visibly dims what's behind it. At least one station in three contains an occluder: render
  with and without it, and star-field luminance inside the occluder's footprint must drop to
  ≤ 0.5× the same stars unoccluded. A dark occluder additionally needs the §6.1 rim treatment —
  dark shape over dark sky is invisible without one.
- **[auto] §7.3 Scale ladder.** Within a station, largest ÷ smallest non-atmosphere element
  ≥ 6× in longest dimension.
- **[auto] §7.4 Atmospheric perspective, applied between form-bearing layers.** Far-layer mean
  chroma ≤ 0.55× mid-layer chroma; far-layer peak luma ≤ 0.6× mid-layer peak. (Not "far vs
  near" — if the near layer is stars-only, its chroma is near zero by definition and the
  comparison is meaningless. The near layer's depth identity instead comes from size and speed:
  size ≥ 1.4× the far field's, surge ≥ 4.5× far's, both already required by §0.)
- **[auto] §7.5 Relation.** At least one declared pair per station: two elements linked by
  proximity plus one shared visual property (a common halo, an aligned axis, a colour echo, a
  connecting bridge). Two unrelated blobs is a collage; two related ones is a place.
- **[auto] §7.6 The anchor, sized to the far layer's own arithmetic, not a fixed pane count.**
  One nameable form on the slowest (far) layer, present in **4–6 of 12 stations**, computed as
  `(frameWidth + anchorWidth) / farSurge` landing in that band — not an arbitrarily chosen
  "3–5" that the far layer's actual speed may not support. **[eye]** it must be nameable out
  loud, and it must be absent from the rest of the ring — you turned away from it.
- **[auto] §7.7 One element per world carries real, trackable translate motion**, crossing time
  4–12 minutes (≥ 2.7 px/s — the project's own prior finding that slower reads as visually
  frozen). It animates its own transform *inside* a surge layer; it never becomes a second
  transform on the layer itself — nesting transforms at the layer level is the exact defect
  class that caused visible pops in an earlier build. Without this, the gap between turns (up
  to 75 seconds) is a freeze-frame with glitter; twinkle alone isn't continuous life.

---

## 8. Motion

- **[auto] `transform` and `opacity` only.** Static `filter`/`box-shadow` allowed; animated,
  never. No `requestAnimationFrame` in the persistent layer — CSS keyframes and chained
  `setTimeout` only, so the background stays smooth under main-thread load from the rest of the
  app.
- **[auto] Reduced motion freezes, never vanishes.** One declaration point covering the surge
  transition and the twinkle/breathe animations — not a guard class duplicated per element.
- **The turn transition (1700ms, front-loaded custom easing) is correct motion craft — pin it,
  don't "fix" it toward a UI-scale duration.** This is a scene move seen ~40 times a night, not
  a button press seen hundreds of times a day; the 300ms ceiling that governs UI interactions
  doesn't apply here. Keep the front-loaded curve (fast attack, long settle — reads as turning
  toward something, not sliding past it).
- **[auto] Sub-visible animation is banned as dead weight.** Any opacity animation whose
  peak-pixel swing is < 22 luma must not exist — it costs render work and buys nothing a viewer
  can see. At most the headline element per station may breathe; if it does, the swing must be
  ≥ 22 luma with period ≥ 30s. Every other form stays static — continuous life is carried by
  twinkle (§5) and the one trackable drifter (§7.7), not by dozens of imperceptible pulses.
- **[auto] The turn-12 wrap should animate through, then jump — not hard-cut at the wrap
  itself.** Every surge layer already renders `cylinder + one frame` of content specifically to
  cover this window; the engine can run the standard transition to `offset = 12 × surge` like
  any other turn, then reset `offset %= cylinder` afterward with the transition suppressed.
  Because phase-`cylinder` content is byte-identical to phase-0 content by construction, that
  reset is invisible — the animation is what a viewer sees, the reset is what the engine does
  after they've stopped looking. **Note:** the current hard-cut has been directly verified as
  visually clean (no pop, confirmed by screenshot comparison) — this rule is an enhancement for
  smoother, more consistent motion across all twelve turns, not a fix for something visibly
  broken.
- **[auto] A turn request during an in-flight turn must queue, never drop silently.** The
  station-per-slide contract is the whole model; if a rapid double-advance can leave the engine
  permanently out of sync with the slide index, the ring stops meaning anything. Either queue
  the request or expose an idempotent `syncTo(index)` and require every caller to use it —
  after any sequence of calls, station must always equal `slideIndex % 12`.
- **[auto] Every motion constant is single-sourced and the gate reads it back from computed
  styles** — comparing the engine's own declared duration/easing against what the DOM actually
  renders. A constant declared in two places that quietly drift apart is the exact defect class
  that produced visible pops in an earlier build; this rule exists so it can't recur silently.
- **[auto] Performance budget, verified on the real display rig, not assumed.** Node/animation
  count ceiling at the current shipped scale; `will-change: transform` scoped to the three
  surge elements only, never per-star or per-form; surge elements paint no background of their
  own (a 36,000px-wide element with a painted background is expensive for no visual reason).
  One trace on the actual venue hardware (not a dev laptop) confirming zero dropped frames
  during a surge, before trusting the budget as met.
- **[eye] Motion clarity at peak turn velocity.** The near (star) layer moves fastest during a
  surge; on a sample-and-hold display, small bright objects moving far enough per frame can
  strobe or double-image — the same reason film cameras cap pan speed. Watch a real surge on
  the actual TV; if it strobes, dim the near layer slightly during the transition rather than
  slowing the turn down.

---

## 9. Legibility — protecting the text that sits on top of all of this

This section exists because a real, live problem was found while building this spec: a
question's text color, sourced automatically from a theme's data, can render at roughly 1.4:1
contrast against its own background — silently, per-theme, with nothing catching it.

- **[auto] Question text color floor.** Every text color a world can select must have relative
  luminance ≥ 0.45 **and** ≥ 7:1 contrast against the worst-case post-scrim safe-box luminance
  (not the bare-frame value — see §2). A color that fails is auto-lightened toward white, hue
  preserved, until it passes. **A theme's UI-surface accent color is never used as a text
  source** — it's tuned for buttons and panels, not for 75 seconds of legibility over a moving
  background; text colors come only from a theme's dedicated text/highlight fields, or a
  lightened derivative of one.
- **[auto] Halation cap.** Fully saturated color as text on a near-black background haloes at
  distance. Cap text-color saturation: minimum RGB channel ≥ 0.5 × maximum channel. A theme's
  neon accent, used raw as text, typically fails this and self-corrects once it's run through
  the lightening step above.
- **[auto] Transients (shooting stars, any future ephemeral flash) must not cross the safe box
  at peak brightness while a question is visible.** Either the spawn/travel envelope is
  constrained to miss the box, or spawns are suppressed while text is on screen. This can't be
  caught by a static-frame gate — it has to be a geometric constraint on the transient itself.
- **[auto] Run the full legibility gate matrix (safe-box cap, text-color floor, halation cap,
  sky-hue integrity) against every theme's real data, not just the reference/flagship world.**
  A rule can pass by construction on a hand-tuned reference build and fail on a theme's actual
  color data — that's exactly how the 1.4:1 contrast problem got through. A theme that fails
  gets its override colors fixed in data, not a special case carved into the engine.
- **[auto] Derived sky stops preserve the world's own hue family.** A gradient's terminal stop
  should darken the world's own deepest color toward near-black, never fall back to a literal
  hardcoded near-black — a fixed blue-black terminal stop under a warm autumn or green firefly
  theme visibly shifts that theme's corners toward blue, which is the opposite of "this theme's
  own place."

---

## 10. Pacing — what holds twelve stations together as one world, and what makes them different places

**Constant across all twelve — this is what makes it a family, not a slideshow:**

- The base gradient and its geometry.
- Every star-field parameter (density, size distribution, twinkle range, colour ramp, alpha
  floor).
- The hue anchor window(s).
- Tier size/alpha bands.
- Grain and vignette treatment (when the production port carries them — see §11).

**Must change every station:**

- **[auto]** The largest element's **noun** — not its hue. A primitive repeating with a
  different color is not a different noun (§6.2). No noun is the largest element more than 3
  times in 12, never on cyclically adjacent stations.
- **[auto]** The headline's quadrant (§2).
- **[auto]** The station's mean luma (§3).
- **[auto]** The station's chroma.

**Must change slowly — once every 3–4 stations:**

- **[auto]** The dominant hue within the anchor window(s).
- **[auto]** Element count.

**Must never repeat:**

- **[auto]** The same `(noun, quadrant, size-tier)` triple twice in a turn.
- **[auto]** The same noun twice within one station.

---

## 11. What a generator emits

```
Station {
  index              0..11
  targetMeanLuma     from §3's clamped formula
  targetInk          derived from targetMeanLuma
  elements [
    { tier, noun, primitive, primitiveParams{...},   // recipe, not a bare noun→primitive string
      quadrant, centroid{x,y}, size{w,h}, rotationDeg,
      bboxAfterRotation, alphaStops[], hueDeg (within a declared anchor window),
      coreSize, hardEdge{ subElement, thicknessPx, contrastDelta, arcCoverage },
      layer, bleed?, pairedWith? }
  ]
  declaredPair       [elementA, elementB, sharedProperty]
}

World {
  type, name, phase,
  hueAnchors[ { deg, window: 25 } ]        // 1-3, see §4
  palette{ base{...}, field-derivation-source: theme.highlight },
  anchor{ noun, primitive, panesVisible[] },  // sized per §7.6, not a fixed guess
  starField{ density, sizeBands[], twinkle{lo,hi,period}, colourRamp[] },   // space-type only, see §5
  base{ geometry, stops[], internalDeltaLuma },
  surgeDistances{ far, mid, near }          // ratio ≥ 1:2.2:4.5, mid == frame width exactly
  stations[12]
}
```

---

## 12. Eye checks — what no measurement settles

- **[eye]** Does each station's largest element read as its noun at 12 feet, said out loud?
- **[eye]** Silhouetted (filled solid black), is the noun still guessable? (§6.2)
- **[eye]** Does the turn feel like turning your head, or like a slide changing?
- **[eye]** Does the world feel like *this theme's* world, or generic-ambient-with-a-recolor?
- **[eye]** Is the arc across the night felt, or only measurable?
- **[eye]** Does the safe box stay legible with the loudest station behind it — watched moving,
  with a real question up, not as a still?
- **[eye]** Is the anchor nameable, and does its absence from most of the ring feel like "you
  turned away," not like it forgot to render?
- **[eye]** At real turn velocity, does the near star layer strobe? (§8)
- **[eye]** One full turn, on the loudest station, question visible, on the actual taproom TV
  at bar distance — not a monitor, not a still. This is the test that certifies the whole chain
  at once, and nothing above substitutes for it.

---

## 13. What's still unverified — stated plainly so nobody quotes it as settled

- **Every luminance/contrast number in this document assumes sRGB-on-a-standard-panel.** None
  of it has had a pass on the actual taproom TVs. This is the single largest open risk in the
  spec, was flagged in the original draft, and remains true.
- **The 4px hard-edge thickness floor (§6.1) is derived from a 55"/12ft viewing assumption** —
  confirm the real panel size and typical seating distance before treating it as exact.
  Directionally correct regardless (thin low-contrast lines don't survive distance), but the
  precise number deserves a real check.
- **Real dwell time per question is still unknown.** Every pacing number in this document
  assumes something close to the engine's authored 75-second window. Nobody has timed a real
  show against it.
- **Hue windows and internal-range minimums for terrestrial/aquatic/aerial/interior worlds are
  reasoned from the one working reference (space) and one read-not-rendered comparison
  (Sonora), not tested against a built world of those types.** Treat as a first draft; re-derive
  the first time a real world of each type exists.
- **The scale ladder, occlusion-by-ablation, declared-pair, and anchor-timing rules (§7) are
  unimplemented in the current reference build.** They're correctly diagnosed as missing, not
  verified as sufficient once built — build one world against them and re-check before treating
  them as proven.

---

## Appendix: real bugs found while writing this spec, not spec issues

These came up during the critique passes and are genuine defects in the *current build*
(`world-07-ring.html` / `RingAmbient.jsx` / `midnightGalaxy.ring.js`), not gaps in the document
above. Listed here rather than silently folded into the rules, since fixing code wasn't this
task's job:

1. **Question text contrast, live.** `midnightGalaxy.ring.js`'s `qColours` sources one entry
   from `theme.colors.accent` — for Midnight Galaxy that's `#4a1a8f`, roughly 1.4:1 contrast
   against the safe box. Every theme's `accent` field is a UI-surface color, never tuned as
   text. §9's rule exists specifically because of this finding.
2. **Placement is left-weighted by a hardcoded cap**, not by chance — `bandY()`/headline
   placement math caps its random draw below the frame's full width, the identical defect
   class measured and supposedly fixed once already in the world-06 → world-07 transition.
3. **`bandY()`'s vertical exclusion recreates the dead stripe** §2 was written to eliminate —
   it's a geometric ban, not the centroid+luminance rule this spec calls for.
4. **"Binary pair" renders as an undifferentiated star cluster** — mapped to the `dots`
   primitive with no parameters distinguishing it from any other cluster station. §6.2's
   recipe-not-token rule exists because of this.
5. **The sky gradient's terminal stop is a hardcoded near-black literal**, independent of the
   world's own theme — will visibly shift a warm or green theme's corners toward blue once a
   second theme is built. §9's derived-terminal-stop rule addresses this directly.
6. **`turn()` holds its busy-lock for the full transition duration**; a rapid double-advance
   during that window is dropped silently rather than queued, which can permanently desync the
   station from the slide index. §8 names the required fix.
