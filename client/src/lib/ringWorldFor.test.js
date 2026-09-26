import { describe, it, expect } from 'vitest'
import { ringWorldFor, RING_WORLDS } from './ringWorldFor.js'
import { midnightGalaxyRing } from '../worlds/midnightGalaxy.ring.js'
import { RING_VERSION } from './ringCertification.js'
import { RING_POOL } from '../worlds/ringPool.js'
import { assertRing } from './ringDraw.js'

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

  it('a resolved ringWorld station carries fields RING_POOL does not have (finding #1 — full authored station shape, not the reduced draw-pool shape)', () => {
    // RING_POOL is {key,prim,hue,accent,family} only — variant/region/
    // regionSource/noCompanion/companionKind live solely on the full
    // midnightGalaxyRing.stations objects, and RingAmbient.jsx reads them
    // by station identity. Resolving against RING_POOL silently drops them.
    const theme = {
      ...BASE_THEME,
      ringWorld: {
        rowId: 'row-1', seed: 'x', ringVersion: RING_VERSION,
        stations: SWAPPED_KEYS,
        palette: { colors: ['#22c55e', '#eab308'], weights: [0.5, 0.5], drift: { arc: 30 } },
      },
    }
    const world = ringWorldFor(theme)
    const eclipse = world.stations.find(s => s.key === 'eclipse')
    expect(eclipse.region).toBe('corona')
    expect(eclipse.regionSource).toBe(true)
    const pulsar = world.stations.find(s => s.key === 'pulsar')
    expect(pulsar.noCompanion).toBe(true)
  })

  it('falls back to the base world when a resolved ringWorld.stations array is the wrong length, without throwing (finding #3)', () => {
    const theme = {
      ...BASE_THEME,
      ringWorld: { rowId: null, seed: 'x', ringVersion: RING_VERSION, stations: AUTHORED_KEYS.slice(0, 12), palette: { colors: ['#22c55e', '#eab308'], weights: [0.5, 0.5], drift: { arc: 30 } } },
    }
    expect(() => ringWorldFor(theme)).not.toThrow()
    expect(ringWorldFor(theme)).toBe(midnightGalaxyRing)
  })

  it('falls back to the base world when a resolved ringWorld.stations array has a duplicate key, without throwing (finding #3)', () => {
    // 13 entries, but the last is overwritten with the first key — one key
    // ("supernova") silently missing, "ringed planet" appearing twice.
    const dup = AUTHORED_KEYS.map((k, i) => (i === 12 ? AUTHORED_KEYS[0] : k))
    const theme = {
      ...BASE_THEME,
      ringWorld: { rowId: null, seed: 'x', ringVersion: RING_VERSION, stations: dup, palette: { colors: ['#22c55e', '#eab308'], weights: [0.5, 0.5], drift: { arc: 30 } } },
    }
    expect(() => ringWorldFor(theme)).not.toThrow()
    expect(ringWorldFor(theme)).toBe(midnightGalaxyRing)
  })

  it('falls through to the recolored worldPalette, not straight to base, when ringWorld fails to resolve but worldPalette is ALSO present (combinatorial gap flagged in review)', () => {
    const theme = {
      ...BASE_THEME,
      // Distinct seed/key from the "unresolvable station key" case above —
      // ringWorldFor's cache key is derived from theme.ringWorld alone, so
      // reusing that exact payload would hit the OTHER test's cached
      // (worldPalette-less) fallback instead of exercising this one.
      ringWorld: { rowId: null, seed: 'combinatorial', ringVersion: RING_VERSION, stations: ['still-not-a-real-key', ...AUTHORED_KEYS.slice(1)], palette: { colors: ['#22c55e', '#eab308'], weights: [0.5, 0.5], drift: { arc: 30 } } },
      worldPalette: { colors: ['#ff0000', '#0000ff'], weights: [0.6, 0.4], drift: { arc: 60 } },
    }
    const world = ringWorldFor(theme)
    expect(world).not.toBe(midnightGalaxyRing)
    expect(world.stations.map(s => s.key)).toEqual(AUTHORED_KEYS) // worldPalette never reorders
    expect(world.stations.map(s => s.hue)).not.toEqual(midnightGalaxyRing.stations.map(s => s.hue))
  })
})

