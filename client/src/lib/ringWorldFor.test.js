import { describe, it, expect, vi } from 'vitest'
import { ringWorldFor, RING_WORLDS, resolveArrangement, isEvolving, autoDrawWorld } from './ringWorldFor.js'
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
describe('ringWorldFor — no explicit ringWorld, showId present (auto-draw disabled 2026-09-29)', () => {
  const POOL_KEYS = new Set(RING_POOL.map(s => s.key))

  it('a showId alone no longer draws — returns the base world by identity, same as no showId at all', () => {
    const world = ringWorldFor(BASE_THEME, 'show_autodraw_1')
    expect(world).toBe(midnightGalaxyRing)
    expect(world.stations).toHaveLength(AUTHORED_KEYS.length)
  })

  it('without a showId, behavior is unchanged: returns the base world', () => {
    expect(ringWorldFor(BASE_THEME)).toBe(midnightGalaxyRing)
    expect(ringWorldFor(BASE_THEME, undefined)).toBe(midnightGalaxyRing)
  })

  // 2026-09-29: auto-draw is disabled by default (AUTO_DRAW_ENABLED = false,
  // ringWorldFor.js) — confirmed live, through the real gate, that a random
  // draw can push a bright object's glow past the safe-box cap (no equivalent
  // of the authored order's hand-placed safety). ringWorldFor/resolveArrangement
  // now always land on 'fixed' regardless of showId — see the tests below.
  // autoDrawWorld itself is untouched and still exported so its own
  // correctness stays covered for whenever a real placement-safety fix lands
  // and this gets re-enabled.
  it('with auto-draw disabled, ringWorldFor and resolveArrangement return the fixed authored order for any showId', () => {
    for (const showId of ['show_autodraw_2', 'show_variety_0', 'show_variety_1', undefined, '']) {
      expect(ringWorldFor(BASE_THEME, showId).stations.map(s => s.key)).toEqual(AUTHORED_KEYS)
      expect(resolveArrangement(BASE_THEME, showId).stations.map(s => s.key)).toEqual(AUTHORED_KEYS)
    }
  })

  it('autoDrawWorld itself is still structurally valid: 13 unique real pool keys, eclipse pinned at station 10 (machinery kept for re-enabling later)', () => {
    const world = autoDrawWorld(midnightGalaxyRing, 'show_autodraw_2')
    const keys = world.stations.map(s => s.key)
    expect(keys).toHaveLength(13)
    expect(new Set(keys).size).toBe(13)
    for (const k of keys) expect(POOL_KEYS.has(k)).toBe(true)
    expect(keys[10]).toBe('eclipse')
    expect(() => assertRing(world.stations)).not.toThrow()
  })

  it('autoDrawWorld is deterministic for the same showId (a /display reload must not re-roll mid-show)', () => {
    const a = autoDrawWorld(midnightGalaxyRing, 'show_stable_seed')
    const b = autoDrawWorld(midnightGalaxyRing, 'show_stable_seed')
    expect(b.stations.map(s => s.key)).toEqual(a.stations.map(s => s.key))
  })

  it('autoDrawWorld produces different orders for different showIds', () => {
    const orders = new Set()
    for (let i = 0; i < 8; i++) {
      const world = autoDrawWorld(midnightGalaxyRing, `show_variety_${i}`)
      orders.add(world.stations.map(s => s.key).join(','))
    }
    expect(orders.size).toBeGreaterThan(1)
  })

  // 2026-09-28, "gap C": a host-picked worldPalette was only ever certified
  // (palette-sweep.mjs's shelf) against the FIXED authored order — never
  // against a fresh per-show draw. Auto-draw must not run at all when a
  // palette is set; it has to fall through to paletteOnly, the exact
  // (palette, arrangement) pair the shelf actually checked.
  it('with a worldPalette also set, auto-draw is skipped: stations stay the fixed authored order, only colors change', () => {
    const theme = { ...BASE_THEME, worldPalette: { colors: ['#a855f7', '#3b82f6'], weights: [0.65, 0.35] } }
    const world = ringWorldFor(theme, 'show_autodraw_palette')
    expect(world.stations.map(s => s.key)).toEqual(AUTHORED_KEYS)
    expect(world.stations.map(s => s.hue)).not.toEqual(midnightGalaxyRing.stations.map(s => s.hue))
  })

  it('a stale ringWorld plus a worldPalette plus a showId still lands on the fixed order, not a fresh draw', () => {
    const theme = {
      ...BASE_THEME,
      ringWorld: { rowId: 'row-1', seed: 'x', ringVersion: 'v0-stale', stations: SWAPPED_KEYS, palette: { colors: ['#22c55e', '#eab308'], weights: [0.5, 0.5], drift: { arc: 30 } } },
      worldPalette: { colors: ['#a855f7', '#3b82f6'], weights: [0.65, 0.35] },
    }
    const world = ringWorldFor(theme, 'show_stale_ringworld_with_palette')
    expect(world.stations.map(s => s.key)).toEqual(AUTHORED_KEYS)
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

describe('resolveArrangement', () => {
  it('returns the fixed authored order when no showId and no ringWorld', () => {
    const arrangement = resolveArrangement(BASE_THEME, undefined)
    expect(arrangement.stations.map(s => s.key)).toEqual(AUTHORED_KEYS)
    expect(arrangement.stations.map(s => s.hue)).toEqual(midnightGalaxyRing.stations.map(s => s.hue))
  })

  // 2026-09-29: auto-draw disabled (AUTO_DRAW_ENABLED = false) — see the
  // dated comment above autoDrawWorld tests. showId alone no longer draws.
  it('with a showId and no worldPalette, still resolves to the fixed authored order (auto-draw disabled)', () => {
    const arrangement = resolveArrangement(BASE_THEME, 'show_arrangement_test')
    expect(arrangement.stations.map(s => s.key)).toEqual(AUTHORED_KEYS)
  })

  it('stays on the fixed order when a worldPalette is set, even with a showId', () => {
    const theme = { ...BASE_THEME, worldPalette: { colors: ['#a855f7', '#3b82f6'], weights: [0.65, 0.35] } }
    const arrangement = resolveArrangement(theme, 'show_arrangement_test_2')
    expect(arrangement.stations.map(s => s.key)).toEqual(AUTHORED_KEYS)
  })

  it('forceFixedArrangement keeps the fixed authored order even with a showId (both resolvers)', () => {
    const theme = { ...BASE_THEME, forceFixedArrangement: true }
    expect(resolveArrangement(theme, 'show_force_fixed').stations.map(s => s.key)).toEqual(AUTHORED_KEYS)
    expect(ringWorldFor(theme, 'show_force_fixed').stations.map(s => s.key)).toEqual(AUTHORED_KEYS)
  })

  it('forceFixedArrangement + a current saved ringWorld + worldPalette: fixed order, palette colors, no false fallback warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const worldPalette = { colors: ['#a855f7', '#3b82f6'], weights: [0.65, 0.35] }
    const theme = {
      ...BASE_THEME, forceFixedArrangement: true, worldPalette,
      ringWorld: { rowId: 'row-ff', seed: 'x', ringVersion: RING_VERSION, stations: SWAPPED_KEYS, palette: { colors: ['#22c55e', '#eab308'], weights: [0.5, 0.5], drift: { arc: 30 } } },
    }
    const world = ringWorldFor(theme, 'show_force_fixed_ringworld')
    expect(world.stations.map(s => s.key)).toEqual(AUTHORED_KEYS)
    expect(world).toBe(ringWorldFor({ ...BASE_THEME, worldPalette })) // same paletteOnly result
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  // Final-review finding 1: colorEvolution + the UI's default "Random draw"
  // painted duo colors onto an uncertified drawn arrangement (gap C again,
  // measured 80.9 vs the 68 brightness cap). Duos are only certified on the
  // fixed order, so evolution must ALWAYS resolve to it.
  it('colorEvolution always resolves to the fixed authored order, whatever the showId', () => {
    const theme = { ...BASE_THEME, colorEvolution: true }
    for (const showId of [undefined, '', 'show_evo_1', 'show_evo_2', 'show_evo_3', 'show_arrangement_test']) {
      expect(resolveArrangement(theme, showId)).toBe(midnightGalaxyRing)
    }
  })

  it('colorEvolution ignores even a current saved ringWorld (its drawn order was never duo-certified)', () => {
    const theme = {
      ...BASE_THEME, colorEvolution: true,
      ringWorld: { rowId: 'row-evo', seed: 'x', ringVersion: RING_VERSION, stations: SWAPPED_KEYS, palette: { colors: ['#22c55e', '#eab308'], weights: [0.5, 0.5], drift: { arc: 30 } } },
    }
    expect(resolveArrangement(theme, 'show_evo_saved')).toBe(midnightGalaxyRing)
  })

  // Final-review finding 2: parity across every arrangement combination this
  // plan introduced, not just auto-draw.
  const SAVED = { rowId: 'row-parity', seed: 'parity', ringVersion: RING_VERSION, stations: SWAPPED_KEYS, palette: { colors: ['#22c55e', '#eab308'], weights: [0.5, 0.5], drift: { arc: 30 } } }
  const PALETTE = { colors: ['#a855f7', '#3b82f6'], weights: [0.65, 0.35] }
  const PARITY_CASES = [
    ['auto-draw', {}, 'show_arrangement_parity'],
    ['no showId', {}, undefined],
    ['worldPalette + showId', { worldPalette: PALETTE }, 'show_parity_palette'],
    ['saved ringWorld (SWAPPED_KEYS)', { ringWorld: SAVED }, 'show_parity_saved'],
    ['saved ringWorld + worldPalette', { ringWorld: SAVED, worldPalette: PALETTE }, 'show_parity_saved_pal'],
    ['stale saved ringWorld', { ringWorld: { ...SAVED, ringVersion: 'v0-stale' } }, 'show_parity_stale'],
    ['forceFixedArrangement', { forceFixedArrangement: true }, 'show_parity_ff'],
    ['forceFixedArrangement + saved ringWorld + worldPalette', { forceFixedArrangement: true, ringWorld: SAVED, worldPalette: PALETTE }, 'show_parity_ff_saved'],
    ['colorEvolution', { colorEvolution: true }, 'show_parity_evo'],
  ]
  for (const [label, extra, showId] of PARITY_CASES) {
    it(`resolveArrangement and ringWorldFor agree on arrangement — ${label}`, () => {
      const theme = { ...BASE_THEME, ...extra }
      const arrangement = resolveArrangement(theme, showId)
      const full = ringWorldFor(theme, showId)
      expect(full.stations.map(s => s.key)).toEqual(arrangement.stations.map(s => s.key))
    })
  }

  it('parity fixtures actually hit each arrangement kind (guards the table above from going vacuous)', () => {
    expect(resolveArrangement({ ...BASE_THEME, ringWorld: SAVED }, 'x').stations.map(s => s.key)).toEqual(SWAPPED_KEYS)
    // 'auto-draw' in PARITY_CASES no longer produces a drawn order (disabled,
    // 2026-09-29) — it still hits the 'fixed' path both resolvers agree on,
    // which is what the case above actually tests now.
    expect(resolveArrangement(BASE_THEME, 'show_arrangement_parity').stations.map(s => s.key)).toEqual(AUTHORED_KEYS)
    expect(resolveArrangement({ ...BASE_THEME, forceFixedArrangement: true, ringWorld: SAVED }, 'x')).toBe(midnightGalaxyRing)
  })
})

describe('isEvolving', () => {
  it('is true only for colorEvolution on a theme with a ring world', () => {
    expect(isEvolving({ ...BASE_THEME, colorEvolution: true })).toBe(true)
    expect(isEvolving(BASE_THEME)).toBe(false)
    expect(isEvolving({ id: 'pure-michigan', colorEvolution: true })).toBe(false)
  })
})
