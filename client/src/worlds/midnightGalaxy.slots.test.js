import { describe, it, expect } from 'vitest'
import { SLOTS } from './midnightGalaxy.slots.js'
import { midnightGalaxyRing } from './midnightGalaxy.ring.js'
import { rng } from '../lib/ringEngine.js'

// bandUpper/companionUpper are pure functions of rng(i, 0x5EED2) — the exact
// formula RingAmbient.jsx's station loop uses today for `pairBandDraw`/
// `pairUpper`/`compUpper`, before any override. Recomputed here (not just
// eyeballed once) so a future edit to that formula, or to a station's
// explicit override, is caught the moment SLOTS drifts from it.
const explicitBandUpper = { 11: false }
const explicitCompanionUpper = { 2: true }

function effectiveFor(i) {
  const pairBandDraw = rng(i, 0x5EED2)() < 0.5
  const bandUpper = i in explicitBandUpper ? explicitBandUpper[i] : pairBandDraw
  const companionUpper = i in explicitCompanionUpper ? explicitCompanionUpper[i] : !bandUpper
  return { bandUpper, companionUpper }
}

describe('midnightGalaxy.slots', () => {
  it('has exactly 13 slots, one per station, in station order', () => {
    expect(SLOTS).toHaveLength(13)
    expect(midnightGalaxyRing.stations).toHaveLength(13)
  })

  it.each(midnightGalaxyRing.stations.map((s, i) => [i, s.key]))(
    'slot %i (%s) matches the shipped world\'s bandUpper/companionUpper exactly',
    (i) => {
      const { bandUpper, companionUpper } = effectiveFor(i)
      expect(SLOTS[i].bandUpper).toBe(bandUpper)
      // Station 5 (pulsar) has noCompanion:true — no companion is ever drawn,
      // so companionUpper is inert there; don't assert a formula result that
      // production code never actually reads.
      if (!midnightGalaxyRing.stations[i].noCompanion) {
        expect(SLOTS[i].companionUpper).toBe(companionUpper)
      }
    },
  )

  it('carries the shipped world\'s maxDetail exactly (station.maxDetail ?? 4)', () => {
    midnightGalaxyRing.stations.forEach((s, i) => {
      expect(SLOTS[i].maxDetail).toBe(s.maxDetail ?? 4)
    })
  })

  it('carries the shipped world\'s explicit companionBoost exactly', () => {
    midnightGalaxyRing.stations.forEach((s, i) => {
      expect(SLOTS[i].companionBoost).toBe(s.companionBoost ?? false)
    })
  })

  // cornerLeft depends on how many rHeadline() draws makePrim() consumes
  // internally per primitive — not re-derivable by formula here (that's
  // exactly the fragility this slot table exists to remove). Captured from
  // a live render (2026-09-03) instead; cross-checked at the time against
  // stations 6/7's known explicit cornerLeft:false overrides (RingAmbient.jsx
  // reads them ONLY when the station has no explicit override, so a mismatch
  // there would have meant the capture was wired to the wrong variable — it
  // matched). Frozen here as a regression guard on this file, not a live
  // re-derivation.
  it('pins the captured cornerLeft per station (2026-09-03 render capture)', () => {
    const CAPTURED = [false, false, true, true, true, true, false, false, true, true, false, false, true]
    expect(SLOTS.map(s => s.cornerLeft)).toEqual(CAPTURED)
    // The two stations with an explicit override in the shipped data must
    // match that override exactly — the strongest available cross-check
    // that the capture read the right (post-override) variable.
    expect(SLOTS[6].cornerLeft).toBe(midnightGalaxyRing.stations[6].cornerLeft)
    expect(SLOTS[7].cornerLeft).toBe(midnightGalaxyRing.stations[7].cornerLeft)
  })

  it('every slot has all five placement keys plus family', () => {
    for (const slot of SLOTS) {
      expect(slot).toHaveProperty('cornerLeft')
      expect(slot).toHaveProperty('bandUpper')
      expect(slot).toHaveProperty('companionUpper')
      expect(slot).toHaveProperty('companionBoost')
      expect(slot).toHaveProperty('maxDetail')
      expect(typeof slot.family).toBe('string')
    }
  })
})
