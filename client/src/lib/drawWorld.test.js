import { describe, it, expect } from 'vitest'
import { assertWorld } from './drawWorld.js'

const s = (key, family, prim, hue, accent = false) => ({ key, family, prim, hue, accent })

// A minimal but ring-legal 4-station world for unit-testing assertWorld in
// isolation, independent of the real 13-station shape (integration with the
// real world is Task 2).
function legalWorld(overrides = {}) {
  return {
    stations: [s('a', 'A', 'ring', 10), s('b', 'B', 'lens', 100), s('c', 'C', 'dots', 200), s('d', 'D', 'binary', 260)],
    hueAnchors: [{ deg: 10, window: 25 }, { deg: 100, window: 25 }, { deg: 200, window: 25 }, { deg: 260, window: 25 }],
    ...overrides,
  }
}

describe('assertWorld', () => {
  it('passes a world with no ring violations, no region drift, no dead-band hits', () => {
    expect(assertWorld(legalWorld())).toBe(true)
  })

  it('throws when the stations fail assertRing (family too close)', () => {
    const world = legalWorld({
      stations: [s('a', 'A', 'ring', 10), s('a2', 'A', 'planet', 20), s('c', 'C', 'dots', 200), s('d', 'D', 'binary', 260)],
    })
    expect(() => assertWorld(world)).toThrow(/family "A".*need >=3/)
  })

  it('throws when a station hue lands inside the dead band [45,80)', () => {
    const world = legalWorld({
      stations: [s('a', 'A', 'ring', 50), s('b', 'B', 'lens', 100), s('c', 'C', 'dots', 200), s('d', 'D', 'binary', 260)],
      hueAnchors: [{ deg: 50, window: 25 }, { deg: 100, window: 25 }, { deg: 200, window: 25 }, { deg: 260, window: 25 }],
    })
    expect(() => assertWorld(world)).toThrow(/dead band/)
  })

  it('throws when a sky region hue lands outside every anchor window', () => {
    // 'aurora' rides the pulsar-family station's hue + a fixed +32 offset
    // (ringPrimitives.js SKY_REGIONS) — give this world a 'region'-carrying
    // station whose resulting sky hue nothing in hueAnchors covers.
    const world = legalWorld({
      stations: [
        s('a', 'A', 'ring', 10), s('b', 'B', 'lens', 100),
        { ...s('p', 'burst', 'pulsar', 200), region: 'aurora', regionSource: true },
        s('d', 'D', 'binary', 260),
      ],
      hueAnchors: [{ deg: 10, window: 5 }, { deg: 100, window: 5 }, { deg: 200, window: 5 }, { deg: 260, window: 5 }],
    })
    // pulsar hue 200 + aurora's +32 offset = 232, outside every 5deg-wide anchor window above
    expect(() => assertWorld(world)).toThrow(/Sky region 'aurora'/)
  })
})
