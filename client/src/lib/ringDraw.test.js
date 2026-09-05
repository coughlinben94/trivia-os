import { describe, it, expect } from 'vitest'
import { LANE_CAP, assertRing, drawStations } from './ringDraw.js'
import { seedFrom } from './paletteGenerator.js'
import { RING_POOL } from '../worlds/ringPool.js'

const s = (key, family, prim = key, accent = false) => ({ key, family, prim, accent })

describe('LANE_CAP', () => {
  it('is floor(slots/3) — 4 at 13 slots', () => {
    expect(LANE_CAP(13)).toBe(4)
    expect(LANE_CAP(12)).toBe(4)
    expect(LANE_CAP(9)).toBe(3)
  })
})

describe('assertRing', () => {
  it('passes a ring where every family is >=3 apart cyclically', () => {
    // families A,B,C,D placed at 0,1,2,3 then repeated every 4 — max distance
    // between same-family members is >=3 for a 12-slot ring built this way
    const order = [
      s('a0', 'A'), s('b0', 'B'), s('c0', 'C'), s('d0', 'D'),
      s('a1', 'A'), s('b1', 'B'), s('c1', 'C'), s('d1', 'D'),
      s('a2', 'A'), s('b2', 'B'), s('c2', 'C'), s('d2', 'D'),
    ]
    expect(assertRing(order, { slots: 12 })).toBe(true)
  })

  it('throws when two same-family members are <3 apart', () => {
    const order = [
      s('a0', 'A'), s('a1', 'A'), s('b0', 'B'), s('c0', 'C'),
    ]
    expect(() => assertRing(order, { slots: 4 })).toThrow(/family "A".*need >=3/)
  })

  it('throws when the same prim is adjacent', () => {
    const order = [
      s('x0', 'A', 'ring'), s('x1', 'B', 'ring'), s('x2', 'C', 'dots'), s('x3', 'D', 'lens'),
    ]
    expect(() => assertRing(order, { slots: 4 })).toThrow(/prim "ring" adjacent/)
  })

  it('throws on a duplicate key', () => {
    const order = [s('dup', 'A'), s('dup', 'B'), s('c', 'C'), s('d', 'D')]
    expect(() => assertRing(order, { slots: 4 })).toThrow(/duplicate key "dup"/)
  })

  it('throws when accents exceed the cap', () => {
    const order = [
      s('a', 'A', 'a', true), s('b', 'B', 'b', true), s('c', 'C', 'c', true), s('d', 'D', 'd', true),
    ]
    expect(() => assertRing(order, { slots: 4, maxAccents: 3 })).toThrow(/4 accents, max 3/)
  })

  it('throws when one prim is used more than maxPerPrim times', () => {
    const order = [
      s('a', 'A', 'ring'), s('b', 'B', 'lens'), s('c', 'C', 'ring'),
      s('d', 'D', 'dots'), s('e', 'E', 'ring'), s('f', 'F', 'binary'),
    ]
    expect(() => assertRing(order, { slots: 6, maxPerPrim: 2 })).toThrow(/prim "ring" used 3x, max 2/)
  })

  it('wraps around the cyclic boundary (last slot vs slot 0)', () => {
    const order = [s('a0', 'A'), s('b', 'B'), s('c', 'C'), s('a1', 'A')]
    // slot 3 and slot 0 are cyclically 1 apart (4-slot ring) — same family, must throw
    expect(() => assertRing(order, { slots: 4 })).toThrow(/family "A".*need >=3/)
  })
})

