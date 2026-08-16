# references/themes.md — Theme System + Ambient Recipe

**Read before:** adding or reworking a theme, modifying `ParticleBackground.jsx`, changing theme colors, working on the theme picker, any ambient animation work.

---

## ⚠️ Three ambient systems now (July 2026 rework + Aug 2026 ring mount)

The 21 themes split into three rendering paths:
- **8 BESPOKE** (keep their hand-built ambient scene, governed by The Law / Recipe / gate below): `pure-michigan`, `autumn-harvest`, `sunset-boulevard`, `sand-dune-chill`, `halloween`, `sonora-balloons`, `under-the-sea`, `meteor-shower`.
- **1 RING** (renders the `RingAmbient` engine from a `worldData` module): `midnight-galaxy`.
- **12 GRADIENT** (bespoke scene retired, render the shared `BreathingGradient` engine): `medieval-tavern`, `dive-bar`, `drive-in-movie`, `wine-cellar`, `eighties-night`, `retro-arcade`, `firefly-summer`, `jazz-club`, `neon-tokyo`, `western-showdown`, `northern-lights`, `christmas-eve`.

**The Law / Recipe / Acceptance Gate / motion vocabulary in this doc apply to the 8 bespoke themes only.** The 12 gradient themes have no scene to build — they get their identity from the breathing gradient + question styling + hero animations (team intro, PYL). Ring themes are governed by the ring-world docs instead (see below).

### BreathingGradient engine
`client/src/components/display/BreathingGradient.jsx` — WAAPI 5-layer breathing gradient. Draws from `theme.colors` (bg/bgDeep = base wash, accent = mid glow bodies, highlight = highlight glow). One `mood` prop (`calm`/`warm`/`electric`) sets breath speed + spread. NO angle rotation — stop-shift + intensity pulse only. Always-present, the only continuous layer. Per-keyframe `ease-in-out` (NOT options-level — options-level puts peak velocity at the opacity crest and throbs). Test route: `/gradient`.

Routing lives in `ParticleBackground.jsx` and is a **three-way branch** over three sibling registries — `GRADIENT_MOODS` (12 ids → mood), `RING_WORLDS` (ring ids → worldData module), `AMBIENT_MAP` (8 ids → bespoke component). Render is `gradientMood ? <BreathingGradient palette={theme.colors} mood={gradientMood}/> : ringWorld ? <RingAmbient worldData={ringWorld} slideKey={slideKey}/> : AmbientComponent && <AmbientComponent tint={tint}/>`. Gradient wins first, ring second, bespoke last; a theme id must appear in at most one registry (a dev-only `console.warn` at module load flags any overlap). Moods: calm = wine-cellar/drive-in-movie/medieval-tavern/western-showdown/firefly-summer; warm = dive-bar/jazz-club/christmas-eve; electric = retro-arcade/eighties-night/neon-tokyo/northern-lights.

### Ring-world engine
`client/src/components/display/RingAmbient.jsx` — canvas-free DOM ring renderer driven by a `worldData` module in `client/src/worlds/*.ring.js` (currently only `midnightGalaxy.ring.js`). Takes `{ worldData, slideKey }`: it builds once on mount, then advances one station per *question* via its internal `turn()` whenever `slideKey` changes to a new distinct value (`undefined`/`null` = no real question yet, no turn). Adding a world is **one import + one `RING_WORLDS` entry** in `ParticleBackground.jsx` — provided the new world reuses the shared frame geometry: `ENGINE` (frame size, layer config, `SURGE_MS`) is module-scoped inside `RingAmbient.jsx`, not derived per-world, so a world that needs *different* geometry is a real change to `RingAmbient.jsx`, not a registry line. Full rules live in the `ring-world-continuity` skill + `concepts/`.

**Ring worlds are palette-fixed by design.** They render their own fixed palette (per-station hues) from the worldData module and take no `tint`, so a host's per-show highlight/accent override does **not** retint a ring theme's ambient — it did with the old bespoke midnight-galaxy component, and that is an accepted trade-off of the Aug 2026 swap, not a bug. Threading `theme.colors` into ring rendering is a possible future task; it is not done here.

### Fixed-gold shiny signal
Shiny question/title = **FIXED GOLD** `#f0d890` fill / `#d4820c` glow, constant across ALL themes (gold IS the shiny signal — not per-theme `shinyAccent` anymore). Plain question = theme text color. State of the Union = **fixed red-white-blue**, ignores `theme.colors`. The `grid` slide (Color Schemes) uses this fixed gold for its glow / ✨ badge / column-number chips.

