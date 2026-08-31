import { describe, it, expect } from 'vitest'
import { midnightGalaxyRing } from './midnightGalaxy.ring.js'

// Pins the shipped hues so a constant-wiring change (or any future palette
// edit landing by accident) can't silently alter the world. Update this
// list ONLY in the same commit that deliberately changes a hue, and only
// after `npm run verify:ring` has been run against the change.
describe('midnightGalaxyRing station hues', () => {
  it('matches the shipped values', () => {
    expect(midnightGalaxyRing.stations.map(s => [s.key, s.hue])).toEqual([
      ['ringed planet', 256], ['spiral galaxy', 170], ['star cluster', 268],
      ['amber planet', 28], ['lit planet', 140], ['pulsar', 120],
      ['rose nebula', 330], ['comet', 208], ['binary pair', 214],
      ['asteroid field', 160], ['record', 300], ['aurora ribbon', 196],
      ['supernova', 36],
    ])
  })
})
