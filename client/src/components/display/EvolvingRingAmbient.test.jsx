// @vitest-environment jsdom
// Reconciliation test for EvolvingRingAmbient: which RingAmbient instances
// mount, survive, and get replaced as the show walks. RingAmbient itself is
// mocked (EvolvingRingAmbient.onscreen/.glide tests cover the real engine);
// recolorWorld is mocked only so each instance can be traced back to its duo.
//
// History: the first version of this file (2026-09-26) guarded against the
// solo/split shape switch remounting whatever was already playing, and a
// multi-slide skip leaving a stale duo on screen. Its "settle remounts once"
// expectation was itself the next bug (the incoming world was thrown away at
// settle and a fresh one snapped in) — now every world is one keyed instance
// for as long as it's on screen or one slide away from it.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { DUO_PALETTES, DUO_GRAPH } from '../../lib/duoGraph.js'
import { outgoingAndIncomingDuo } from '../../lib/duoTransition.js'
import { drawStations } from '../../lib/ringDraw.js'
import { RING_POOL } from '../../worlds/ringPool.js'
import { midnightGalaxyRing } from '../../worlds/midnightGalaxy.ring.js'

const mounts = []
const jumpToCalls = []
let nextInstanceId = 0

vi.mock('../../lib/ringRecolor.js', () => ({
  recolorWorld: (world, palette) => ({ palette, sky: ['#000'], stations: world.stations }),
}))

vi.mock('./RingAmbient.jsx', () => ({
  default: forwardRef(function MockRingAmbient({ worldData, panePlan }, ref) {
    const [m] = useState(() => {
      const duo = Object.keys(DUO_PALETTES).find(k => DUO_PALETTES[k] === worldData.palette)
      const rec = { id: nextInstanceId++, duo, alive: true, worldData }
      mounts.push(rec)
      return rec
    })
    m.panePlan = panePlan
    useEffect(() => () => { m.alive = false }, [m])
    useImperativeHandle(ref, () => ({ jumpTo: (target) => jumpToCalls.push({ instanceId: m.id, target }) }))
    return null
  }),
}))

const { default: EvolvingRingAmbient, panePlanFor, worldForDuo } = await import('./EvolvingRingAmbient.jsx')

const onScreen = (showId, i) => [outgoingAndIncomingDuo(showId, DUO_GRAPH, i).incoming]
const alive = () => mounts.filter(m => m.alive)
const duoOfWorld = (w) => Object.keys(DUO_PALETTES).find(k => DUO_PALETTES[k] === w.palette)

