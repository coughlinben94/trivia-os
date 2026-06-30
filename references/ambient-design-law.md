# Ambient Design Law — skill update

> Replaces the stale parts of `references/themes.md` ("5 Non-Negotiable Constraints" #1 and #2) and
> `SKILL.md` §7 Non-Negotiables #2 and #3. Drop this in as the new ambient design section; keep the
> rest of themes.md (GlowLayer primitive, opacity/timing ranges, vignette system) as-is.

---

## The Ambient Design Law

Every reworked ambient = **anchor + drifter + atmosphere**, with the center kept open.

1. **Anchor** — one named focal element you can point at and name ("the torch," "the god-rays,"
   "the bouncing apple"). Soft glowing light-forms (sun disc, neon sign, SVG curtain) **and** defined
   sprites (an original pixel critter) are both allowed. One near-hard edge keeps the anchor from
   turning to mush; all-soft = mush, all-hard = clip-art.
2. **Drifter** — at least one element with real `translate` motion you can track across the frame
   (not just breathing in place).
3. **Atmosphere** — layered gradient washes / glows sitting behind the anchor and drifter.

**Center safe-area:** middle 60% width (20–80%) × middle 45% height (28–72%). Don't park a focal or
high-energy element inside it. Atmosphere and low-energy motion may pass behind; a drifter may transit
through, just don't anchor there.

## Color, in-family

Every ambient hue lives inside the theme's `accent → highlight` range. Sanctioned exceptions: a hot
near-white core at the anchor, and dark silhouette drifters. Ambients **hardcode** their colors (they
receive no theme prop) — source the hexes from `themes/index.js` by hand.

## GPU rule (replaces "never filter / never box-shadow")

Animate **only** `transform` and `opacity`. Never animate `width/height/color/box-shadow/filter/
background-position` or any layout property. **Static** `filter` (blur, drop-shadow) and **static**
`box-shadow` are now allowed — the ban is on *animating* them, not on using them.

## Reduced motion

Every keyframe set needs a `prefers-reduced-motion` branch via a guard class
(e.g. `.xx-anim { animation: none !important }`) on every animated element.

## No copyrighted IP

Original forms only. No trademarked characters, sprites, logos, or licensed art — these run on
commercial TVs in front of paying guests. Design your own critter (e.g. the 8-bit apple, not Pac-Man).

## 7-Check Acceptance Gate

Claude self-gates the `[auto]` checks before presenting. Ben owns the `[eyes]` checks and the commit.
Claude never self-certifies a commit or flips ⟳→✓ — those happen after the TV pass.

| # | Check | Owner |
|---|-------|-------|
| 1 | **Anchor** present and nameable | [eyes] reads-as |
| 2 | **Drifter** has real trackable translate motion | [auto] |
| 3 | **Safe-area** center stays legible | [eyes] |
| 4 | **In-family color** — all hues in accent→highlight (+ sanctioned exceptions) | [auto] |
| 5 | **Motion** matches the world; no pop-in at load; no weak ease-in | [auto] + [eyes] |
| 6 | **GPU + reduced-motion** — transform/opacity only, guard present | [auto] |
| 7 | **Distinct at thumbnail** — IDs as this theme at small 16:9 | [auto] + [eyes] |

## Port pattern (artifact → ParticleBackground.jsx)

Each ambient is a self-contained block: prefixed palette const, prefixed `rgba` helper, prefixed
keyframes injected via `<style>{XX_STYLE}</style>` inside the component, prefixed sub-components,
reduced-motion guard, and **no own vignette** (ParticleBackground adds the theme `Vignette` after).
Keep the exported function name so `AMBIENT_MAP` still resolves. Never touch shared helpers
(`GlowLayer`, `PulseDot`, shared `ambient*` keyframes) — other ambients depend on them.
