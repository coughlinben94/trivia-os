import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { RING_POOL } from './ringPool.js'
import { CANDIDATE_STATIONS } from './midnightGalaxy.candidates.js'
import {
  RINGED_PLANET_HUE, SPIRAL_GALAXY_HUE, STAR_CLUSTER_HUE, AMBER_PLANET_HUE, LIT_PLANET_HUE,
  PULSAR_HUE, ROSE_NEBULA_HUE, COMET_HUE, BINARY_PAIR_HUE, ASTEROID_FIELD_HUE, ECLIPSE_HUE,
  AURORA_RIBBON_HUE, SUPERNOVA_HUE,
} from './midnightGalaxy.ring.js'

// These literals are the oracle, not a re-derivation of RING_POOL. If
// midnightGalaxy.ring.js, midnightGalaxy.slots.js, or
// midnightGalaxy.candidates.js changes, these hardcoded expectations
// mismatch and the test fails — that's the drift detector.
const EXPECTED_AUTHORED_KEYS = [
  'ringed planet', 'spiral galaxy', 'star cluster', 'amber planet', 'lit planet',
  'pulsar', 'rose nebula', 'comet', 'binary pair', 'asteroid field', 'eclipse',
  'aurora ribbon', 'supernova',
]
const EXPECTED_CANDIDATE_KEYS = ['big dipper', 'cassiopeia', 'southern cross']

const EXPECTED_ACCENT_KEYS = ['amber planet', 'rose nebula', 'supernova']

const EXPECTED_AUTHORED_FAMILIES = [
  'radial-mass', 'lens', 'cluster', 'radial-mass', 'radial-mass',
  'burst', 'cloud', 'streak', 'radial-mass', 'cluster', 'radial-mass',
  'streak', 'burst',
]

describe('RING_POOL', () => {
  it('has 16 entries: the 13 authored stations, then the pool-only candidates', () => {
    expect(RING_POOL).toHaveLength(16)
    expect(RING_POOL.map(s => s.key)).toEqual([...EXPECTED_AUTHORED_KEYS, ...EXPECTED_CANDIDATE_KEYS])
  })

  it('the first 13 hues match the live authored constants, not a copied literal', () => {
    const hues = [
      RINGED_PLANET_HUE, SPIRAL_GALAXY_HUE, STAR_CLUSTER_HUE, AMBER_PLANET_HUE, LIT_PLANET_HUE,
      PULSAR_HUE, ROSE_NEBULA_HUE, COMET_HUE, BINARY_PAIR_HUE, ASTEROID_FIELD_HUE, ECLIPSE_HUE,
      AURORA_RIBBON_HUE, SUPERNOVA_HUE,
    ]
    expect(RING_POOL.slice(0, 13).map(s => s.hue)).toEqual(hues)
  })

  it('accent is true only on amber planet, rose nebula, supernova — the warm-complementary cap', () => {
    expect(RING_POOL.filter(s => s.accent).map(s => s.key)).toEqual(EXPECTED_ACCENT_KEYS)
  })

  it('the first 13 families match the shipped slot table', () => {
    expect(RING_POOL.slice(0, 13).map(s => s.family)).toEqual(EXPECTED_AUTHORED_FAMILIES)
  })

  it('the last 3 entries are exactly CANDIDATE_STATIONS, in order, unmodified', () => {
    expect(RING_POOL.slice(13)).toEqual(CANDIDATE_STATIONS)
  })

  it('every authored station carries its full render fields, not a reduced projection', () => {
    // Regression guard for the exact bug fixed 2026-09-24: a reduced
    // {key,prim,hue,accent,family} pool silently drops variant/region/
    // regionSource/noCompanion/companionKind. Pick two authored stations
    // that carry fields the old reduced shape dropped and confirm they
    // survive into RING_POOL.
    const pulsar = RING_POOL.find(s => s.key === 'pulsar')
    expect(pulsar.noCompanion).toBe(true)
    expect(pulsar.region).toBe('aurora')
    const amberPlanet = RING_POOL.find(s => s.key === 'amber planet')
    expect(amberPlanet.variant).toBe('dust')
  })
})

// concepts/world-07-ring.html has NO import of the client `src` tree (it's a
// standalone static reference build — its own comment says so, same reason
// WORLD.stations there is a literal copy of the 13 authored stations rather
// than an import) — so its own CANDIDATE_STATIONS is a hand-maintained
// duplicate, "keep in sync by hand" per that file's comment. Three
// independent review passes tonight (opus, fable, sonnet) flagged this as a
// real drift-risk with zero mechanical enforcement — this is that
// enforcement, following the exact regex-extraction pattern
// ringRecolor.test.js already uses for the 13 authored stations'
// key/hue/tint/sky parity between these same two files.
describe('midnightGalaxy.candidates.js and world-07-ring.html agree', () => {
  const HTML = readFileSync(new URL('../../../concepts/world-07-ring.html', import.meta.url), 'utf8')

  const htmlCandidates = () => {
    const block = HTML.match(/const CANDIDATE_STATIONS = \[([\s\S]*?)\n\];/)
    expect(block, 'world-07-ring.html: no CANDIDATE_STATIONS block').toBeTruthy()
    return [...block[1].matchAll(
      /key:\s*'([^']+)',\s*prim:\s*'([^']+)',\s*variant:\s*'([^']+)',\s*hue:\s*(\d+),\s*accent:\s*(true|false),\s*family:\s*'([^']+)'/g
    )].map(m => ({
      key: m[1], prim: m[2], variant: m[3], hue: Number(m[4]), accent: m[5] === 'true', family: m[6],
    }))
  }

  it('carries the same candidate stations, in the same order, with the same fields', () => {
    expect(htmlCandidates()).toEqual(CANDIDATE_STATIONS)
  })
})
