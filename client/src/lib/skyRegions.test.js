import { describe, it, expect } from 'vitest'
import { skyRegionWeights, applySkyTints, skyRegionHues, accentCompanionHue, SKY_REGIONS } from './ringPrimitives.js'
import { midnightGalaxyRing } from '../worlds/midnightGalaxy.ring.js'

// Frozen snapshot of the Midnight Galaxy palette as shipped 2026-09-02 — only
// the fields these functions read. The hue tests below are tests OF THE
// FUNCTIONS, so they pin the fixture, not the live world: scripts/ring-recolor.mjs
// rewrites every hue in midnightGalaxy.ring.js (and the shipped-values guard in
// midnightGalaxy.ring.test.js along with it, on purpose), and a recolor must not
// turn `npm run test:unit` — the ship gate, and the script's own printed next
// step — red. Layout assertions still read the live world: station order and
// region membership are palette-independent, and a recolor must not silently
// move them.
const SHIPPED_STATIONS = [
  { key: 'ringed planet', hue: 256, accent: false },
  { key: 'spiral galaxy', hue: 170, accent: false },
  { key: 'star cluster', hue: 268, accent: false },
  { key: 'amber planet', hue: 28, accent: true },
  { key: 'lit planet', hue: 140, accent: false, region: 'aurora' },
  { key: 'pulsar', hue: 120, accent: false, region: 'aurora', regionSource: true },
  { key: 'rose nebula', hue: 330, accent: true },
  { key: 'comet', hue: 208, accent: false },
  { key: 'binary pair', hue: 214, accent: false },
  { key: 'asteroid field', hue: 160, accent: false },
  { key: 'record', hue: 300, accent: false, region: 'disco', regionSource: true },
  { key: 'aurora ribbon', hue: 196, accent: false },
  { key: 'supernova', hue: 36, accent: true, region: 'ember', regionSource: true },
]
const SHIPPED_ANCHORS = [{ deg: 276, window: 25 }, { deg: 214, window: 25 }, { deg: 140, window: 25 }]

// The one piece of real logic in the sky-region system: the weight curve is
// DERIVED from cyclic index distance, never hand-authored per station. If
// someone re-authors it per station, or the wrap breaks, these fail.
//
// 2026-08-16: the curve went from a two-entry neighbour lookup (core / exit /
// approach / else-zero) to a continuous geometric falloff — 0.25 per step
// ahead, 0.50 per step behind — because the lookup left four of the thirteen
// stations with no sky colour at all. Every value the lookup produced is
// preserved exactly at |distance| <= 1; the change is entirely in what used
// to be a hard zero.
const R = (x) => +x.toFixed(6)

