# references/themes.md — Theme System + Ambient Architecture

**Read before:** adding a new theme, modifying `ParticleBackground.jsx`, changing theme colors, working on the theme picker, any ambient animation work.

---

## Theme Shape

All 29 themes are defined in `client/src/themes/index.js`. Use `getTheme(id)` to access.

```js
{
  id: 'midnight-galaxy',
  name: 'Midnight Galaxy',
  colors: {
    bg:          '#2b1e3e',   // slide background
    bgDeep:      '#1e1530',   // question slide background (darker)
    accent:      '#4a4e8f',   // badge backgrounds, bars
    highlight:   '#a490c2',   // titles, counter, key text
    text:        '#e6e6fa',   // body text
    textMuted:   '#9988bb',   // watermark, secondary text
    shinyBg:     '#3d2060',   // shiny slide background
    shinyAccent: '#c9a0ff',   // shiny slide highlight color
  },
}
```

Theme changes happen via Supabase UPDATE on `shows.theme_id`. All subscribers re-render via `useTheme()`. No Socket.io.

---

## Ambient Animation Architecture

**File:** `client/src/components/display/ParticleBackground.jsx`
**Last full audit:** 2026-06-23 (all 29 themes rewritten/validated)

### The 5 Non-Negotiable Constraints

1. **No shapes or objects.** Ambient uses ONLY color gradients, glow layers, and CSS `@keyframes`. No SVG shapes, no characters, no icons, no pictorial elements.
2. **GPU-only animations.** Every `@keyframes` animates only `transform` and/or `opacity`. Never `width`, `height`, `background-position`, `color`, `box-shadow`, `filter`, or any layout property.
3. **Locked background architecture.** `<ParticleBackground>` never re-mounts on slide changes. It persists for the entire session.
4. **Pure CSS, no React state.** Ambient components have zero `useState`, `useEffect`, or `requestAnimationFrame`. All motion is `@keyframes`.
5. **Self-contained components.** Each ambient component owns its full animation system — all `@keyframes`, all `GlowLayer` instances, the `Vignette`.

### 3-Layer Architecture

Every ambient component must have at least 3 layers:

1. **Base** — slow foundational atmosphere (gradient wash, 10–20s loop)
2. **Mid** — signature animation that makes the theme identifiable at thumbnail scale (aurora bands, firefly dots, neon glow, 6–12s loop)
3. **Accent** — near-invisible detail that rewards close attention (0.04–0.08 opacity, 12–25s loop)

### Opacity Ranges (calibrated for TV at bar distance)

| Layer | Value range |
|-------|-------------|
| Background radial/gradient | 0.28–0.55 alpha |
| GlowLayer `lo` (keyframe floor) | 0.12–0.25 |
| GlowLayer `hi` (keyframe ceiling) | 0.40–0.70 |
| Particle/dot elements | 0.70–0.95 |
| Star field (per star) | 0.25–0.55 |

**Critical:** Never use rgba alpha below 0.25 on glow layers. Values below 0.25 are invisible at TV distance in a dark bar. The old system used 0.03–0.13 — all themes were completely rewritten in the June 2026 audit.

### Timing Ranges

| Animation type | Duration range | Notes |
|----------------|---------------|--------|
| Ambient breathe (base) | 10–25s | Never shorter than 8s — loop seam becomes visible |
| Signature animation (mid) | 6–18s | Use prime-number stagger to prevent sync |
| Aurora curtains | 15–28s | Stagger 6–12s between layers |
| Flicker (torch, candle) | 2–4s | Organic, not seizure-inducing |
| Neon buzz | 1.3–2.5s | Fast is correct for electrical |
| Falling particles | 8–14s | Leaves, snow, confetti |
| Rising particles | 3–9s | Embers, bubbles, dust |

### GlowLayer Primitive

```jsx
<GlowLayer lo={0.25} hi={0.55} duration="12s" delay="3s" style={{
  inset: 0,   // ALWAYS use inset:0 — constrained divs create visible box boundaries
  background: 'radial-gradient(ellipse 60% 70% at 30% 50%, rgba(R,G,B,0.40), transparent)',
}}/>
```

**Rule:** Always use `inset: 0` on GlowLayers. Never constrain with `left/right/top/bottom` unless the gradient explicitly fades to transparent before those edges.

All keyframes use CSS variables `--lo` and `--hi` for the opacity range. Never hardcode opacity values inside keyframes.

### The Vignette System

Each theme gets a `Vignette` component with tinted (never pure black) edge treatment:
- `r`, `g`, `b`: tint toward theme's shadow color
- `strength`: 0.45–0.68 (lower = lighter venue, higher = dark cellar/space)

