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
    expect(w[1]).toEqual({ aurora: 0.5, ember: 0.25 })
  })

  it('matches the shipped Midnight Galaxy layout (aurora st4-5, ember st10)', () => {
    const w = skyRegionWeights(midnightGalaxyRing.stations)
    expect(w.map(x => x.aurora)).toEqual([0, 0, 0, 0.25, 1, 1, 0.5, 0, 0, 0, 0, 0])
    expect(w.map(x => x.ember)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0.25, 1, 0.5])
  })
})
