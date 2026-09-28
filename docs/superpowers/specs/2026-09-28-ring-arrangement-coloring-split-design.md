# Ring World — Independent Arrangement/Coloring Axes + Color-Evolution Wiring

**Status:** approved by Ben 2026-09-28. Build now; feature stays OFF by default for every show, including after ship — see Global Constraints.

## Goal

Two things currently live in the codebase but can't be combined:

1. **Arrangement** — which 13 stations sit where on the ring. Either the fixed authored order, or a per-show random draw (`ringWorldFor.js`'s `autoDrawWorld`, live since `6ceb14d`).
2. **Coloring** — what color each station renders. Either the authored per-station hues, a host-picked static 2-color `worldPalette`, or the dormant 17-duo color-evolution walk (`EvolvingRingAmbient.jsx`, built but never wired to a live show — only reachable via `/ambient?evolving=1`).

Today color-evolution is hardcoded to the fixed authored arrangement (`worldForDuo()` in `EvolvingRingAmbient.jsx` always recolors `midnightGalaxyRing` directly, never calls `ringWorldFor`). This design makes arrangement and coloring two independent choices a host makes per show, and wires color-evolution into the live render path for the first time — while keeping it off by default until it's actually tested.

## Background

`ringWorldFor.js` (post gap-C fix, commit `2078338`) already resolves arrangement and coloring in one pass, with worldPalette gating auto-draw off (a palette was only ever certified against the fixed order). `EvolvingRingAmbient.jsx` duplicates the "resolve + recolor" pattern independently, hardcoded to the fixed order — this is the exact shape of duplication that caused gap-C in the first place (two places deciding the same thing, one gets updated, one doesn't). Fixing this by sharing one arrangement-resolution function removes the duplication instead of adding a third copy.

## Design

### 1. Extract arrangement resolution from `ringWorldFor.js`

New exported function in `client/src/lib/ringWorldFor.js`:

```js
// Resolves ONLY the station arrangement (fixed authored order, a saved
// ringWorld, or a per-show draw) — no coloring applied. Both the normal
// worldPalette path and the color-evolution path call this so there is
// exactly one place that decides "which stations, in what order."
export function resolveArrangement(theme, showId) {
  const base = RING_WORLDS[theme.id]
  if (!base) return base

  if (theme.ringWorld && theme.ringWorld.ringVersion === RING_VERSION) {
    try {
      const stations = resolveStations(RING_POOL, theme.ringWorld.stations)
      if (stations.length !== base.stations.length) {
        throw new Error(`resolveArrangement: expected ${base.stations.length} stations, got ${stations.length}`)
      }
      if (new Set(stations.map(s => s.key)).size !== stations.length) {
        throw new Error('resolveArrangement: duplicate station keys in a resolved ringWorld')
      }
      return { ...base, stations }
    } catch (err) {
      console.warn('[ring] bad ringWorld, falling back:', err.message)
      return base
    }
  }

  if (showId && !theme.worldPalette) {
    return autoDrawWorld(base, showId)
  }

  return base
}
```

`ringWorldFor` itself is rewritten to call `resolveArrangement` then apply coloring on top (`recolorWorld` with `theme.ringWorld.palette` or `theme.worldPalette`, exactly as today) — same external behavior, verified by the existing `ringWorldFor.test.js` suite passing unchanged. This is a refactor, not a behavior change, for the non-duo path.

Cache key note: `resolveArrangement` is NOT itself memoized — `ringWorldFor`'s existing `worldCache` still owns memoization for the colored result. `worldForDuo` (below) gets its own cache.

### 2. Generalize `worldForDuo` to take an arrangement

`client/src/components/display/EvolvingRingAmbient.jsx`:

```js
const duoWorldCache = new Map()
function worldForDuo(duoId, arrangement) {
  const key = duoId + '|' + arrangement.stations.map(s => s.key).join(',')
  if (!duoWorldCache.has(key)) {
    duoWorldCache.set(key, recolorWorld(arrangement, DUO_PALETTES[duoId], getTheme('midnight-galaxy')))
  }
  return duoWorldCache.get(key)
}
```

`EvolvingRingAmbient` takes a new required prop `arrangement` (the object `resolveArrangement(theme, showId)` returns) instead of hardcoding `midnightGalaxyRing`. Every call site of `worldForDuo(duo)` becomes `worldForDuo(duo, arrangement)`.

### 3. Data model — one new field, `theme.colorEvolution`

`theme_overrides` (JSONB, no migration needed) gains an optional boolean: `colorEvolution: true`. Threaded through `ThemeProvider.jsx`'s `applyOverrides` the same way `worldPalette`/`ringWorld` already are:

```js
colorEvolution: overrides?.colorEvolution ?? undefined,
```

Absent (`undefined`) on every existing show — this is what keeps the feature off by default with zero backfill.

### 4. Component wiring — `ParticleBackground.jsx`

```js
const ringWorldRef = useRef(null)
if (ringWorldRef.current === null) {
  ringWorldRef.current = theme.colorEvolution
    ? { evolving: true, arrangement: resolveArrangement(theme, showId) }
    : (ringWorldFor(theme, showId) ?? false)
}
```

And in the render branch (replacing the existing `ringWorld ? <RingAmbient .../> : ...`):

```jsx
{gradientMood
  ? <BreathingGradient palette={theme.colors} mood={gradientMood} />
  : ringWorldRef.current?.evolving
    ? <EvolvingRingAmbient arrangement={ringWorldRef.current.arrangement} showId={showId} slideIndex={slideIndex} stationOverride={stationOverride} showStationDebug={showStationDebug} forceSnap={forceSnap} />
    : ringWorldRef.current
      ? <RingAmbient worldData={ringWorldRef.current} showId={showId} slideIndex={slideIndex} stationOverride={stationOverride} showStationDebug={showStationDebug} forceSnap={forceSnap} />
      : AmbientComponent && <AmbientComponent tint={tint} />}
```

`WarpTransition.jsx` reads `theme.ringWorld`/`worldPalette`-derived `sky`/`tints` today (see gap-C critique). Under `colorEvolution`, sky/tints should come from the CURRENT duo (`outgoingAndIncomingDuo`'s `incoming` at the transition's slide index) — same "read the identical thing ParticleBackground built" discipline gap-C's critique confirmed matters. Implementation task: `WarpTransition.jsx` needs `theme.colorEvolution` + `showId` + `slideIndex` to compute this; check current props it receives before assuming they're already there.

### 5. Host UI — Theme panel (`ThemePickerModal.jsx`, next to `WorldPaletteEditor`)

Two new controls, both persisted via the same `applyPaletteColors`-style write `ThemePickerModal.jsx` already does for `worldPalette`/`ringWorld`:

- **Arrangement picker**: "Fixed layout" / "Random draw" — maps to presence/absence of a forced `theme.ringWorld` vs relying on the existing auto-draw gate (`showId && !worldPalette`). Exact control mechanics (radio vs toggle) are an implementation-task decision, not a design fork.
- **Color picker**: "Authored colors" (default) / "Custom palette" (existing `WorldPaletteEditor` flow, unchanged) / "Color evolution" (new — sets `colorEvolution: true`, clears `worldPalette`/`ringWorld` palette since they're mutually exclusive coloring sources; arrangement choice is untouched).

Mutual exclusion enforced at the write site: setting `colorEvolution: true` must clear any set `worldPalette`, and vice versa — never both true at once, since `ParticleBackground`'s branch above checks `colorEvolution` first and would otherwise silently ignore a set `worldPalette`.

## Known gaps (explicit, not silently deferred)

- **11 of 17 duos have a documented shading bug** (drift-shading cancels out under drift, prior finding, not yet root-caused). Must be found and fixed before this feature is ever turned on for a real show — task in the plan, not optional polish.
- **Duo colors under a drawn arrangement have never been rendered or checked**, even after this wiring — the 17 duo color *pairs* are individually certified (`ring_palettes`, verified against `duoGraph.js`'s own sourcing comment), but only against the fixed order, and the animated transition/blend between two duos has no certification at all. A real `/ambient?evolving=1&showId=x` visual pass (both arrangement modes) is a required task before sign-off, not a nice-to-have.
- **`WarpTransition.jsx` color-evolution support** (point 4 above) is new code, not a port of something proven — needs its own test, not just "matches the palette path."

## Global Constraints

- `colorEvolution` defaults to unset/false for every show that exists today — zero behavior change for anything live.
- Feature ships **code-complete but not enabled**: no show should have `colorEvolution: true` set as a result of this work. Ben turns it on per-show, by hand, after reviewing it live — this is a STAYS-HUMAN decision (`references/ring-world-continuity.md` §4), not something a plan or an agent decides.
- `resolveArrangement` extraction must not change `ringWorldFor`'s output for any existing input — the full existing `ringWorldFor.test.js` suite passing unchanged is the acceptance bar for that refactor, not a rewrite of its assertions.
- GPU-only animation / reduced-motion / safe-box rules (SKILL.md Critical Rules 2, 3, 6) apply to any new render code same as everywhere else in this system.