describe('skyRegionWeights', () => {
  it('scores core / exit / approach from index distance, exactly as before', () => {
    const stations = [
      {}, { region: 'aurora' }, { region: 'aurora' }, {}, {}, {},
    ]
    const w = skyRegionWeights(stations).map(x => R(x.aurora))
    // st0 approach 0.25, st1/st2 core, st3 exit 0.50 — unchanged. st4/st5
    // used to be a flat 0 and now continue the falloff instead.
    expect(w.slice(0, 4)).toEqual([0.25, 1, 1, 0.5])
    expect(w[3]).toBeGreaterThan(w[4])
    expect(w[4]).toBeGreaterThan(0)
    expect(w[5]).toBeGreaterThan(0)
  })

  it('wraps around the cylinder (station 0 neighbours the last station)', () => {
    const stations = [{}, {}, {}, { region: 'ember' }]
    const w = skyRegionWeights(stations).map(x => R(x.ember))
    // st0 is the last station's EXIT shoulder (0.5) via the wrap, st2 its
    // approach (0.25). st1 is the exact antipode on a 4-ring; ties resolve to
    // the ahead/approach side, so it reads 0.25^2 rather than 0.5^2.
    expect(w).toEqual([0.5, 0.0625, 0.25, 1])
  })

  it('decays geometrically by direction — 0.25 per step ahead, 0.50 behind', () => {
    // One source, plenty of room either side, so nothing gets clipped by the
    // antipode split: this reads the curve's shape directly.
    const stations = Array.from({ length: 13 }, (_, i) => (i === 6 ? { region: 'ember' } : {}))
    const w = skyRegionWeights(stations).map(x => R(x.ember))
    expect(w[6]).toBe(1)
    // st5/st4/st3 come BEFORE the source in turn order — they are approaching
    // it, so they get the quarter-strength preview curve.
    expect([w[5], w[4], w[3]]).toEqual([0.25, 0.0625, 0.015625])    // approach, 0.25^d
    // st7/st8/st9 come after — the region is behind them, thinning out.
    expect([w[7], w[8], w[9]]).toEqual([0.5, 0.25, 0.125])          // exit, 0.50^d
  })

  it('scores every region independently so shoulders can overlap', () => {
    const stations = [{ region: 'aurora' }, {}, { region: 'ember' }]
    const w = skyRegionWeights(stations)
    expect(R(w[1].aurora)).toBe(0.5)
    expect(R(w[1].ember)).toBe(0.25)
  })

  it('takes the max over a multi-station region, never the sum', () => {
    // aurora spans two stations; the shared shoulder must not read 1.5.
    const stations = [{}, { region: 'aurora' }, { region: 'aurora' }, {}, {}, {}]
    const w = skyRegionWeights(stations)
    expect(w[1].aurora).toBe(1)
    expect(w[2].aurora).toBe(1)
    expect(R(w[3].aurora)).toBe(0.5)
  })

  // Record/supernova swap 2026-08-16 (same day the record landed at st12):
  // the record moved st12 -> st10 for silhouette-family spacing, the
  // supernova st10 -> st12. Disco follows the record; ember follows the
  // supernova. See the station entries' own comments for the arithmetic.
  it('matches the shipped Midnight Galaxy layout (aurora st4-5, disco st10, ember st12)', () => {
    const w = skyRegionWeights(midnightGalaxyRing.stations)
    expect(midnightGalaxyRing.stations).toHaveLength(13)
    expect(w.map(x => R(x.aurora))).toEqual(
      [0.003906, 0.015625, 0.0625, 0.25, 1, 1, 0.5, 0.25, 0.125, 0.0625, 0.03125, 0.015625, 0.000977])
    expect(w.map(x => R(x.ember))).toEqual(
      [0.5, 0.25, 0.125, 0.0625, 0.03125, 0.015625, 0.000244, 0.000977, 0.003906, 0.015625, 0.0625, 0.25, 1])
    expect(w.map(x => R(x.disco))).toEqual(
      [0.125, 0.0625, 0.03125, 0.015625, 0.000244, 0.000977, 0.003906, 0.015625, 0.0625, 0.25, 1, 0.5, 0.25])
  })

  // Ben, 2026-08-16: "ensure that the color wiring on s13 is noticeable and
  // fun." The disco region is what delivers that.
  it('gives the music station its own region, and lights st9 and st11 on the way through', () => {
    const w = skyRegionWeights(midnightGalaxyRing.stations)
    expect(w[10].disco).toBe(1)          // core — the record is its own light source
    expect(R(w[9].disco)).toBe(0.25)     // approach
    expect(R(w[11].disco)).toBe(0.5)     // exit — stacks with ember's 0.25 approach
    expect(midnightGalaxyRing.stations[10]).toMatchObject({
      key: 'record', prim: 'record', region: 'disco', regionSource: true,
    })
    // The record's own hue is a palette value, so it is pinned on the frozen
    // fixture — midnightGalaxy.ring.test.js guards the live one.
    expect(SHIPPED_STATIONS[10]).toMatchObject({ key: 'record', hue: 300 })
  })

  // The reason the curve changed. Ben, on the sky work: panning must "ALWAYS
  // feel connected." Under the old neighbour lookup, st1/st2/st7/st8 carried
  // zero weight from every region — two contiguous stretches of dead air
  // where the sky held no region colour at all, so turning into them was a
  // colour cliff rather than a flow.
  it('leaves no station colourless anywhere on the ring', () => {
    const w = skyRegionWeights(midnightGalaxyRing.stations)
    const totals = w.map(x => Object.values(x).reduce((a, b) => a + b, 0))
    for (const t of totals) expect(t).toBeGreaterThan(0.15)
    // The stations that used to be exactly 0 now carry real, visible weight.
    for (const i of [1, 2, 7, 8]) expect(totals[i]).toBeGreaterThan(0.18)
  })
})

