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
