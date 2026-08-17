import { describe, it, expect } from 'vitest'
import { skyRegionWeights } from './ringPrimitives.js'
import { midnightGalaxyRing } from '../worlds/midnightGalaxy.ring.js'

// The one piece of real logic in the sky-region system: the weight curve is
// DERIVED from index distance (cyclically), never hand-authored per station.
// If someone re-authors it per station, or the wrap breaks, these fail.
describe('skyRegionWeights', () => {
  it('scores core / exit / approach / elsewhere from index distance', () => {
    const stations = [
      {}, { region: 'aurora' }, { region: 'aurora' }, {}, {}, {},
    ]
    const w = skyRegionWeights(stations).map(x => x.aurora)
    expect(w).toEqual([0.25, 1, 1, 0.5, 0, 0])
  })

  it('wraps around the cylinder (station 0 neighbours the last station)', () => {
    const stations = [{}, {}, {}, { region: 'ember' }]
    const w = skyRegionWeights(stations).map(x => x.ember)
    expect(w).toEqual([0.5, 0, 0.25, 1])
  })

  it('scores every region independently so shoulders can overlap', () => {
    const stations = [{ region: 'aurora' }, {}, { region: 'ember' }]
    const w = skyRegionWeights(stations)
    // Asserted per-key rather than as a whole-object match: every region in
    // SKY_REGIONS is scored at every station (that's the point — overlapping
    // shoulders stack instead of clobbering), so a whole-object equality here
    // breaks every time a region is added, which is not what this test is
    // about. It broke exactly that way when `disco` landed 2026-08-16.
    expect(w[1].aurora).toBe(0.5)
    expect(w[1].ember).toBe(0.25)
  })

  it('matches the shipped Midnight Galaxy layout (aurora st4-5, ember st10, disco st12)', () => {
    const w = skyRegionWeights(midnightGalaxyRing.stations)
    expect(midnightGalaxyRing.stations).toHaveLength(13)
    expect(w.map(x => x.aurora)).toEqual([0, 0, 0, 0.25, 1, 1, 0.5, 0, 0, 0, 0, 0, 0])
    expect(w.map(x => x.ember)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0.25, 1, 0.5, 0])
    expect(w.map(x => x.disco)).toEqual([0.5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.25, 1])
  })

  // Ben, 2026-08-16: "ensure that the color wiring on s13 is noticeable and
  // fun." The disco region is what delivers that, and its exit shoulder is
  // also what breaks up the ring's flattest colour stretch — station 0 used
  // to carry zero weight from any region.
  it('gives the music station its own region, and lights st11 and st0 on the way through', () => {
    const w = skyRegionWeights(midnightGalaxyRing.stations)
    expect(w[12].disco).toBe(1)    // core — the record is its own light source
    expect(w[11].disco).toBe(0.25) // approach
    expect(w[0].disco).toBe(0.5)   // exit, wrapping past the end of the array
    expect(midnightGalaxyRing.stations[12]).toMatchObject({
      key: 'record', prim: 'record', hue: 300, region: 'disco', regionSource: true,
    })
  })

  it('station 0 is no longer colourless now that disco exits into it', () => {
    const w = skyRegionWeights(midnightGalaxyRing.stations)
    const total = Object.values(w[0]).reduce((a, b) => a + b, 0)
    expect(total).toBeGreaterThan(0)
  })
})