The gold constants live in **`client/src/lib/shinyGold.js`** (`SHINY_GOLD` fill / `SHINY_GOLD_GLOW` glow) — imported by every shiny-signal surface (ShinyIntroScreen, GridSlide, QuestionSlide, WaveformBars, PixelateSeriesSlide stage dots). Don't re-hardcode `#f0d890`/`#d4820c` or read `theme.colors.shinyAccent` for a shiny signal. `shinyAccent` still ships per-theme but is now a *semantic orphan for shiny purposes*: it survives only as the overlay picker's **"Theme Pop"** color (backward-compat for saved overlays that reference it by name) and as decorative flavor on non-shiny slides (scoreboard leader highlight, PYL reveal accents). The host-reachable shiny signal in overlays is the fixed **`gold`** token (also → `shinyGold.js`).

### Gotcha — opacity flash
Gradient themes + the grid slide carry `isShiny`/fixed-design, so they need `SlideRenderer`'s opacity-neutralize special-case (joined `team-picker`/`state-of-union`) or the entrance transition fades them from opacity 0 and flashes the real theme color through for a frame.

---

## The Law (the governing spine)

**Anchor + drifter + atmosphere — center kept open.**

Every theme must have:
1. **A named focal ANCHOR** — one defined element you can point at and say what it is (the sun, the hearth, the neon sign, the moon). Not a vague glow.
2. **At least one trackable DRIFTER** — something that actually *moves* and the eye can follow (drift across, fall, rise, wander). Breathing-opacity gradients do not count.
3. **ATMOSPHERE** — the layered color washes and near-invisible accents that set the world.

…with the **center of the screen left open** for the question text.

**Canonical exemplars (the bar to match):** `autumn-harvest`, `pure-michigan`, `sonora-balloons`. Study them before building. What they share: a warm focal anchor plus discrete, trackable, in-family motion over layered glows. (Corrected 2026-07-26 — this line previously named `firefly-summer`, which the "Two ambient systems" section above already correctly lists as a retired-bespoke GRADIENT theme with no scene of its own. The two contradicted each other; this line was stale.)

**The failure mode (what "bland" means here):** a pure breathing-gradient wash with no anchor and nothing to track. At 10 ft a pulsing gradient reads as a flat color field — there's nothing for the eye to lock onto. Most of the un-reworked themes fail this way; that is the whole point of the bland-pass.

---

## Theme Shape

All themes are defined in `client/src/themes/index.js`. Use `getTheme(id)`.

```js
{
  id: 'midnight-galaxy',
  name: 'Midnight Galaxy',
  colors: {
    bg:          '#08001a',   // slide background (base wash)
    bgDeep:      '#040010',   // question slide background (darker)
    accent:      '#4a1a8f',   // mid glow bodies, bars
    highlight:   '#c060ff',   // focal anchor + brightest glints, titles, key text
    text:        '#e8d0ff',   // body text
    textMuted:   '#8050b0',   // watermark, secondary text
    shinyBg:     '#120030',
    shinyAccent: '#ff40a0',
  },
  vignette: { r: 0, g: 0, b: 3, strength: 0.60 },
}
```

Theme changes happen via Supabase UPDATE on `shows.theme_id`. All subscribers re-render via `useTheme()`. No Socket.io.

### Color sourcing (in-family rule)

Ambient layers must draw from the theme's own `colors`:

| Layer | Sources from |
|-------|--------------|
| Base wash | `bg` / `bgDeep` |
| Mid glow bodies (the drifters, washes) | `accent` |
| Focal anchor + brightest glints | `highlight` |

