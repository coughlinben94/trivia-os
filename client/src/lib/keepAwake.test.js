import { describe, it, expect } from 'vitest'
import { keepAwake } from './keepAwake.js'

function fakes({ visible = true, refuseFirst = 0 } = {}) {
  const listeners = { doc: {}, win: {} }
  const calls = { request: 0, released: 0 }
  let refusals = refuseFirst
  const doc = {
    visibilityState: visible ? 'visible' : 'hidden',
    addEventListener: (t, f) => { listeners.doc[t] = f },
    removeEventListener: t => { delete listeners.doc[t] },
  }
  const win = {
    addEventListener: (t, f) => { listeners.win[t] = f },
    removeEventListener: t => { delete listeners.win[t] },
  }
  const nav = {
    wakeLock: {
      request: async () => {
        calls.request++
        if (refusals-- > 0) throw new Error('NotAllowedError')
        const sentinel = { addEventListener: (t, f) => { sentinel.onRelease = f }, release: async () => { calls.released++ } }
        return sentinel
      },
    },
  }
  return { nav, doc, win, listeners, calls }
}
const tick = () => new Promise(r => setTimeout(r, 0))

describe('keepAwake', () => {
  it('does nothing when the browser has no wake lock', () => {
    const stop = keepAwake({ nav: {}, doc: {}, win: {} })
    expect(typeof stop).toBe('function')
    stop()
  })

  it('requests a lock right away when the tab is visible', async () => {
    const f = fakes()
    keepAwake(f)
    await tick()
    expect(f.calls.request).toBe(1)
  })

  it('does not ask while the tab is hidden, and asks again on return', async () => {
    const f = fakes({ visible: false })
    keepAwake(f)
    await tick()
    expect(f.calls.request).toBe(0)
    f.doc.visibilityState = 'visible'
    f.listeners.doc.visibilitychange()
    await tick()
    expect(f.calls.request).toBe(1)
  })

  it('retries on the next tap after a refused request', async () => {
    const f = fakes({ refuseFirst: 1 })
    keepAwake(f)
    await tick()
    f.listeners.win.pointerdown()
    await tick()
    expect(f.calls.request).toBe(2)
  })

  it('does not stack a second lock while one is held', async () => {
    const f = fakes()
    keepAwake(f)
    await tick()
    f.listeners.win.keydown()
    await tick()
    expect(f.calls.request).toBe(1)
  })

  it('releases the lock and removes listeners on stop', async () => {
    const f = fakes()
    const stop = keepAwake(f)
    await tick()
    stop()
    await tick()
    expect(f.calls.released).toBe(1)
    expect(f.listeners.doc.visibilitychange).toBeUndefined()
    expect(f.listeners.win.pointerdown).toBeUndefined()
  })
})