describe('EvolvingRingAmbient', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    mounts.length = 0
    jumpToCalls.length = 0
    nextInstanceId = 0
  })

  it('mounts exactly one ring and never remounts it across slides, jumps, or world changes', async () => {
    const root = createRoot(document.createElement('div'))
    await act(async () => { root.render(<EvolvingRingAmbient showId="show_b" slideIndex={2} />) })
    expect(alive()).toHaveLength(1)
    expect(jumpToCalls).toEqual([{ instanceId: 0, target: 2 }])
    // 3 = first slide of a new duo (transition), 7 / 1 = multi-slide skips.
    for (const i of [3, 4, 5, 6, 7, 1, 14]) {
      await act(async () => { root.render(<EvolvingRingAmbient showId="show_b" slideIndex={i} />) })
    }
    expect(mounts).toHaveLength(1)
    expect(jumpToCalls).toHaveLength(1)
    expect(typeof mounts[0].panePlan).toBe('function')
    await act(async () => { root.unmount() })
  })

  describe('panePlanFor', () => {
    // show_b: world changes arriving at slide 3 (a -> b), then again at 6.
    const [a] = onScreen('show_b', 2)
    const [b] = onScreen('show_b', 3)
    const arr = midnightGalaxyRing
    const duo = (spec) => duoOfWorld(spec)

    it('paints every pane, with the empty gap exactly on the first slide of the new duo', () => {
      const plan = panePlanFor('show_b', arr, 3, 3)
      expect(plan).toHaveLength(13)
      expect(plan.every(Boolean)).toBe(true)
      expect(plan[3].empty).toBe(true) // slide 3 = the switch
      expect(duo(plan[2])).toBe(a)     // slide 2, still the old world
      expect(duo(plan[4])).toBe(b)     // slide 4, the new world
      expect(duo(plan[5])).toBe(b)
      expect(plan[6].empty).toBe(true) // slide 6 = the next switch
    })

    it('pokes an old-world object in from the left and a clearly different new-world object from the right', () => {
      const gap = panePlanFor('show_b', arr, 3, 3)[3]
      const [l, r] = gap.bleeds
      expect(l).toMatchObject({ side: 'left', station: 2, neighbor: 2 }) // pane 2's own object, old world
      expect(duo(l.world)).toBe(a)
      expect(r).toMatchObject({ side: 'right', neighbor: 4 }) // sits clear of pane 4's own headline
      expect(duo(r.world)).toBe(b)
      // The arriving colour is the incoming station farthest in hue from the leaving one.
      const gapOf = (x, y) => { const d = Math.abs((((x - y) % 360) + 360) % 360); return Math.min(d, 360 - d) }
      const leftHue = l.world.stations[l.station].hue
      const best = Math.max(...r.world.stations.map(st => gapOf(st.hue, leftHue)))
      expect(gapOf(r.world.stations[r.station].hue, leftHue)).toBe(best)
      for (const x of [l, r]) { expect(x.reach).toBeGreaterThanOrEqual(0.3); expect(x.reach).toBeLessThanOrEqual(0.7) }
      expect(typeof gap.key).toBe('string')
    })

    it('varies the gap layout by show and by change, not only by pane', () => {
      const seeds = new Set()
      for (const show of ['show_b', 'show_d', 'show_e']) {
        for (const slide of [3, 6, 9]) {
          const g = panePlanFor(show, arr, slide, slide)[slide % 13]
          if (g.empty) seeds.add(g.seed)
        }
      }
      expect(seeds.size).toBeGreaterThan(4)
    })

    it('follows the ring\'s own station, not slide % 13 (a grading break leaves it one behind)', () => {
      const plan = panePlanFor('show_b', arr, 3, 10)
      expect(plan[10].empty).toBe(true)
      expect(duo(plan[9])).toBe(a)
      expect(duo(plan[11])).toBe(b)
      expect(plan.every(Boolean)).toBe(true) // wraps 12 -> 0 without a hole
    })

    it('never leaves the grading-break center pane empty', () => {
      const plan = panePlanFor('show_b', arr, 3, 10, true)
      expect(plan[10].empty).toBeUndefined()
      expect(duo(plan[10])).toBe(b)
    })

    it('is a pure function of its inputs (back-nav and reload recompute the same plan)', () => {
      expect(panePlanFor('show_b', arr, 8, 8)).toEqual(panePlanFor('show_b', arr, 8, 8))
    })

    it('handles the start of the show, where earlier slides do not exist', () => {
      const plan = panePlanFor('show_b', arr, 0, 0)
      expect(plan.every(Boolean)).toBe(true)
      expect(plan.filter(p => p.empty)).toHaveLength(2) // slides 3 and 6, both within 6 ahead of slide 0
    })
  })

  it('recolors the arrangement it is given, not always the fixed authored order', async () => {
    const drawn = {
      ...midnightGalaxyRing,
      stations: drawStations(RING_POOL, { seed: 12345, slots: midnightGalaxyRing.stations.length, pinKey: 'eclipse', pinAt: 10 }),
    }
    const drawnKeys = drawn.stations.map(s => s.key)
    expect(drawnKeys).not.toEqual(midnightGalaxyRing.stations.map(s => s.key)) // really a different order
    const root = createRoot(document.createElement('div'))

    await act(async () => { root.render(<EvolvingRingAmbient showId="show_b" slideIndex={1} arrangement={drawn} />) })
    // Every mounted world (current + preloaded neighbor) must carry the
    // drawn station order, not the authored midnightGalaxyRing order.
    expect(alive().length).toBeGreaterThan(0)
    for (const m of alive()) expect(m.worldData.stations.map(s => s.key)).toEqual(drawnKeys)

    await act(async () => { root.unmount() })
  })
})