Applied as: `background: radial-gradient(ellipse at center, transparent 30%, rgba(r,g,b,strength) 100%)`

Examples:
- Warm amber bar: `{ r:4, g:2, b:0, strength:0.55 }`
- Cold space: `{ r:0, g:0, b:3, strength:0.62 }`
- Halloween: `{ r:3, g:0, b:5, strength:0.65 }`

### Flicker vs Buzz vs Breathe

- `flicker`: torch fire, candle, jack-o-lantern — warm analog light sources
- `buzz`: neon signs, CRT, electrical — cool/cold synthetic light
- `breathe` (default): everything else — slow organic pulsing

### Available Keyframes

`ambientBreathe`, `ambientFlicker`, `ambientNeonBuzz`, `ambientFallSlow`, `ambientRiseUp`, `ambientPulseIn`, `ambientDriftAcross`, `ambientAuroraFade`, `ambientMeteor`, `ambientScanline`

### Creative Brief Template (for new themes)

```
Theme: [id]
World: [one sentence — what physical place or feeling]
Bg color: [hex — almost always very dark, #050505–#1a0800 range]
Vignette: { r, g, b, strength }
Signature element: [what makes this unmistakably THIS theme at thumbnail scale]
Base layer: [gradient wash — direction, colors, opacity]
Mid layer: [main animation — describe motion, timing, colors]
Accent: [subtle detail — nearly invisible, rewards close attention]
Distinctiveness test: [how would someone ID this theme without reading the title]
```

---

## The 29 Themes (as of 2026-06-23 audit)

| Theme ID | Character | Signature Element |
|----------|-----------|------------------|
| `pure-michigan` | Dark lake night | Green firefly pulse dots |
| `midnight-galaxy` | Deep space | Large purple + magenta nebula clouds + star field |
| `autumn-harvest` | Forest fire evening | Falling orange/red leaves + hearth glow from below |
| `northern-lights` | Arctic sky | Tight horizontal teal + purple bands at very top |
| `medieval-tavern` | Stone tavern | Orange torch side-glows + hearth flicker center-bottom |
| `sunset-boulevard` | Sunset sky | Horizontal amber/orange gradient top half |
| `retro-arcade` | CRT arcade | Purple left + green right neon + scanlines |
| `sand-dune-chill` | Twilight beach | Warm golden horizon haze + emerging stars |
| `halloween` | Jack-o-lantern | Orange edge glow + purple fog center + ember particles |
| `jazz-club` | Smoky stage | Warm amber spotlight from top center + floor glow |
| `speakeasy` | Art deco bar | Gold center downlight + corner ornaments |
| `dive-bar` | Neon bar | Red left neon + blue right neon (two distinct sign colors) |
| `rooftop-party` | City rooftop | Dense city light dots at very bottom + warm sky glow |
| `solar-flare` | Solar corona | Radiating orange/red edge heat pulse |
| `nebula-dreams` | Pink + teal nebula | Large pink upper-left + large teal lower-right (diagonal) |
| `christmas-eve` | Christmas night | Red left + green right + gold candle center + snowflakes |
| `drive-in-movie` | Movie screen | Pale screen rectangle from bottom + projector beam |
| `vinyl-night` | Turntable room | Warm amber radial pool + subtle record ring circle |
| `western-showdown` | Desert dusk | Warm orange sky top + golden horizon glow bottom-left |
| `under-the-sea` | Bioluminescent deep | Teal bioluminescent pulse dots + bubble rise |
| `neon-tokyo` | Tokyo alley | Hot pink left + cyan right neon buzz + rain streaks |
| `haunted-mansion` | Gothic mansion | Cold horizontal ghost light band + deep purple shadow |
| `firefly-summer` | Summer night | Yellow-green firefly pulse dots (forest variant) |
| `karaoke-night` | Stage spotlight | Pink left + cyan right + multi-color confetti fall |
| `wine-cellar` | Stone cellar | Deep burgundy edge closing in + tiny candle center |
| `aurora-borealis` | Northern sky | Bright lime-green vertical curtain columns from top |
| `meteor-shower` | Clear night sky | Dense star field + diagonal meteor streaks |
| `oktoberfest` | Beer tent | Bright warm amber lantern glow from tent top |
| `eighties-night` | Retrowave | Hot pink top + teal bottom + horizontal grid lines |

---

## ThemeCanvas + ThemeForeground

`ThemeCanvas.jsx` and `ThemeForeground.jsx` are wired into the display pipeline but currently have `scene: null` on all 29 themes. They are reserved for future 3D/WebGL foreground elements — do not add ambient logic to them. Keep them as pass-through until the feature spec is written.
