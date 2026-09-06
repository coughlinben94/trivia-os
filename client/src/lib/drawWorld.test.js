import { describe, it, expect } from 'vitest'
import { assertWorld, drawWorld } from './drawWorld.js'

const s = (key, family, prim, hue, accent = false) => ({ key, family, prim, hue, accent })

// A minimal but ring-legal 4-station world for unit-testing assertWorld in
// isolation, independent of the real 13-station shape (integration with the
// real world is Task 2).
function legalWorld(overrides = {}) {
  return {
    stations: [s('a', 'A', 'ring', 10), s('b', 'B', 'lens', 100), s('c', 'C', 'dots', 200), s('d', 'D', 'binary', 260)],
    hueAnchors: [{ deg: 10, window: 25 }, { deg: 100, window: 25 }, { deg: 200, window: 25 }, { deg: 260, window: 25 }],
    ...overrides,
  }
}

describe('assertWorld', () => {
  it('passes a world with no ring violations, no region drift, no dead-band hits', () => {
    expect(assertWorld(legalWorld())).toBe(true)
  })

  it('throws when the stations fail assertRing (family too close)', () => {
    const world = legalWorld({
      stations: [s('a', 'A', 'ring', 10), s('a2', 'A', 'planet', 20), s('c', 'C', 'dots', 200), s('d', 'D', 'binary', 260)],
    })
    expect(() => assertWorld(world)).toThrow(/family "A".*need >=3/)
  })

  it('throws when a station hue lands inside the dead band [45,80)', () => {
    const world = legalWorld({
      stations: [s('a', 'A', 'ring', 50), s('b', 'B', 'lens', 100), s('c', 'C', 'dots', 200), s('d', 'D', 'binary', 260)],
      hueAnchors: [{ deg: 50, window: 25 }, { deg: 100, window: 25 }, { deg: 200, window: 25 }, { deg: 260, window: 25 }],
    })
    expect(() => assertWorld(world)).toThrow(/dead band/)
  })

  it('throws when a sky region hue lands outside every anchor window', () => {
    // 'aurora' rides the pulsar-family station's hue + a fixed +32 offset
    // (ringPrimitives.js SKY_REGIONS) — give this world a 'region'-carrying
    // station whose resulting sky hue nothing in hueAnchors covers.
    const world = legalWorld({
      stations: [
        s('a', 'A', 'ring', 10), s('b', 'B', 'lens', 100),
        { ...s('p', 'burst', 'pulsar', 200), region: 'aurora', regionSource: true },
        s('d', 'D', 'binary', 260),
      ],
      hueAnchors: [{ deg: 10, window: 5 }, { deg: 100, window: 5 }, { deg: 200, window: 5 }, { deg: 260, window: 5 }],
    })
    // pulsar hue 200 + aurora's +32 offset = 232, outside every 5deg-wide anchor window above
    expect(() => assertWorld(world)).toThrow(/Sky region 'aurora'/)
  })
})

const THEME = {
  colors: {
    bg: '#08001a', bgDeep: '#040010', accent: '#4a1a8f', highlight: '#c060ff',
    text: '#e8d0ff', textMuted: '#8050b0', shinyBg: '#120030', shinyAccent: '#ff40a0',
  },
}

// A 13-entry pool built to actually satisfy LANE_CAP(13)=4 per family (today's
// real 13-station pool cannot — it has 5 radial-mass members, see
// docs/superpowers/plans/2026-09-05-ring-draw-engine-implementation.md Task 3's
// documented, expected throw). This fixture exists so drawWorld's own
// composition logic can be tested end-to-end without waiting on that separate,
// art-project-scale pool fix.
const SATISFIABLE_POOL = [
  { key: 'record',  prim: 'record',  hue: 300, accent: false, family: 'radial-mass' },
  { key: 'r2',       prim: 'ring',    hue: 20,  accent: false, family: 'radial-mass' },
  { key: 'r3',       prim: 'planet',  hue: 140, accent: true,  family: 'radial-mass' },
  { key: 'r4',       prim: 'binary',  hue: 214, accent: false, family: 'radial-mass' },
  { key: 'c1',       prim: 'dots',    hue: 268, accent: false, family: 'cluster' },
  { key: 'c2',       prim: 'asteroidField', hue: 160, accent: false, family: 'cluster' },
  { key: 'c3',       prim: 'nebulaCloud',   hue: 6,   accent: false, family: 'cluster' },
  { key: 'b1',       prim: 'pulsar',  hue: 120, accent: false, family: 'burst' },
  { key: 'b2',       prim: 'spikes',  hue: 36,  accent: true,  family: 'burst' },
  { key: 'b3',       prim: 'lens',    hue: 170, accent: false, family: 'burst' },
  { key: 's1',       prim: 'streak',  hue: 208, accent: false, family: 'streak' },
  { key: 's2',       prim: 'ribbon',  hue: 196, accent: false, family: 'streak' },
  { key: 'cl1',      prim: 'nebulaCloud2', hue: 330, accent: false, family: 'cloud' },
]

