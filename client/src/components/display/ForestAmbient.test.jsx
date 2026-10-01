// @vitest-environment jsdom
//
// ForestAmbient camera + scene contract (Halloween forest spec §2.1/§2.2, Phase 3b-2).
// Same harness as RingAmbient.camera.test.jsx. queuePolicy 'retarget': a turn during a walk cuts.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, createRef, useLayoutEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import ForestAmbient from './ForestAmbient.jsx'
import { RING_RETURN } from '../../lib/ringStationOverride.js'

vi.setConfig({ testTimeout: 30_000 })
const DUR = 4000
const WALK_MS = DUR + 40
const CUT_MS = 450
const WORLD = { walk: { durMs: DUR, stepM: 6 } }
let container, root, reduced
beforeEach(() => {
  vi.useFakeTimers()
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  global.ResizeObserver = class { observe() {} disconnect() {} }
  reduced = false
  window.matchMedia = (q) => ({ matches: reduced && /prefers-reduced-motion/.test(q), addEventListener() {}, removeEventListener() {} })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => { root.unmount() })
  container.remove()
  vi.useRealTimers()
})

async function mount(props = {}, probe = null) {
  const ref = createRef()
  const render = (p) => act(async () => {
    root.render(<>
      <ForestAmbient ref={ref} worldData={WORLD} exposeDebugGlobal={false} {...p} />
      {probe}
    </>)
  })
  await render(props)
  return { ref, render }
}
const tick = (ms) => act(async () => { vi.advanceTimersByTime(ms) })
const stageAttr = () => container.querySelector('.forest-stage').dataset.forestStation
const scene = () => container.querySelector('.fs-stage').dataset.scene
const kf = () => document.head.querySelector('style[data-forest-walk]').textContent
const cams = () => container.querySelectorAll('.fs-cam').length
const clones = () => container.querySelectorAll('.rmx').length

