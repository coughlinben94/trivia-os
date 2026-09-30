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
import { outgoingAndIncomingDuo, isTransitionSlide } from '../../lib/duoTransition.js'
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
  default: forwardRef(function MockRingAmbient({ worldData }, ref) {
    const [m] = useState(() => {
      const duo = Object.keys(DUO_PALETTES).find(k => DUO_PALETTES[k] === worldData.palette)
      const rec = { id: nextInstanceId++, duo, alive: true, worldData }
      mounts.push(rec)
      return rec
    })
    useEffect(() => () => { m.alive = false }, [m])
    useImperativeHandle(ref, () => ({ jumpTo: (target) => jumpToCalls.push({ instanceId: m.id, target }) }))
    return null
  }),
}))

const { default: EvolvingRingAmbient } = await import('./EvolvingRingAmbient.jsx')

const onScreen = (showId, i) => {
  const { outgoing, incoming } = outgoingAndIncomingDuo(showId, DUO_GRAPH, i)
  return isTransitionSlide(showId, i) ? [outgoing, incoming] : [incoming]
}
const alive = () => mounts.filter(m => m.alive)

describe('EvolvingRingAmbient', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    mounts.length = 0
    jumpToCalls.length = 0
    nextInstanceId = 0
  })

  it('never remounts a world while it stays on screen or one slide away — including at settle', async () => {
    // show_b: transition at 3 (neon_garden -> electric_bloom, pinned in
    // duoTransition.test.js), settles at 4, next transition at 6.
    const root = createRoot(document.createElement('div'))
    const [a, b] = onScreen('show_b', 3)

    await act(async () => { root.render(<EvolvingRingAmbient showId="show_b" slideIndex={2} />) })
    // Solo on a, with b pre-mounted (hidden) for the transition next slide.
    expect(alive().map(m => m.duo).sort()).toEqual([a, b].sort())
    const before = alive().map(m => m.id)

    await act(async () => { root.render(<EvolvingRingAmbient showId="show_b" slideIndex={3} />) })
    expect(alive().map(m => m.id)).toEqual(before) // transition: nothing new, nothing lost

    await act(async () => { root.render(<EvolvingRingAmbient showId="show_b" slideIndex={4} />) })
    // Settle: b is the SAME instance it was as the incoming half; a stays
    // mounted (Prev lands back on the transition); only the world for the
    // NEXT transition (slide 6) is preloaded on the following step.
    const bInst = mounts.find(m => m.duo === b)
    expect(bInst.alive).toBe(true)
    expect(mounts.filter(m => m.duo === b)).toHaveLength(1)
    expect(mounts.filter(m => m.duo === a)).toHaveLength(1)
    await act(async () => { root.render(<EvolvingRingAmbient showId="show_b" slideIndex={5} />) })
    const [, c] = onScreen('show_b', 6)
    expect(alive().map(m => m.duo).sort()).toEqual([b, c].sort())

    await act(async () => { root.unmount() })
  })

  it('calls jumpTo on every freshly mounted instance, but never on a surviving one', async () => {
    const root = createRoot(document.createElement('div'))

    await act(async () => { root.render(<EvolvingRingAmbient showId="show_b" slideIndex={2} />) })
    expect(jumpToCalls).toEqual([{ instanceId: 0, target: 2 }, { instanceId: 1, target: 2 }])

    await act(async () => { root.render(<EvolvingRingAmbient showId="show_b" slideIndex={3} />) })
    expect(jumpToCalls).toHaveLength(2) // both survived, no new mounts

    await act(async () => { root.render(<EvolvingRingAmbient showId="show_b" slideIndex={4} />) })
    expect(jumpToCalls).toHaveLength(2) // next world is one slide away
    await act(async () => { root.render(<EvolvingRingAmbient showId="show_b" slideIndex={5} />) })
    expect(jumpToCalls.slice(2)).toEqual([{ instanceId: 2, target: 5 }]) // only the new preload

    await act(async () => { root.unmount() })
  })

  it('replaces stale worlds on a multi-slide skip with no transition frame rendered', async () => {
    // RingAmbient ignores a changed worldData prop after mount, so a world
    // must be keyed by its duo — a skip to a new duo has to mount it, not
    // silently keep the old one.
    const root = createRoot(document.createElement('div'))

    await act(async () => { root.render(<EvolvingRingAmbient showId="show_b" slideIndex={1} />) })
    await act(async () => { root.render(<EvolvingRingAmbient showId="show_b" slideIndex={7} />) })
    const want = [...new Set([6, 7, 8].flatMap(i => onScreen('show_b', i)))].sort()
    expect(alive().map(m => m.duo).sort()).toEqual(want)
    expect(onScreen('show_b', 7).every(d => !onScreen('show_b', 1).includes(d))).toBe(true) // really a new duo

    await act(async () => { root.unmount() })
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

  it('applies a stable SVG wipe only on a transition slide and reveals immediately for reduced motion', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} })
    const root = createRoot(container)

    await act(async () => { root.render(<EvolvingRingAmbient showId="show_b" slideIndex={2} />) })
    expect([...container.querySelectorAll('div')].some(el => el.style.maskImage)).toBe(false)

    await act(async () => { root.render(<EvolvingRingAmbient showId="show_b" slideIndex={3} />) })
    const maskedLayer = [...container.querySelectorAll('div')].find(el => el.style.maskImage)
    expect(maskedLayer).toBeTruthy()
    expect(maskedLayer.style.maskImage).toMatch(/duo-wipe-/)
    const maskPath = maskedLayer.querySelector('mask path')
    expect(maskPath.getAttribute('d')).toBe('M -300 -300 H 1300 V 1300 H -300 Z')

    await act(async () => { root.unmount() })
    document.body.removeChild(container)
  })
})
