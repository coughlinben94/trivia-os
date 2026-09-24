# Ring World — Drawn-World Picker UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Also read `references/ring-world-continuity.md` before starting — this plan lives in the ring-world system's mandatory-read set.

**Goal:** Let a host apply a full drawn world (a noun draw + a palette, not just a palette) from the World picker — the last unbuilt piece of `docs/superpowers/plans/2026-09-05-ring-unified-noun-color-draw-design.md`'s roadmap (step 5; steps 1-4 shipped 2026-09-02 through 2026-09-15, see that plan and `docs/superpowers/plans/2026-09-14-ring-world-shelf-stations.md`, both confirmed shipped by `git log` — 846/846 tests passing as of `6877d9a`).

**Architecture:** Two independent pieces sharing one contract (see Global Constraints). (1) `client/src/lib/ringWorldFor.js` — extracted from `ParticleBackground.jsx` and extended to resolve `theme.ringWorld` (a stations+palette draw) before falling back to `theme.worldPalette` (palette-only, today's shape) then the base authored world; never throws, the TV never blanks. (2) `WorldPaletteEditor.jsx` grows a shelf strip of certified rows (each already-certified palette OR world), a "Re-roll objects" action that composes a fresh draw via the already-shipped `drawWorld()`, and an Apply path that writes the new `ringWorld` shape into `theme_overrides` alongside the existing `worldPalette`.

**Tech Stack:** React, Vite, Supabase (Postgres + RLS, no schema change here), Vitest.

**Spec:** `docs/superpowers/plans/2026-09-05-ring-unified-noun-color-draw-design.md` §7.1 (storage shape) and §7.2 (picker UI, row-by-row). Also read `references/ring-world-mistakes.md` and `references/ring-world-continuity.md` (mandatory-read set) and `client/src/lib/drawWorld.js` (already shipped, this plan calls it, does not modify it).

## Global Constraints

- **Known, deterministic blocker — do not fix in this plan, build around it honestly.** The real 13-station pool (`client/src/worlds/ringPool.js`) has 5 `radial-mass` members against `LANE_CAP(13) = 4` — verified directly (`grep family client/src/worlds/midnightGalaxy.slots.js` shows stations 0,3,4,8,10 all `radial-mass`). `drawStations`/`drawWorld` against this pool throws `ringDraw: pool cannot fill 13 slots under the caps (chose N of 13)` on every seed today, deterministically, not intermittently. Fixing the pool is step 6 (art project, out of scope per the prior plan, Ben's call). "Re-roll objects" (Task 2) must catch this per-click and show a plain message — it must never crash the picker.
- **Live shelf state, checked 2026-09-24 via `mcp__supabase__execute_sql`:** 17 certified rows at `RING_VERSION = 'v1-2026-09-06'`, all with `stations = null` (palette-only, "the authored ring" per schema convention). Zero world rows exist yet — `--world-batch` has never produced a certified one, which is `docs/superpowers/plans/2026-09-14-ring-world-shelf-stations.md`'s own documented, expected result given the pool blocker above. The shelf strip (Task 2) must render correctly with an all-`stations:null` shelf — it will in production today.
- **Shared contract — both tasks read/write this shape, independently, no code dependency between them:**
  ```
  theme_overrides.ringWorld = {
    rowId: string | null,       // the matched ring_palettes.id, or null for an unmatched/pending pick
    seed: string,                // 'showSeed:<hex>', hex = seedFrom(showId).toString(16)
    ringVersion: string,         // must equal ringCertification.js's RING_VERSION to be trusted
    stations: string[],          // 13 pool keys, in slot order
    palette: { colors: string[], weights: number[], drift: { arc: number } },
  }
  ```
  `theme_overrides.worldPalette` (existing shape, unchanged) still rides along in the same write — back-compat, per the design doc's own §7.1 framing.
- STAYS HUMAN (`references/ring-world-continuity.md` §4): this plan edits no lock file, no gate check code (`ring-spec.lock.json`, `ring-verify.mjs`'s pass/fail logic), no threshold, and makes no aesthetic call. If a task's implementer hits a decision on that list, stop and name it.
- Never touch `RingAmbient.jsx`, `ringEngine.js`, `ringPrimitives.js`, `SLOTS`, `MUSIC_STATION`, `recolorWorld`'s own body, or `drawWorld.js`/`ringDraw.js` — all already shipped and tested, this plan only calls them.
- Render before claiming done (`references/ring-world-mistakes.md`'s standing instruction) — after Task 2 ships, open the World picker on a real show and look at it; note in the handoff whether that happened.

---

### Task 1: `ringWorldFor` — resolve a drawn world, extracted and testable

**Files:**
- Create: `client/src/lib/ringWorldFor.js`
- Create: `client/src/lib/ringWorldFor.test.js`
- Modify: `client/src/components/display/ParticleBackground.jsx:5,6,8,1157-1192` (remove the inline `RING_WORLDS`/`worldCache`/`ringWorldFor`, import them instead)

**Interfaces:**
- Produces: `RING_WORLDS` (object, theme id → base world), `ringWorldFor(theme) → worldData | undefined` — same signature `ParticleBackground.jsx` already calls it with (`theme` = the merged per-show theme object carrying `.id`, `.ringWorld?`, `.worldPalette?`).
- Consumes: `recolorWorld` (`./ringRecolor.js`), `resolveStations` (`./drawWorld.js`), `RING_POOL` (`../worlds/ringPool.js`), `RING_VERSION` (`./ringCertification.js`), `getTheme` (`../themes/index.js`), `midnightGalaxyRing` (`../worlds/midnightGalaxy.ring.js`) — all already exist, none modified by this task.

- [ ] **Step 1: Write the failing tests**

```js
// client/src/lib/ringWorldFor.test.js
import { describe, it, expect } from 'vitest'
import { ringWorldFor, RING_WORLDS } from './ringWorldFor.js'
import { midnightGalaxyRing } from '../worlds/midnightGalaxy.ring.js'
import { RING_VERSION } from './ringCertification.js'

const BASE_THEME = { id: 'midnight-galaxy', colors: { text: '#fff', textMuted: '#aaa' } }
const AUTHORED_KEYS = midnightGalaxyRing.stations.map(s => s.key)
// Same swap the 2026-09-14 shelf-stations plan's own integration test used
// (positions 0/10) — reused here so a drift between that verification and
// this one would show up as two different "known good" swaps disagreeing.
const SWAPPED_KEYS = AUTHORED_KEYS.map((k, i) => (i === 0 ? AUTHORED_KEYS[10] : i === 10 ? AUTHORED_KEYS[0] : k))

describe('RING_WORLDS', () => {
  it('registers midnight-galaxy against the authored base world', () => {
    expect(RING_WORLDS['midnight-galaxy']).toBe(midnightGalaxyRing)
  })
})

describe('ringWorldFor', () => {
  it('returns undefined for a theme with no registered ring world', () => {
    expect(ringWorldFor({ id: 'pure-michigan' })).toBeUndefined()
  })

  it('returns the base world when the theme has no worldPalette and no ringWorld', () => {
    expect(ringWorldFor(BASE_THEME)).toBe(midnightGalaxyRing)
  })

  it('recolors via worldPalette when present, no ringWorld', () => {
    const theme = { ...BASE_THEME, worldPalette: { colors: ['#ff0000', '#0000ff'], weights: [0.6, 0.4], drift: { arc: 60 } } }
    const world = ringWorldFor(theme)
    expect(world.stations.map(s => s.key)).toEqual(AUTHORED_KEYS)
    expect(world.stations.map(s => s.hue)).not.toEqual(midnightGalaxyRing.stations.map(s => s.hue))
  })

  it('resolves theme.ringWorld: reorders stations AND recolors, when ringVersion matches', () => {
    const theme = {
      ...BASE_THEME,
      ringWorld: {
        rowId: 'row-1', seed: 'showSeed:abc', ringVersion: RING_VERSION,
        stations: SWAPPED_KEYS,
        palette: { colors: ['#22c55e', '#eab308'], weights: [0.5, 0.5], drift: { arc: 30 } },
      },
    }
    const world = ringWorldFor(theme)
    expect(world.stations.map(s => s.key)).toEqual(SWAPPED_KEYS)
    expect(world.stations.map(s => s.hue)).not.toEqual(midnightGalaxyRing.stations.map(s => s.hue))
  })

  it('falls back to worldPalette when ringWorld.ringVersion is stale', () => {
    const theme = {
      ...BASE_THEME,
      ringWorld: { rowId: 'row-1', seed: 'x', ringVersion: 'v0-stale', stations: SWAPPED_KEYS, palette: { colors: ['#22c55e', '#eab308'], weights: [0.5, 0.5], drift: { arc: 30 } } },
      worldPalette: { colors: ['#ff0000', '#0000ff'], weights: [0.6, 0.4], drift: { arc: 60 } },
    }
    const world = ringWorldFor(theme)
    expect(world.stations.map(s => s.key)).toEqual(AUTHORED_KEYS) // worldPalette never reorders
  })

  it('falls back to the base world when ringWorld has an unresolvable station key, without throwing', () => {
    const theme = {
      ...BASE_THEME,
      ringWorld: { rowId: null, seed: 'x', ringVersion: RING_VERSION, stations: ['not-a-real-key', ...AUTHORED_KEYS.slice(1)], palette: { colors: ['#22c55e', '#eab308'], weights: [0.5, 0.5], drift: { arc: 30 } } },
    }
    expect(() => ringWorldFor(theme)).not.toThrow()
    expect(ringWorldFor(theme)).toBe(midnightGalaxyRing)
  })

  it('falls back to the base world when worldPalette itself is malformed, without throwing', () => {
    const theme = { ...BASE_THEME, worldPalette: { colors: 'not-an-array' } }
    expect(() => ringWorldFor(theme)).not.toThrow()
    expect(ringWorldFor(theme)).toBe(midnightGalaxyRing)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:unit -- ringWorldFor`
Expected: FAIL — `Cannot find module './ringWorldFor.js'` (the file doesn't exist yet).

- [ ] **Step 3: Write `client/src/lib/ringWorldFor.js`**

```js
// Resolves a theme's ring world (RingAmbient.jsx's worldData prop) from
// per-show overrides. Extracted from ParticleBackground.jsx (2026-09-24) so
// it's unit-testable without importing the whole component tree — no
// ringWorldFor test existed before this file. See design doc §7.1:
// docs/superpowers/plans/2026-09-05-ring-unified-noun-color-draw-design.md
import { midnightGalaxyRing } from '../worlds/midnightGalaxy.ring.js'
import { RING_POOL } from '../worlds/ringPool.js'
import { resolveStations } from './drawWorld.js'
import { recolorWorld } from './ringRecolor.js'
import { RING_VERSION } from './ringCertification.js'
import { getTheme } from '../themes/index.js'

// Plug-and-play: every ring-based ambient registers here by theme id -> its
// worldData module. ENGINE (frame geometry, layer config, SURGE_MS) stays
// module-scoped inside RingAmbient.jsx, not derived per-world — a world
// that reuses that geometry is a two-line drop-in; one that needs different
// geometry is a RingAmbient.jsx change, not just a registry entry.
export const RING_WORLDS = {
  'midnight-galaxy': midnightGalaxyRing,
}

// Memoized at module scope (not per-component state) so WarpTransition.jsx
// can read the identical recolored object ParticleBackground built, without
// either side recomputing it.
const worldCache = new Map()

function paletteOnly(theme, base) {
  if (!theme.worldPalette) return null
  const key = theme.id + '|palette|' + JSON.stringify(theme.worldPalette)
  if (!worldCache.has(key)) {
    try {
      worldCache.set(key, recolorWorld(base, theme.worldPalette, getTheme(theme.id)))
    } catch (err) {
      console.warn('[ring] bad worldPalette, using base:', err.message)
      worldCache.set(key, base)
    }
  }
  return worldCache.get(key)
}

// theme.ringWorld (a drawn world: stations + palette) wins when present and
// its ringVersion is current; theme.worldPalette (palette-only) is the next
// fallback; the unmodified base world is the fallback of the fallback. A
// malformed saved value must never blank the TV — every failure mode below
// falls through to the next tier instead of throwing.
export function ringWorldFor(theme) {
  const base = RING_WORLDS[theme.id]
  if (!base) return base

  if (theme.ringWorld && theme.ringWorld.ringVersion === RING_VERSION) {
    const key = theme.id + '|world|' + JSON.stringify(theme.ringWorld)
    if (!worldCache.has(key)) {
      try {
        const stations = resolveStations(RING_POOL, theme.ringWorld.stations)
        worldCache.set(key, recolorWorld({ ...base, stations }, theme.ringWorld.palette, getTheme(theme.id)))
      } catch (err) {
        console.warn('[ring] bad ringWorld, falling back:', err.message)
        worldCache.set(key, paletteOnly(theme, base) ?? base)
      }
    }
    return worldCache.get(key)
  }

  return paletteOnly(theme, base) ?? base
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:unit -- ringWorldFor`
Expected: PASS, all 8 tests.

- [ ] **Step 5: Wire `ParticleBackground.jsx` to the extracted module**

Modify `client/src/components/display/ParticleBackground.jsx`:

Replace line 6 (`import { midnightGalaxyRing } from '../../worlds/midnightGalaxy.ring.js'`) and line 8 (`import { recolorWorld } from '../../lib/ringRecolor.js'`) — both become unused by this file once the block below moves — with:

```js
import { RING_WORLDS, ringWorldFor } from '../../lib/ringWorldFor.js'
```

Delete the block currently at lines 1157-1192 (from `// ─── Ring-world registry ───` through the closing `}` of the old `ringWorldFor` function) and replace it with:

```js
// ─── Ring-world registry ──────────────────────────────────────────────────
// RING_WORLDS/ringWorldFor live in client/src/lib/ringWorldFor.js (moved
// 2026-09-24 for unit-testability). RING_WORLDS[theme.id] is what routes a
// theme to RingAmbient instead of AMBIENT_MAP, below.
```

Leave everything else in the file (the dev-only overlap-warning block, `ringWorldRef`, etc.) untouched — they already reference `RING_WORLDS`/`ringWorldFor` by name, which now resolve to the import.

- [ ] **Step 6: Run the full unit suite and the build**

Run: `npm run test:unit`
Expected: PASS, 846 + 8 = 854/854 (no existing test imports `ParticleBackground.jsx`, confirmed via `grep -rln "from '.*ParticleBackground" client/src --include="*.test.*"` returning nothing, so this refactor has zero risk of breaking an existing suite).

Run: `npm run build`
Expected: clean, no unused-import warnings for `midnightGalaxyRing`/`recolorWorld` in `ParticleBackground.jsx`.

- [ ] **Step 7: Commit**

```bash
git add client/src/lib/ringWorldFor.js client/src/lib/ringWorldFor.test.js client/src/components/display/ParticleBackground.jsx
git commit -m "feat(ring): extract ringWorldFor, resolve theme.ringWorld (drawn worlds) with graceful fallback"
```

---

### Task 2: World picker — shelf strip, Re-roll objects, Apply writes ringWorld

**Files:**
- Modify: `client/src/components/host/WorldPaletteEditor.jsx` (full set of changes below)
- Modify: `client/src/components/host/WorldPaletteEditor.test.jsx` (add tests)
- Modify: `client/src/components/host/ThemePickerModal.jsx:91,135-139,141-148,282-283,296-305`

**Interfaces:**
- Consumes: `drawWorld`, `resolveStations` (`../../lib/drawWorld.js`, already shipped — `drawWorld({ base, pool, shelf, showId, baseTheme, pinKey?, pinAt? }) → { world, showSeed, nounSeed, palSeed }`, where `world.stations[i].key` and `world.palette` are already populated by `recolorWorld`'s own return shape — verified by reading `ringRecolor.js:213-227`, no changes needed there), `RING_POOL` (`../../worlds/ringPool.js`), `RING_VERSION` (`../../lib/ringCertification.js`), `seedFrom` (`../../lib/paletteGenerator.js`, already exported), `findMatch`/`saveAsPending` (`../../lib/ringPalettesClient.js`, already accept/compare `stations`).
- Produces: `WorldPaletteEditor` gains a `showId` prop; its `onApplyThemeColors` callback is now called with `{ themeColors, worldPalette, ringWorld? }` — `ringWorld` present only when the current pick carries a non-authored station draw (see Global Constraints' shared contract). `ThemePickerModal` threads `showId={show.id}` through and merges/clears `overrides.ringWorld` the same way it already does for `overrides.worldPalette`.

- [ ] **Step 1: Write the failing tests** (append to `client/src/components/host/WorldPaletteEditor.test.jsx`)

First, extend the existing mocks at the top of the file. Replace the `fetchCertifiedPalettes` mock (lines 17-23) with:

```js
vi.mock('../../lib/ringPalettesClient.js', () => ({
  fetchCertifiedPalettes: vi.fn().mockResolvedValue([
    { id: '1', colors: ['#a855f7', '#3b82f6'], weights: [0.65, 0.35], drift: { arc: 60 }, source: 'generated', seed: '42', stations: null },
    {
      id: '2', colors: ['#22c55e', '#eab308'], weights: [0.5, 0.5], drift: { arc: 30 }, source: 'generated', seed: '99',
      // Swap of positions 0/10 — same swap the 2026-09-14 shelf-stations
      // plan's own integration test used, reused here for the same reason
      // ringWorldFor.test.js reuses it: two independent "known good" swaps
      // agreeing is worth more than either alone.
      stations: ['eclipse', 'spiral galaxy', 'star cluster', 'amber planet', 'lit planet', 'pulsar', 'rose nebula', 'comet', 'binary pair', 'asteroid field', 'ringed planet', 'aurora ribbon', 'supernova'],
    },
  ]),
  saveAsPending: vi.fn().mockResolvedValue(undefined),
  findMatch: (shelf, p) => shelf.find(s => JSON.stringify(s.colors) === JSON.stringify(p.colors) && JSON.stringify(s.weights) === JSON.stringify(p.weights) && JSON.stringify(s.drift) === JSON.stringify(p.drift)),
}))
```

Add a `drawWorld` mock right after the `RingAmbient.jsx` mock (after line 34), so "Re-roll objects" is deterministic and its failure path is exercised without depending on the real pool's current (documented, deterministic) shortage:

```js
let drawWorldImpl = () => { throw new Error('ringDraw: pool cannot fill 13 slots under the caps (chose 11 of 13)') }
vi.mock('../../lib/drawWorld.js', async () => {
  const actual = await vi.importActual('../../lib/drawWorld.js')
  return { ...actual, drawWorld: (...args) => drawWorldImpl(...args) }
})
```

Reset it in `beforeEach` (add to the existing `beforeEach` block, after `mounts.length = 0`):

```js
  drawWorldImpl = () => { throw new Error('ringDraw: pool cannot fill 13 slots under the caps (chose 11 of 13)') }
```

Then add these tests inside the existing `describe('WorldPaletteEditor', ...)` block:

```js
  it('lists certified shelf rows as clickable cards, including a drawn-world row', async () => {
    render()
    await act(async () => { await Promise.resolve() })
    const cards = [...host.querySelectorAll('button[title]')]
    expect(cards).toHaveLength(2)
    expect(cards[1].title).toContain('eclipse')
  })

  it('picking a drawn-world shelf card reorders the preview stations to match', async () => {
    render()
    await act(async () => { await Promise.resolve() })
    const worldCard = [...host.querySelectorAll('button[title]')].find(b => b.title.startsWith('eclipse'))
    act(() => worldCard.click())
    const last = mounts.at(-1).worldData.stations
    expect(last[0].key).toBe('eclipse')
    expect(last[10].key).toBe('ringed planet')
  })

  it('Apply on a picked drawn-world row hands up a ringWorld payload matching the shelf row', async () => {
    const applied = []
    render({ onApplyThemeColors: c => applied.push(c), showId: 'show-abc' })
    await act(async () => { await Promise.resolve() })
    const worldCard = [...host.querySelectorAll('button[title]')].find(b => b.title.startsWith('eclipse'))
    act(() => worldCard.click())
    act(() => byText("Apply to this show's theme").click())
    expect(applied).toHaveLength(1)
    expect(applied[0].ringWorld).toEqual({
      rowId: '2',
      seed: expect.stringMatching(/^showSeed:[0-9a-f]+$/),
      ringVersion: expect.any(String),
      stations: ['eclipse', 'spiral galaxy', 'star cluster', 'amber planet', 'lit planet', 'pulsar', 'rose nebula', 'comet', 'binary pair', 'asteroid field', 'ringed planet', 'aurora ribbon', 'supernova'],
      palette: { colors: ['#22c55e', '#eab308'], weights: [0.5, 0.5], drift: { arc: 30 } },
    })
  })

  it('Apply on a plain palette pick omits ringWorld entirely (back-compat)', async () => {
    const applied = []
    render({ onApplyThemeColors: c => applied.push(c) })
    await act(async () => { await Promise.resolve() })
    act(() => byText("Apply to this show's theme").click())
    expect(applied).toHaveLength(1)
    expect('ringWorld' in applied[0]).toBe(false)
  })

  it('Re-roll objects composes a new draw and updates the preview on success', async () => {
    drawWorldImpl = () => ({
      world: {
        stations: [{ key: 'eclipse' }, ...Array(12).fill({ key: 'x' })],
        palette: { colors: ['#111111', '#222222'], weights: [0.7, 0.3], drift: { arc: 45 } },
      },
      showSeed: 1, nounSeed: 2, palSeed: 3,
    })
    render()
    await act(async () => { await Promise.resolve() })
    act(() => byText('Re-roll objects').click())
    expect(mounts.at(-1).worldData.stations[0].key).toBe('eclipse')
  })

  it('Re-roll objects shows a plain error instead of crashing when the pool cannot fill 13 slots (known limit — docs/superpowers/plans/2026-09-14-ring-world-shelf-stations.md)', async () => {
    render()
    await act(async () => { await Promise.resolve() })
    act(() => byText('Re-roll objects').click())
    expect(host.textContent).toContain("Couldn't compose a new object set")
    // Must not have crashed the rest of the modal:
    expect(byText("Apply to this show's theme")).toBeTruthy()
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:unit -- WorldPaletteEditor`
Expected: FAIL — no shelf cards rendered (`button[title]` query finds 0), no "Re-roll objects" button exists yet, `ringWorld` never present on the applied payload.

- [ ] **Step 3: Implement the component changes**

Modify `client/src/components/host/WorldPaletteEditor.jsx`:

Imports (replace line 3 and add three new lines after line 6):

```js
import { PRESETS, seedFrom } from '../../lib/paletteGenerator.js'
import { recolorWorld } from '../../lib/ringRecolor.js'
import { midnightGalaxyRing } from '../../worlds/midnightGalaxy.ring.js'
import { RING_POOL } from '../../worlds/ringPool.js'
import { resolveStations, drawWorld } from '../../lib/drawWorld.js'
import { RING_VERSION } from '../../lib/ringCertification.js'
import { fetchCertifiedPalettes, saveAsPending, findMatch } from '../../lib/ringPalettesClient.js'
```

After line 36 (`const CURRENT_HUES = ...`), add:

```js
const AUTHORED_STATION_KEYS = midnightGalaxyRing.stations.map(s => s.key)
```

Component signature (line 91) — add `showId`:

```js
export default function WorldPaletteEditor({ onClose, baseTheme, onApplyThemeColors, showId }) {
```

New state — add after line 107 (`const [shelfError, setShelfError] = useState(false)`):

```js
  const [stations, setStations] = useState(null) // null = authored ring; else a 13-key drawn order
  const [rerollError, setRerollError] = useState(false)
```

Replace the `previewWorldData` block (lines 182-189):

```js
  // Committed palette + committed stations (recolorWorld internally derives
  // the palette; resolveStations reorders the base ring's nouns) — drives
  // the ring preview only. A malformed committed value must never throw
  // during render — Host.jsx's ErrorBoundary sits above the WHOLE control
  // surface, not just this modal, so an uncaught throw here would take down
  // a live show's host screen, not just fail to preview a pick.
  const previewWorldData = useMemo(() => {
    try {
      const base = stations ? { ...midnightGalaxyRing, stations: resolveStations(RING_POOL, stations) } : midnightGalaxyRing
      return recolorWorld(base, committed, baseTheme)
    } catch (err) {
      console.warn('[palette editor] bad committed world, showing base world:', err.message)
      return midnightGalaxyRing
    }
  }, [committed, stations, baseTheme])
```

Add a `reRollObjects` function near `copyRingRecolorCommand` (after it, before the `return`):

```js
  function reRollObjects() {
    setRerollError(false)
    try {
      const { world } = drawWorld({ base: midnightGalaxyRing, pool: RING_POOL, shelf, showId: String(showId ?? 'preview'), baseTheme })
      applyPalette(world.palette.colors, world.palette.weights, world.palette.drift.arc)
      setStations(world.stations.map(s => s.key))
    } catch {
      // Known, deterministic today: the real pool has 5 radial-mass entries
      // against a cap of 4, so every seed throws. See Global Constraints,
      // docs/superpowers/plans/2026-09-24-ring-world-picker-ui.md.
      setRerollError(true)
    }
  }
```

Retitle the header (line 225): change `World palette — Midnight Galaxy` to `World — Midnight Galaxy` (matches design doc §7.2's exact wording).

Add the shelf strip. Insert it right after the preset row's closing `</div>` (after line 244) and before the `<div className="flex items-center gap-3">` that holds "Custom colors"/"Surprise me" (line 245):

```jsx
          <div className="flex gap-2 overflow-x-auto pb-1">
            {shelfLoading ? (
              [0, 1, 2].map(i => <div key={i} className="shrink-0 w-28 h-14 rounded-lg bg-gray-100 animate-pulse" />)
            ) : shelf.length === 0 ? (
              <p className="text-xs text-gray-400 py-2">No certified worlds yet — run `palette-sweep.mjs --world-batch`.</p>
            ) : (
              shelf.map(row => (
                <button
                  key={row.id}
                  onClick={() => {
                    applyPalette(row.colors, row.weights, row.drift?.arc ?? 60)
                    setStations(row.stations ?? null)
                  }}
                  title={(row.stations ?? AUTHORED_STATION_KEYS).join(', ')}
                  className="shrink-0 w-28 rounded-lg border border-gray-200 hover:border-gray-400 overflow-hidden text-left"
                >
                  <div className="flex h-6">
                    {row.colors.map((c, i) => (
                      <span key={i} className="h-full" style={{ width: `${(row.weights[i] ?? 0) * 100}%`, background: c }} />
                    ))}
                  </div>
                  {/* ponytail: dot-per-noun hue coloring skipped — every
                      certified row today has stations=null (see Global
                      Constraints), so 13 identical dots would show nothing.
                      Add real per-dot hue once a --world-batch run actually
                      certifies a drawn-world row. */}
                  <div className="px-1.5 py-1 text-[10px] text-gray-500">
                    {row.stations ? `${row.stations.length}-noun world` : 'Palette'}
                  </div>
                </button>
              ))
            )}
          </div>
```

In the existing "Surprise me" button (around line 252-267), extend `onClick` to also carry the picked row's stations:

```js
            <button
              onClick={() => {
                if (!shelf.length) return
                const pick = shelf[Math.floor(Math.random() * shelf.length)]
                applyPalette(pick.colors, pick.weights, pick.drift.arc)
                setDrift(pick.drift.arc)
                setStations(pick.stations ?? null)
              }}
              disabled={shelfLoading || !shelf.length}
              className="text-xs font-medium px-3 py-1.5 rounded-full border border-gray-200 hover:border-gray-400 disabled:opacity-40"
            >
              {shelfLoading ? 'Loading palettes…' : shelfError ? "Couldn't load palettes — try again" : shelf.length ? `🎲 Surprise me (${shelf.length} ready)` : 'No certified palettes yet'}
            </button>
            <button
              onClick={reRollObjects}
              disabled={shelfLoading || !shelf.length}
              className="text-xs font-medium px-3 py-1.5 rounded-full border border-gray-200 hover:border-gray-400 disabled:opacity-40"
            >
              🔀 Re-roll objects
            </button>
```

Right after that button row's closing `</div>` (the one holding "Custom colors"/"Surprise me"/"Re-roll objects"), add:

```jsx
          {rerollError && (
            <p className="text-xs text-amber-700">
              Couldn't compose a new object set yet — the noun pool needs more variety first (known, tracked).
            </p>
          )}
```

Swap the left-rail station list's data source (around line 302) from `midnightGalaxyRing.stations` to `previewWorldData.stations`:

```jsx
            {previewWorldData.stations.map((st, i) => (
```

(the rest of that block — `onClick`, className, hue dot using `derived.hues[i]`, `{st.key}` — is unchanged; `derived.hues` stays positional and valid regardless of which noun occupies which slot.)

Swap the advisory table's row label (around line 342) from `midnightGalaxyRing.stations[a.index].key` to `previewWorldData.stations[a.index].key`.

Rewrite the Apply button's `onClick` (lines 396-418):

```js
            onClick={async () => {
              setSaveFailed(false)
              const current = { colors, weights, drift: { arc: drift }, stations }
              const match = findMatch(shelf, current)
              const payload = { themeColors: derived.themeColors, worldPalette: { colors, weights, drift: { arc: drift } } }
              if (stations) {
                payload.ringWorld = {
                  rowId: match?.id ?? null,
                  seed: `showSeed:${seedFrom(String(showId ?? '')).toString(16)}`,
                  ringVersion: RING_VERSION,
                  stations,
                  palette: { colors, weights, drift: { arc: drift } },
                }
              }
              if (match) {
                onApplyThemeColors(payload)
                setApplied(true)
                appliedTimeoutRef.current = setTimeout(onClose, 700)
              } else {
                try {
                  await saveAsPending(current)
                  setSavedPending(true)
                  appliedTimeoutRef.current = setTimeout(onClose, 1200)
                } catch {
                  setSaveFailed(true)
                }
              }
            }}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:unit -- WorldPaletteEditor`
Expected: PASS, all tests (existing + new).

- [ ] **Step 5: Wire `ThemePickerModal.jsx`**

Modify `client/src/components/host/ThemePickerModal.jsx`:

Extend `applyPaletteColors` (lines 135-139) to carry `ringWorld` when present:

```js
  function applyPaletteColors({ themeColors, worldPalette, ringWorld }) {
    const next = { ...overrides, colors: { ...overrides.colors, ...themeColors }, worldPalette }
    if (ringWorld) next.ringWorld = ringWorld
    else delete next.ringWorld
    setOverrides(next)
    onUpdateOverrides(next)
  }
```

Extend `resetToPreset` (lines 141-148) to also clear it:

```js
  function resetToPreset() {
    const next = { ...overrides }
    delete next.colors
    delete next.fonts
    delete next.worldPalette
    delete next.ringWorld
    setOverrides(next)
    onUpdateOverrides(next)
  }
```

Thread `showId` through to `WorldPaletteEditor` (around line 302):

```jsx
          <WorldPaletteEditor
            baseTheme={baseTheme}
            showId={show.id}
            onApplyThemeColors={applyPaletteColors}
            onClose={() => setPaletteOpen(false)}
          />
```

- [ ] **Step 6: Run the full unit suite**

Run: `npm run test:unit`
Expected: PASS. No test file exists for `ThemePickerModal.jsx` today (confirmed: `ls client/src/components/host/ThemePickerModal.test.jsx` → not found) — its two-line merge changes are covered by inspection and by `WorldPaletteEditor.test.jsx`'s payload-shape assertions, consistent with the rest of that file being untested already.

- [ ] **Step 7: Commit**

```bash
git add client/src/components/host/WorldPaletteEditor.jsx client/src/components/host/WorldPaletteEditor.test.jsx client/src/components/host/ThemePickerModal.jsx
git commit -m "feat(ring): World picker — shelf strip, Re-roll objects, Apply writes ringWorld (design doc step 5)"
```

---

## Self-Review

**Spec coverage** (design doc §7.2, row by row): shelf strip → Task 2 (shelf-card block). Surprise me → already existed, extended to carry `stations`. Re-roll objects → Task 2 `reRollObjects`, with the pool's real documented failure surfaced instead of hidden. Custom (collapsed) → untouched, already exists. Left column drawn nouns in slot order → Task 2's `previewWorldData.stations` swap. Apply exact-match-instant / else-pending → Task 2's Apply rewrite, extended with `ringWorld`. §7.1 storage shape → Task 1 reads it, Task 2 writes it, both against the same Global Constraints block, no drift possible since both cite this one plan.

**Placeholder scan:** none — every step has real, complete code and named file:line targets.

**Type consistency:** `ringWorldFor(theme)` (Task 1) reads exactly the `theme.ringWorld` shape Task 2's Apply handler writes (`rowId`, `seed`, `ringVersion`, `stations`, `palette`) — cross-checked field-by-field against the Global Constraints block both tasks cite. `reRollObjects` reads `world.stations[i].key` and `world.palette.{colors,weights,drift.arc}` — both already proven to exist on `drawWorld`'s return by reading `ringRecolor.js:213-227` (`recolorWorld` always attaches `.palette`) rather than assumed.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-24-ring-world-picker-ui.md`. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