describe('ForestAmbient', () => {
  it('mount alignment: slideIndex 20 -> station 7 before paint (seen from a later layout effect)', async () => {
    const seen = {}
    function Probe() {
      useLayoutEffect(() => {
        seen.attr = container.querySelector('.forest-stage')?.dataset.forestStation
        seen.scene = container.querySelector('.fs-stage')?.dataset.scene
      }, [])
      return null
    }
    const { ref } = await mount({ slideIndex: 20 }, <Probe />)
    expect(seen).toEqual({ attr: '7', scene: 'rest:7' })
    expect(ref.current.station).toBe(7)
    expect(stageAttr()).toBe('7')
  })

  it('turn() starts a walk; station updates at once; rest after the walk', async () => {
    const { ref } = await mount()
    expect(scene()).toBe('rest:0')
    await act(async () => { ref.current.turn() })
    expect(ref.current.station).toBe(1)
    expect(stageAttr()).toBe('1')
    expect(scene()).toBe('walk:0>1')
    expect(kf()).toContain('@keyframes')
    expect(container.querySelector('.fs-cam').className).toMatch(/bob[AB]/)
    await tick(WALK_MS)
    expect(scene()).toBe('rest:1')
    expect(container.querySelector('.fs-cam').className).toBe('fs-cam')
    expect(kf()).toBe('')
  })

  it('three rapid turns each retarget with a covered cut; one rest scene remains', async () => {
    const { ref } = await mount({ slideIndex: 2 })
    await act(async () => { ref.current.turn() })
    expect(scene()).toBe('walk:2>3')
    await tick(1000)
    await act(async () => { ref.current.turn() })
    expect(ref.current.station).toBe(4)
    expect(scene()).toBe('cut:4')
    expect(clones()).toBe(1)
    await tick(100)
    await act(async () => { ref.current.turn() })
    expect(ref.current.station).toBe(5)
    expect(stageAttr()).toBe('5')
    expect(scene()).toBe('cut:5')
    // gate 7: the superseded cut's clone is NOT dropped (that popped the picture in one frame): it stays,
    // frozen, on top; the new snapshot (the in-between rest frame) is slipped beneath it
    expect(clones()).toBe(2)
    const rigKids = [...container.querySelector('.fs-rig').children].filter(e => e.hasAttribute('data-forest-clone'))
    expect(rigKids).toHaveLength(2)
    expect(rigKids[0].compareDocumentPosition(rigKids[1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy() // new first (below), old after (above)
    expect(kf()).toBe('') // no walk restarted
    await tick(300) // the superseded cut's own timer (started 200 ms before) would have fired by now
    expect(scene()).toBe('cut:5') // ...and must not have: no early rest, no early clone removal
    expect(clones()).toBe(2)
    await tick(WALK_MS * 2)
    expect(ref.current.station).toBe(5)
    expect(scene()).toBe('rest:5')
    expect(cams()).toBe(1)
    expect(clones()).toBe(0)
  })

  it('reversal: turn(-1) during a walk cuts back to the start', async () => {
    const { ref } = await mount({ slideIndex: 6 })
    await act(async () => { ref.current.turn(1) })
    await act(async () => { ref.current.turn(-1) })
    expect(ref.current.station).toBe(6)
    expect(scene()).toBe('cut:6')
    await tick(WALK_MS * 2)
    expect(scene()).toBe('rest:6')
    expect(stageAttr()).toBe('6')
  })

  it('idle turn(-1) never walks forward: it is a covered cut to the station behind', async () => {
    const { ref } = await mount({ slideIndex: 6 })
    await act(async () => { ref.current.turn(-1) })
    expect(ref.current.station).toBe(5)
    expect(scene()).toBe('cut:5')
    await tick(CUT_MS)
    expect(scene()).toBe('rest:5')
  })

  it('jumpTo during a walk cancels it; the stale completion never changes the station', async () => {
    const { ref } = await mount()
    await act(async () => { ref.current.turn() })
    await tick(500)
    await act(async () => { ref.current.jumpTo(9) })
    expect(ref.current.station).toBe(9)
    expect(scene()).toBe('rest:9')
    await tick(DUR * 2)
    expect(ref.current.station).toBe(9)
    expect(stageAttr()).toBe('9')
    expect(scene()).toBe('rest:9')
    await act(async () => { ref.current.turn() }) // busy was cleared: walks at once
    expect(scene()).toBe('walk:9>10')
  })

  it('a cancelled walk freezes the frame, and the next rest render clears every frozen inline style', async () => {
    const orig = window.getComputedStyle.bind(window)
    const spy = vi.spyOn(window, 'getComputedStyle').mockImplementation((el, ...r) =>
      (el?.classList?.contains('fs-stage') || el?.closest?.('.fs-stage'))
        ? { transform: 'matrix(1, 0, 0, 1, 0, 7)', opacity: '0.5' } : orig(el, ...r))
    try {
      const { ref } = await mount()
      await act(async () => { ref.current.turn() })
      await tick(500)
      await act(async () => { ref.current.turn() }) // cancel -> freeze -> cut
      const cam = container.querySelector('.fs-cam')
      expect(container.querySelector('[data-forest-clone]').style.transform).toContain('matrix') // the clone holds the frozen mid-walk frame
      await tick(CUT_MS * 2)
      expect(scene()).toBe('rest:2')
      expect(cam.style.transform).toBe('') // reset by the rest render, not left frozen for good
      expect(cam.style.opacity).toBe('')
      expect([...cam.querySelectorAll('div'), cam].filter(e => e.style.transform.includes('matrix') || e.style.animation === 'none' || e.style.opacity === '0.5')).toHaveLength(0) // creeps, world, ground: all thawed
    } finally { spy.mockRestore() }
  })

  it('unmount after the creep/idle timers are armed leaves no timers', async () => {
    const { render } = await mount()
    await tick(31) // creep restart fires and arms the 40 s idle-sway timer
    expect(vi.getTimerCount()).toBeGreaterThan(0)
    await act(async () => { root.render(null) })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('stationOverride round trip 3 -> 10 -> RING_RETURN -> 3', async () => {
    const { ref, render } = await mount({ slideIndex: 3 })
    await render({ slideIndex: 3, stationOverride: 10 })
    expect(ref.current.station).toBe(10)
    expect(stageAttr()).toBe('10')
    await render({ slideIndex: 3, stationOverride: RING_RETURN })
    expect(ref.current.station).toBe(3)
    expect(scene()).toBe('rest:3')
  })

  it('RING_RETURN with no outbound jump holds still', async () => {
    const { ref, render } = await mount({ slideIndex: 3 })
    await render({ slideIndex: 3, stationOverride: RING_RETURN })
    expect(ref.current.station).toBe(3)
  })

  it('slideIndex +1 walks; forceSnap makes the same step an instant jump', async () => {
    const { ref, render } = await mount({ slideIndex: 4 })
    await render({ slideIndex: 5 })
    expect(scene()).toBe('walk:4>5')
    await tick(WALK_MS)
    await render({ slideIndex: 6, forceSnap: true })
    expect(ref.current.station).toBe(6)
    expect(scene()).toBe('rest:6')
    await act(async () => { ref.current.turn() }) // not busy: walks at once
    expect(scene()).toBe('walk:6>7')
  })

  it('unmount mid-walk leaves no timers, styles, clones or stage', async () => {
    const { ref } = await mount()
    await act(async () => { ref.current.turn() })
    await tick(1000)
    await act(async () => { ref.current.turn() }) // a cut in flight too
    expect(clones()).toBe(1)
    await act(async () => { root.unmount() })
    root = createRoot(container) // afterEach unmounts again
    expect(vi.getTimerCount()).toBe(0)
    expect(document.head.querySelectorAll('style[data-forest-css],style[data-forest-walk]').length).toBe(0)
    expect(document.body.querySelectorAll('.fs-stage,.rmx,[data-forest-clone]').length).toBe(0)
  })

  it('reduced motion: turns crossfade without walk keyframes', async () => {
    reduced = true
    const { ref } = await mount()
    await act(async () => { ref.current.turn() })
    expect(ref.current.station).toBe(1)
    expect(kf()).toBe('')
    expect(scene()).toBe('cut:1')
    expect(clones()).toBe(1)
    await tick(CUT_MS)
    expect(scene()).toBe('rest:1')
    expect(clones()).toBe(0)
    expect(kf()).toBe('')
  })

  it('window.__forest: exposed, setSeed rebuilds at the current station, removed on unmount', async () => {
    const { ref } = await mount({ slideIndex: 4, exposeDebugGlobal: true })
    expect(window.__forest.station).toBe(4)
    const before = container.querySelector('.fs-world').innerHTML
    await act(async () => { window.__forest.setSeed(5) })
    expect(window.__forest.seed).toBe(5)
    expect(scene()).toBe('rest:4')
    expect(container.querySelectorAll('.fs-stage').length).toBe(1)
    expect(container.querySelector('.fs-world').innerHTML).not.toBe(before)
    await act(async () => { window.__forest.turn() })
    expect(ref.current.station).toBe(5)
    await act(async () => { root.unmount() })
    root = createRoot(container)
    expect(window.__forest).toBeUndefined()
  })

  it('no rAF, unseeded randomness or canvas in the forest DOM layer', () => {
    for (const f of ['../../worlds/forest/forestScene.js', './ForestAmbient.jsx']) {
      const src = readFileSync(new URL(f, import.meta.url), 'utf8')
      for (const bad of ['requestAnimationFrame', 'Math.random', '<canvas', 'getContext']) expect(src, `${f}: ${bad}`).not.toContain(bad)
    }
  })
})
