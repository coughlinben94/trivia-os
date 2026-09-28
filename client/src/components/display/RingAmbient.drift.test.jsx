// @vitest-environment jsdom
//
// The drifter's per-show journey (2026-09-28). Before this, every show got
// the identical path: a hardcoded seed and one shared keyframe. This pins
// (1) no showId keeps the old single-element fixed path, (2) a showId builds
// the seeded run+bob pair, deterministic per show and different across shows,
// (3) the vertical swing never leaves the band above the safe box. The band
// numbers are duplicated as literals on purpose (not imported) so a change to
// ENGINE.SAFE or the drifter's start height fails here instead of tracking.
// jsdom can't run CSS animations — the real rendered path was sampled in
// Chromium separately; this only guards the inputs to it.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import RingAmbient from './RingAmbient.jsx'
import { midnightGalaxyRing } from '../../worlds/midnightGalaxy.ring.js'

const TOP = 102.7            // drifter's calibrated start top (bandY, seed 0xD817)
const UP_MAX = 56.7          // TOP - glow 42 - 4px on-frame spare
const DOWN_MAX = 119.7       // 302.4 safe-box top - 24 clear - 42 glow - 14 size - TOP

describe('RingAmbient drifter — per-show journey', () => {
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

  async function driftOf(showId) {
    await act(async () => {
      root.render(<RingAmbient worldData={midnightGalaxyRing} showId={showId} exposeDebugGlobal={false} />)
    })
    const drift = container.querySelector('.ring-drift')
    const run = drift.parentElement.classList.contains('ring-driftRun') ? drift.parentElement : null
    const params = run && {
      drx: run.style.getPropertyValue('--drx'), drd: run.style.getPropertyValue('--drd'),
      dby: drift.style.getPropertyValue('--dby'), dbd: drift.style.getPropertyValue('--dbd'),
    }
    await act(async () => { root.unmount() })
    root = createRoot(container)
    return { drift, run, params }
  }

  it('no showId keeps the old fixed path, one element, no per-show vars', async () => {
    const { drift, run } = await driftOf(undefined)
    expect(run).toBeNull()
    expect(drift.className).toBe('ring-drift')
    expect(drift.style.top).toBe(TOP + 'px')
    expect(drift.style.getPropertyValue('--dby')).toBe('')
  })

  it('a showId builds the seeded run+bob pair, same start point', async () => {
    const { drift, run, params } = await driftOf('show-a')
    expect(run).toBeTruthy()
    expect(drift.classList.contains('ring-drift-bob')).toBe(true)
    expect(run.style.top).toBe(TOP + 'px')
    expect(run.style.left).toBe('748.8px')
    expect(Object.values(params).every(v => v !== '')).toBe(true)
  })

  it('deterministic per show, different across shows', async () => {
    const a1 = (await driftOf('show-a')).params
    const a2 = (await driftOf('show-a')).params
    const b = (await driftOf('show-b')).params
    expect(a2).toEqual(a1)
    expect(b).not.toEqual(a1)
  })

  it('vertical swing stays inside the band above the safe box for 12 shows (20k-seed sweep done offline)', async () => {
    for (let i = 0; i < 12; i++) {
      const { dby } = (await driftOf(`sweep-${i}`)).params
      const by = parseFloat(dby)
      expect(by).toBeGreaterThanOrEqual(-UP_MAX)
      expect(by).toBeLessThanOrEqual(DOWN_MAX)
    }
  }, 60000)
})
