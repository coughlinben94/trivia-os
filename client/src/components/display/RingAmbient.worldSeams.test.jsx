// @vitest-environment jsdom
//
// Real-render checks (unmocked RingAmbient) for the per-world seams of Halloween
// spec §4 items 4, 5 and 10: ambient-layer flags, the world's sky-region set,
// and per-world primitive dispatch. Space defaults are asserted alongside so a
// seam that silently switched the space world off would fail here too.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import RingAmbient from './RingAmbient.jsx'
import { midnightGalaxyRing } from '../../worlds/midnightGalaxy.ring.js'
import { hauntedOctoberRing } from '../../worlds/hauntedOctober.ring.js'
import { SKY_REGIONS } from '../../lib/ringPrimitives.js'

let container, root
beforeEach(() => {
  vi.useFakeTimers()
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  global.ResizeObserver = class { observe() {} disconnect() {} }
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => { root.unmount() })
  document.body.removeChild(container)
  vi.useRealTimers()
})

const count = (sel) => container.querySelectorAll(sel).length
async function mount(world) {
  await act(async () => { root.render(<RingAmbient worldData={world} exposeDebugGlobal={false} />) })
}

describe('RingAmbient per-world seams', () => {
  it('space world: stars, drifter, shooting-star lane and its three sky regions all present', async () => {
    await mount(midnightGalaxyRing)
    expect(count('.ring-star')).toBeGreaterThan(0)
    expect(count('.ring-drift')).toBeGreaterThan(0)
    expect(count('.ring-shootLane')).toBe(1)
    expect(count('.ring-sky-tint')).toBe(Object.keys(SKY_REGIONS).length)
  }, 30_000)

  it('haunted world: layer flags switch stars/drifter/shooting stars off; sky uses its own region set', async () => {
    await mount(hauntedOctoberRing)
    expect(count('.ring-star')).toBe(0)
    expect(count('.ring-drift')).toBe(0)
    expect(count('.ring-driftRun')).toBe(0)
    expect(count('.ring-shootLane')).toBe(0)
    expect(count('.ring-sky-tint')).toBe(Object.keys(hauntedOctoberRing.skyRegions).length)
    // Its region source station draws a source glow from the world's set.
    expect(count('.ring-sky-src')).toBeGreaterThan(0)
    // No shooting star ever spawns, even after the scheduler's longest wait.
    await act(async () => { vi.advanceTimersByTime(120_000) })
    expect(count('.ring-shoot')).toBe(0)
  }, 30_000)

  it('a world-supplied kind renders through the real render path; shared kinds still fall back', async () => {
    const stubMark = vi.fn((dom, w, h) => {
      const e = dom.el('stub-mark')
      e.style.position = 'absolute'; e.style.width = w + 'px'; e.style.height = h + 'px'
      return e
    })
    const world = {
      ...hauntedOctoberRing,
      prims: { stubMark },
      stations: hauntedOctoberRing.stations.map((s, i) => i === 0 ? { ...s, prim: 'stubMark' } : s),
    }
    await mount(world)
    // Headline call for station 0 (the station in view at mount): isHeadline true.
    expect(stubMark).toHaveBeenCalledTimes(1)
    expect(stubMark.mock.calls[0][0].makePrim).toBeTypeOf('function') // got the shared dom helpers
    expect(stubMark.mock.calls[0][6]).toBe(true)
    // Mid layer is authored once and repeated m+1 = 2 times.
    expect(count('.ring-stub-mark')).toBe(2)
    // A shared kind elsewhere in the same world still rendered (station 1 is a `planet`).
    expect(count('.ring-d-glow')).toBeGreaterThan(0)
  }, 30_000)
})
