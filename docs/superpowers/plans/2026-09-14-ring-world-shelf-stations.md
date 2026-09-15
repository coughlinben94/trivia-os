# Ring World — Shelf `stations` Column + World Batch + Match/Save Implementation Plan

> **Amendment, 2026-09-14 (separate session):** Task 2/3 patched to fix a render-fidelity gap the original draft missed — resolving a drawn world's stations against `RING_POOL` (its reduced, draw-only shape) would have silently stripped every noun's `region`/`companionKind`/`maxDetail`/`variant` at render time. `resolveStations` gained an optional third `slots` argument; real call sites now resolve against full station objects (`midnightGalaxyRing.stations` / `world-07-ring.html`'s own `WORLD.stations` literal) plus `SLOTS`'s positional layout fields, instead of `RING_POOL`. Everything else in this plan (schema, `--world-batch`, `findMatch`/`saveAsPending`) is unchanged from the original draft. See Task 2's header note for the full reasoning.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Also read `references/ring-world-continuity.md` before starting — this plan lives in the ring-world system's mandatory-read set.

**Goal:** Build step 4 of the unified noun-color draw design — the `ring_palettes` schema, render-route, and sweep-tool plumbing that lets a *composed world* (drawn stations + a palette, not just a palette) be certified, stored, and matched — so step 5 (picker UI) has something to call.

**Architecture:** `ring_palettes` gains a nullable `stations` column (null = "the authored ring," same meaning every existing row already carries). A new pure helper, `worldFromParams`, unifies the query-param-to-world logic that `concepts/world-07-ring.html` and `client/src/views/AmbientAudit.jsx` each currently duplicate (kept in sync by comment discipline only) — both call it, and it gains the ability to swap which nouns render, not just recolor them. `palette-sweep.mjs` gains `--world-batch N`, which draws N worlds via the already-shipped `drawWorld()` and certifies each through the same Playwright gate the palette-only sweep uses, now hitting the new `?stations=` param. `findMatch`/`saveAsPending` grow to compare/write `stations`.

**Tech Stack:** React, Vite, Supabase (Postgres + RLS), Playwright (`concepts/tools/ring-verify.mjs`), Vitest.

**Spec:** `docs/superpowers/plans/2026-09-05-ring-unified-noun-color-draw-design.md` §7 (storage/picker/sweep shapes), §11a/§11b (Ben's decisions — items 1,2,3,5,6,7,8,9,10,11 settled, item 4 eclipse-placement still open/provisional). Also read `docs/superpowers/plans/2026-09-05-ring-draw-engine-implementation.md` and `2026-09-05-ring-world-composition-implementation.md` — the two prior plans that shipped `ringDraw.js` and `drawWorld.js`, which this plan builds on without modifying.

## Global Constraints

- `stations jsonb null` on `ring_palettes` — `null` means "the authored ring" (design doc §7.1, Ben-confirmed §11b item 7). No new table.
- **Known, deterministic blocker — do not treat as a bug to fix in this plan.** The real 13-station pool (`client/src/worlds/ringPool.js`'s `RING_POOL`) has 5 `radial-mass` members against `LANE_CAP(13) = 4`; **every** non-`'authored'` seed passed to `drawStations`/`drawWorld` against `RING_POOL` throws `cannot fill 13 slots under the caps` (verified: `client/src/lib/ringDraw.test.js:82`). This is `drawWorld.js:12-18`'s own documented comment, not new information. Fixing the pool is step 6 (art project, out of scope). `--world-batch` (Task 4) must catch this per-seed and write a `status: 'failed'` row, never crash the batch or block on it. Running `--world-batch` against the live `RING_POOL` today will produce zero certified world rows — that is the machinery working correctly, not a defect in this plan's code.
- STAYS HUMAN (per `references/ring-world-continuity.md` §4): this plan edits no lock file, no gate check code, no threshold, and makes no aesthetic call. If a task's implementer hits a decision on that list, stop and name it rather than deciding.
- Never touch `ring-spec.lock.json`, `concepts/tools/ring-verify.mjs`'s pass/fail logic, `RingAmbient.jsx`, `derivePalette`, `recolorWorld`'s own body, `SLOTS`, `MUSIC_STATION`, the warp, or the Jukebox — design doc §7.4, unchanged by this plan.
- `RING_VERSION` (currently `'v1-2026-09-06'`, `client/src/lib/ringCertification.js`) is not bumped by this plan — no ring-art or gate-check change happens here.
- Every new Supabase migration is additive (`alter table ... add column`) — no existing row's meaning changes, per the doc's own "nothing re-certifies for the schema change alone" framing.
- This plan does **not** build the picker UI (design doc §7.2, step 5) — that is a separate follow-up plan, same discipline as every prior ring-world step.

---

### Task 1: `stations` column on `ring_palettes`

**Files:**
- Create: `supabase/migrations/20260915000000_ring_palettes_stations_column.sql`

**Interfaces:**
- Produces: `ring_palettes.stations jsonb null` — an array of 13 `{key, prim, hue, accent, family}` objects (the shape `RING_POOL` entries already have) when set, `null` when the row means "the authored ring."

- [ ] **Step 1: Write the migration**

```sql
-- Adds the "world" shape to the existing palette-only shelf. A row with
-- stations = null means "the authored 13," the same meaning every existing
-- certified/failed row already carries — nothing re-certifies for this
-- schema change alone (docs/superpowers/plans/2026-09-05-ring-unified-noun-color-draw-design.md
-- §7.1, Ben-confirmed 2026-09-14 §11b item 7). RING_VERSION is not bumped by
-- this migration.
alter table public.ring_palettes
  add column stations jsonb;
```

- [ ] **Step 2: Apply via Supabase MCP**

Use `mcp__supabase__apply_migration` with `project_id: qwtbgusqfoypvehnungr`, `name: ring_palettes_stations_column`, and the SQL above (never raw `execute_sql` for DDL — the project convention, see this file's own header comment style in the origin migration `supabase/migrations/20260903180438_ring_palettes_table.sql`).

- [ ] **Step 3: Verify**

Run `mcp__supabase__list_tables` (project `qwtbgusqfoypvehnungr`, `verbose: true`) and confirm `ring_palettes` now lists a `stations` column, type `jsonb`, nullable. Run:

```sql
select count(*) from ring_palettes where stations is not null;
```

Expected: `0` — no existing row gains a value from this migration.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260915000000_ring_palettes_stations_column.sql
git commit -m "feat(ring): add nullable stations column to ring_palettes"
```

---

### Task 2: `resolveStations` + `worldFromParams` pure helpers

**Files:**
- Modify: `client/src/lib/drawWorld.js` (add both functions, exported)
- Modify: `client/src/lib/drawWorld.test.js` (add this task's tests)

**Interfaces:**
- Consumes: nothing new — uses only what `drawWorld.js` already imports (`recolorWorld`).
- Produces:
  - `resolveStations(pool, keys, slots)` → `Array<station>`, throws `Error` naming the missing key if any `keys` entry isn't in `pool`. `slots` is optional (third param, default `undefined`).
  - `worldFromParams({ colorsParam, weightsParam, driftParam, stationsParam }, { base, pool, baseTheme, slots })` → a world object (`{...base, stations?}`, optionally recolored). Both are pure — no DOM, no fetch, no `URLSearchParams` inside them (callers parse their own query string and pass plain strings/undefined).

**Why `resolveStations` takes an optional third `slots` argument — a gap this plan's original draft missed:** `RING_POOL` (`client/src/worlds/ringPool.js`) is a *reduced* projection of the real ring — `{key, prim, hue, accent, family}` only, built for `drawStations`'s lane-spacing math. It drops `region`, `regionSource`, `companionKind`, `variant`, `maxDetail` — fields `RingAmbient.jsx`'s DOM builder (`ringDom` in `ringPrimitives.js`) reads to actually render a station's companion, sky-region tint, and detail level. If Task 3's render routes resolved drawn keys against `RING_POOL`, a drawn world would render every noun stripped of its own visual identity — no companion, no region tint, silently degraded, not crashed, so nothing would catch it except a human noticing the TV looks wrong. The fix: **real render call sites resolve against `midnightGalaxyRing.stations` (the full authored objects, keyed the same way) instead of `RING_POOL`**, recovering every noun-intrinsic field for free. The one thing still missing after that swap is purely positional: `cornerLeft`/`bandUpper`/`companionUpper`/`companionBoost` (`client/src/worlds/midnightGalaxy.slots.js`'s `SLOTS`) describe where in the frame a station's companion sits — that's about the *slot* a noun lands in, not the noun itself, so a drawn noun placed in a new slot must take on that slot's layout, not carry its original one. `resolveStations`'s optional `slots` param merges exactly those four fields, keyed by output position (`slots[i]`), while leaving `family` out (draw-time-only, never a rendering field) and leaving every noun-intrinsic field alone. `SATISFIABLE_POOL` (this file's existing synthetic test fixture) never had these fields to begin with, so every existing test in this file is unaffected by the new optional parameter — it's additive.

- [ ] **Step 1: Write the failing tests**

Append to `client/src/lib/drawWorld.test.js` (after the existing `describe('drawWorld', ...)` block, same file — reuses `BASE`, `SATISFIABLE_POOL`, `THEME` already defined there):

```javascript
describe('resolveStations', () => {
  it('looks up each key in slot order, returning the pool entries', () => {
    const result = resolveStations(SATISFIABLE_POOL, ['r2', 'c1', 'b3'])
    expect(result.map(s => s.key)).toEqual(['r2', 'c1', 'b3'])
    expect(result[0]).toEqual(SATISFIABLE_POOL.find(s => s.key === 'r2'))
  })

  it('throws naming the missing key', () => {
    expect(() => resolveStations(SATISFIABLE_POOL, ['r2', 'nope']))
      .toThrow(/no pool entry for key "nope"/)
  })

  it('merges layout fields from slots, keyed by output position, when slots is given', () => {
    const slots = [
      { cornerLeft: true, bandUpper: false, companionUpper: true, companionBoost: false, family: 'ignored' },
      { cornerLeft: false, bandUpper: true, companionUpper: false, companionBoost: true, family: 'ignored' },
    ]
    const result = resolveStations(SATISFIABLE_POOL, ['r2', 'c1'], slots)
    expect(result[0]).toMatchObject({ key: 'r2', cornerLeft: true, bandUpper: false, companionUpper: true, companionBoost: false })
    expect(result[1]).toMatchObject({ key: 'c1', cornerLeft: false, bandUpper: true, companionUpper: false, companionBoost: true })
    // family is draw-time-only, never a rendering field — never merged in,
    // even though the slots fixture above carries one (to prove it's ignored).
    expect(result[0].family).toBe(SATISFIABLE_POOL.find(s => s.key === 'r2').family)
  })

  it('returns pool entries unchanged when slots is omitted', () => {
    const result = resolveStations(SATISFIABLE_POOL, ['r2', 'c1'])
    expect(result[0]).toEqual(SATISFIABLE_POOL.find(s => s.key === 'r2'))
    expect(result[1]).toEqual(SATISFIABLE_POOL.find(s => s.key === 'c1'))
  })
})

describe('worldFromParams', () => {
  it('returns base unchanged when no params are given', () => {
    const result = worldFromParams({}, { base: BASE, pool: SATISFIABLE_POOL, baseTheme: THEME })
    expect(result).toBe(BASE)
  })

  it('swaps stations when stationsParam is given, without recoloring', () => {
    const stationsParam = SATISFIABLE_POOL.map(s => s.key).reverse().join(',')
    const result = worldFromParams(
      { stationsParam },
      { base: BASE, pool: SATISFIABLE_POOL, baseTheme: THEME },
    )
    expect(result.stations.map(s => s.key)).toEqual(SATISFIABLE_POOL.map(s => s.key).reverse())
  })

  it('recolors when colorsParam is given, without touching stations', () => {
    const result = worldFromParams(
      { colorsParam: '#ff2200,#2563eb', weightsParam: '0.55,0.45', driftParam: '0' },
      { base: BASE, pool: SATISFIABLE_POOL, baseTheme: THEME },
    )
    expect(result.stations.map(s => s.key)).toEqual(BASE.stations.map(s => s.key))
    expect(result.palette.colors).toEqual(['#ff2200', '#2563eb'])
  })

  it('applies stations first, then recolors the swapped set, when both are given', () => {
    const stationsParam = SATISFIABLE_POOL.map(s => s.key).slice().reverse().join(',')
    const result = worldFromParams(
      { colorsParam: '#ff2200,#2563eb', weightsParam: '0.55,0.45', driftParam: '0', stationsParam },
      { base: BASE, pool: SATISFIABLE_POOL, baseTheme: THEME },
    )
    expect(result.stations.map(s => s.key)).toEqual(SATISFIABLE_POOL.map(s => s.key).reverse())
    expect(result.palette.colors).toEqual(['#ff2200', '#2563eb'])
  })
})
```

Add `resolveStations` and `worldFromParams` to the existing top import line in that test file (currently `import { assertWorld, drawWorld } from './drawWorld.js'`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os && npm run test:unit -- drawWorld`
Expected: FAIL — `resolveStations`/`worldFromParams` are not exported yet.

- [ ] **Step 3: Implement**

Add to `client/src/lib/drawWorld.js`, after `assertWorld` (after line 36) and before the `NOUN_SALT`/`COLR_SALT` constants:

```javascript
// slots is optional — see this task's header note on why real render call
// sites pass it (client/src/worlds/midnightGalaxy.slots.js's SLOTS) and this
// file's own synthetic test pool doesn't need to. Merged fields are keyed by
// OUTPUT position (slots[i]), not the pool entry's original position — a
// drawn noun takes on the layout of the slot it lands in, never the one it
// came from. `family` is deliberately never merged: it's draw-time-only
// (ringDraw.js's lane-spacing math), not a rendering field.
export function resolveStations(pool, keys, slots) {
  return keys.map((key, i) => {
    const found = pool.find(s => s.key === key)
    if (!found) throw new Error(`resolveStations: no pool entry for key "${key}"`)
    if (!slots) return found
    const { cornerLeft, bandUpper, companionUpper, companionBoost } = slots[i]
    return { ...found, cornerLeft, bandUpper, companionUpper, companionBoost }
  })
}

// Unifies the query-param-to-world logic concepts/world-07-ring.html and
// AmbientAudit.jsx each used to duplicate inline (kept in sync by comment
// discipline only — see either file's pre-2026-09-15 history). Pure: no
// URLSearchParams, no DOM — callers parse their own query string and pass
// plain strings or undefined. stationsParam applies before colorsParam so a
// recolor always sees the swapped set, matching drawWorld()'s own order
// (draw stations, then recolorWorld over them).
export function worldFromParams({ colorsParam, weightsParam, driftParam, stationsParam }, { base, pool, baseTheme, slots }) {
  let result = base
  if (stationsParam) {
    result = { ...result, stations: resolveStations(pool, stationsParam.split(','), slots) }
  }
  if (colorsParam) {
    result = recolorWorld(result, {
      colors: colorsParam.split(','),
      weights: weightsParam ? weightsParam.split(',').map(Number) : undefined,
      drift: driftParam ? { arc: Number(driftParam) } : undefined,
    }, baseTheme)
  }
  return result
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- drawWorld`
Expected: PASS, all tests in the file (prior `assertWorld`/`drawWorld` tests + this task's 8 new ones: 4 `resolveStations` + 4 `worldFromParams`).

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/drawWorld.js client/src/lib/drawWorld.test.js
git commit -m "feat(ring): add resolveStations + worldFromParams to drawWorld.js"
```

---

### Task 3: Wire `worldFromParams` into both render routes, add `?stations=`

**Files:**
- Modify: `concepts/world-07-ring.html:451-473`
- Modify: `client/src/views/AmbientAudit.jsx:1-37`

**Interfaces:**
- Consumes: `worldFromParams`, `resolveStations` (Task 2, `client/src/lib/drawWorld.js`). The pool passed to `worldFromParams` must be FULL station objects (not `RING_POOL`, which drops `region`/`companionKind`/`maxDetail`/`variant` — fine for the draw's lane-spacing math, but would silently strip a drawn noun's own look if used to render it — see Task 2's header note). `world-07-ring.html` already defines its own full-fidelity `WORLD.stations` literal (this file has no `midnightGalaxyRing` import — it's a standalone reference build, synced by hand, not by import); `AmbientAudit.jsx` already imports the real `midnightGalaxyRing` (`client/src/worlds/midnightGalaxy.ring.js:6`) — use that. Both files need `SLOTS` (`client/src/worlds/midnightGalaxy.slots.js`) for the render-position layout fields Task 2's `slots` param merges in — `world-07-ring.html` already imports it (line 266); `AmbientAudit.jsx` does not yet.
- Produces: both render routes now accept `?stations=key1,key2,...,key13` (13 comma-separated pool keys, slot order) alongside the existing `?colors=&weights=&drift=`. No stations param → behavior byte-identical to today (design doc §10's "no claim about how any composed world looks" still holds — nothing renders differently until a caller passes `stations`). A drawn noun renders with its own region/companion/detail level intact, using the layout of the slot it's placed in.

- [ ] **Step 1: Replace `world-07-ring.html`'s inline param block**

Replace lines 462-473 (the `{ const q = new URLSearchParams(...) ... }` block) with:

```javascript
{
  const q = new URLSearchParams(location.search);
  WORLD = worldFromParams({
    colorsParam: q.get('colors'),
    weightsParam: q.get('weights'),
    driftParam: q.get('drift'),
    stationsParam: q.get('stations'),
  }, { base: WORLD, pool: WORLD.stations, slots: SLOTS, baseTheme: { colors: { bg: SKY_BG, bgDeep: SKY_BG_DEEP } } });
}
```

`pool: WORLD.stations` reads this file's own pre-recolor authored literal (defined above at line 381) — the same full-fidelity source `RING_POOL` is itself derived from, just not stripped down. `SLOTS` is already imported (line 266); no new import needed for it.

Add one import at the top of the module script block, alongside the existing ones at line 263-266:

```javascript
import { worldFromParams } from '../client/src/lib/drawWorld.js';
```

- [ ] **Step 2: Replace `AmbientAudit.jsx`'s `ringWorldData` memo**

Replace lines 21-37 with:

```javascript
  const ringWorldData = useMemo(() => {
    const colorsParam = params.get('colors')
    const stationsParam = params.get('stations')
    if (!colorsParam && !stationsParam) return midnightGalaxyRing
    try {
      return worldFromParams({
        colorsParam,
        weightsParam: params.get('weights'),
        driftParam: params.get('drift'),
        stationsParam,
      }, { base: midnightGalaxyRing, pool: midnightGalaxyRing.stations, slots: SLOTS, baseTheme: getTheme('midnight-galaxy') })
    } catch (err) {
      console.warn('[AmbientAudit] bad ?colors=/?stations= params, using base:', err.message)
      return midnightGalaxyRing
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchString])
```

`pool: midnightGalaxyRing.stations` — the full authored objects (this file already imports `midnightGalaxyRing`, line 6), never the reduced `RING_POOL` (see this task's Interfaces note). Replace the import on line 7 (`import { recolorWorld } from '../lib/ringRecolor.js'`) with:

```javascript
import { worldFromParams } from '../lib/drawWorld.js'
import { SLOTS } from '../worlds/midnightGalaxy.slots.js'
```

- [ ] **Step 3: Manual verification (no unit test — this step touches only render-route wiring, already covered by Task 2's pure-function tests)**

Run `npm run verify:ring` from the repo root (this is a "regression tier must stay green" check, not a new test — the STAYS-HUMAN gate on this system is aesthetic/threshold judgment, not this mechanical wiring check):

```bash
cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os && npm run verify:ring
```

Expected: identical regression-tier and spec-tier results to the pre-task baseline (no `?stations=` param is passed by this check, so nothing should change). Record the before/after PASS/FAIL counts in the task report — a diff here means something in Step 1/2 broke the no-params path, stop and fix before proceeding.

Then load `http://localhost:<staticServerPort>/concepts/world-07-ring.html?stations=<13 real RING_POOL keys in a different order>` in a browser (or via the sweep's own static server helper) and confirm the ring renders with nouns in the new order — this is the one thing only visual inspection confirms, not required to pass a machine check, but confirm it renders without a console error before marking this task done.

- [ ] **Step 4: Run full unit suite**

Run: `npm run test:unit`
Expected: PASS, 833/833 (no new test files in this task, but confirms nothing else broke from the AmbientAudit.jsx import change).

- [ ] **Step 5: Commit**

```bash
git add concepts/world-07-ring.html client/src/views/AmbientAudit.jsx
git commit -m "feat(ring): accept ?stations= on both render routes via worldFromParams"
```

---

### Task 4: `--world-batch N` mode in `palette-sweep.mjs`

**Files:**
- Modify: `concepts/tools/palette-sweep.mjs`

**Interfaces:**
- Consumes: `drawWorld` (`client/src/lib/drawWorld.js`), `RING_POOL` (`client/src/worlds/ringPool.js`), `midnightGalaxyRing` (`client/src/worlds/midnightGalaxy.ring.js`, already imported in this file), the existing `certifyPalette`-internal `runChecks` plumbing (already imported), `RING_VERSION` (already imported).
- Produces: CLI mode `node concepts/tools/palette-sweep.mjs --world-batch N` — for showId `'1'..N`, calls `drawWorld`, and on success certifies the composed world through both render routes (now accepting `?stations=`), writing rows with `stations` set; on the documented `RING_POOL` throw (Global Constraints), writes a `status: 'failed'` row with `stations: null` and the error in `gate_summary`.

- [ ] **Step 1: Read the current CLI dispatch and `runSeedBatch` shape**

No test file exists for this tool (it is an attended, Supabase-writing CLI script — same as today's `--seed-batch`/`--pending` modes, none of which are vitest-covered; verification here is a real run against a live Supabase project, done in Step 4 below, not a unit test). Read `concepts/tools/palette-sweep.mjs` lines 1-30 (imports, known-answer probe) and 125-215 (`runSeedBatch`, CLI dispatch) before editing — this task adds a sibling function and one new `if (mode === ...)` branch, it does not touch `runSeedBatch`.

- [ ] **Step 2: Add imports**

Add to the existing import block near the top of the file (alongside `import { midnightGalaxyRing } from '../../client/src/worlds/midnightGalaxy.ring.js'`):

```javascript
import { drawWorld } from '../../client/src/lib/drawWorld.js'
import { RING_POOL } from '../../client/src/worlds/ringPool.js'
```

- [ ] **Step 3: Add `certifyWorld` (parallels `certifyPalette`, adds the `stations` query param) and `runWorldBatch`**

Add after the existing `certifyPalette` function (after its closing `}`, before `async function runSeedBatch(n, browser) {`):

```javascript
function worldStationsQuery(stations) {
  return `stations=${stations.map(s => encodeURIComponent(s.key)).join(',')}`
}

async function certifyWorld(browser, { colors, weights, drift, stations }) {
  const pq = paletteQuery({ colors, weights, drift })
  const sq = worldStationsQuery(stations)
  const results = []
  for (const [label, url] of [
    ['html', `http://127.0.0.1:${staticPort}/concepts/world-07-ring.html?${pq}&${sq}`],
    ['react-live', `${viteServer.url}&${pq}&${sq}`],
  ]) {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
    try {
      const r = await runChecks({ label, prefix: label === 'react-live' ? 'ring-' : '', page, gotoUrl: url })
      results.push(...r.regression, ...r.spec)
    } finally {
      await page.close()
    }
  }
  const regressionFails = results.filter(r => r.tier === 'regression' && r.status === 'FAIL')
  return {
    passed: regressionFails.length === 0,
    summary: {
      regression_fail_count: regressionFails.length,
      regression_fail_names: regressionFails.map(r => r.name),
      spec_fail_count: results.filter(r => r.tier === 'spec' && r.status === 'FAIL').length,
    },
  }
}

// Draws N worlds against the LIVE RING_POOL and today's certified whole-ring
// shelf (rows with stations = null — a world needs a palette AND a station
// draw). Per this plan's Global Constraints: RING_POOL has 5 radial-mass
// members against LANE_CAP(13)=4, so drawWorld() throws
// "cannot fill 13 slots under the caps" for every showId here, deterministically,
// until step 6 (pool growth, a separate art-project plan) lands. Each
// showId's failure is caught and written as its own row — one bad/every draw
// must never crash the batch, same discipline runSeedBatch already has for a
// bad generated palette.
async function runWorldBatch(n, browser) {
  const { data: shelf, error: shelfErr } = await sb.from('ring_palettes')
    .select('colors, weights, drift')
    .eq('status', 'certified').eq('ring_version', RING_VERSION).is('stations', null)
  if (shelfErr) throw new Error(`world-batch: failed to read certified shelf: ${shelfErr.message}`)
  if (!shelf.length) {
    console.log('world-batch: no certified whole-ring palettes on the shelf — run --seed-batch first.')
    return
  }

  const rows = []
  for (let s = 1; s <= n; s++) {
    const showId = String(s)
    let drawn
    try {
      drawn = drawWorld({
        base: midnightGalaxyRing, pool: RING_POOL, shelf,
        showId, baseTheme: { colors: { bg: '#08001a', bgDeep: '#040010' } },
      })
    } catch (err) {
      rows.push({
        colors: null, weights: null, drift: null, stations: null,
        status: 'failed', source: 'generated', seed: `showSeed:${showId}`,
        ring_version: RING_VERSION,
        gate_summary: { stage: 'draw', error: err.message },
        checked_at: new Date().toISOString(),
      })
      console.log(`show ${showId}: DRAW FAILED (${err.message})`)
      continue
    }
    const { world, showSeed } = drawn
    const { passed, summary } = await certifyWorld(browser, {
      colors: world.palette.colors, weights: world.palette.weights, drift: world.palette.drift,
      stations: world.stations,
    })
    rows.push({
      colors: world.palette.colors, weights: world.palette.weights, drift: world.palette.drift,
      stations: world.stations.map(st => st.key),
      status: passed ? 'certified' : 'failed', source: 'generated', seed: `showSeed:${showSeed.toString(16)}`,
      ring_version: RING_VERSION, gate_summary: summary, checked_at: new Date().toISOString(),
    })
    console.log(`show ${showId}: ${passed ? 'CERTIFIED' : 'FAILED'} (stage: gate)`)
  }

  if (rows.length) {
    // Same two-step insert-pending-then-update pattern as runSeedBatch, and
    // the same reason (INSERT policy only allows status='pending'). See that
    // function's own comment for the full RLS explanation.
    const asPending = rows.map(r => ({ ...r, status: 'pending' }))
    const { error: insErr } = await sb.from('ring_palettes')
      .upsert(asPending, { onConflict: 'source,seed,ring_version' })
    if (insErr) throw new Error(`world-batch upsert (pending) failed: ${insErr.message}`)
    for (const r of rows) {
      const { error: updErr } = await sb.from('ring_palettes')
        .update({ status: r.status })
        .eq('source', r.source).eq('seed', r.seed).eq('ring_version', r.ring_version)
      if (updErr) throw new Error(`world-batch status update failed for seed=${r.seed}: ${updErr.message}`)
    }
  }
  console.log(`\n${rows.filter(r => r.status === 'certified').length}/${rows.length} worlds certified, written to ring_palettes.`)
}
```

- [ ] **Step 4: Wire the CLI dispatch**

Find the existing dispatch block (`if (mode === '--seed-batch') await runSeedBatch(...)`) and add a sibling branch:

```javascript
if (mode === '--seed-batch') await runSeedBatch(Number(process.argv[3] ?? 10), browser)
else if (mode === '--world-batch') await runWorldBatch(Number(process.argv[3] ?? 10), browser)
```

Update the usage string in the same block to include `--world-batch N`.

- [ ] **Step 5: Attended verification run — real Supabase writes, run once, read the output**

This is a live-infra step, not a unit test. Before running: confirm no other Claude Code session has this repo's dev server or `verify:ring` running concurrently (per `references/ring-world-continuity.md` §1.3 — `git status` and check for concurrent sessions), and run it from an isolated `git worktree` (see `superpowers:using-git-worktrees`) so a concurrent edit elsewhere in the repo cannot trigger a vite HMR reload mid-run and kill the dev server (observed failure mode, 2026-09-14 session).

```bash
cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os && node concepts/tools/palette-sweep.mjs --world-batch 3
```

Expected output: 3 lines reading `show N: DRAW FAILED (cannot fill 13 slots under the caps)`, then `0/3 worlds certified, written to ring_palettes.` Confirm via SQL that 3 rows landed with `status='failed'`, `stations` null, `source='generated'`, `seed` matching `showSeed:%`, `gate_summary->>'stage' = 'draw'`. **This all-failed outcome is the expected, correct result per this plan's Global Constraints — do not attempt to fix `RING_POOL` or loosen `LANE_CAP` to make it pass; that is step 6, STAYS HUMAN, out of scope.**

- [ ] **Step 6: Commit**

```bash
git add concepts/tools/palette-sweep.mjs
git commit -m "feat(ring): add --world-batch N to palette-sweep.mjs"
```

---

### Task 5: `findMatch`/`saveAsPending` grow to compare/write `stations`

**Files:**
- Modify: `client/src/lib/ringPalettesClient.js`
- Create: `client/src/lib/ringPalettesClient.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `findMatch(shelf, { colors, weights, drift, stations })` — `stations` defaults to `undefined`; a shelf row's `stations` is compared as `row.stations ?? null` against `stations ?? null`, so an existing call site that never passes `stations` (today's palette-only Apply flow) keeps matching exactly as before.
  - `saveAsPending({ colors, weights, drift, stations })` — same default-to-`null` behavior on insert.
  - `fetchCertifiedPalettes()` — unchanged signature, but its `.select(...)` now includes `stations` so a caller can read it back.

- [ ] **Step 1: Write the failing tests**

Create `client/src/lib/ringPalettesClient.test.js`:

```javascript
import { describe, it, expect, vi } from 'vitest'

// ringPalettesClient.js imports the real Supabase client. Stub it and
// capture what gets sent, same pattern as hostPhotos.test.js.
const insertMock = vi.fn(() => ({ error: null }))
const selectMock = vi.fn()
vi.mock('./supabase.js', () => ({
  supabase: {
    from: () => ({
      select: (...args) => { selectMock(...args); return { eq: () => ({ eq: () => ({ then: () => {} }) }) } },
      insert: (...args) => insertMock(...args),
    }),
  },
}))

const { findMatch, saveAsPending } = await import('./ringPalettesClient.js')

const PALETTE = { colors: ['#a855f7', '#3b82f6'], weights: [0.65, 0.35], drift: { arc: 60 } }

describe('findMatch', () => {
  it('matches an existing palette-only row (no stations on either side)', () => {
    const shelf = [{ id: '1', ...PALETTE }]
    expect(findMatch(shelf, PALETTE)).toBe(shelf[0])
  })

  it('does not match when stations differ', () => {
    const shelf = [{ id: '1', ...PALETTE, stations: ['a', 'b'] }]
    expect(findMatch(shelf, { ...PALETTE, stations: ['a', 'c'] })).toBeUndefined()
  })

  it('matches when both sides have the same stations array', () => {
    const shelf = [{ id: '1', ...PALETTE, stations: ['a', 'b'] }]
    expect(findMatch(shelf, { ...PALETTE, stations: ['a', 'b'] })).toBe(shelf[0])
  })

  it('treats a row with no stations key the same as stations: null', () => {
    const shelf = [{ id: '1', ...PALETTE }] // no `stations` key at all
    expect(findMatch(shelf, { ...PALETTE, stations: null })).toBe(shelf[0])
    expect(findMatch(shelf, { ...PALETTE })).toBe(shelf[0])
  })
})

describe('saveAsPending', () => {
  it('inserts with stations: null when not given (today\'s palette-only flow)', async () => {
    await saveAsPending(PALETTE)
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ ...PALETTE, stations: null }))
  })

  it('inserts the given stations array', async () => {
    await saveAsPending({ ...PALETTE, stations: ['a', 'b'] })
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ stations: ['a', 'b'] }))
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- ringPalettesClient`
Expected: FAIL — `findMatch` doesn't compare `stations` yet, `saveAsPending` doesn't write it.

- [ ] **Step 3: Implement**

Replace the full contents of `client/src/lib/ringPalettesClient.js` with:

```javascript
// Verified 2026-09-03: every other host component (DatabaseAddPanels.jsx,
// LateTeamPopover.jsx, HostPinGate.jsx, LiveMode.jsx, ScorePanel.jsx, etc.)
// imports the SAME shared client from this exact path — never create a
// second client instance.
import { supabase } from './supabase.js'
import { RING_VERSION } from './ringCertification.js'

export async function fetchCertifiedPalettes() {
  const { data, error } = await supabase
    .from('ring_palettes')
    .select('id, colors, weights, drift, source, seed, stations')
    .eq('status', 'certified')
    .eq('ring_version', RING_VERSION)
  if (error) throw error
  return data ?? []
}

export async function saveAsPending({ colors, weights, drift, stations = null }) {
  const { error } = await supabase.from('ring_palettes').insert({
    colors, weights, drift, stations, source: 'manual', ring_version: RING_VERSION, status: 'pending',
  })
  if (error) throw error
}

// A live pick matches a shelf entry only on an exact value match — weights
// are floats from a drag, so in practice a manual pick almost never
// matches an existing row and correctly falls to "save as pending". Exact
// match still matters for the "Surprise me" round-trip (drawing an
// existing certified row and re-finding it) and for re-opening a show that
// already has a certified worldPalette applied.
//
// stations defaults to null (today's palette-only shape) so an existing
// call site that never passes it keeps matching exactly as before a row's
// missing `stations` key and an explicit `null` compare equal.
export function findMatch(shelf, { colors, weights, drift, stations = null }) {
  return shelf.find(row =>
    JSON.stringify(row.colors) === JSON.stringify(colors) &&
    JSON.stringify(row.weights) === JSON.stringify(weights) &&
    JSON.stringify(row.drift) === JSON.stringify(drift) &&
    JSON.stringify(row.stations ?? null) === JSON.stringify(stations))
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- ringPalettesClient`
Expected: PASS, all 6 tests.

- [ ] **Step 5: Run full unit suite**

Run: `npm run test:unit`
Expected: PASS, 839/839 (833 baseline + 6 new).

- [ ] **Step 6: Commit**

```bash
git add client/src/lib/ringPalettesClient.js client/src/lib/ringPalettesClient.test.js
git commit -m "feat(ring): findMatch/saveAsPending compare and write stations"
```

---

## Self-Review

**Spec coverage:** design doc §7.1 (schema) → Task 1. §7.2's `findMatch`/`saveAsPending` line → Task 5. §7.3 (`--world-batch N`) → Task 4. The render-route gap §7.3 assumes is real but unstated in the doc — Task 2/3 close it (found via research, not guessed). §7.4 (what does not change) → respected in Global Constraints. §7.2's picker UI itself is explicitly step 5, not this plan.

**Placeholder scan:** none — every step has real code, real file:line targets, real expected test output.

**Type consistency:** `resolveStations(pool, keys)` and `worldFromParams(params, ctx)` (Task 2) are the exact names/shapes Task 3 imports and calls. `certifyWorld`/`runWorldBatch` (Task 4) reuse `paletteQuery`, `staticPort`, `viteServer`, `sb`, `RING_VERSION` — all already module-scope in `palette-sweep.mjs`, none redefined. `findMatch`/`saveAsPending`'s new `stations` parameter (Task 5) matches the array-of-keys shape `runWorldBatch` writes (`world.stations.map(st => st.key)`) and what Task 3's routes read back via `resolveStations`.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-14-ring-world-shelf-stations.md`. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
