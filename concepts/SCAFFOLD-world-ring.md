# The Ring Scaffold — how it works, and what it should absorb

**Reference build:** `concepts/world-07-ring.html`
**Status:** arithmetic verified in a JS engine; appearance never rendered by anyone.
**Purpose of this document:** explain the scaffolding precisely enough that it can be extended,
generalised to all 21 themes, and eventually moved into `ParticleBackground.jsx` without anyone
re-deriving it.

Ben's verdict on the reference build: *"I really love the engine, needs some tweaks, but the bones
are really there."* So: the bones are what this document is about. Tweaks are listed at the end and
are deliberately separated from structure.

---

## 1. The model in one paragraph

The viewer stands inside a **ring** of sky divided into **12 stations**. Each slide is one station.
Advancing **turns** the view to the next station. Twelve turns brings you back to where you started.
Depth comes from layers translating **different distances per turn** — but every layer's period is
exactly twelve turns, so a station always lands on the composition it was authored with. Register is
guaranteed by arithmetic, not by tuning.

---

## 2. The layer chassis

```
.stage                       responsive box, aspect-ratio 16/9
  .design                    fixed 1920x1080 coordinate space, CSS-scaled to fit
    .lyr                     clip box, viewport-sized, NEVER transformed
      .surge                 the ONLY transform on this layer
        [content copies]
```

Two rules do a lot of work here:

**`.lyr` is never transformed.** It exists to bound the raster. Chromium tiles composited layers and
rasters by proximity to the viewport, so the enormous off-screen tail of `.surge` costs nothing as
long as something clips it.

**`.surge` is the only transform.** Earlier builds nested a continuously-drifting `.rail` inside the
clip and put the per-turn move on a child. That was two moving parts that had to agree about
position, and in world-04 they didn't — travel was declared in CSS as `--stp:6/8/12` and again in JS
as `step:8/10/16`. The animation used one and the settle used the other, so every advance ended in a
hard pop of 2–4cq, a different size on each layer.

Those pops measured **0.31° and 0.61° of visual angle**. The window where abrupt displacement most
strongly captures attention is **0.26°–1.05°**. The bug wasn't just wrong, it was landing in the
worst possible band. That is what "choppy" was.

Because there is now exactly one transform per layer and one place that writes it, the class of bug
cannot recur.

**Everything in the design space is in true pixels.** `.design` is a fixed 1920×1080 div scaled by
`transform: scale(stageWidth / 1920)`. So every number in the engine is a literal pixel value and
means the same thing on any display. No `cqw`, no percentages, no unit conversion anywhere.

---

## 3. The ring arithmetic — the part that matters most

```js
LAYERS: [
  { id:'sky',  surge:0,    m:1 },
  { id:'far',  surge:480,  m:1 },
  { id:'mid',  surge:1920, m:1 },
  { id:'near', surge:2880, m:3 },
]
cylinderOf(L)     = PANES * L.surge      // the layer's period, always 12 turns
authorPeriodOf(L) = cylinderOf(L) / L.m  // how much content is actually authored
```

| layer | surge/turn | cylinder | author period | copies rendered |
|---|---|---|---|---|
| far | 480 | 5,760 | 5,760 | 2 |
| mid | 1,920 | 23,040 | 23,040 | 2 |
| near | 2,880 | 34,560 | 11,520 | 4 |

**Why this shape:**

- **`surge` differs per layer, so parallax is real.** Ratio far : mid : near = **1 : 4 : 6**.
  world-06 wrote `--sd = PANE_W` on every layer, meaning all three moved 1920px — the depth system
  was completely inert during the one second anyone was watching it.

- **`cylinder = 12 × surge` for every layer**, so all layers hit phase 0 *simultaneously* on turn 12.
  Verified by simulation to turn 36: all-layers-phase-0 at turns 12, 24, 36, with no non-integer
  value ever reaching a transform.

- **`mid.surge === W` exactly.** This is the rule that keeps composition trustworthy. Mid moves
  exactly one frame per turn, so station *i* is authored into the frame at `x = i * 1920` and lands
  there every single time. What you design is what you get. Far and near slide past at ¼ and 1½
  speed, giving depth, but nothing you composed can drift out of register.

