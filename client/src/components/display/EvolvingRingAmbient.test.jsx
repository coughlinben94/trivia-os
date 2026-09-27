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

const mounts = []
const jumpToCalls = []
let nextInstanceId = 0

vi.mock('../../lib/ringRecolor.js', () => ({
  recolorWorld: (_world, palette) => ({ palette, sky: ['#000'] }),
}))

vi.mock('./RingAmbient.jsx', () => ({
  default: forwardRef(function MockRingAmbient({ worldData }, ref) {
    const [m] = useState(() => {
      const duo = Object.keys(DUO_PALETTES).find(k => DUO_PALETTES[k] === worldData.palette)
      const rec = { id: nextInstanceId++, duo, alive: true }
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
    mounts.length = 0
    jumpToCalls.length = 0
    nextInstanceId = 0
  })

  it('never remounts a world while it stays on screen or one slide away — including at settle', async () => {
    // show_b: transition at 2 (neon_garden -> electric_bloom, pinned in
    // duoTransition.test.js), settles at 3, next transition at 4.
    const root = createRoot(document.createElement('div'))
    const [a, b] = onScreen('show_b', 2)

    await act(async () => { root.render(<EvolvingRingAmbient showId="show_b" slideIndex={1} />) })
    // Solo on a, with b pre-mounted (hidden) for the transition next slide.
    expect(alive().map(m => m.duo).sort()).toEqual([a, b].sort())
    const before = alive().map(m => m.id)

    await act(async () => { root.render(<EvolvingRingAmbient showId="show_b" slideIndex={2} />) })
    expect(alive().map(m => m.id)).toEqual(before) // transition: nothing new, nothing lost

    await act(async () => { root.render(<EvolvingRingAmbient showId="show_b" slideIndex={3} />) })
    // Settle: b is the SAME instance it was as the incoming half; a stays
    // mounted (Prev lands back on the transition); only the world for the
    // NEXT transition (slide 4) is new.
    const bInst = mounts.find(m => m.duo === b)
    expect(bInst.alive).toBe(true)
    expect(mounts.filter(m => m.duo === b)).toHaveLength(1)
    expect(mounts.filter(m => m.duo === a)).toHaveLength(1)
    const [, c] = onScreen('show_b', 4)
    expect(alive().map(m => m.duo).sort()).toEqual([a, b, c].sort())

    await act(async () => { root.unmount() })
  })

  it('calls jumpTo on every freshly mounted instance, but never on a surviving one', async () => {
    const root = createRoot(document.createElement('div'))

    await act(async () => { root.render(<EvolvingRingAmbient showId="show_b" slideIndex={1} />) })
    expect(jumpToCalls).toEqual([{ instanceId: 0, target: 1 }, { instanceId: 1, target: 1 }])

    await act(async () => { root.render(<EvolvingRingAmbient showId="show_b" slideIndex={2} />) })
    expect(jumpToCalls).toHaveLength(2) // both survived, no new mounts

    await act(async () => { root.render(<EvolvingRingAmbient showId="show_b" slideIndex={3} />) })
    expect(jumpToCalls.slice(2)).toEqual([{ instanceId: 2, target: 3 }]) // only the new preload

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
})
