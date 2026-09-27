// @vitest-environment jsdom
//
// Regression test for the real bug two independent reviews found in
// EvolvingRingAmbient (2026-09-26, see the "Revert ... route midnight-galaxy
// to the evolving color walk" commit for the full history): a freshly
// mounted RingAmbient instance reported the CORRECT station through its own
// internal counter (window.__world.station, and the debug label) while the
// ring's actual on-screen position stayed frozen at station 0. Every
// existing test — including EvolvingRingAmbient.test.jsx's own reconciliation
// suite — mocks RingAmbient's real DOM-building engine away entirely, so none
// of them could ever see this: they can only prove "jumpTo was called," never
// "the pixels moved." This file uses the REAL, unmocked RingAmbient
// specifically to close that gap.
//
// Reproduces the exact real-world shape (a wrapper that calls the exposed
// jumpTo() in a useLayoutEffect on mount — EvolvingRingAmbient.jsx's own
// SyncedRingAmbient does precisely this) directly, rather than driving the
// full EvolvingRingAmbient tree through several real turn() glides — that
// path needs fake timers to drain turn()'s busy/unlock() queue, which fights
// the component's own shooting-star scheduler badly enough to hang the test
// runner. Isolating the actual mechanism under test (mount-time jumpTo vs.
// the build effect's offset seeding) verifies the same fix without that.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act, useLayoutEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import RingAmbient from './RingAmbient.jsx'
import { midnightGalaxyRing } from '../../worlds/midnightGalaxy.ring.js'

// ENGINE.LAYERS far.surge and PANES (RingAmbient.jsx) — duplicated as a
// plain literal rather than imported, so this test also catches ENGINE
// itself changing shape unexpectedly (an import would just silently track
// the change instead).
const FAR_SURGE = 480
const PANES = 13

// DOM order inside a mounted RingAmbient's #design: the sky's own inner
// scroller (appended first, its transform is never touched by writeOffsets —
// the build effect skips `L.id === 'sky'`), then far, mid, near, in
// ENGINE.LAYERS' declared order. Reading index 1 (far) is enough to prove
// the fix — the same seed formula applies to every non-sky layer.
function onScreenStation(stageEl) {
  const surges = stageEl.querySelectorAll('.ring-surge')
  const far = surges[1]
  if (!far) return null
  const m = far.style.transform.match(/translate3d\((-?[\d.]+)px/)
  if (!m) return null
  const offset = -Number(m[1])
  return (Math.round(offset / FAR_SURGE) % PANES) || 0 // normalize -0 to 0
}

// The exact real-world shape: EvolvingRingAmbient.jsx's own SyncedRingAmbient
// calls the exposed jumpTo(target) in a useLayoutEffect on mount, before
// RingAmbient's own build effect (a plain useEffect, runs after layout
// effects) has run.
function JumpsOnMount({ target }) {
  const ref = useRef(null)
  useLayoutEffect(() => { ref.current?.jumpTo(target) }, [])
  return <RingAmbient ref={ref} worldData={midnightGalaxyRing} slideIndex={target} exposeDebugGlobal={false} />
}

describe('RingAmbient — a mount-time jumpTo() must land on screen, not just in the internal counter', () => {
  let container, root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    global.ResizeObserver = class { observe() {} disconnect() {} }
    if (!window.matchMedia) {
      window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
    }
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => { root.unmount() })
    document.body.removeChild(container)
  })

  it.each([0, 1, 5, 10, 12])('a fresh mount jumped to station %i shows station %i on screen', async (target) => {
    await act(async () => { root.render(<JumpsOnMount target={target} />) })
    const stage = container.querySelector('.ring-stage')
    expect(stage).toBeTruthy()
    expect(onScreenStation(stage)).toBe(target)
  })

  it('an ordinary mount (no pre-build jumpTo) still starts at station 0, unchanged', async () => {
    await act(async () => {
      root.render(<RingAmbient worldData={midnightGalaxyRing} slideIndex={0} exposeDebugGlobal={false} />)
    })
    const stage = container.querySelector('.ring-stage')
    expect(onScreenStation(stage)).toBe(0)
  })
})