- **`m` is how many times a layer's content repeats around the ring.** `m` must divide `PANES`.
  `m > 1` is only legal on layers whose content is **anonymous** — a repeat you cannot recognise is
  invisible. That is the useful half of a finding that otherwise hurt: a uniform starfield is useless
  as a landmark (you can't tell one dot from another), which is exactly why star-layer repetition is
  unnoticeable. Near uses `m:3` and saves two thirds of its nodes.

- **`m + 1` copies are rendered.** The extra copy covers the window that hangs past the cylinder just
  before it wraps. Verified: coverage ≥ cylinder + one frame on every layer.

- **Wrapping is a jump, not an animation.** When a turn would carry a layer past its cylinder, the
  offset is set with `% cylinderOf(L)` and written without the transition. Sliding back across a
  whole cylinder would be a visible rewind. The jump is *theoretically* invisible because content at
  phase 0 is identical to content at phase `cylinder` — **this is the single biggest untested
  assumption in the build.** See §8.

**Loop closure, honestly stated:** pixel-exact closure is worth nothing on its own — no viewer can
recognise a frame from eighty minutes ago, and with host-variable question lengths the world position
was never deterministic in earlier drift-based designs anyway. What the ring buys is different and
real: **geography.** The anchor comes back, a guest can say "we've come round again," and the content
budget is finite and closed. Closure here is a by-product of the geography, not the goal.

---

## 4. Determinism

One seeded hash, used for every position, size, alpha and phase:

```js
function hash32(x, seed){ … }              // 32-bit integer hash
function rng(i, seed){ … return () => …; } // a stream seeded at index i
```

**No `Math.random` anywhere in world construction.** world-06 used it in `featureY()` only — vertical
placement — which meant the world looked different on every reload. That silently defeats any
automated check, because the thing you captured is not the thing that renders next time. It also makes
a reported bug irreproducible.

`Math.random` remains acceptable for genuinely ephemeral things that are not part of the world's
identity: shooting-star timing and position.

---

## 5. The value arc — how a station becomes a moment

```js
ARC: { lo:18, hi:52, exp:1.6 }
arcAt(i) = lo + (hi-lo) * ( 0.5 - 0.5*cos( 2π*(i + WORLD.phase) / 12 ) ) ^ 1.6
loudness(i) = normalised 0..1 across the twelve
```

Every station gets a target mean luminance. `loudness(i)` then drives that station's form **sizes**
and **alphas**, so quiet stations are genuinely quiet and two or three are genuinely loud.

The `1.6` exponent is what makes most stations quiet and only a few loud — the numerical form of
"some panes nearly empty so the others can land." `WORLD.phase` rotates where the crest falls, so two
worlds with the same arc still feel different.

world-06's twelve panes spanned **1.097×** in mean luma and **1.03×** in chroma. Twelve different
objects that all read identically. Target span is **2.2–4.0×**; world-07 measures **2.89×**.

There is also a "no flat neighbours" rule — rank the twelve by luma, and at least 8 of the 12
adjacent steps must differ by ≥ 2 ranks. world-07 scores 10/12. See §8 for where it still falls down.

---

## 6. Content authoring, per layer

**`far`** — slow and wide. Dense small star field plus six wide soft washes across the period. Because
far only advances 480px per turn, its content changes slowly; that is what "far" means. A wash spans
several stations.

**`mid`** — the composition layer, and the only one with per-station authorship:

```
for each station i:
  headline form   576–880px longest edge, alpha 0.34–0.55, both scaled by loudness(i)
  companion form  230–420px, opposite band, different primitive
  detail specks   1–4 of them, 58–154px, count follows loudness(i)
  all placed inside the frame x ∈ [i*1920, (i+1)*1920)
```

The companion exists because a single object in an empty frame does not read as a *place*. Ben's
words: *"every PANE has stars and such — it's the concept of showing the guests we're in a WORLD."*

**`near`** — fast and anonymous. Larger, brighter, sparser stars at 1.5× size. This is the layer that
sells the turn, and it carries no compositional duty, which is what lets it use `m:3`.

**`sky`** — almost bare. A single radial base. world-06 put a fixed corner haze here that contributed
**84% as much frame luminance as all twelve panes of content combined**, identically on every pane —
the precise opposite of "each pane is a different place."

### Placement grammar

```js
bandY(r, h)   // upper band above the safe box, or lower band below it — never inside
```

Solid forms stay out of the centre **60% × 44%** box. Atmosphere may cross it. The box is declared
once in `ENGINE.SAFE` as fractions and every pixel form is derived from it — the repo previously had
44% in code and 45% in the design law, which is exactly the kind of split that rots.

---

## 7. The primitive set

A world picks a primitive and a hue. It **may not invent a shape.**

| primitive | structure | guarantees its hard edge via |
|---|---|---|
| `blob` | 3 offset radial lobes | a mandatory rim arc on one side |
| `dots` | 26–48 points, `pow(r,0.55)` radial distribution | points are inherently hard |
| `spikes` | hot core + 6 radial spikes | the core and the spikes |
| `lens` | flattened disc + dust lane | the lane and the core |
| `streak` | tapering tail + head | the head |
| `ribbon` | long tapered form | a mandatory rim |

Each primitive **structurally** guarantees at least one near-hard edge, which turns the design law's
"all-soft = mush, all-hard = clip-art" from a thing a reviewer has to catch into a thing that cannot
happen. That is the pattern worth copying everywhere: *a convention that holds is one turned into
arithmetic, not judgment.*

Colour is `hsla(hue, …)` driven off one `hue` number per station, so hue-window rules are checkable
by reading the data rather than by sampling pixels.

---

## 8. Known defects and tweaks — structure is fine, these are not

1. **The turn-12 wrap is untested.** It jumps rather than animates on the assumption the jump is
   invisible. Nobody has watched it. Highest-priority thing to look at.
2. **Stations 6, 7, 8 all sit at brightness 18** — a quarter of the ring reads identical, which is
   the very defect the arc exists to prevent. Fix: add a seeded ±10–16% jitter inside `arcAt()`, then
   re-verify span stays in 2.2–4.0 and no-flat-neighbours stays ≥ 8.
3. **1,464 star nodes each running an opacity animation**, extrapolated from Sonora's 22 and never
   profiled. Target hardware is a **MacBook driving an HDMI splitter to 3 TVs** — not a low-power
   stick, despite what earlier notes in this repo claim. Profile before trusting.
4. **Nothing has been rendered.** No claim about how any of this looks is worth anything yet.
5. `formTotal` counts nodes appended, not distinct forms — cosmetic, but the status line overstates.

---

## 9. What this can absorb from the repo

The scaffold currently reimplements several things the app already does properly. Folding these in is
most of the path from prototype to production.

| Already in the repo | What the scaffold does now | Action |
|---|---|---|
| `client/src/lib/autoFitText.js` | a hand-ported copy of the binary-search fit | import the real one; delete the copy |
| `client/src/lib/easings.js` — 5 named curves, the only legal ones | an inline `cubic-bezier(.16,.62,.28,1)` | either adopt a named curve or add this one to `easings.js` in the same commit |
| `client/src/lib/colorTint.js` `deriveTint()` | raw `hsla()` from a literal hue | route field colours through `tint()` so per-show highlight overrides work; leave hot near-white cores literal (sanctioned exception) |
| `client/src/themes/` — 21 palettes | a hardcoded `WORLD.sky` array | derive base and field colours from the theme; a generator should never hand-pick a hex |
| `ParticleBackground.jsx` ambient block pattern | a standalone HTML page | adopt the packaging: prefixed palette const, prefixed keyframes injected via `<style>{XX_STYLE}</style>`, prefixed sub-components, reduced-motion guard, **no own vignette** (ParticleBackground adds the theme `Vignette` after), exported name kept so `AMBIENT_MAP` resolves |
| `ParticleBackground` mounts once outside `AnimatePresence`, never re-mounts | n/a | the station index must arrive as a CSS custom property on the root or a ref-driven update — **never as a React prop that could remount the background** |
| `GlowLayer`, `PulseDot`, shared `ambient*` keyframes | own glow implementations | reuse; never modify the shared helpers, other ambients depend on them |
| `.claude/hooks/geometry-lint.mjs`, `design-done-gate.mjs` | nothing | the gate should extend these, not run beside them |
| `concepts/QUEUE.md`, `LESSONS.md` (10-cap, fold-to-conventions) | untracked prototypes | every world build gets a queue entry; the five that failed were tracked nowhere |
| `SbStars` in `ParticleBackground.jsx` (~line 1000) | matched behaviourally | this is the named quality bar for twinkle: every star animates, `lo` 0.25 → `hi` 0.85, 5–13s, negative delay |
| `StageFrame` at `STAGE_SCALE 0.85`, `container-type: size` | ignores the stage boundary | the ambient sits full-viewport *behind* the frame; confirm the safe box maths still holds once framed |
| `shinyGold.js` fixed gold | n/a | the shiny signal is a sanctioned literal and must not be tinted |

**Delivery shape:** one engine component plus one plain-data ES module per theme, at
`client/src/worlds/*.world.js` — not 21 generated JSX blocks. The engine is written once; a world is
data. That is the whole point of the split.

---

## 10. The engine / world split

Everything in `ENGINE` is identical for all 21 themes. A world sets none of it.

Everything in `WORLD` is what a generator emits:

```js
WORLD = {
  id, type,            // type ∈ space | terrestrial | aquatic | aerial | interior
  name, phase,         // phase rotates where the brightness crest falls
  sky: [4 stops],      // should become theme-derived
  qColours: [2],
  stations: [ 12 × { key, prim, hue, accent } ]
}
```

`key` is the nameable thing — it must survive the noun test at 15 feet. `prim` is one of the six
primitives. `hue` drives all colour for that station. `accent` marks the ≤ 3 stations allowed the one
complementary hue; one deliberate opposite makes a world feel authored, five unrelated hues across
300° is noise.

**World type is a required field and it is not decoration.** It decides rules that are *opposite*
between types: a space world **bans** vertical gradients (a vertical ramp always implies a horizon —
that is how an earlier build silently grew ridges and a glow band nobody asked for), while a
terrestrial world **requires** one. The absence of this field is the actual root cause of that
failure; the terrain was only the symptom.

**If a new world needs an engine change, either the schema is missing a field or the thing is really
a round journey.** Say which. Do not fork the engine.

---

## 11. What still has to be built

**The verification gate.** Loads a world, drives all 12 stations deterministically, captures each,
reads the console, and checks the measurable rules with numbers attached. Its absence is the direct
cause of five failed rounds. Note the rule that would have caught every one of them already existed —
"watch it render" — but was scoped to the nightly pipeline, so it never fired on a prototype. **Scope
it to work, not to a pipeline.**

**The generator agent.** Theme name in, a `*.world.js` out that passes `validateWorld` and then passes
the gate. The hard part is the design-vein problem: naive templating gives 21 recolours of one file,
free rein gives 21 unrelated looks. It needs a **Noun Atlas** — space has nebulae and comets, Autumn
Harvest does not — mapping each theme to the nouns that belong in it and the primitive each maps onto.

---

## 12. Reference material

In the Cowork outputs folder:

| File | What it is |
|---|---|
| `FAILURE-LEDGER.md` | 18 dead approaches plus the process failures. **Read before proposing anything.** |
| `S1-art-direction.md` | Measured critique of world-06 and the full visual spec; `[auto]` items are gate-checkable |
| `S2-engine.md` + `s2-world-engine.js` | The engine contract; `validateWorld` is the acceptance test |
| `DRAFT-world-scaffold.md` | Engine + content contract, including the world-type table |
| `TT-02-doctrine-audit.md` | Why this repo's docs rotted — 24 contradictions, 8 named mechanisms |
| `SCAFFOLD-TEAM-BRIEF.md` | Full context and house law |
