import { describe, it, expect } from 'vitest'
import { cylinderOf, authorPeriodOf, buildArc, loudnessOf, fillOf, hash32, rng, assertLayerPeriods } from './ringEngine.js'

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

// ── 13 panes ──────────────────────────────────────────────────────────────
// Station 13 (the jukebox music slot, 2026-08-16) took PANES 12 -> 13. Two
// things had to be proved before that shipped, and they are proved here
// rather than by eye on a running build:
//   1. near's m=3 still tiles its cylinder exactly, even though 3 does not
//      divide 13 (the old, wrongly-stated invariant).
//   2. the wrap glide generalises. The wrap point MOVED: it used to be
//      station 11 -> 0, it is now 12 -> 0. Ben asked for both legs of
//      s12->s13->s0 (1-indexed; indices 11 -> 12 -> 0) checked, not just the
//      old one.
const ENGINE13 = {
  PANES: 13,
  LAYERS: [
    { id: 'sky', surge: 0, m: 1 },
    { id: 'far', surge: 480, m: 1 },
    { id: 'mid', surge: 1920, m: 1 },
    { id: 'near', surge: 2880, m: 3 },
  ],
}

describe('assertLayerPeriods', () => {
  it('accepts 13 panes — 3 does not divide 13, but the pixel period is exact', () => {
    expect(() => assertLayerPeriods(ENGINE13)).not.toThrow()
  })

  it('accepts the historical 12-pane engine', () => {
    expect(() => assertLayerPeriods({ PANES: 12, LAYERS: ENGINE13.LAYERS })).not.toThrow()
  })

  it('throws when the surge makes the strip a fractional pixel count', () => {
    const bad = { PANES: 13, LAYERS: [{ id: 'near', surge: 2881, m: 3 }] }
    expect(() => assertLayerPeriods(bad)).toThrow(/whole pixels/)
  })

  it('throws when m does not divide the cylinder evenly', () => {
    const bad = { PANES: 13, LAYERS: [{ id: 'near', surge: 2880, m: 7 }] }
    expect(() => assertLayerPeriods(bad)).toThrow(/whole pixels/)
  })

  it('ignores the sky layer, which never pans', () => {
    expect(() => assertLayerPeriods({ PANES: 13, LAYERS: [{ id: 'sky', surge: 0, m: 1 }] })).not.toThrow()
  })

  it('near tiles exactly at 13 panes: 12480 x 3 === 37440', () => {
    const near = ENGINE13.LAYERS[3]
    expect(authorPeriodOf(ENGINE13, near)).toBe(12480)
    expect(authorPeriodOf(ENGINE13, near) * near.m).toBe(cylinderOf(ENGINE13, near))
  })
})

// turn()'s own offset arithmetic, reproduced (RingAmbient.jsx and
// world-07-ring.html share it): offset += surge unconditionally — that is the
// GLIDE target, and it may hang one frame past the cylinder, which is legal
// because each layer's DOM is authored cylinder + ENGINE.W wide with an extra
// content copy precisely to cover that window. The modulo reset runs only
// AFTER the transition completes, where the snap is invisible.
function simulateTurns(engine, turns) {
  const pans = engine.LAYERS.filter(L => L.surge !== 0)
  const offset = Object.fromEntries(pans.map(L => [L.id, 0]))
  const legs = []
  for (let t = 0; t < turns; t++) {
    const before = { ...offset }
    for (const L of pans) offset[L.id] += L.surge
    const glideTarget = { ...offset }
    for (const L of pans) offset[L.id] %= cylinderOf(engine, L)
    legs.push({ before, glideTarget, after: { ...offset } })
  }
  return legs
}

describe('13-pane wrap glide (Ben: "the glide from s12-s13-s0")', () => {
  const pans = ENGINE13.LAYERS.filter(L => L.surge !== 0)

  it('every one of the 13 legs travels exactly one surge — no snap, no double-step', () => {
    simulateTurns(ENGINE13, 13).forEach((leg, i) => {
      for (const L of pans) {
        expect(leg.glideTarget[L.id] - leg.before[L.id], `turn ${i}, layer ${L.id}`).toBe(L.surge)
      }
    })
  })

  it('no glide target overshoots the authored content (cylinder + one frame)', () => {
    for (const leg of simulateTurns(ENGINE13, 13)) {
      for (const L of pans) {
        expect(leg.glideTarget[L.id]).toBeLessThanOrEqual(cylinderOf(ENGINE13, L))
      }
    }
  })

  it('leg 11->12 (s12->s13) is an ordinary forward glide, not the wrap', () => {
    const leg = simulateTurns(ENGINE13, 13)[11]
    expect(leg.glideTarget.mid - leg.before.mid).toBe(1920)
    expect(leg.after.mid).toBe(leg.glideTarget.mid) // no modulo fired
    expect(leg.after.mid).toBe(23040) // 12 * 1920, still short of the 24960 cylinder
  })

  it('leg 12->0 (s13->s0) is the new wrap: full forward travel, reset deferred', () => {
    const leg = simulateTurns(ENGINE13, 13)[12]
    expect(leg.glideTarget.mid - leg.before.mid).toBe(1920) // forward, positive — never a rewind
    expect(leg.glideTarget.mid).toBe(cylinderOf(ENGINE13, ENGINE13.LAYERS[2]))
    expect(leg.after.mid).toBe(0) // modulo only after the transition completes
  })

  it('all layers reach phase 0 together on turn 13, not turn 12', () => {
    const legs = simulateTurns(ENGINE13, 13)
    expect(Object.values(legs[11].after).some(v => v !== 0)).toBe(true)
    expect(legs[12].after).toEqual({ far: 0, mid: 0, near: 0 })
  })

  it('the old 12-pane wrap point no longer wraps at 13 panes (off-by-one guard)', () => {
    // The bug this guards: leaving a hardcoded 12 somewhere would make the
    // ring reset a station early and skip the record entirely.
    const legs = simulateTurns(ENGINE13, 13)
    expect(legs[10].after.mid).not.toBe(0) // old wrap leg 11->0
  })
})