// Guard for the gate-instrument fix (2026-08-16). The snap path must CANCEL
// an in-flight transition, not just set a 0ms duration for the next one —
// changing transition-duration never stops a running transition, and writing
// an opacity the element is already at starts no new one, so the old code
// left the transition alive for ring-verify.mjs's freezeFrame() to rewind.
// Verified for real (computed opacity, live Chromium, real CSS transitions)
// by concepts/tools' repro; this is the cheap structural guard that fails if
// the cancel is dropped again.
describe('applySkyTints transition handling', () => {
  const fakeTint = () => ({ style: { opacity: '', transitionProperty: '', transitionDuration: '' } })

  it('cancels the transition on a snap, even when the value does not change', () => {
    const t = fakeTint()
    t.style.opacity = '0.000'
    applySkyTints({ ember: t }, [{ ember: 0 }], 0, false)
    expect(t.style.transitionProperty).toBe('none')
    expect(t.style.transitionDuration).toBe('0ms')
  })

  it('restores the stylesheet transition on an animated turn', () => {
    const t = fakeTint()
    t.style.opacity = '0.000'
    t.style.transitionProperty = 'none' // left over from a previous snap
    applySkyTints({ ember: t }, [{ ember: 0.5 }], 0, true)
    expect(t.style.transitionProperty).toBe('')
    expect(t.style.opacity).toBe('0.500')
  })
})

// 2026-09-02 — the two places a hue used to be hardcoded OUTSIDE station
// data. Both now derive from the palette, so a recolor of the station data
// carries the sky and the accent companions with it instead of leaving them
// pointing at the old world's colours.
describe('skyRegionHues', () => {
  // The one thing a frozen fixture can silently get wrong is going stale.
  // Key order and region wiring are palette-independent, so a recolor leaves
  // this green while a real layout change turns it red.
  it('the frozen fixture still matches the live world it snapshots', () => {
    expect(SHIPPED_STATIONS.map(s => [s.key, s.region, s.regionSource, s.accent])).toEqual(
      midnightGalaxyRing.stations.map(s => [s.key, s.region, s.regionSource, s.accent]))
  })

  it('reproduces the shipped region hues from the shipped station data', () => {
    expect(skyRegionHues(SHIPPED_STATIONS)).toEqual({ aurora: 152, ember: 26, disco: 300 })
  })

  it('follows the source station when its hue moves', () => {
    const stations = SHIPPED_STATIONS.map(s => s.key === 'pulsar' ? { ...s, hue: 10 } : s)
    expect(skyRegionHues(stations).aurora).toBe(42)
  })

  it('omits a region with no member station', () => {
    expect(skyRegionHues([{ hue: 5 }])).toEqual({})
  })

  it('falls back to a region member when none is declared the source', () => {
    expect(skyRegionHues([{ region: 'ember', hue: 200 }]).ember).toBe(190)
  })

  it('wraps into 0..359 rather than emitting a negative hue', () => {
    expect(skyRegionHues([{ region: 'ember', hue: 4, regionSource: true }]).ember).toBe(354)
  })

  it('SKY_REGIONS carries no hardcoded hue', () => {
    for (const cfg of Object.values(SKY_REGIONS)) expect(cfg).not.toHaveProperty('hue')
  })
})

describe('accentCompanionHue', () => {
  const anchors = SHIPPED_ANCHORS // 276, 214, 140

  it('picks the anchor farthest from the station hue', () => {
    expect(accentCompanionHue(28, anchors)).toBe(214)   // amber planet
    expect(accentCompanionHue(330, anchors)).toBe(140)  // rose nebula
    expect(accentCompanionHue(36, anchors)).toBe(214)   // supernova
  })

  it('two-color palette: the other color', () => {
    const ry = [{ deg: 0, window: 25 }, { deg: 55, window: 25 }]
    expect(accentCompanionHue(58, ry)).toBe(0)
    expect(accentCompanionHue(3, ry)).toBe(55)
  })

  it('falls back to +168 with no anchors', () => {
    expect(accentCompanionHue(30, [])).toBe(198)
  })

  // The shipped world may not visibly change: every accent companion has to
  // land within 18 degrees of the +168 it used to be hardcoded to.
  it('shifts the shipped accent companions by no more than 18 degrees', () => {
    for (const st of SHIPPED_STATIONS.filter(s => s.accent)) {
      const was = (st.hue + 168) % 360
      const now = accentCompanionHue(st.hue, SHIPPED_ANCHORS)
      expect(Math.abs((((now - was) % 360) + 540) % 360 - 180)).toBeLessThanOrEqual(18)
    }
  })
})
