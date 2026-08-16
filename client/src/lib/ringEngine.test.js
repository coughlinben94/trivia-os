import { describe, it, expect } from 'vitest'
import { cylinderOf, authorPeriodOf, buildArc, loudnessOf, fillOf, hash32, rng } from './ringEngine.js'

const ENGINE = { PANES: 12, ARC: { lo: 10, hi: 31, exp: 1.6, ref: 31, fillMin: 0.35, fillMax: 1.00 } }
const LAYERS = [
  { id: 'far', surge: 480, m: 1 },
  { id: 'mid', surge: 1920, m: 1 },
  { id: 'near', surge: 2880, m: 3 },
]
const WORLD = { phase: 5 }

describe('cylinderOf / authorPeriodOf', () => {
  // layer arithmetic — matches concepts/tools/ring-verify.mjs's live-DOM check
  it('computes cylinder length per layer', () => {
    expect(cylinderOf(ENGINE, LAYERS[0])).toBe(5760) // far
    expect(cylinderOf(ENGINE, LAYERS[1])).toBe(23040) // mid
    expect(cylinderOf(ENGINE, LAYERS[2])).toBe(34560) // near
  })
  it('divides cylinder by m for authorPeriod', () => {
    expect(authorPeriodOf(ENGINE, LAYERS[2])).toBe(11520) // near, m=3
  })
})

describe('buildArc', () => {
  it('keeps the value arc span within the 2.2-4.0 band', () => {
    // matches the 2.99x this session measured live
    const arc = buildArc(ENGINE, WORLD)
    const span = Math.max(...arc) / Math.min(...arc)
    expect(span).toBeGreaterThanOrEqual(2.2)
    expect(span).toBeLessThanOrEqual(4.0)
  })
})

describe('fillOf', () => {
  // the arc's absolute value must reach a pixel — proved 2026-08-08 that
  // loudnessOf() alone throws the units away (scaling ARC.lo/hi 10x
  // rendered byte-identical frames). fillOf is the channel that carries it.
  it('clamps to fillMin/fillMax and scales with the arc, not just its rank', () => {
    const arc = [25, 20, 31]
    expect(fillOf(ENGINE, arc, 0)).toBeCloseTo(25 / 31, 5) // unclamped, mid-range
    expect(fillOf(ENGINE, arc, 2)).toBe(1.00) // 31/31, clamped at fillMax
    expect(fillOf(ENGINE, [10, 20, 31], 0)).toBe(0.35) // 10/31 below fillMin, clamped
  })
})

describe('loudnessOf', () => {
  const arc = [10, 20, 30]
  it('maps the minimum value to 0', () => {
    expect(loudnessOf(arc, 0)).toBe(0)
  })
  it('maps the maximum value to 1', () => {
    expect(loudnessOf(arc, 2)).toBe(1)
  })
})

describe('rng', () => {
  it('is deterministic — same (i, seed) always produces the same stream', () => {
    // the exact world-06 bug this engine exists to fix: the world must not
    // differ between reloads
    const a = rng(3, 0x4217)
    const b = rng(3, 0x4217)
    expect(a()).toBe(b())
  })
  it('advances its stream via hash32 on each call', () => {
    const seed = hash32(3, 0x4217)
    const next = hash32(seed, 0x9e3779b9)
    const gen = rng(3, 0x4217)
    expect(gen()).toBe(next / 4294967296)
  })
})
