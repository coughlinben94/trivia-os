import { describe, it, expect } from 'vitest'
import { RING_POOL } from './ringPool.js'
import {
  RINGED_PLANET_HUE, SPIRAL_GALAXY_HUE, STAR_CLUSTER_HUE, AMBER_PLANET_HUE, LIT_PLANET_HUE,
  PULSAR_HUE, ROSE_NEBULA_HUE, COMET_HUE, BINARY_PAIR_HUE, ASTEROID_FIELD_HUE, RECORD_HUE,
  AURORA_RIBBON_HUE, SUPERNOVA_HUE,
} from './midnightGalaxy.ring.js'

// These literals are the oracle, not a re-derivation of RING_POOL. If
// midnightGalaxy.ring.js or midnightGalaxy.slots.js changes, these hardcoded
// expectations mismatch and the test fails — that's the drift detector.
const EXPECTED_KEYS = [
  'ringed planet', 'spiral galaxy', 'star cluster', 'amber planet', 'lit planet',
  'pulsar', 'rose nebula', 'comet', 'binary pair', 'asteroid field', 'record',
  'aurora ribbon', 'supernova',
]

const EXPECTED_ACCENT_KEYS = ['amber planet', 'rose nebula', 'supernova']

const EXPECTED_FAMILIES = [
  'radial-mass', 'lens', 'cluster', 'radial-mass', 'radial-mass',
  'burst', 'cloud', 'streak', 'radial-mass', 'cluster', 'radial-mass',
  'streak', 'burst',
]

describe('RING_POOL', () => {
  it('has exactly 13 entries in todays authored order', () => {
    expect(RING_POOL).toHaveLength(13)
    expect(RING_POOL.map(s => s.key)).toEqual(EXPECTED_KEYS)
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
    expect(RING_POOL.filter(s => s.accent).map(s => s.key)).toEqual(EXPECTED_ACCENT_KEYS)
  })

  it('family matches the shipped slot table', () => {
    expect(RING_POOL.map(s => s.family)).toEqual(EXPECTED_FAMILIES)
  })
})
