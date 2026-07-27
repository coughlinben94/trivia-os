# Campfire Sing-Along — locked spec (concept prototype v1)

Read this before touching `concepts/campfire-sing-along-v1.html`. New bespoke ambient theme,
not yet in `themes/index.js` — this is a prototype, following the same convention
`references/round-journeys.md` establishes for new motifs ("prototype as a standalone HTML mockup
before any real code... Ben needs to see it move before anything touches the actual app").

## Sources (locked, not regenerated)

- `concepts/.recraft-cache/campfire-vector-source.svg` — flat-vector composition, viewBox `0 0 2688 1536`, 42 `<path>` elements.
- `concepts/.recraft-cache/campfire-raster-source.svg` — same composition, gradient-shaded reference (also literal SVG despite the name; used only to confirm the flat version's shapes, not traced from directly).

## Path-index → semantic group map

Extracted with `/tmp/extract-campfire-paths2.mjs` (bbox-per-path in % of the 2688×1536 viewBox).
Indices are the path's order of appearance in the source file.

| Group | Path indices | Fill(s) | Native bbox (x%, y%) |
|---|---|---|---|
| Sky bg + lake wash (excluded — replaced by CSS gradient, same hue) | 0, 1 | `rgb(44,23,96)` | full frame |
| **treeline** | 41 | `rgb(4,8,27)` | x 0–100, y 50.5–62.7 |
| **reflection** | 10, 40 | `rgb(249,178,110)` | x 32.3–70.1, y 62.4–70.0 |
| **sandPath** (winding path) | 9 | `rgb(197,146,113)` | x 1.0–32.1, y 62.7–95.0 |
| **sandGround** | 8, 7, 6 | `rgb(167,114,68)` | x 0–71.7, y 60.6–100.3 |
| **fireGlowHalo** (firelit ground patch) | 2, 3, 4 | `rgb(197,146,113)`/`rgb(249,178,110)` | x 29.5–97.1, y 80.6–100 |
| **logs** | 5 | `rgb(82,25,13)` | x 44.2–56.0, y 91.8–96.5 |
| **flame** (isolated, own SVG) | 38 | `rgb(247,143,75)` | x 46.0–54.3, y 70.6–91.8 |
| **chairLeft** | 24–37 (14 paths) + 39 (stray highlight fleck) | mixed | x 28.3–39.4, y 62.6–93.5 |
| **chairRight** | 11–23 (13 paths) | mixed | x 60.8–70.7, y 74.8–96.5 |

All groups except `flame` are concatenated verbatim (unedited `d`/`fill`/`transform`) into `#tracedScene`,
one `<svg viewBox="0 0 2688 1536">`. `flame` is pulled into its own `#flameWrap` SVG (viewBox
`1230 1080 235 335`, a tight crop of path 38's own bbox + 6px padding) so it alone can carry a
flicker animation without the treeline/chairs/etc flickering with it.

## Why the composition needed remapping, and the exact math

The source's own internal layout puts the flame tip at y=70.6% and both chairs spanning
roughly y=74–97% of its own 1536-tall frame — inside `references/themes.md`'s hard safe-area
(x20–80%, y28–72%) if used at native scale. Editing any path's coordinates would break "the
vector is the geometry source of truth," so instead the **entire traced assembly is scaled and
repositioned as one uniform block** — every path keeps its exact relative position to every
other path; only the assembly's placement within the stage changes.

**Derivation (corrected after a first-pass render caught the direction was backwards — see
"A wrong-direction first pass" below).** Let `f` = a point's fraction down the original
1536-tall viewBox (0=top, 1=bottom). The shipped mechanism keeps the traced `<svg>`'s own
`viewBox="0 0 2688 1536"` unchanged and gives it a CSS box **shorter than the stage**
(`width:100%` — native x-range 0–100% already matches the stage exactly, no crop needed —
`height: k × 100%` with `k < 1`, `bottom:0`, `preserveAspectRatio="none"` so width and height
scale independently). A shorter, bottom-anchored box leaves a real `(1-k)×100%`-tall gap of
plain stage background above it. A point at fraction `f` maps to:

```
stage_frac = (1 - k) + f·k
```

Solved for `k` so the treeline's own top edge (`f = 0.505`) lands at stage-y ≈ 57%:

```
0.57 = (1 - k) + 0.505k  →  0.57 = 1 - 0.495k  →  k = 0.43 / 0.495 = 0.8687
```

`k = 0.8687` → assembly `height:86.87%` of stage height, `width:100%` (unscaled — the native
x-range already fills the stage 1:1, so no horizontal crop or gap either). This is a real,
deliberate ~13% *uniform vertical compression* of the whole traced group relative to its own
width (native AR 1.75 vs. the rendered AR at this box ≈ 1.75/0.8687 ≈ 2.01) — an affine
transform applied equally to every path in the group, not a reshape of any individual path's
geometry, and small enough that it reads as intentional stylization rather than a distortion
artifact (confirmed by eye in the render, not just assumed).

### A wrong-direction first pass — corrected before shipping, left in the record

The first implementation used `k > 1` (`width:113.34%; height:115.12%`, centered, bottom-anchored)
on the theory that an *oversized*, cropped box would push content down. Rendering it (per this
project's own render-before-done rule) showed the opposite: the reflection scrim landed as a
visibly dark rectangle sitting *below* the still-bright, undimmed reflection — the two didn't
align at all. Re-deriving the mapping from the actual CSS mechanism (a box **taller** than the
stage, bottom-anchored, viewBox unchanged, uniformly scaled) gives `stage_frac = 1 - (1-f)/k`,
which for `k > 1` *raises* content relative to the frame (effectively zooming into the bottom of
the source), not lowers it — the reverse of what was needed. Both formulas produce the same
numeric table below when related by `k_wrong = 1/k_right` (they're the same map parameterized
two different ways), which is exactly why the **numbers** in the table were right from the start
while the **shipped CSS** briefly wasn't — the bug was purely in which of the two mechanically
different constructions (`k>1` oversized-crop vs. `k<1` undersized-gap) those numbers were wired
to. Fixed by switching to the `k<1`, `width:100%` construction described above.

**Resulting stage-percent bounds for every group that matters for the safe-area check** (all via
`stage_frac = (1-k) + f·k`, `k=0.8687` — algebraically identical to `stage_frac = 1-(1-f)/1.1512`,
f taken from the table above):

| Element | Native f (top/bottom) | Stage-% (top/bottom) | Inside y28–72 safe-area? |
|---|---|---|---|
| treeline top | 0.505 | 57.00% | atmosphere, allowed |
| treeline/shoreline blend bottom | 0.627 | 67.60% | atmosphere, allowed |
| reflection top | 0.624 | 67.34% | **yes — scrimmed** |
| reflection main band bottom | 0.681 | 72.29% | **yes (barely) — scrimmed** |
| reflection tail bottom | 0.700 | 73.94% | no (just below floor) |
| flame tip | 0.706 | 74.46% | **no** — clears the 72% floor by 2.46pp |
| flame base | 0.918 | 92.88% | no |
| chairLeft top/bottom | 0.742 / 0.935 | 77.59% / 94.40% | no |
| chairRight top/bottom | 0.748 / 0.965 | 78.05% / 96.96% | no |
| fire-glow sand halo top | 0.806 | 83.15% | no |

Flame (the anchor) and both chairs clear the safe-area floor entirely. The reflection is the one
element that genuinely overlaps the zone — matches the brief's own callout — and is the only
element that gets a dedicated scrim (see below). x-span of the reflection (32.3–70.1%) sits fully
inside the safe-area's x20–80% band too, confirmed, not assumed.

## Reflection scrim — exact box and reasoning

First attempt used a rectangular box exactly matching the reflection's stage-mapped bbox
(`left:32.3%; top:67.34%; width:37.8%; height:6.6%`) with a straight `linear-gradient(to bottom,
...)` fade. Rendering it showed a visible **hard horizontal seam** partway down the streak —
the exact "banded rectangle" pattern `themes.md` rule 6 warns against — because a linear fade
inside a box with no horizontal falloff still has a sharp box edge on all four sides once the
gradient itself reaches 0 alpha before the box boundary. Fixed by switching to a **radial**
scrim, padded beyond the reflection's own bbox specifically so its margin math clears the same
convention every other glow layer in this file follows:

`#reflectionScrim`: box `left:26%; top:63%; width:50%; height:14%` (padded well past the
reflection's actual 32.3–70.1%/67.34–73.94% bbox). Fill: `radial-gradient(ellipse 42% 30% at 50%
38%, rgba(8,4,20,0.68) 0%, rgba(8,4,20,0.38) 45%, rgba(8,4,20,0) 100%)`.
- x: center 50% ± 42% → 8%–92% → **8% margin each side**. ✓
- y (top): center 38% ± 30% → 8%–68% → **8% top margin**. ✓
- y (bottom, unscored per the established bottom-exemption): reaches local y=68%, i.e. stage-y
  ≈ 63+0.68×14 = 72.5% — fading out almost exactly at the safe-area's own 72% floor, which is the
  right place for it to disappear (dimming shouldn't linger deep into the area that's already
  outside the zone). This repurposes the "bottom anchor" exemption for a different but analogous
  reason (fading toward the un-dimmed side, not blending into a ground plane) — noted here rather
  than silently relying on the same carve-out for an unstated reason.

Darkest at the ellipse's center (local 50%,38% ≈ stage 51%,68.2% — close to the reflection's own
top edge, the part sitting deepest inside the safe-area), fading smoothly in every direction
instead of stopping at a rectangle's edge. "Broken up": the source's own reflection shape is
already a scalloped row of lens-shaped humps (see the raster reference), not a solid bar — that
requirement was already true
of the traced geometry before any scrim was added; the scrim's job is brightness suppression only.

## Radial-gradient margin math (every glow/core/pool layer — no eyeballing, per the 2026-07-26 lesson)

Established convention: compute `center ± radius` per axis against the gradient's *own* box
width/height; every side that needs to taper (top/left/right) needs real margin (5–15% aim);
the bottom is exempt when the element is ground/base-anchored.

**`#flameGlow`** (box: `width:18%; height:20%` of stage, positioned `left:41.15%; top:74%`):
`radial-gradient(ellipse 42% 55% at 50% 80%, ...)`
- x: center 50% ± 42% → 8%–92% → **8% margin each side** (within 5–15% aim). ✓
- y: center 80% ± 55% → 25%–135%. Top margin 25% (comfortable). Bottom (135%) overflows past the
  box — sanctioned: this glow's box bottom edge sits at stage-y 94%, i.e. at/past the flame's own
  base — the anchor's ground point, exempt per the Established Convention. ✓

**`#flameCore`** (box: `width:9%; height:10%` of stage, positioned `left:45.6%; top:82%`):
`radial-gradient(ellipse 40% 42% at 50% 60%, ...)`
- x: center 50% ± 40% → 10%–90% → **10% margin each side**. ✓
- y: center 60% ± 42% → 18%–102%. Top margin 18% (comfortable). Bottom (102%) overflows minimally
  past the box — same ground-anchor exemption (box bottom sits at stage-y 92%, right at the
  flame's own base). ✓

**`#groundPool`** (box: `width:30%; height:10%` of stage, positioned `left:35%; top:90%`):
`radial-gradient(ellipse 42% 70% at 50% 90%, ...)`
- x: center 50% ± 42% → 8%–92% → **8% margin each side**. ✓
- y: center 90% ± 70% → 20%–160%. Top margin 70% (very comfortable — this is a flat, wide ground
  glow, not a tall one). Bottom (160%) overflows well past the box — sanctioned: box bottom sits
  at stage-y 100%, the screen's own bottom edge, the ultimate ground-anchor case. ✓

No `box-shadow` is used anywhere in this file for a glow effect — every soft-edge light effect is
a dedicated `radial-gradient` div with a static `filter:blur()`, per the corrected convention.

**Two full-stage layers deliberately do NOT use a radial-gradient at all**, for the same
underlying reason: the margin-math convention above is built for a *glow that must taper to
transparent before its own box's edge* — it doesn't fit a layer whose job is the opposite (reach
or exceed the frame edge on purpose).
- `.stage`'s own background (the sky/lake wash) is a plain top-to-bottom `linear-gradient` —
  matches `themes.md`'s own default "Base wash... linear-gradient" convention for a sky/atmosphere
  layer, and sidesteps the margin check entirely rather than fighting it.
- `#vignette` (corner-darkening) is built from two edge-to-edge `linear-gradient`s (one
  horizontal, one vertical, each dark at both ends fading to transparent in the middle) instead of
  an oversized radial ellipse. A vignette's dark color is *supposed* to reach the box edge — the
  opposite requirement of a glow — so the radial-margin check doesn't apply to it either way; using
  linear gradients for it avoids relying on an exemption that isn't really the right shape for this
  layer's job.

`.ember`'s own tiny radial-gradient (`ellipse 42% 42% at 50% 50%`, 8% margin each axis) is scored
and passes normally — it's a genuine small glow (a dot fading to transparent within its own tiny
box), the pattern the convention is actually for.

## Container-relative motion units — a second bug caught by the same render-and-look pass

Both `.ember`'s rise (`emberRise`) and `#shootingStar`'s streak (`meteorStreak`) were first written
using `vh`/`vw` — units relative to the **browser viewport**, not this file's `.stage` container.
Since `.stage` is a `min(1200px, 92vw)` box, not the full viewport, an ember's intended "rise about
23 percentage-points of the stage" instead rose by 46% of the *whole browser window's* height —
visibly rocketing embers well above the treeline into the star field on the first render. Fixed by
adding `container-type:size` to `.stage` and switching both keyframes to `cqh`/`cqw` (container
query height/width — resolves against `.stage`'s own box, exactly the fix this project's
`firefly-summer-pond-deck-v1.html` already uses for the same class of problem, `var(--dx,2cqw)`).
`emberRise`'s final transform is `translate(var(--drift), -23cqh)` (drift itself stays in `px` — a
small few-pixel jitter that doesn't need to scale with the stage); `meteorStreak`'s is
`translate(52cqw,26cqh)`.

## Motion inventory (all GPU-only: `transform`/`opacity`, static `filter` only)

| Element | Keyframe | Period | Note |
|---|---|---|---|
| Flame silhouette | `flameFlicker` | 2.6s, irregular easing points | scaleY/scaleX + opacity, `transform-origin:50% 100%` |
| Ambient bloom glow | `glowPulse` | 2.6s, same phase as flame | opacity only |
| Hot near-white core | `corePulse` | 2.6s, same phase | opacity only; sanctioned tonal exception, anchor only |
| Ground light pool | `poolPulse` | 2.6s, **0.55s delay** | lags the flame, doesn't strobe in sync — Established Convention |
| Embers (drifter, ×7) | `emberRise` | 4.5–7.5s, negative delays | `translate()` rise + fade, staggered so none pop in sync |
| Stars (×22) | `starTwinkle` | 3.2–6.6s, negative delays | opacity only, irregular per-star period |
| Shooting star | `meteorStreak` | 34s cycle, ~1s visible | `translate()` diagonal streak, rare per task's "occasional" |

Reduced motion: `prefers-reduced-motion` (real OS-level) and a JS-forced `.rm-force` toggle both
freeze every `.sd-anim` element via `animation:none!important` — flame/glow/core/pool hold at
their keyframe-0 state (a legible mid-brightness fire, not blacked out), embers/stars/shooting-star
stop entirely. Traced geometry was never animated, so it needs no reduced-motion branch.

## Noun-test classification

Per `concepts/OBJECT-RENDERING-PROTOCOL.md`: treeline, chairs, flame, logs, reflection, sand path
are all figurative-by-contour (a guest would name each by its outline). The escalation ("generate
it, confirm in isolation") is satisfied upstream — these are traced, unedited paths from a locked,
already-generated Recraft source, not hand-typed guesses. No new figurative shape was invented in
this file; the only hand-authored additions are abstract light forms (glow/core/pool — the
sanctioned near-white-core and light-pool exceptions) and particle-tier dots (embers, stars,
shooting star), all iconic (one sentence of geometry each).

## Known open item — not yet resolved, flagged rather than hidden

`references/themes.md` rule 1a states an ambient theme may **never** place a pictorial figurative
object as-is — only cut it or restate it as an abstract light form (the near-white-core / dark-
silhouette-drifter exceptions). Two static camp chairs and a full campfire scene are, literally,
placed pictorial objects, not abstracted into light forms. This spec's read: the brief itself
(explicit "trace the vector source's real shapes for the fire, chairs, and tree line") is a
same-session, explicit instruction that supersedes that default for this one theme, on the same
logic that already lets `sonora-balloons` ship five recognizable hot-air balloons as its anchor —
the operative bar in 1a's own text is "no hard pictorial icons... kept soft, reading as light" /
no register mismatch, not "nothing may ever be recognizable as an object." This traced geometry is
one coherent flat-vector asset (no photoreal/vector register mismatch) and the fire/core/glow
carry the "reading as light" quality the rule actually asks for. Flagging this rather than quietly
picking a side — if the design-critic gate or Ben reads it differently, the chairs are the
element to cut or re-abstract, not the flame.