describe('drawStations', () => {
  it('seed "authored" returns todays 13 stations byte-for-byte, unchanged order', () => {
    const result = drawStations(RING_POOL, { seed: 'authored' })
    expect(result).toEqual(RING_POOL)
  })

  it('throws for a real seed on the current 13-entry pool — radial-mass has 5 members, cap is 4', () => {
    // This is the documented, expected failure (docs/superpowers/plans/
    // 2026-09-05-ring-unified-noun-color-draw-design.md §9): with pool.length
    // === slots, every member must be chosen, and today's pool has 5
    // radial-mass nouns against LANE_CAP(13)=4. The throw IS the proof the
    // cap is enforced, not a bug — pool growth (a separate art-project task)
    // is what makes a real seed succeed.
    expect(() => drawStations(RING_POOL, { seed: 42 })).toThrow(/cannot fill 13 slots under the caps/)
  })

  it('throws if pinKey is not in the pool (non-authored seed)', () => {
    const noRecord = RING_POOL.filter(s => s.key !== 'record')
    expect(() => drawStations(noRecord, { seed: 1, slots: 12 })).toThrow(/pinKey "record" not found/)
  })

  it('throws if seed is missing', () => {
    expect(() => drawStations(RING_POOL, { slots: 12 })).toThrow(/seed is required/)
    expect(() => drawStations(RING_POOL, { seed: null, slots: 12 })).toThrow(/seed is required/)
  })

  it('throws if pinAt is out of range or non-integer', () => {
    expect(() => drawStations(RING_POOL, { seed: 1, slots: 12, pinAt: 12 })).toThrow(/pinAt \(12\) must be an integer in \[0, 12\)/)
    expect(() => drawStations(RING_POOL, { seed: 1, slots: 12, pinAt: -1 })).toThrow(/pinAt \(-1\)/)
    expect(() => drawStations(RING_POOL, { seed: 1, slots: 12, pinAt: 1.5 })).toThrow(/pinAt \(1.5\)/)
  })

  const SYNTHETIC_POOL = [
    { key: 'p1', prim: 'ring', hue: 10, accent: false, family: 'radial-mass' },
    { key: 'p2', prim: 'planet', hue: 40, accent: false, family: 'radial-mass' },
    { key: 'c1', prim: 'dots', hue: 90, accent: false, family: 'cluster' },
    { key: 'c2', prim: 'asteroidField', hue: 130, accent: false, family: 'cluster' },
    { key: 'c3', prim: 'neutron', hue: 140, accent: false, family: 'cluster' },
    { key: 'b1', prim: 'pulsar', hue: 170, accent: false, family: 'burst' },
    { key: 'b2', prim: 'spikes', hue: 210, accent: true, family: 'burst' },
    { key: 'record', prim: 'record', hue: 300, accent: false, family: 'radial-mass' },
    { key: 's1', prim: 'streak', hue: 250, accent: false, family: 'streak' },
    { key: 's2', prim: 'wave', hue: 260, accent: false, family: 'streak' },
  ]

  it('a satisfiable synthetic pool: same seed twice gives identical results, and each result is valid', () => {
    const r1 = drawStations(SYNTHETIC_POOL, { seed: 777, slots: 8, pinAt: 6 })
    const r2 = drawStations(SYNTHETIC_POOL, { seed: 777, slots: 8, pinAt: 6 })
    expect(r1).toEqual(r2)
    expect(assertRing(r1, { slots: 8 })).toBe(true)
  })

  it('pins "record" at pinAt regardless of where the internal draw placed it', () => {
    const result = drawStations(SYNTHETIC_POOL, { seed: 777, slots: 8, pinAt: 6 })
    expect(result[6].key).toBe('record')
  })

  it('different seeds can produce different arrangements of the same satisfiable pool', () => {
    const r1 = drawStations(SYNTHETIC_POOL, { seed: 1, slots: 8, pinAt: 6 })
    const r2 = drawStations(SYNTHETIC_POOL, { seed: 2, slots: 8, pinAt: 6 })
    // not asserting they always differ (small search space could coincide),
    // just that both are independently valid — the real claim under test.
    expect(assertRing(r1, { slots: 8 })).toBe(true)
    expect(assertRing(r2, { slots: 8 })).toBe(true)
  })

  it('retries past a greedy dead end instead of falsely reporting the pool as too narrow', () => {
    // This exact pool+seed was found by brute-force search specifically
    // because a single, non-retried greedy attempt gets stuck at 7 of 8
    // chosen (an unlucky pick order burns the caps early) even though a
    // valid 8-of-9 selection exists — verified by re-running the pre-fix
    // single-attempt algorithm against this pool/seed offline. With the
    // bounded-retry loop, drawStations must succeed instead of throwing.
    const pool = [
      { key: 'p0', prim: 'p_pin', hue: 0, accent: false, family: 'fam_pin' },
      { key: 'x0', prim: 'pr2', hue: 0, accent: false, family: 'fam2' },
      { key: 'x1', prim: 'pr0', hue: 1, accent: false, family: 'fam3' },
      { key: 'x2', prim: 'pr2', hue: 2, accent: true, family: 'fam0' },
      { key: 'x3', prim: 'pr0', hue: 3, accent: false, family: 'fam2' },
      { key: 'x4', prim: 'pr0', hue: 4, accent: true, family: 'fam1' },
      { key: 'x5', prim: 'pr1', hue: 5, accent: false, family: 'fam1' },
      { key: 'x6', prim: 'pr1', hue: 6, accent: true, family: 'fam4' },
      { key: 'x7', prim: 'pr2', hue: 7, accent: true, family: 'fam1' },
    ]
    const result = drawStations(pool, { seed: 0, slots: 8, pinKey: 'p0', pinAt: 0 })
    expect(result).toHaveLength(8)
    expect(assertRing(result, { slots: 8 })).toBe(true)
    // Deterministic: same seed always retries the same way to the same result.
    expect(drawStations(pool, { seed: 0, slots: 8, pinKey: 'p0', pinAt: 0 })).toEqual(result)
  })

  it('string seeds no longer collapse to 0 — different strings hash differently', () => {
    // seedFrom uses FNV-1a hashing, not the broken hash32(String(x), 0) path
    const seed1 = seedFrom('show-alpha')
    const seed2 = seedFrom('show-beta')
    // Both must be non-zero and different
    expect(seed1).not.toBe(0)
    expect(seed2).not.toBe(0)
    expect(seed1).not.toBe(seed2)
    // Both string seeds work with drawStations and produce valid results
    const r1 = drawStations(SYNTHETIC_POOL, { seed: 'show-alpha', slots: 8, pinAt: 6 })
    const r2 = drawStations(SYNTHETIC_POOL, { seed: 'show-beta', slots: 8, pinAt: 6 })
    expect(assertRing(r1, { slots: 8 })).toBe(true)
    expect(assertRing(r2, { slots: 8 })).toBe(true)
    // Verify that the two different string seeds produce results consistent
    // with the same numeric seeds they hash to (as a sanity check)
    const r1Numeric = drawStations(SYNTHETIC_POOL, { seed: seed1, slots: 8, pinAt: 6 })
    expect(r1).toEqual(r1Numeric)
  })

  it('production-scale stress test: 1,000 seeds at 13 slots, all valid', () => {
    // This test validates the fix for the dropped regression case: drawStations
    // with a satisfiable pool at slots=13 (production scale) across many seeds.
    // Original spec (docs/superpowers/plans/2026-09-02-ring-station-variety.md §8
    // Phase 2) required stress-testing at 13 slots; an independent manual run
    // (10,000 seeds, all passed, max 58ms) confirmed it works. This adds that
    // missing regression test so it stays proven going forward.
    //
    // Pool design: 4 families × 3-4 members each = 14 total members.
    // LANE_CAP(13) = 4, so each family respects the cap. We can always choose
    // 4+4+4+1=13 or similar valid distributions.
    const POOL_PRODUCTION = [
      s('a1', 'familyA'), s('a2', 'familyA'), s('a3', 'familyA'), s('a4', 'familyA'),
      s('b1', 'familyB'), s('b2', 'familyB'), s('b3', 'familyB'), s('b4', 'familyB'),
      s('g1', 'familyG'), s('g2', 'familyG'), s('g3', 'familyG'), s('g4', 'familyG'),
      s('record', 'familyD'), s('d2', 'familyD'),
    ]

    for (let seed = 0; seed < 1000; seed++) {
      const result = drawStations(POOL_PRODUCTION, { seed, slots: 13, pinAt: 10 })
      expect(result).toHaveLength(13)
      expect(assertRing(result, { slots: 13 })).toBe(true)
    }
  })
})