// 2026-09-25, Ben: "go turn it on" — every real show up to tonight rendered
// midnightGalaxyRing's fixed authored order, always (live DB check, this
// session: 0 of the last 6 midnight-galaxy shows had theme.ringWorld set).
// This tier makes the per-show draw actually fire by default, seeded from
// showId, without needing a host to click "Re-roll objects" first.
describe('ringWorldFor — auto-draw (no explicit ringWorld, showId present)', () => {
  const POOL_KEYS = new Set(RING_POOL.map(s => s.key))

  it('draws a per-show arrangement instead of the fixed authored order when showId is given', () => {
    const world = ringWorldFor(BASE_THEME, 'show_autodraw_1')
    expect(world).not.toBe(midnightGalaxyRing)
    expect(world.stations).toHaveLength(AUTHORED_KEYS.length)
  })

  it('without a showId, behavior is unchanged: returns the base world', () => {
    expect(ringWorldFor(BASE_THEME)).toBe(midnightGalaxyRing)
    expect(ringWorldFor(BASE_THEME, undefined)).toBe(midnightGalaxyRing)
  })

  it('the drawn arrangement is structurally valid: 13 unique real pool keys, eclipse pinned at station 10', () => {
    const world = ringWorldFor(BASE_THEME, 'show_autodraw_2')
    const keys = world.stations.map(s => s.key)
    expect(keys).toHaveLength(13)
    expect(new Set(keys).size).toBe(13)
    for (const k of keys) expect(POOL_KEYS.has(k)).toBe(true)
    expect(keys[10]).toBe('eclipse')
    expect(() => assertRing(world.stations)).not.toThrow()
  })

  it('is deterministic for the same showId (a /display reload must not re-roll mid-show)', () => {
    const a = ringWorldFor({ ...BASE_THEME }, 'show_stable_seed')
    // Fresh theme object (new identity) but same showId and same underlying
    // draw inputs — exercises the seed math directly, not just the memo cache.
    const b = ringWorldFor({ ...BASE_THEME }, 'show_stable_seed')
    expect(b.stations.map(s => s.key)).toEqual(a.stations.map(s => s.key))
  })

  it('different showIds can draw different arrangements', () => {
    const orders = new Set()
    for (let i = 0; i < 8; i++) {
      const world = ringWorldFor(BASE_THEME, `show_variety_${i}`)
      orders.add(world.stations.map(s => s.key).join(','))
    }
    expect(orders.size).toBeGreaterThan(1)
  })

  it('with a worldPalette also set, auto-draw reorders stations AND recolors', () => {
    const theme = { ...BASE_THEME, worldPalette: { colors: ['#a855f7', '#3b82f6'], weights: [0.65, 0.35] } }
    const world = ringWorldFor(theme, 'show_autodraw_palette')
    expect(world.stations).toHaveLength(13)
    expect(world.stations.map(s => s.hue)).not.toEqual(midnightGalaxyRing.stations.map(s => s.hue))
    expect(() => assertRing(world.stations)).not.toThrow()
  })

  it('explicit theme.ringWorld still wins over auto-draw when both a current ringWorld and a showId are present', () => {
    const theme = {
      ...BASE_THEME,
      ringWorld: {
        rowId: 'row-1', seed: 'showSeed:abc', ringVersion: RING_VERSION,
        stations: SWAPPED_KEYS,
        palette: { colors: ['#22c55e', '#eab308'], weights: [0.5, 0.5], drift: { arc: 30 } },
      },
    }
    const world = ringWorldFor(theme, 'show_should_be_ignored')
    expect(world.stations.map(s => s.key)).toEqual(SWAPPED_KEYS)
  })

  it('never throws even for a pathological showId, and still returns a valid world', () => {
    expect(() => ringWorldFor(BASE_THEME, '')).not.toThrow()
    const world = ringWorldFor(BASE_THEME, '')
    expect(world.stations.length).toBeGreaterThan(0)
  })
})
