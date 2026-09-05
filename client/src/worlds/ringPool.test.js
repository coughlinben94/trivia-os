import { describe, it, expect } from 'vitest'
import { RING_POOL } from './ringPool.js'
import {
  RINGED_PLANET_HUE, SPIRAL_GALAXY_HUE, STAR_CLUSTER_HUE, AMBER_PLANET_HUE, LIT_PLANET_HUE,
  PULSAR_HUE, ROSE_NEBULA_HUE, COMET_HUE, BINARY_PAIR_HUE, ASTEROID_FIELD_HUE, RECORD_HUE,
  AURORA_RIBBON_HUE, SUPERNOVA_HUE,
  midnightGalaxyRing,
} from './midnightGalaxy.ring.js'
import { SLOTS } from './midnightGalaxy.slots.js'

describe('RING_POOL', () => {
  it('has exactly 13 entries in todays authored order', () => {
    expect(RING_POOL).toHaveLength(13)
    expect(RING_POOL.map(s => s.key)).toEqual(midnightGalaxyRing.stations.map(s => s.key))
  })

  it('every hue matches the live authored constant, not a copied literal', () => {
    const hues = [
      RINGED_PLANET_HUE, SPIRAL_GALAXY_HUE, STAR_CLUSTER_HUE, AMBER_PLANET_HUE, LIT_PLANET_HUE,
      PULSAR_HUE, ROSE_NEBULA_HUE, COMET_HUE, BINARY_PAIR_HUE, ASTEROID_FIELD_HUE, RECORD_HUE,
      AURORA_RIBBON_HUE, SUPERNOVA_HUE,
    ]
    expect(RING_POOL.map(s => s.hue)).toEqual(hues)
  })

  it('accent is true only on amber planet, rose nebula, supernova — the warm-complementary cap', () => {
    expect(RING_POOL.filter(s => s.accent).map(s => s.key)).toEqual(
      midnightGalaxyRing.stations.filter(s => s.accent).map(s => s.key)
    )
  })

  it('family matches the shipped slot table', () => {
    expect(RING_POOL.map(s => s.family)).toEqual(SLOTS.map(s => s.family))
  })
})
