// @vitest-environment jsdom
//
// Camera contract of RingAmbient (Halloween forest spec §2.1, Phase 3a).
// Pins what turn/jumpTo/mount-alignment/stationOverride do TODAY, on the
// unmodified space ring, so the createStationCamera extraction can be proven
// behavior-identical. Fake clock; asserts the station sequence over time.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, createRef } from 'react'
import { createRoot } from 'react-dom/client'
import RingAmbient from './RingAmbient.jsx'
import { midnightGalaxyRing } from '../../worlds/midnightGalaxy.ring.js'
import { RING_RETURN } from '../../lib/ringStationOverride.js'

vi.setConfig({ testTimeout: 30_000 }) // each real RingAmbient mount takes ~4 s (same as the sibling ring tests)
const WALK_MS = 1700 + 60 // ENGINE.SURGE_MS + 60: busy lock release
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

async function mount(props = {}) {
  const ref = createRef()
  const render = (p) => act(async () => {
    root.render(<RingAmbient ref={ref} worldData={midnightGalaxyRing} exposeDebugGlobal={false} {...p} />)
  })
  await render(props)
  return { ref, render }
}
const tick = (ms) => act(async () => { vi.advanceTimersByTime(ms) })

describe('RingAmbient camera contract', () => {
  it('idle turn() moves the station at once; busy lock holds until SURGE_MS+60', async () => {
    const { ref } = await mount()
    expect(ref.current.station).toBe(0)
    await act(async () => { ref.current.turn() })
    expect(ref.current.station).toBe(1)
    await act(async () => { ref.current.turn() }) // busy: queued, not applied
    expect(ref.current.station).toBe(1)
    await tick(WALK_MS - 1)
    expect(ref.current.station).toBe(1)
    await tick(1) // unlock drains the queued turn
    expect(ref.current.station).toBe(2)
  })

  it('three rapid advances drain in order, one per walk', async () => {
    const { ref } = await mount()
    const seen = []
    await act(async () => { ref.current.turn(); ref.current.turn(); ref.current.turn(); ref.current.turn() })
    seen.push(ref.current.station)
    for (let i = 0; i < 3; i++) { await tick(WALK_MS); seen.push(ref.current.station) }
    expect(seen).toEqual([1, 2, 3, 4])
    await tick(WALK_MS * 2)
    expect(ref.current.station).toBe(4) // nothing left in the queue
  })

  it('reversal: queued -1 after +1 lands back on the start', async () => {
    const { ref } = await mount()
    await act(async () => { ref.current.turn(1); ref.current.turn(-1) })
    expect(ref.current.station).toBe(1)
    await tick(WALK_MS)
    expect(ref.current.station).toBe(0)
  })

  it('wraps 12 -> 0 forward and 0 -> 12 backward', async () => {
    const { ref } = await mount()
    await act(async () => { ref.current.jumpTo(12) })
    await act(async () => { ref.current.turn(1) })
    expect(ref.current.station).toBe(0)
    await tick(WALK_MS)
    await act(async () => { ref.current.turn(-1) })
    expect(ref.current.station).toBe(12)
  })

  it('jumpTo() is authoritative: cancels the walk timer and the queue', async () => {
    const { ref } = await mount()
    await act(async () => { ref.current.turn(); ref.current.turn(); ref.current.turn() })
    await act(async () => { ref.current.jumpTo(7) })
    expect(ref.current.station).toBe(7)
    await tick(WALK_MS * 5)
    expect(ref.current.station).toBe(7) // stale completion + queue never fire
    await act(async () => { ref.current.turn() }) // busy was cleared: walks at once
    expect(ref.current.station).toBe(8)
    await tick(WALK_MS * 5) // that walk's unlock would drain any queue the jump failed to drop
    expect(ref.current.station).toBe(8)
  })

  it('a walk cut off by jumpTo() cannot release the lock of the NEXT walk early', async () => {
    const { ref } = await mount()
    await act(async () => { ref.current.turn() }) // walk A, unlock due at WALK_MS
    await tick(500)
    await act(async () => { ref.current.jumpTo(7) })
    await act(async () => { ref.current.turn() }) // walk B at t=500, unlock due at 500+WALK_MS
    expect(ref.current.station).toBe(8)
    await tick(WALK_MS - 500) // t=WALK_MS: A's stale timer would fire here
    await act(async () => { ref.current.turn() }) // B still running: must queue, not apply
    expect(ref.current.station).toBe(8)
    await tick(500) // B finishes, queued turn drains
    expect(ref.current.station).toBe(9)
  })

  it('the PAN follows the station: jump and a settled turn land on identical surge transforms', async () => {
    const { ref } = await mount()
    const pan = () => [...container.querySelectorAll('.ring-surge')].map(e => e.style.transform).join('|')
    const home = pan()
    await act(async () => { ref.current.jumpTo(3) })
    const at3 = pan()
    expect(at3).not.toBe(home)
    await act(async () => { ref.current.jumpTo(0) })
    expect(pan()).toBe(home)
    await act(async () => { ref.current.jumpTo(2); ref.current.turn() })
    await tick(WALK_MS)
    expect(ref.current.station).toBe(3)
    expect(pan()).toBe(at3) // glide ends exactly where a snap to 3 lands
    await act(async () => { ref.current.jumpTo(12); ref.current.turn() }) // forward wrap
    await tick(WALK_MS)
    expect(ref.current.station).toBe(0)
    expect(pan()).toBe(home) // deferred modulo reset returns to the un-wrapped offsets
  })

  it('jumpTo() normalizes out-of-range targets', async () => {
    const { ref } = await mount()
    await act(async () => { ref.current.jumpTo(15) })
    expect(ref.current.station).toBe(2)
    await act(async () => { ref.current.jumpTo(-1) })
    expect(ref.current.station).toBe(12)
  })

  it('alignment on mount: slideIndex % 13 before any timer runs', async () => {
    const { ref } = await mount({ slideIndex: 20 })
    expect(ref.current.station).toBe(7)
  })

  it('slideIndex step +1 glides, step -1 glides back, a larger move jumps', async () => {
    const { ref, render } = await mount({ slideIndex: 4 })
    expect(ref.current.station).toBe(4)
    await render({ slideIndex: 5 })
    expect(ref.current.station).toBe(5)
    await tick(WALK_MS)
    await render({ slideIndex: 4 })
    expect(ref.current.station).toBe(4)
    await tick(WALK_MS)
    await render({ slideIndex: 9 })
    expect(ref.current.station).toBe(9) // jump: instant, no queue
  })

  it('forceSnap turns a single step into an instant jump (no busy lock)', async () => {
    const { ref, render } = await mount({ slideIndex: 4 })
    await render({ slideIndex: 5, forceSnap: true })
    expect(ref.current.station).toBe(5)
    await act(async () => { ref.current.turn() }) // not busy: applies at once
    expect(ref.current.station).toBe(6)
  })

  it('stationOverride round trip: jump to the break station, RING_RETURN restores the pre-break station', async () => {
    const { ref, render } = await mount({ slideIndex: 3 })
    await render({ slideIndex: 3, stationOverride: 10 })
    expect(ref.current.station).toBe(10)
    await render({ slideIndex: 3, stationOverride: RING_RETURN })
    expect(ref.current.station).toBe(3)
  })

  it('RING_RETURN with no outbound jump holds still', async () => {
    const { ref, render } = await mount({ slideIndex: 3 })
    await render({ slideIndex: 3, stationOverride: RING_RETURN })
    expect(ref.current.station).toBe(3)
  })
})
