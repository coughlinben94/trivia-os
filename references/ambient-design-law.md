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
near-white core at the anchor, and dark silhouette drifters.

**Updated 2026-07-01:** ambients no longer hand-hardcode dead hex values. Each `AmbientComponent`
receives a `tint(originalColorStr)` function as a prop from `ParticleBackground.jsx`
(`client/src/lib/colorTint.js`'s `deriveTint`, anchored on the theme's `highlight` color). Call
`tint('#f5a623')` (or with an `rgba(...)` string, alpha preserved) on every in-family hue color in the
component — this reproduces the original hand-tuned color exactly when no per-show override is active,
and shifts the whole family cohesively (same hue delta, same saturation/lightness scale) when a host
overrides the show's highlight color from `ThemePickerModal.jsx`'s Customize row. **Do not wrap
sanctioned exceptions** (hot near-white cores, dark silhouette drifters) in `tint()` — those are
intentionally hue-agnostic and must stay literal. There is no `accent`-anchor option — an earlier
version exposed one, but it was numerically unstable (accent colors are usually very dark washes, so
the lightness-scale ratio blows up) and every one of the 21 themes anchored on highlight anyway, so it
was removed.

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

## Reroll-on-animationiteration: the safe pattern for random ambient variation

**2026-07-24, sonora-balloons-depth prototype.** Any element that should periodically change
something at random (position, target distance, content) while looping forever needs three things,
each one proven necessary by a real bug this session:

1. **The keyframe must return to a genuine rest state every iteration.** A `direction:alternate`
   two-point keyframe (`from`/`to`) does NOT do this — its forward and backward halves are separate
   iterations that don't share a common rest instant, so a mid-alternate reroll can snap position.
   Use a symmetric `0%/50%/100%` (or equivalent) keyframe that starts AND ends at rest instead, with
   plain `infinite` (no `alternate`) in the shorthand.
2. **Guard every `animationiteration` listener by `e.animationName`.** The event bubbles from any
   child element's own looping animation up through every ancestor. An element with several nested
   animated layers (breathe/sway/gore-slide inside a drifting wrapper, say) will fire a parent's
   listener on EVERY child's iteration boundary too, not just its own — silently rerolling far more
   often than intended, including mid-flight. `if (e.animationName !== 'yourAnimName') return;` at
   the top of the handler is not optional, even on an element that looks like it only has one
   animation at a glance.
3. **To change apparent speed without breaking position or a sibling animation, use WAAPI
   `Animation.playbackRate`, never `element.style.animationDuration`.** Changing `duration` on a
   running CSS animation re-maps its already-elapsed time against the new duration and snaps the
   visible position instantly — confirmed via a real headless-Chromium repro (a balloon jumped to
   96% of its max drift distance the instant duration changed). It's also a single value applied to
   EVERY comma-separated animation on that element, so it silently overwrites an unrelated sibling
   animation's own duration too. `element.getAnimations().find(a => a.animationName === '...')
   .playbackRate = someFactor` changes speed from the current instant forward with no position
   remap, and only touches the one matched Animation object. Verify any such fix with a real
   headless-Chromium repro, not just the spec description — the ONLY reason the original
   `animationDuration` bug was caught was an actual browser test, not a code read.

## Flat holds inside a keyframe (fast transition, real "on"/"off" states)

A symmetric `0%,100%{A} 50%{B}` keyframe is ALWAYS mid-transition — it never actually holds at A or
B, just endlessly ramps between them. For anything that should snap quickly then hold (a filler
element fading in, staying, fading out, staying gone), use **two consecutive keyframe stops with
the identical value** to force a flat segment: `0%,100%{opacity:0} 12%{opacity:1} 45%{opacity:1}
58%{opacity:0}` holds fully visible from 12% to 45% (identical values at both ends of that span)
and fully invisible from 58% back to 100%, with fast ~12%-of-cycle ramps in between. Standard CSS
keyframe interpolation runs segment-by-segment between consecutive stops — identical endpoint
values produce zero change across that segment regardless of easing function.

## Depth layers need real separation, not just non-overlap

Three-plus parallax layers sharing one small band of screen height (verified-non-overlapping is
not the same as visually distinct) read as one flat mass with the frontmost layer dominating —
confirmed this session when three ridge layers packed into a 4-unit-tall band left the front layer
occupying ~70% of the visible ground while the back two were a barely-visible sliver on top. Give
each depth layer its own real vertical band with an actual gap to its neighbor (not just "doesn't
numerically overlap"), sized so each layer gets a comparable share of the total visible depth
stack, not a token peek above the one in front of it.

## Tile-seam invariants when a scrolling layer gets a second shape variant

A layer that scrolls via two identical tile-copies (seamless because both halves are pixel-
identical, so the loop's instant reset is invisible) breaks that guarantee the moment the two
copies stop being identical — e.g. adding a second bump-layout variant for visual variety. Fix:
use 4 copies in an `[A,B,A,B]` pattern (not 2), double the effective duration to hold the same
scroll speed over the now-doubled track width, and keep the SAME translate keyframe percentages —
translating by "one track-half" now moves exactly one full `A+B` pair, so copy 2 (A) lands exactly
where copy 0 (A) started, restoring the original seamless-wrap guarantee over a longer period.
Verify empirically with a capture that actually crosses the new (longer) wrap boundary — the
seamless assumption can look fine in any capture shorter than one full cycle.

## Removing an old feature that's no longer wanted: grep before declaring done

When a feature is cut ("that's a no-no, revert it" / "squash this concept entirely"), a real revert
means the keyframe, the config fields, the wiring in the build function, AND every human-readable
mention of it (on-page notes text, doc comments describing "what this file has") — a stale
description sitting right next to the removed code is exactly the kind of thing that reads as
confusing or dishonest to whoever looks at this file next. Grep the whole file for the feature's
name/keyframe/every distinguishing string before calling a removal complete, not just the code path
you touched directly.

## A "fixed" bug can have a second, unrelated cause

A reported symptom ("there's a horizon line") can survive a real, verified fix (a sky-gradient
color-rate outlier) because a SEPARATE, unrelated element was independently producing the same
visual symptom (a leftover water-reflection-glint layer from an earlier version of the file, sitting
at roughly the same screen height). Confirming the diagnosed cause is fixed (rate-of-change math
checks out, pixel scan confirms no artifact at that specific stop) is not the same as confirming the
REPORTED symptom is gone — when it persists after a verified fix, look for an entirely different
source at the same location rather than re-tuning the first fix further.
