# Ambient color-tint rewire — remaining 20 themes

**Context:** `client/src/components/display/ParticleBackground.jsx` has 21 ambient theme
components. Each one used to hand-hardcode every color, unconnected to `theme.colors` — this
was even the documented design law ("Ambients hardcode their colors, they receive no theme
prop"). That meant a per-show host color override (from `ThemePickerModal.jsx`'s new Accent
color / Highlight color pickers) only affected slide text, never the animated background.

**Foundation already built and committed (`dd6696a`) — do not redo this:**
- `client/src/lib/colorTint.js` — exports `deriveTint(baseAnchorHex, currentAnchorHex, originalColorStr)`.
  Reproduces `originalColorStr`'s HSL relationship to `baseAnchorHex` (the theme's own default
  accent/highlight), applied relative to `currentAnchorHex` (the live, possibly overridden
  value) instead. Returns `originalColorStr` unchanged when the anchor hasn't changed — so every
  theme renders pixel-identical to today until a host actually overrides a color. Handles hex,
  `rgb()`, and `rgba()` strings (alpha preserved).
- `ParticleBackground.jsx`'s main export now computes `baseTheme = getTheme(theme.id)` and a bound
  `tint(originalColorStr, anchor = 'highlight')` callback, passed as a prop to every
  `<AmbientComponent tint={tint} />`.
- `ThemeCustomizeControls.jsx` has new "Accent color" and "Highlight color" pickers (reusing the
  existing generic `onSetTextColor(field, value)` handler — no new plumbing needed).
- `AutumnHarvestAmbient` is done as the reference implementation — read it (lines ~501-550 in
  `ParticleBackground.jsx`) before starting. Every hue-bearing color is wrapped in `tint(...)`;
  the function signature is `function AutumnHarvestAmbient({ tint })`.
