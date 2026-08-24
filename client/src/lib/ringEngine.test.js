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

  // ART-DIRECTION-SPEC §3 / ring-verify.mjs check 7. This is the guard on
  // separateArc(): before it existed the arc met this floor only by luck of
  // the jitter seed, and at PANES=13 7 of 13 cyclic pairs were under it.
  // Swept across every PANES/phase the engine could plausibly take, not just
  // the shipped one — the previous version passed at PANES=12 and silently
  // stopped holding the day PANES became 13.
  it('separates every cyclic adjacent pair by at least 6% of hi-lo', () => {
    const floor = 0.06 * (ENGINE.ARC.hi - ENGINE.ARC.lo)
    for (let panes = 8; panes <= 16; panes++) {
      for (let phase = 0; phase < panes; phase++) {
        const arc = buildArc({ ...ENGINE, PANES: panes }, { phase })
        for (let i = 0; i < panes; i++) {
          const gap = Math.abs(arc[i] - arc[(i + 1) % panes])
          expect(gap, `PANES=${panes} phase=${phase} pair ${i}->${(i + 1) % panes}`).toBeGreaterThanOrEqual(floor - 1e-9)
        }
      }
    }
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

// turn(-1)'s offset arithmetic, reproduced the same way simulateTurns above
// reproduces turn(+1)'s (RingAmbient.jsx, 2026-08-24 — Prev between adjacent
// ring slides glides instead of snapping). The backward wrap is the forward
// wrap's mirror with the snap on the OTHER side of the glide: at station 0
// (all offsets 0) the offsets pre-snap to their cylinders — pixel-identical,
// offset===cylinder shows the spare-frame copy of [0, W], the same window
// every forward wrap glide already ends on — and THEN the subtraction glides
// over authored content. Nothing is deferred: cylinder - surge is already in
// [0, cylinder), so no post-transition modulo reset exists on this path.
function simulateBackTurn(engine, station) {
  const pans = engine.LAYERS.filter(L => L.surge !== 0)
  // offset === station * surge is the system's own invariant (turn/jumpTo
  // both move offsets by whole surges in lockstep with stationRef).
  const offset = Object.fromEntries(pans.map(L => [L.id, station * L.surge]))
  const before = { ...offset }
  const willUnwrap = pans.some(L => offset[L.id] - L.surge < 0)
  if (willUnwrap) for (const L of pans) offset[L.id] += cylinderOf(engine, L)
  const preSnap = { ...offset }
  for (const L of pans) offset[L.id] -= L.surge
  return { before, willUnwrap, preSnap, glideTarget: { ...offset } }
}

describe('backward glide (2026-08-24: Prev between adjacent ring slides)', () => {
  const pans = ENGINE13.LAYERS.filter(L => L.surge !== 0)

  it('every non-wrap leg travels exactly one surge backward, never below 0', () => {
    for (let s = 1; s < ENGINE13.PANES; s++) {
      const leg = simulateBackTurn(ENGINE13, s)
      expect(leg.willUnwrap, `station ${s}`).toBe(false)
      for (const L of pans) {
        expect(leg.glideTarget[L.id] - leg.before[L.id], `station ${s}, layer ${L.id}`).toBe(-L.surge)
        expect(leg.glideTarget[L.id], `station ${s}, layer ${L.id}`).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('station 0 is the one backward wrap, on every layer at once', () => {
    expect(simulateBackTurn(ENGINE13, 0).willUnwrap).toBe(true)
    for (let s = 1; s < ENGINE13.PANES; s++) {
      expect(simulateBackTurn(ENGINE13, s).willUnwrap).toBe(false)
    }
  })

  it('the backward wrap pre-snaps to offset === cylinder — the pixel-identical spare-frame window', () => {
    const leg = simulateBackTurn(ENGINE13, 0)
    for (const L of pans) {
      // Same resting point every FORWARD wrap glide ends on before its own
      // deferred reset — proven-authored content, not an assumption.
      expect(leg.preSnap[L.id]).toBe(cylinderOf(ENGINE13, L))
    }
  })

  it('the backward wrap glide lands exactly on station 12 resting offsets, already normalized', () => {
    const leg = simulateBackTurn(ENGINE13, 0)
    for (const L of pans) {
      expect(leg.glideTarget[L.id]).toBe((ENGINE13.PANES - 1) * L.surge)
      expect(leg.glideTarget[L.id]).toBeLessThan(cylinderOf(ENGINE13, L)) // no deferred modulo needed
    }
  })

  it('a full backward circuit retraces the forward circuit station by station', () => {
    // Walk 0 -> 12 -> 11 -> ... -> 0 and check each glide target equals the
    // resting offsets simulateTurns produces for that same station.
    const forward = simulateTurns(ENGINE13, 13).map(l => l.after)
    let station = 0
    for (let step = 0; step < ENGINE13.PANES; step++) {
      const leg = simulateBackTurn(ENGINE13, station)
      station = (station - 1 + ENGINE13.PANES) % ENGINE13.PANES
      const expected = station === 0
        ? { far: 0, mid: 0, near: 0 }
        : forward[station - 1] // legs[s-1].after is station s's resting offsets
      expect(leg.glideTarget, `arrived at station ${station}`).toEqual(expected)
    }
  })
})