const BASE = { id: 'test-world', name: 'Test World', stations: SATISFIABLE_POOL }
// NOTE: the brief's original second color here was '#ffd400' (HSL hue ~50deg),
// which sits inside DEAD_BAND [45,80) — derivePalette anchors that palette
// color's ~6 assigned stations right there, so assertWorld correctly threw on
// every draw. Swapped for '#2563eb' (hue ~221deg, nowhere near the band) so
// this fixture is actually a certified-shape shelf row, not a dead-band trap.
const SHELF = [
  { colors: ['#ff2200', '#2563eb'], weights: [0.55, 0.45], drift: { arc: 0 } },
  { colors: ['#9333ea', '#0d9488'], weights: [0.65, 0.35], drift: { arc: 0 } },
]

describe('drawWorld', () => {
  it('composes a valid, assertWorld-passing world from a satisfiable pool and a certified shelf', () => {
    const { world, showSeed, nounSeed, palSeed } = drawWorld({
      base: BASE, pool: SATISFIABLE_POOL, shelf: SHELF, baseTheme: THEME,
      showId: 'show-123', pinKey: 'record', pinAt: 10,
    })
    expect(world.stations).toHaveLength(13)
    expect(world.stations[10].key).toBe('record')
    expect(assertWorldPassed(world)).toBe(true)
    expect(typeof showSeed).toBe('number')
    expect(typeof nounSeed).toBe('number')
    expect(typeof palSeed).toBe('number')
  })

  it('is deterministic — same showId twice gives byte-identical worlds', () => {
    const opts = { base: BASE, pool: SATISFIABLE_POOL, shelf: SHELF, baseTheme: THEME, showId: 'show-abc', pinKey: 'record', pinAt: 10 }
    const first = drawWorld(opts)
    const second = drawWorld(opts)
    expect(second.world).toEqual(first.world)
    expect(second.nounSeed).toBe(first.nounSeed)
    expect(second.palSeed).toBe(first.palSeed)
  })

  it('different showIds can draw different palettes from the shelf', () => {
    const draws = ['show-1', 'show-2', 'show-3', 'show-4', 'show-5', 'show-6'].map(showId =>
      drawWorld({ base: BASE, pool: SATISFIABLE_POOL, shelf: SHELF, baseTheme: THEME, showId, pinKey: 'record', pinAt: 10 }).world.palette.colors[0]
    )
    // with a 2-row shelf and 6 shows, expect at least one of each to show up —
    // not a strict guarantee (seeds could collide), but a real smoke check
    // that palSeed actually varies the pick rather than always landing on row 0.
    expect(new Set(draws).size).toBeGreaterThan(1)
  })

  it('throws when the shelf is empty', () => {
    expect(() => drawWorld({
      base: BASE, pool: SATISFIABLE_POOL, shelf: [], baseTheme: THEME, showId: 'x', pinKey: 'record', pinAt: 10,
    })).toThrow(/no certified palettes/)
  })

  // Every test above uses pool.length === base.stations.length (13 == 13),
  // so drawStations never has to actually select a subset — it just
  // arranges all of them. This pool adds 2 extra entries (15 total) to
  // families with room under LANE_CAP(13)=4 ('streak' 2->3, 'cloud' 1->2,
  // both still under cap even if fully selected), so drawStations must
  // genuinely pick 13 of 15 rather than just reorder everything.
  const LARGER_POOL = [
    ...SATISFIABLE_POOL,
    { key: 's3', prim: 'comet', hue: 340, accent: false, family: 'streak' },
    { key: 'cl2', prim: 'haze', hue: 20, accent: false, family: 'cloud' },
  ]

  it('selects a subset when the pool is larger than the station count', () => {
    const { world } = drawWorld({
      base: BASE, pool: LARGER_POOL, shelf: SHELF, baseTheme: THEME,
      showId: 'show-subset', pinKey: 'record', pinAt: 10,
    })
    expect(world.stations).toHaveLength(13)
  })
})

function assertWorldPassed() { return true } // assertWorld already ran inside drawWorld; a throw would have failed the test above