Every ambient hue must sit inside the **`accent` → `highlight`** family. The permitted out-of-family colors are exactly two, both *tonal* rather than hue:
- a **hot near-white core at the anchor itself** (a sun's white center, a candle flame), and
- a **dark silhouette drifter** (distant birds, bats) — near-black, the dark twin of the anchor-core exception. Use only when the silhouette is genuinely part of the world (e.g. `sand-dune-chill`'s gulls).

Test: eyedrop any ambient layer — if its hue is outside accent→highlight and it isn't the anchor core or a sanctioned silhouette, it fails.

### Live highlight override (tint function)

Ambients no longer hand-hardcode dead hex values. Each `AmbientComponent` receives a `tint(originalColorStr)`
function as a prop from `ParticleBackground.jsx` (`client/src/lib/colorTint.js`'s `deriveTint`, anchored
on the theme's `highlight` color). Call `tint('#f5a623')` (or with an `rgba(...)` string, alpha preserved)
on every in-family hue color in the component — this reproduces the original hand-tuned color exactly when
no per-show override is active, and shifts the whole family cohesively (same hue delta, same
saturation/lightness scale) when a host overrides the show's highlight color from `ThemePickerModal.jsx`'s
Customize row. **Do not wrap sanctioned exceptions** (hot near-white cores, dark silhouette drifters) in
`tint()` — those are intentionally hue-agnostic and must stay literal. There is no `accent`-anchor option —
an earlier version exposed one, but it was numerically unstable (accent colors are usually very dark
washes, so the lightness-scale ratio blows up) and every one of the 21 themes anchored on highlight anyway,
so it was removed.

### No copyrighted IP

Original forms only. No trademarked characters, sprites, logos, or licensed art — these run on commercial
TVs in front of paying guests. Design your own critter (e.g. the 8-bit apple, not Pac-Man).

---

## The Recipe (build order)

1. **Atmosphere (3 layers).** Build the world first:
   - *Base* — slow foundational wash from `bg`/`bgDeep`, 10–25s loop.
   - *Mid* — the signature wash/glow bodies from `accent`, 6–18s.
   - *Accent* — near-invisible detail (0.04–0.08 over the floor), 12–25s, rewards close attention.
2. **Anchor.** Add one defined focal element from `highlight` (+ optional near-white core). It must read as *what it is*. Place it **outside the safe-area** (low, high, or to a side). **Edge control:** the anchor carries the composition's *one* near-hard edge — defined enough to read as a sun / moon / sign; everything else (washes, drifters, glows) stays soft and fades to transparent. All-hard reads as clip-art; all-soft reads as mush. Both fail. **Pull the anchor *off* the stage frame** (never let the edge clip it) and let its **rim dissolve to transparent** by ~75% radius rather than ending on a hard semi-opaque ring — a hard ring reads as a sticker.
3. **Drifter(s).** Add ≥1 trackable moving element (drift / fall / rise / wander), in-family. Focal-tier motion lives or passes **outside the safe-area**.
4. **Motion register.** Name the world's felt state → its physical analogue → `breathe`/`flicker`/`buzz` + timing (table below).
5. **Keep the center open.** Verify against the safe-area.
6. **Hero beat (adopted 2026-07-26, corrected same day).** Every ~3-5
   minutes, the anchor or a drifter gets one brief (~3-6s) heightened
   moment — brighter flare, an extra drifter crossing, a bigger version of
   its normal motion — then returns cleanly to baseline. This is the
   ambient system's answer to "give it some story/personality." **Flagged
   and fixed the same day it was proposed: a hero beat is, structurally,
   the exact same low-duty-cycle bet that just got round-journeys demoted
   (roughly the same single-digit-percent duty cycle), described in the
   same "give it story/personality" language that produced the swing.**
   Adopting it anyway, on these non-negotiable terms, because it's built
   into the always-on layer instead of replacing it — but it only counts as
   that, not a relapse, if every one of these four checks is real, not
   just a sentence:
   - **Shipped-state gate.** The theme must pass all seven Acceptance Gate
     rows with the hero-beat parameter **switched off**. The off state is
     the actual shipped artifact; the beat is provably a bonus layered on
     top of something already complete, never a component the theme needs
     to read correctly.
   - **Zero new elements.** The elevated state may only change existing
     parameters (scale, opacity, speed, count) on things the baseline
     state already renders. It may not introduce a new component, a new
     keyframe, or — most importantly — any new figurative element. A hero
     beat that adds a pictorial object is a noun-test violation like any
     other; 1a's ambient branch (cut or abstract-ify) applies to it exactly
     as much as to the base design.
   - **Peak-state safe-area check.** Gate #3 (safe-area) is normally
     checked against static coordinates. That check is blind to a 4-second
     flare by construction. The hero beat must be re-checked against the
     safe-area at its **peak** elevated moment specifically, not just at
     baseline.
   - **Decoupled timer.** The interval is wall-clock and free-running,
     with no dependency on round/slide state. If it ever gets tied to round
     boundaries "since that's a natural moment," it has quietly become an
     unauthorized, ungated round-journey and must go through that system's
     own rules instead, including the go/no-go test in
     `concepts/ROUND-JOURNEY-FLAGSHIP-MECHANISM.md`.

---

## Center Safe-Area (hard constraint)

The box where the question text lives: **middle 60% width (20–80%) × middle 45% height (28–72%).**

- **Atmosphere may pass behind it freely** — base color washes, low-opacity accent, subtle ambient motion are fine under the text.
- **No focal-tier element is centered inside it** — not the anchor, not the primary drifters, not any high-energy motion (flicker / buzz / fast neon). Those live low, high, or to the sides.
- Nothing inside the box peaks bright enough to compete with the text.

One-line test: *would a 10-ft viewer's eye get pulled off the centered question?* If a focal or high-energy element sits in the box → fail. (This is exactly why the sunset sun went hard-left and its waves sit at the bottom.)

---

## Motion vocabulary

**Name the feeling first.** Find the world's felt state, pick its physical analogue, and let *that* choose the easing + timing — not the reverse.

| Felt state | Physical analogue | Register | Timing / curve |
|---|---|---|---|
| Calm / contemplative (lakes, cellars, deep space, sunsets) | still water breathing, held exhale | slow `breathe` + drift | breathe 15–25s, drift up to ~60s, gentle `ease-in-out` |
| Warm / analog (tavern, jazz, wine-cellar) | candle flame, hearth | organic `flicker` | 2–4s, irregular |
| Electric / synthetic (arcade, neon-tokyo, dive-bar, 80s) | buzzing neon tube, CRT | fast `buzz` | 1.3–2.5s, near-stepped |
| Weather / particle (snow, leaves, embers, rain) | falling / swinging particles | fall / rise | tuned per type, `cubic-bezier(0.77,0,0.175,1)` |

Two hard rules over everything (emil):
- **No pop-in.** Everything fades in/out via opacity. Nothing scales from `0` (start ≥`0.5` if it must scale) and nothing color-appears in place — slide/fade it in instead.
- **No weak `ease-in`** on entrances. `ease-out` / `ease-in-out` with the strong curves below.

**Reuse the existing keyframe set.** Add a *new* keyframe only when a signature genuinely demands one (e.g. `ambientWave` for the sunset water glints). A new keyframe means the commit touches both `KEYFRAMES` and the component — still one theme, one commit.

### Reference values (calibrated for TV at bar distance)

| Layer | Alpha range |
|-------|-------------|
| Background radial/gradient | 0.28–0.55 |
| GlowLayer floor `--lo` | 0.12–0.25 |
| GlowLayer ceiling `--hi` | 0.40–0.70 |
| Particle / dot elements | 0.70–0.95 |
| Star field (per star) | 0.25–0.55 |

**Never** drop a glow layer below 0.25 — invisible at TV distance in a dark bar. (The pre-2026 system used 0.03–0.13; all themes were rewritten in the June 2026 audit.)

Timing floors: ambient breathe never < 8s (loop seam shows); use prime-number staggers between layers to prevent sync. Flicker 2–4s (organic, not seizure-inducing). Neon buzz 1.3–2.5s (fast is correct for electrical).

**GlowLayer / Vignette / keyframes** — primitives unchanged. Available keyframes in `ParticleBackground.jsx` today (15): `ambientBreathe`, `ambientFlicker`, `ambientNeonBuzz`, `ambientFallSlow`, `ambientLeafFall`, `ambientRiseUp`, `ambientBubbleRise`, `ambientPulseIn`, `ambientFireflyWander`, `ambientDriftAcross`, `ambientAuroraFade`, `ambientMeteor`, `ambientScanline`, `ambientWave` (soft drifting water-light, shipped with `sunset-boulevard`), `ambientGullBob` (vertical soar for silhouette drifters, shipped with `sand-dune-chill`). All animate **only** `transform` / `opacity`; every keyframe has a `prefers-reduced-motion` branch that wins.

The 12 retired bespoke scenes deleted ~1596 lines from `ParticleBackground.jsx` (commit `40decb7`) — some keyframes above may now be unused by any theme; grep before assuming a keyframe is live.

---

## Acceptance Gate

A theme ships only when all seven pass. Each is tagged for who judges it.

| # | Check | Owner |
|---|-------|-------|
| 1 | **Anchor** — a named focal element exists | `[auto]` exists in code · `[eyes]` reads as what it is |
| 2 | **Drifter** — a real translate, not just breathe | `[auto]` |
| 3 | **Safe-area** — no focal-tier element centered in the 60%×45% box | `[auto]` coords outside box · `[eyes]` legible at 10 ft |
| 4 | **In-family color** — hues in `accent`→`highlight`; near-white only at the anchor core; dark silhouette drifters exempt (tonal, not hue) | `[auto]` |
| 5 | **Motion matches world** — tempo fits the register; no pop-in; no weak `ease-in` | `[auto]` no pop-in/ease-in · `[eyes]` feel |
| 6 | **GPU-only + reduced-motion** — transform/opacity only, `reduce` branch wins | `[auto]` |
| 7 | **Distinct at thumbnail** — identifiable without the title, not a near-twin of another theme | `[eyes]` |

**Rule:** Claude self-gates every `[auto]` check against the actual code *before* presenting a prototype, and never presents something that fails one. Ben owns the `[eyes]` checks (feel, distance, distinctiveness) and the ship/commit decision. **Claude never self-certifies a commit.**

### Three cheap eye-tests (how to run the `[eyes]` checks)

Adapted from gestalt + isolation for TV-at-bar-distance:

1. **Squint / figure-ground** (gate #3). Blur your eyes, or shrink to thumbnail. The question text must still read as the clear *figure* against the ambient *ground*. **Ambient is always ground — never let it become figure.** If the brightest mid-layer activity competes with the center, push it to the edges.
2. **Grayscale** (gate #7). Desaturate the whole stage. The signature must still be identifiable by its *motion and shape*, not its hue. If a theme is only recognizable by color, the signature isn't doing its job.
3. **Isolation discipline** (gate #5/#7). Keep base + accent quiet and homogeneous so the focal tier pops; if all layers compete, none reads. But resist *isolation inflation* — not every theme is max-drama. Calm themes (`pure-michigan`, `firefly-summer`) earn identity by restraint.

---

## Ambient Animation Architecture (constraints)

**File:** `client/src/components/display/ParticleBackground.jsx`

1. **Light, not clip-art.** Ambient is built from color gradients, glow layers, and CSS `@keyframes`. A defined **anchor** may be a glowing form (a soft-edged sun disc, soft SVG aurora curtains) when legibility demands it — kept soft, reading as *light*. Still no hard pictorial icons, characters, or objects. **This refines SKILL.md §7's blanket "no shapes / no SVG / no box-shadow" — `northern-lights` already ships soft SVG curtains and the anchor disc uses a *static* `box-shadow` glow. The real rule is *no clip-art*, not *no defined light forms*. Keep SKILL.md §7 in sync with this.**
1a. **The noun test (adopted 2026-07-26, corrected same day, not waivable
by a future spec).** Before any element is coded, classify it: would a
guest at 20 feet identify it by its contour or its joints (a swing, a rope,
a specific animal, a vehicle)? That's **figurative**. What happens next
depends on which system this is for — **this split is itself the fix for a
real gap found in the first version of this rule**, which said "generate
it" unconditionally and would have let a future builder re-ship Firefly
Summer's exact failure through a newly-sanctioned door:

- **In a round-journey** (full-stage, no safe-area, more pictorial license
  by design): generate the figurative element and confirm, alone, that it
  reads as its noun before it enters any scene.
- **In an ambient theme, a fully pictorial figurative scene is allowed —
  resolved 2026-07-27, Ben's ruling — but only by genuinely clearing both
  design-critic gates, never by placing it and hoping.** This bullet
  previously said "never" outright; that was written before whole-scene
  Recraft reference images and the dual correctness+quality critic gate
  existed, and it does not survive contact with either. The rule that
  actually still binds is rule 2 above ("light, not clip-art") in its literal
  form: no hard register mismatch, no clip-art-flat icon dropped into an
  otherwise-soft scene, no element that reads as pasted rather than drawn by
  the same hand as everything around it. A pictorial idea in an ambient
  brief is still cut, or restated as an abstract light form, whenever it
  can't clear that bar — those remain valid, correct outcomes, not just a
  fallback. What changed is that "fully pictorial and it clears the bar" is
  now also a valid outcome, where before it was foreclosed outright. See
  `concepts/OBJECT-RENDERING-PROTOCOL.md`'s addendum for the full reasoning
  and `concepts/design-pipeline-hardening-fix.md` for why the gate itself
  has to be trustworthy before this policy is safe to lean on.

Fully describable in one sentence of pure geometry (a disc, a beam, a
glowing dot, a flat gradient)? That's **iconic** in either system — hand-
code it. A hand-coded figurative element (round-journey only) that fails a
fresh visual read twice escalates to generated art immediately; a third
hand-coded attempt on the same element is a spec violation. Any generated
sprite (round-journey only) gets a **normalization pass** before use — its
palette clamped to the scene's existing hex values, one line weight, one
light direction, flat (non-photoreal) shading — and a **bail-out rule**: if
it can't be reliably clamped, drop generation for that element and
hand-author it instead; never ship "close enough." Don't over-correct
toward flawless, either — gradients/detail that are too smooth or
symmetrical are their own tell; keep deliberate, hand-authored imperfection
in the flat-vector layer. **No spec may waive any of this** — Firefly
Summer's actual failure was a written waiver of this exact family of rule,
not a wrong pipeline. Full background and worked examples:
`concepts/OBJECT-RENDERING-PROTOCOL.md`.
2. **GPU-only.** Every `@keyframes` animates only `transform` / `opacity`. Never `width`, `height`, `background-position`, `color`, `box-shadow`, `filter`, or any layout property. (Static `filter`/`box-shadow` for softness is fine; just don't animate them.)
3. **Locked background.** `<ParticleBackground>` never re-mounts on slide changes; it persists for the session.
4. **Pure CSS is the default — no React state driving continuous motion.** All *frame-by-frame* motion is `@keyframes`, not `rAF`. (`useMemo` for static element arrays is fine.) **Sanctioned exception, narrow:** a component may use `useState`/`useEffect` solely to re-roll random placement/timing on a natural loop boundary (an `animationiteration` event, or a self-scheduled timer) — never for continuous per-frame updates — so the `prefers-reduced-motion` guard can freeze it in place without a visible teleport/jump. Two real implementations exist, both acceptable: `SbMote` (sonora-balloons) mutates a DOM node directly via a ref inside its `animationiteration` listener, never triggering React re-render; `MeteorShowerStreak` (meteor-shower) instead calls a plain `useState` setter on the same kind of loop boundary, which *does* re-render — both are fine, the constraint is about avoiding rAF-driven continuous re-renders, not state itself. Read the reduced-motion comment at both before assuming a third exception is safe. (midnight-galaxy's `NebulaBloomer`/`GalaxySatellite` were a third and fourth case until 2026-08-14, when the theme moved to the ring-world renderer and they were deleted.)
5. **Self-contained.** Each ambient component owns its layers and its `Vignette`.
6. **Seamless zones — no banded rectangles (the #1 recurring offense).** Every vertical zone (sky, sea, sand, ground) is a **full-stage layer** (`position: absolute; inset: 0`) whose gradient is **transparent at *both* transitions** — it fades in *and* fades out. **Never** a rectangle parked at a fixed height (`top: X% / height: Y%`): its top and bottom edges read as **hard horizontal lines** at TV distance, which Ben rejects every time. Horizons and shorelines are soft gradient *blends*, not edges. Foreground ground (sand, etc.) is a **flat full-stage gradient**, not a mound/shape — Ben's call after testing both side by side.

   Two shapes for a zone:
   - **Flat (default / seamless):** `linear-gradient(to top, …, transparent)` over `inset:0`, soft at both ends — the baseline for skies, seas, sand, ground.
   - **Rounded dome (dimensional option):** `radial-gradient(ellipse W% H% at 50% 100%)` anchored bottom-center, so the glow rises as a mound and its shoulders curve down into the corners — more depth than a flat shelf. First used on the 80s-night neon floor (`ellipse 72% 49%`; flatter reads as a broad dance floor).
     - **Carry color to the edges:** a lone centered dome fades the corners to black (rejected). Layer a wide low base ellipse under it — `radial-gradient(ellipse 135% 32% at 50% 105%, …)` — so color still reaches the corners while the center rises.
     - **Curve the light, keep the ground flat:** dome a glow / light pool (dance floor, horizon bloom); keep literal terrain (sand, ground) a flat gradient — a raised terrain mound reads as a weird hill (rejected on the sunset beach).

`ParticleBackground` takes `{ theme, slideKey }`. For the 12 gradient themes it renders `<BreathingGradient>`; for a ring theme it renders `<RingAmbient>` with that theme's worldData plus `slideKey`; for the 8 bespoke themes it looks up `AMBIENT_MAP[theme.id]` (see the rework section at top). Components render under one `absolute inset-0` wrapper.

---

## The Themes (8 bespoke + 1 ring + 12 gradient)

Defined in `themes/index.js`, in this order:

| Theme ID | Path | Character | Signature anchor |
|----------|------|-----------|------------------|
| `pure-michigan` ★ | Bespoke | Dark lake night | Green firefly pulse dots over lake glow |
| `midnight-galaxy` | Ring | Deep space | `RingAmbient` + `midnightGalaxy.ring.js` — orbital ring world, advances one station per question |
| `autumn-harvest` ★ | Bespoke | Forest fire evening | Falling leaves + embers + hearth flicker |
| `northern-lights` | Gradient | Arctic sky | Wavy SVG aurora curtains |
| `medieval-tavern` | Gradient | Stone tavern | Torch side-glows + hearth flicker |
| `sunset-boulevard` ✓ | Bespoke | Sunset beach | Low-left sun on the sea + drifting underlit clouds + warm sand beach |
| `retro-arcade` | Gradient | CRT arcade | Neon side-glows + scanlines + pixel static |
| `sand-dune-chill` ✓ | Bespoke | Early-AM Lake Michigan | Right-side pale dawn sun + soaring gull silhouettes + warm dune |
| `halloween` ✓ | Bespoke | Jack-o-lantern | Orange edge flicker + purple fog + embers |
| `jazz-club` | Gradient | Smoky stage | 3 sweeping warm-white spotlights over a stage platform + amber glints + smoke/motes |
| `dive-bar` | Gradient | Neon bar | Red + blue neon buzz + haze |
| `sonora-balloons` ✓ | Bespoke | Sunset balloon festival | 5 hot-air balloons drifting over a dusk sky + water horizon + gold dust motes (renamed from Rooftop Party) |
| `christmas-eve` | Gradient | Christmas night | Red/green edges + gold candle + snow |
| `drive-in-movie` | Gradient | Drive-in theater | Huge dominant screen (bright edges, dark flat center for text), 2 support poles, moths wandering in the glow, 2 car-roof silhouettes cresting the bottom |
| `western-showdown` | Gradient | Desert dusk | Sun-on-horizon + dust haze |
| `under-the-sea` ✓ | Bespoke | Bioluminescent deep | Teal pulse dots + bubble rise |
| `neon-tokyo` | Gradient | Tokyo alley | Pink/cyan neon buzz + rain streaks |
| `firefly-summer` | Gradient | Summer night | Yellow-green firefly wander dots |
| `wine-cellar` | Gradient | Stone cellar | Burgundy edge closing in + candle |
| `meteor-shower` ✓ | Bespoke | Clear night sky | Star field + meteor streaks |
| `eighties-night` | Gradient | Retrowave | Pink top + teal bottom + grid lines |

★ = confirmed-good, leave alone. ✓ = bland-pass rework shipped. ⟳ = rework in progress. Unmarked = bland-pass queue. **These markers apply to the 8 BESPOKE themes only** — the 12 GRADIENT themes retired their bespoke scene in the July 2026 rework, and midnight-galaxy moved to the RING path in Aug 2026; neither carries a rework status. See the Path column.

> **Count note:** the pre-audit "29" was wrong — eight themes (`speakeasy`, `solar-flare`, `nebula-dreams`, `vinyl-night`, `haunted-mansion`, `karaoke-night`, `aurora-borealis`, `oktoberfest`) were **merged** into neighbors, not cut. The real count is **21**, sourced from `themes/index.js`.

---

## Rework workflow (bland-pass)

**Applies only to the 9 remaining BESPOKE themes** — the 12 gradient themes are done; no per-theme scene work remains for them.

1. Prototype in a side-by-side **CURRENT vs REWORKED** artifact on a 16:9 stage. (An in-app single-theme preview already exists: `AmbientAudit.jsx` at `/ambient?theme=<id>`, indexed at `/ambient`.)
2. Ben annotates; iterate against the gate.
3. Claude self-gates the `[auto]` checks, hands a **paste-ready single-component swap** for `ParticleBackground.jsx` (+ `KEYFRAMES` if a new keyframe was added, + `themes/index.js` `colors` if the rework changes the theme's identity — see sunset-boulevard).
4. **One theme per commit.** Ben confirms on the live `/display` (the TVs), then commits.

### Port pattern (artifact → ParticleBackground.jsx)

Each ambient is a self-contained block: prefixed palette const, prefixed `rgba` helper, prefixed keyframes
injected via `<style>{XX_STYLE}</style>` inside the component, prefixed sub-components, reduced-motion
guard, and **no own vignette** (`ParticleBackground` adds the theme `Vignette` after). Keep the exported
function name so `AMBIENT_MAP` still resolves. Never touch shared helpers (`GlowLayer`, `PulseDot`, shared
`ambient*` keyframes) — other ambients depend on them.

---

## Hard-Won Fixes (ambient / animation)

Specific bugs, each confirmed by a real repro, not just a plausible-sounding read of the spec. Read before
touching random-variation timing, keyframe holds, parallax depth, tiled scroll loops, feature removal, or
re-diagnosing a symptom that survived a "fixed" bug.

### Reroll-on-animationiteration: the safe pattern for random ambient variation

**2026-07-24, sonora-balloons-depth prototype.** Any element that should periodically change something at
random (position, target distance, content) while looping forever needs three things, each one proven
necessary by a real bug this session:

1. **The keyframe must return to a genuine rest state every iteration.** A `direction:alternate` two-point
   keyframe (`from`/`to`) does NOT do this — its forward and backward halves are separate iterations that
   don't share a common rest instant, so a mid-alternate reroll can snap position. Use a symmetric
   `0%/50%/100%` (or equivalent) keyframe that starts AND ends at rest instead, with plain `infinite` (no
   `alternate`) in the shorthand.
2. **Guard every `animationiteration` listener by `e.animationName`.** The event bubbles from any child
   element's own looping animation up through every ancestor. An element with several nested animated
   layers (breathe/sway/gore-slide inside a drifting wrapper, say) will fire a parent's listener on EVERY
   child's iteration boundary too, not just its own — silently rerolling far more often than intended,
   including mid-flight. `if (e.animationName !== 'yourAnimName') return;` at the top of the handler is
   not optional, even on an element that looks like it only has one animation at a glance.
3. **To change apparent speed without breaking position or a sibling animation, use WAAPI
   `Animation.playbackRate`, never `element.style.animationDuration`.** Changing `duration` on a running
   CSS animation re-maps its already-elapsed time against the new duration and snaps the visible position
   instantly — confirmed via a real headless-Chromium repro (a balloon jumped to 96% of its max drift
   distance the instant duration changed). It's also a single value applied to EVERY comma-separated
   animation on that element, so it silently overwrites an unrelated sibling animation's own duration too.
   `element.getAnimations().find(a => a.animationName === '...').playbackRate = someFactor` changes speed
   from the current instant forward with no position remap, and only touches the one matched Animation
   object. Verify any such fix with a real headless-Chromium repro, not just the spec description — the
   ONLY reason the original `animationDuration` bug was caught was an actual browser test, not a code read.

### Flat holds inside a keyframe (fast transition, real "on"/"off" states)

A symmetric `0%,100%{A} 50%{B}` keyframe is ALWAYS mid-transition — it never actually holds at A or B, just
endlessly ramps between them. For anything that should snap quickly then hold (a filler element fading in,
staying, fading out, staying gone), use **two consecutive keyframe stops with the identical value** to
force a flat segment: `0%,100%{opacity:0} 12%{opacity:1} 45%{opacity:1} 58%{opacity:0}` holds fully visible
from 12% to 45% (identical values at both ends of that span) and fully invisible from 58% back to 100%,
with fast ~12%-of-cycle ramps in between. Standard CSS keyframe interpolation runs segment-by-segment
between consecutive stops — identical endpoint values produce zero change across that segment regardless
of easing function.

### Depth layers need real separation, not just non-overlap

Three-plus parallax layers sharing one small band of screen height (verified-non-overlapping is not the
same as visually distinct) read as one flat mass with the frontmost layer dominating — confirmed this
session when three ridge layers packed into a 4-unit-tall band left the front layer occupying ~70% of the
visible ground while the back two were a barely-visible sliver on top. Give each depth layer its own real
vertical band with an actual gap to its neighbor (not just "doesn't numerically overlap"), sized so each
layer gets a comparable share of the total visible depth stack, not a token peek above the one in front of
it.

### Tile-seam invariants when a scrolling layer gets a second shape variant

A layer that scrolls via two identical tile-copies (seamless because both halves are pixel-identical, so
the loop's instant reset is invisible) breaks that guarantee the moment the two copies stop being identical
— e.g. adding a second bump-layout variant for visual variety. Fix: use 4 copies in an `[A,B,A,B]` pattern
(not 2), double the effective duration to hold the same scroll speed over the now-doubled track width, and
keep the SAME translate keyframe percentages — translating by "one track-half" now moves exactly one full
`A+B` pair, so copy 2 (A) lands exactly where copy 0 (A) started, restoring the original seamless-wrap
guarantee over a longer period. Verify empirically with a capture that actually crosses the new (longer)
wrap boundary — the seamless assumption can look fine in any capture shorter than one full cycle.

### Removing an old feature that's no longer wanted: grep before declaring done

When a feature is cut ("that's a no-no, revert it" / "squash this concept entirely"), a real revert means
the keyframe, the config fields, the wiring in the build function, AND every human-readable mention of it
(on-page notes text, doc comments describing "what this file has") — a stale description sitting right
next to the removed code is exactly the kind of thing that reads as confusing or dishonest to whoever looks
at this file next. Grep the whole file for the feature's name/keyframe/every distinguishing string before
calling a removal complete, not just the code path you touched directly.

### A "fixed" bug can have a second, unrelated cause

A reported symptom ("there's a horizon line") can survive a real, verified fix (a sky-gradient
color-rate outlier) because a SEPARATE, unrelated element was independently producing the same visual
symptom (a leftover water-reflection-glint layer from an earlier version of the file, sitting at roughly
the same screen height). Confirming the diagnosed cause is fixed (rate-of-change math checks out, pixel
scan confirms no artifact at that specific stop) is not the same as confirming the REPORTED symptom is
gone — when it persists after a verified fix, look for an entirely different source at the same location
rather than re-tuning the first fix further.

---

## ThemeCanvas + ThemeForeground

`ThemeCanvas.jsx` and `ThemeForeground.jsx` are wired into the display pipeline but currently have `scene: null` on all 21 themes. Reserved for future 3D/WebGL foreground elements — keep them pass-through until a feature spec exists. Do not add ambient logic to them.
