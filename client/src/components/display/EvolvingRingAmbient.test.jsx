// @vitest-environment jsdom
// Regression test for the real bug an adversarial Codex review caught
// 2026-09-26 in the first version of this file: switching between the solo
// and split render shapes unmounted the world that was ALREADY correctly
// playing, and a host multi-slide skip could leave a stale duo on screen
// forever (RingAmbient silently ignores a changed worldData prop after
// mount). This test mocks RingAmbient itself (its real DOM-building engine
// has no unit coverage anywhere in this repo, by design — see the wiring
// plan) and asserts only on EvolvingRingAmbient's OWN reconciliation: which
// mounts survive across a real transition, and which get replaced.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, forwardRef, useImperativeHandle, useState } from 'react'
import { createRoot } from 'react-dom/client'

const mounts = []
const jumpToCalls = []
let nextInstanceId = 0

vi.mock('./RingAmbient.jsx', () => ({
  default: forwardRef(function MockRingAmbient({ worldData }, ref) {
    const [instanceId] = useState(() => {
      const id = nextInstanceId++
      mounts.push({ id, worldData })
      return id
    })
    useImperativeHandle(ref, () => ({ jumpTo: (target) => jumpToCalls.push({ instanceId, target }) }))
    return null
  }),
}))

const { default: EvolvingRingAmbient } = await import('./EvolvingRingAmbient.jsx')

describe('EvolvingRingAmbient', () => {
  beforeEach(() => {
    mounts.length = 0
    jumpToCalls.length = 0
    nextInstanceId = 0
  })

  it('keeps the current world mounted across a transition, and only remounts once it actually settles on a new duo', async () => {
    // Seed/index pinned in duoTransition.test.js: at 'show_b' index 2,
    // outgoing='neon_garden', incoming='electric_bloom'; the boundary gap is
    // always >=2, so index 3 is still the same step (still electric_bloom).
    const container = document.createElement('div')
    const root = createRoot(container)

    await act(async () => { root.render(<EvolvingRingAmbient showId="show_b" slideIndex={1} />) })
    expect(mounts.length).toBe(1) // solo: one RingAmbient

    await act(async () => { root.render(<EvolvingRingAmbient showId="show_b" slideIndex={2} />) })
    // Transitioning: the persistent "current" slot must NOT have remounted
    // (still mount id 0), and exactly one NEW instance appears for incoming.
    expect(mounts.length).toBe(2)
    expect(mounts[0].id).toBe(0) // unchanged — proves no remount happened

    await act(async () => { root.render(<EvolvingRingAmbient showId="show_b" slideIndex={3} />) })
    // Settled: the transition's incoming slot is gone, and the surviving
    // "current" slot has now remounted exactly once (real new duo, real new
    // colors — unavoidable) rather than continuing to reuse instance 0.
    expect(mounts.length).toBe(3)
    expect(mounts[2].id).toBe(2)

    await act(async () => { root.unmount() })
  })

  it('calls jumpTo on every freshly mounted instance, but never on the surviving one', async () => {
    const container = document.createElement('div')
    const root = createRoot(container)

    await act(async () => { root.render(<EvolvingRingAmbient showId="show_b" slideIndex={1} />) })
    expect(jumpToCalls).toEqual([{ instanceId: 0, target: 1 }])

    await act(async () => { root.render(<EvolvingRingAmbient showId="show_b" slideIndex={2} />) })
    // Instance 0 (surviving) gets no second jumpTo call; only the new
    // incoming instance (id 1) does.
    expect(jumpToCalls).toEqual([{ instanceId: 0, target: 1 }, { instanceId: 1, target: 2 }])

    await act(async () => { root.unmount() })
  })

  it('remounts (not silently ignores) a duo change on a multi-slide skip with no transition frame rendered', async () => {
    // If a host jump lands two steps ahead without ever rendering the
    // in-between transition frame, the real bug let the stale duo's DOM
    // survive forever (RingAmbient ignores a changed worldData prop). This
    // asserts the fix: the key changes with the duo, so it remounts.
    const container = document.createElement('div')
    const root = createRoot(container)

    await act(async () => { root.render(<EvolvingRingAmbient showId="show_b" slideIndex={1} />) })
    expect(mounts.length).toBe(1)

    await act(async () => { root.render(<EvolvingRingAmbient showId="show_b" slideIndex={7} />) })
    expect(mounts.length).toBe(2) // remounted with the real duo at index 7, not stuck on index 1's

    await act(async () => { root.unmount() })
  })
})