- Live-verified via `ThemePickerModal`'s own preview (it already renders `<ParticleBackground
  theme={previewTheme} />` at line 132): overriding Highlight color to bright blue cohesively
  retinted the falling leaves, ember glow, and sky-glow gradient, while text/watermark stayed
  untouched. Reverting the override reproduces the exact original.
- `references/ambient-design-law.md`'s "Color, in-family" section documents the new mechanism —
  read it for the exact anchor-selection guidance (default to `'highlight'`; `'accent'` is
  numerically unstable because accent colors are usually very dark washes, so the
  lightness-scale ratio can blow up for override colors far from that darkness).

**What's NOT done — this plan's scope:** apply the exact same pattern to the remaining 20
theme components.

---

## The pattern, precisely

For each `XxxAmbient()` function:

1. Change its signature from `function XxxAmbient() {` to `function XxxAmbient({ tint }) {`.
2. Find every hardcoded color value that represents an **in-family hue** — i.e. every color
   that's clearly a variant of that theme's accent→highlight identity (particle colors, glow
   gradients, sprite fills, badge/sign colors, etc). Wrap each one: `tint('#f5a623')` or
   `tint('rgba(245,166,35,1.0)')`. If a color is used inside a template literal (e.g. a
   `linear-gradient(...)` string), wrap just that color argument:
   `` `linear-gradient(to bottom, ${tint('rgba(200,60,10,0.52)')} 0%, transparent 100%)` ``.
3. **Do NOT wrap sanctioned exceptions** — per `ambient-design-law.md`'s "Color, in-family"
   section: a hot near-white core at an anchor (e.g. a bright white-hot center of a glowing
   orb), and dark silhouette drifters (e.g. a black car-roof silhouette, a dark bird shape).
   Those are intentionally hue-agnostic. Use your judgment reading each theme's existing
   comments (most already say things like `// near-white core` or describe silhouettes) — when
   genuinely unsure whether a color counts as in-family or an exception, err toward leaving it
   untouched rather than guessing.
4. If any `useMemo` array of particle definitions computes a `color` field once, add `tint` to
   that `useMemo`'s dependency array (see Autumn Harvest's `leaves` useMemo for the pattern —
   `}, [tint])`) so the retint actually updates if theme colors change without a full remount.
5. Leave every other line — timing, positions, opacity curves, keyframe names, comments — untouched.
   This is a color-sourcing change only, not a redesign.
6. Do not touch `theme.vignette`, `Vignette`, or anything outside the named `XxxAmbient` functions
   themselves. Do not touch shared helpers (`GlowLayer`, `PulseDot`, `FallingParticle`,
   `RisingParticle`, shared `ambient*` keyframes, `KEYFRAMES` constant) — other themes depend on
   them and they take no theme-specific color args themselves (colors are passed in as props by
   the calling `XxxAmbient` function, which is what you're editing).

**Anchor selection:** default every call to `tint(color)` (implicit `'highlight'` anchor). Only
pass `'accent'` explicitly if you've checked that theme's `colors.accent` lightness is reasonably
close to the colors you're deriving from it (i.e. not a near-black wash) — when in doubt, use
`'highlight'`. Every theme's `accent`/`highlight` hex values are in `client/src/themes/index.js`;
read the specific theme's entry before starting so you know the anchor values you're working with.

---

## Task 1 — Batch A: Pure Michigan, Midnight Galaxy, Northern Lights, Medieval Tavern, Sunset Boulevard

**File:** `client/src/components/display/ParticleBackground.jsx`

- [ ] Apply the pattern (see above) to `PureMichiganAmbient`, `MidnightGalaxyAmbient`,
  `NorthernLightsAmbient`, `MedievalTavernAmbient`, `SunsetBoulevardAmbient`.
- [ ] Theme colors for reference (from `client/src/themes/index.js`):
  - Pure Michigan: `accent #1a6b4a, highlight #4dffc3`
  - Midnight Galaxy: `accent #4a1a8f, highlight #c060ff`
  - Northern Lights: `accent #0d5040, highlight #40ffcc` (has an SVG aurora with gradient
    `stopColor` values — these need the same treatment, wrap each `stopColor` argument)
  - Medieval Tavern: `accent #5a2a08, highlight #e08020`
  - Sunset Boulevard: `accent #c2521e, highlight #ff9a4d`
- [ ] Run `npm run build` — must be clean.
- [ ] Verify via `playwright-cli`: open the local dev app, use `ThemePickerModal`'s live preview
  (Build Mode → Theme card) to check at least 2 of these 5 themes at DEFAULT settings (should look
  visually identical to before this change — no visual regression) and at least 1 with an
  overridden Highlight color (should visibly retint the ambient, cohesively, 0 console errors).
  Revert any test override you make (confirm via `mcp__claude_ai_Supabase__execute_sql`,
  project_id `qwtbgusqfoypvehnungr`, that `shows.theme_overrides` is back to its prior state).
- [ ] Commit: `git add client/src/components/display/ParticleBackground.jsx && git commit -m "Rewire ambient color-tint: Pure Michigan, Midnight Galaxy, Northern Lights, Medieval Tavern, Sunset Boulevard"`

## Task 2 — Batch B: Retro Arcade, Sand Dune Chill, Halloween, Jazz Club, Dive Bar

Same file, same pattern, same verification steps as Task 1, applied to `RetroArcadeAmbient`,
`SandDuneChillAmbient`, `HalloweenAmbient`, `JazzClubAmbient`, `DiveBarAmbient`.

Theme colors:
- Retro Arcade: `accent #3a0880, highlight #a020ff`
- Sand Dune Chill: `accent #6e84b6, highlight #f7cda0`
- Halloween: `accent #380858, highlight #a000ff`
- Jazz Club: `accent #4a2808, highlight #d4820c`
- Dive Bar: `accent #600818, highlight #ff2040`

Commit message: "Rewire ambient color-tint: Retro Arcade, Sand Dune Chill, Halloween, Jazz Club, Dive Bar"

## Task 3 — Batch C: Rooftop Party, Christmas Eve, Drive-In Movie, Western Showdown, Under the Sea

Same file, same pattern, same verification steps, applied to `RooftopPartyAmbient`,
`ChristmasEveAmbient`, `DriveInMovieAmbient`, `WesternShowdownAmbient`, `UnderTheSeaAmbient`.

Theme colors:
- Rooftop Party: `accent #0a1840, highlight #4080ff`
- Christmas Eve: `accent #3a0810, highlight #ff4040` — **note:** `particles.color: '#f0f4ff'` (snow)
  is a near-white color used for falling snow — this is very likely a sanctioned "near-white"
  exception per the design law, so leave the snow color untouched; only tint genuinely
  hue-bearing elements (e.g. any colored string lights, ornament colors, warm window-glow).
- Drive-In Movie: `accent #280848, highlight #e0a000` — **note:** this theme has a documented
  car-roof silhouette (per this project's ambient design law history) — leave silhouette
  fill colors untouched, only tint the screen-glow/projector-beam colors.
- Western Showdown: `accent #602000, highlight #e06010`
- Under the Sea: `accent #003848, highlight #00d8c0`

Commit message: "Rewire ambient color-tint: Rooftop Party, Christmas Eve, Drive-In Movie, Western Showdown, Under the Sea"

## Task 4 — Batch D: Neon Tokyo, Firefly Summer, Wine Cellar, Meteor Shower, 80s Night

Same file, same pattern, same verification steps, applied to `NeonTokyoAmbient`,
`FireflySummerAmbient`, `WineCellarAmbient`, `MeteorShowerAmbient`, `EightiesNightAmbient`.

Theme colors:
- Neon Tokyo: `accent #380048, highlight #ff00c0` — likely has multiple neon sign colors; treat
  the theme's OWN dominant neon hue (closest to `highlight`) as the in-family set to tint, but if
  there are clearly-intentional multi-color neon signs (e.g. a sign with 2-3 different neon
  tube colors as a design feature, not just noise), read the actual code and use your judgment —
  it's fine to tint all of them if they're all going to shift together (multiple `tint()` calls
  with different original hex inputs still respects each one's own relationship to the anchor).
- Firefly Summer: `accent #1a3808, highlight #d4a020` — **note:** firefly glow colors are
  presumably warm yellow-green (in-family); if there's a night-sky star field using near-white
  twinkle colors, treat those as the sanctioned exception, don't tint.
- Wine Cellar: `accent #480018, highlight #c02040`
- Meteor Shower: `accent #101828, highlight #e0f0ff` — **note:** this theme's highlight itself is
  already near-white (`#e0f0ff`), and `particles.color` is also near-white/twinkle — this is an
  unusual theme where the "identity" color IS near-white. Use your judgment: if tinting these
  makes sense (meteor trail could still take on an override tint), do it; if the whole theme is
  built around white/silvery meteors as its core identity (not a swappable accent), it's fine to
  leave more of it untouched than other themes — note your reasoning in your final report either way.
- 80s Night: `accent #300858, highlight #ff1090`

Commit message: "Rewire ambient color-tint: Neon Tokyo, Firefly Summer, Wine Cellar, Meteor Shower, 80s Night"

---

## Final Steps

- [ ] Dispatch a final holistic reviewer across all 4 commits from this plan (and the foundation
  commit `dd6696a`) checking: every one of the 21 `AMBIENT_MAP` entries now accepts `{ tint }`
  (grep `function .*Ambient(` to confirm no signature was missed), no sanctioned exception
  (near-white core, dark silhouette) got accidentally tinted, `npm run build` is clean, and spot
  check a handful of themes live (default + overridden) for visual regressions.
- [ ] Update `references/themes.md` if it documents the old "ambients hardcode, no theme prop"
  rule anywhere else (it may reference `ambient-design-law.md`'s old wording) — check and sync if so.
