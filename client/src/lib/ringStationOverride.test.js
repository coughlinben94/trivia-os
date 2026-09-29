// Hand-derived from the pre-change Display.jsx expression (origin/main 08f249c):
//   stationOverride: breakActive ? MUSIC_STATION : (warp === 'back' ? RING_RETURN : null)
// with MUSIC_STATION = 10 on every theme. Every case below must keep that value
// for the space world and for non-ring themes.
import { describe, it, expect } from 'vitest'
import { ringStationOverride, RING_RETURN } from './ringStationOverride.js'
import { RING_WORLDS } from './ringWorldFor.js'
import { RING_RETURN as RING_RETURN_FROM_COMPONENT_MODULE } from '../components/display/RingAmbient.jsx'

const space = RING_WORLDS['midnight-galaxy']
const haunted = RING_WORLDS['haunted-october']
const nonRing = RING_WORLDS['pure-michigan'] // undefined: what Display sees for a non-ring theme

describe('ringStationOverride', () => {
  it('sentinel value unchanged and shared with RingAmbient', () => {
    expect(RING_RETURN).toBe('return')
    expect(RING_RETURN_FROM_COMPONENT_MODULE).toBe(RING_RETURN)
  })

  it.each([
    // [label, breakActive, warp, world, expected]
    ['space, break active', true, null, space, 10],
    ['space, break active while warping in', true, 'in', space, 10],
    ['space, break active beats warp back', true, 'back', space, 10],
    ['space, warp back', false, 'back', space, RING_RETURN],
    ['space, neither', false, null, space, null],
    ['space, other warp dir', false, 'in', space, null],
    ['non-ring, break active', true, null, nonRing, 10],
    ['non-ring, warp back', false, 'back', nonRing, RING_RETURN],
    ['non-ring, neither', false, null, nonRing, null],
    ['haunted, break active', true, null, haunted, haunted.musicStation],
    ['haunted, warp back', false, 'back', haunted, RING_RETURN],
    ['haunted, neither', false, null, haunted, null],
  ])('%s', (_label, breakActive, warp, world, expected) => {
    expect(ringStationOverride({ breakActive, warp, world })).toBe(expected)
  })

  it('space music station is the eclipse, haunted is the harvest moon', () => {
    expect(space.stations[ringStationOverride({ breakActive: true, world: space })].key).toBe('eclipse')
    expect(haunted.stations[ringStationOverride({ breakActive: true, world: haunted })].key).toBe('harvest moon')
  })

  it('honours a world musicStation other than 10', () => {
    expect(ringStationOverride({ breakActive: true, world: { musicStation: 4 } })).toBe(4)
  })
})
