# references/themes.md — Theme System + Ambient Recipe

**Read before:** adding or reworking a theme, modifying `ParticleBackground.jsx`, changing theme colors, working on the theme picker, any ambient animation work.

---

## ⚠️ Two ambient systems now (July 2026 rework)

The 21 themes split into two rendering paths:
- **9 BESPOKE** (keep their hand-built ambient scene, governed by The Law / Recipe / gate below): `pure-michigan`, `midnight-galaxy`, `autumn-harvest`, `sunset-boulevard`, `sand-dune-chill`, `halloween`, `sonora-balloons`, `under-the-sea`, `meteor-shower`.
- **12 GRADIENT** (bespoke scene retired, render the shared `BreathingGradient` engine): `medieval-tavern`, `dive-bar`, `drive-in-movie`, `wine-cellar`, `eighties-night`, `retro-arcade`, `firefly-summer`, `jazz-club`, `neon-tokyo`, `western-showdown`, `northern-lights`, `christmas-eve`.

**The Law / Recipe / Acceptance Gate / motion vocabulary in this doc apply to the 9 bespoke themes only.** The 12 gradient themes have no scene to build — they get their identity from the breathing gradient + question styling + hero animations (team intro, PYL).

### BreathingGradient engine
`client/src/components/display/BreathingGradient.jsx` — WAAPI 5-layer breathing gradient. Draws from `theme.colors` (bg/bgDeep = base wash, accent = mid glow bodies, highlight = highlight glow). One `mood` prop (`calm`/`warm`/`electric`) sets breath speed + spread. NO angle rotation — stop-shift + intensity pulse only. Always-present, the only continuous layer. Per-keyframe `ease-in-out` (NOT options-level — options-level puts peak velocity at the opacity crest and throbs). Test route: `/gradient`.

Routing lives in `ParticleBackground.jsx`: a `GRADIENT_MOODS` map keys the 12 theme ids → mood. Render is `const gradientMood = GRADIENT_MOODS[theme.id]; gradientMood ? <BreathingGradient palette={theme.colors} mood={gradientMood}/> : AMBIENT_MAP[theme.id]`. Moods: calm = wine-cellar/drive-in-movie/medieval-tavern/western-showdown/firefly-summer; warm = dive-bar/jazz-club/christmas-eve; electric = retro-arcade/eighties-night/neon-tokyo/northern-lights.

### Fixed-gold shiny signal
Shiny question/title = **FIXED GOLD** `#f0d890` fill / `#d4820c` glow, constant across ALL themes (gold IS the shiny signal — not per-theme `shinyAccent` anymore). Plain question = theme text color. State of the Union = **fixed red-white-blue**, ignores `theme.colors`. The `grid` slide (Color Schemes) uses this fixed gold for its glow / ✨ badge / column-number chips.

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

**Canonical exemplars (the bar to match):** `autumn-harvest`, `pure-michigan`, `firefly-summer`. Study them before building. What they share: a warm focal anchor plus discrete, trackable, in-family motion over layered glows.

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
2. **GPU-only.** Every `@keyframes` animates only `transform` / `opacity`. Never `width`, `height`, `background-position`, `color`, `box-shadow`, `filter`, or any layout property. (Static `filter`/`box-shadow` for softness is fine; just don't animate them.)
3. **Locked background.** `<ParticleBackground>` never re-mounts on slide changes; it persists for the session.
4. **Pure CSS, no React state.** Ambient components have zero `useState`/`useEffect`/`rAF`. All motion is `@keyframes`. (`useMemo` for static element arrays is fine.)
5. **Self-contained.** Each ambient component owns its layers and its `Vignette`.
6. **Seamless zones — no banded rectangles (the #1 recurring offense).** Every vertical zone (sky, sea, sand, ground) is a **full-stage layer** (`position: absolute; inset: 0`) whose gradient is **transparent at *both* transitions** — it fades in *and* fades out. **Never** a rectangle parked at a fixed height (`top: X% / height: Y%`): its top and bottom edges read as **hard horizontal lines** at TV distance, which Ben rejects every time. Horizons and shorelines are soft gradient *blends*, not edges. Foreground ground (sand, etc.) is a **flat full-stage gradient**, not a mound/shape — Ben's call after testing both side by side.

   Two shapes for a zone:
   - **Flat (default / seamless):** `linear-gradient(to top, …, transparent)` over `inset:0`, soft at both ends — the baseline for skies, seas, sand, ground.
   - **Rounded dome (dimensional option):** `radial-gradient(ellipse W% H% at 50% 100%)` anchored bottom-center, so the glow rises as a mound and its shoulders curve down into the corners — more depth than a flat shelf. First used on the 80s-night neon floor (`ellipse 72% 49%`; flatter reads as a broad dance floor).
     - **Carry color to the edges:** a lone centered dome fades the corners to black (rejected). Layer a wide low base ellipse under it — `radial-gradient(ellipse 135% 32% at 50% 105%, …)` — so color still reaches the corners while the center rises.
     - **Curve the light, keep the ground flat:** dome a glow / light pool (dance floor, horizon bloom); keep literal terrain (sand, ground) a flat gradient — a raised terrain mound reads as a weird hill (rejected on the sunset beach).

`ParticleBackground` takes `{ theme }`. For the 12 gradient themes it renders `<BreathingGradient>` (see the rework section at top); for the 9 bespoke themes it looks up `AMBIENT_MAP[theme.id]`. Components render under one `absolute inset-0` wrapper.

---

## The Themes (9 bespoke + 12 gradient)

Defined in `themes/index.js`, in this order:

| Theme ID | Path | Character | Signature anchor |
|----------|------|-----------|------------------|
| `pure-michigan` ★ | Bespoke | Dark lake night | Green firefly pulse dots over lake glow |
| `midnight-galaxy` ✓ | Bespoke | Deep space | Purple + magenta nebula clouds + star field |
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

★ = confirmed-good, leave alone. ✓ = bland-pass rework shipped. ⟳ = rework in progress. Unmarked = bland-pass queue. **These markers apply to the 9 BESPOKE themes only** — the 12 GRADIENT themes retired their bespoke scene in the July 2026 rework and carry no rework status; see the Path column.

> **Count note:** the pre-audit "29" was wrong — eight themes (`speakeasy`, `solar-flare`, `nebula-dreams`, `vinyl-night`, `haunted-mansion`, `karaoke-night`, `aurora-borealis`, `oktoberfest`) were **merged** into neighbors, not cut. The real count is **21**, sourced from `themes/index.js`.

---

## Rework workflow (bland-pass)

**Applies only to the 9 remaining BESPOKE themes** — the 12 gradient themes are done; no per-theme scene work remains for them.

1. Prototype in a side-by-side **CURRENT vs REWORKED** artifact on a 16:9 stage. (An in-app single-theme preview already exists: `AmbientAudit.jsx` at `/ambient?theme=<id>`, indexed at `/ambient`.)
2. Ben annotates; iterate against the gate.
3. Claude self-gates the `[auto]` checks, hands a **paste-ready single-component swap** for `ParticleBackground.jsx` (+ `KEYFRAMES` if a new keyframe was added, + `themes/index.js` `colors` if the rework changes the theme's identity — see sunset-boulevard).
4. **One theme per commit.** Ben confirms on the live `/display` (the TVs), then commits.

---

## ThemeCanvas + ThemeForeground

`ThemeCanvas.jsx` and `ThemeForeground.jsx` are wired into the display pipeline but currently have `scene: null` on all 21 themes. Reserved for future 3D/WebGL foreground elements — keep them pass-through until a feature spec exists. Do not add ambient logic to them.
