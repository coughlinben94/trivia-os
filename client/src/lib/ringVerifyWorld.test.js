// Known-answer probes for the per-world gates ring-verify.mjs reads from
// concepts/tools/ring-verify-world.mjs (Halloween spec §4.7): each changed
// gate gets a good fixture that must pass and a bad one that must fail.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  worldGate, liveUrl, worldIdentityProblems, starBandStatus, forceProbeBad, sharedPrimKinds, missingPrims, DEFAULT_WORLD_ID,
} from '../../../concepts/tools/ring-verify-world.mjs'
import { RING_WORLDS } from './ringWorldFor.js'

const space = RING_WORLDS['midnight-galaxy']
const haunted = RING_WORLDS['haunted-october']
const shared = sharedPrimKinds(readFileSync(new URL('./ringPrimitives.js', import.meta.url), 'utf8'))

describe('worldGate / liveUrl', () => {
  it('default world is space and keeps the old live URL byte-for-byte', () => {
    expect(DEFAULT_WORLD_ID).toBe('midnight-galaxy')
    expect(liveUrl('http://localhost:5173')).toBe('http://localhost:5173/ambient?ring=1')
    expect(liveUrl('http://x', 'haunted-october')).toBe('http://x/ambient?ring=1&world=haunted-october')
  })
  it('reads star layer + keys off the world', () => {
    expect(worldGate().stars).toBe(true)
    expect(worldGate('haunted-october').stars).toBe(false)
    expect(worldGate('haunted-october').keys).toEqual(haunted.stations.map(s => s.key))
    expect(() => worldGate('nope')).toThrow(/unknown world/)
  })
})

describe('star band (check 10)', () => {
  const spaceGate = worldGate('midnight-galaxy')
  const hauntedGate = worldGate('haunted-october')
  it('space: in-band passes, zero stars FAILS (the skip never reaches space)', () => {
    expect(starBandStatus(200, spaceGate)).toBe('PASS')
    expect(starBandStatus(0, spaceGate)).toBe('FAIL')
    expect(starBandStatus(130, spaceGate)).toBe('WARN')
  })
  it('haunted: skipped whatever the count', () => {
    expect(starBandStatus(0, hauntedGate)).toBeNull()
    expect(starBandStatus(200, hauntedGate)).toBeNull()
  })
  it('the default (no gate given) is the space band', () => {
    expect(starBandStatus(0, { stars: true })).toBe('FAIL')
  })
})

describe('world identity (both passes)', () => {
  it('good: the registered world passes its own gate', () => {
    expect(worldIdentityProblems(space, worldGate('midnight-galaxy'))).toEqual([])
    expect(worldIdentityProblems(haunted, worldGate('haunted-october'))).toEqual([])
  })
  it('bad: wrong world, or right world with reordered stations, fails', () => {
    expect(worldIdentityProblems(space, worldGate('haunted-october'))).not.toEqual([])
    const swapped = { ...space, stations: [space.stations[1], space.stations[0], ...space.stations.slice(2)] }
    expect(worldIdentityProblems(swapped, worldGate('midnight-galaxy'))).toHaveLength(1)
    expect(worldIdentityProblems(undefined, worldGate('midnight-galaxy'))).toHaveLength(2)
  })
})

// Per-world dispatch fixtures are built from the space world: the forest
// world (renderer 'forest') has no ring prims for this scan to read.
describe('static primitive parity (per-world dispatch)', () => {
  const ring = { ...space, id: 'fixture' }
  it('the shared-kind scan finds every space prim', () => {
    expect(shared.has('eclipse')).toBe(true)
    expect(missingPrims(space, shared)).toEqual([])
  })
  it('bad: a kind with no branch and no world dispatch fails', () => {
    const bad = { ...ring, prims: {}, stations: [{ key: 'x', prim: 'stubKind' }, ...ring.stations.slice(1)] }
    expect(missingPrims(bad, shared)).toEqual(['fixture:st0(stubKind)'])
  })
  it('good: the same kind passes once the world dispatches it', () => {
    const good = { ...ring, prims: { stubKind: () => null }, stations: [{ key: 'x', prim: 'stubKind' }, ...ring.stations.slice(1)] }
    expect(missingPrims(good, shared)).toEqual([])
  })
  it('a prototype key is not a dispatch', () => {
    const bad = { ...ring, prims: {}, stations: [{ key: 'x', prim: 'constructor' }] }
    expect(missingPrims(bad, shared)).toEqual(['fixture:st0(constructor)'])
  })
})

describe('peak-forcing self-check (per station)', () => {
  const spaceGate = worldGate('midnight-galaxy')
  const hauntedGate = worldGate('haunted-october')
  const ok = { starTotal: 200, starForced: 200, pfTotal: 26, pfForced: 26 }
  it('good: everything forced passes on both worlds', () => {
    expect(forceProbeBad(ok, spaceGate)).toBe(false)
    expect(forceProbeBad({ ...ok, starTotal: 0, starForced: 0 }, hauntedGate)).toBe(false)
  })
  it('bad: zero stars still fails on space (the exemption never reaches it)', () => {
    expect(forceProbeBad({ ...ok, starTotal: 0, starForced: 0 }, spaceGate)).toBe(true)
  })
  it('bad: partial forcing or zero pf targets fails on either world', () => {
    expect(forceProbeBad({ ...ok, starForced: 199 }, spaceGate)).toBe(true)
    expect(forceProbeBad({ ...ok, starTotal: 3, starForced: 2 }, hauntedGate)).toBe(true)
    expect(forceProbeBad({ ...ok, pfTotal: 0, pfForced: 0 }, hauntedGate)).toBe(true)
    expect(forceProbeBad({ ...ok, pfForced: 25 }, spaceGate)).toBe(true)
  })
})
