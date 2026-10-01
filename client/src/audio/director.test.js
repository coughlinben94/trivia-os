// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@sentry/react', () => ({ captureMessage: vi.fn(), addBreadcrumb: vi.fn() }))
vi.mock('../lib/youtubeWarmAudio.js', () => ({ warmYoutubeAudio: vi.fn(), claimYoutubeAudio: vi.fn() }))

import { createDirector } from './director.js'
import { FakeContext, makeFakes } from './director.fakes.js'

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

const flush = async () => { await Promise.resolve(); await Promise.resolve() }

describe('director status and unlock', () => {
  it('is locked with no context and no user activation', () => {
    const f = makeFakes()
    const d = createDirector(f.deps)
    expect(d.status()).toBe('locked')
    expect(d.getSnapshot()).toEqual({ status: 'locked', blocked: [] })
  })

  it('is unlocked with no context when the page already has user activation', () => {
    const f = makeFakes({ activation: true })
    expect(createDirector(f.deps).status()).toBe('unlocked')
  })

  it('unlock() creates the shared context, resumes it, and becomes unlocked', async () => {
    const f = makeFakes()
    const d = createDirector(f.deps)
    d.unlock()
    await flush()
    expect(f.deps.makeContext).toHaveBeenCalledTimes(1)
    expect(f.ctx.resumeCalls).toBe(1)
    expect(d.status()).toBe('unlocked')
  })

  it('reuses ONE context for every use (shared across the whole tab)', () => {
    const f = makeFakes()
    const d = createDirector(f.deps)
    d.unlock()
    d.unlock()
    expect(f.deps.makeContext).toHaveBeenCalledTimes(1)
  })

  it('a context that stays suspended means locked, whatever else is true', () => {
    const f = makeFakes({ activation: true })
    const d = createDirector(f.deps)
    f.ctx.resumeMode = 'hang'
    d.unlock()
    expect(d.status()).toBe('locked')
  })

  it('a resume() that NEVER settles does not throw or wedge; a later statechange unlocks and notifies', async () => {
    const f = makeFakes()
    f.ctx.resumeMode = 'hang'
    const d = createDirector(f.deps)
    const seen = []
    d.subscribe(() => seen.push(d.getSnapshot().status))
    expect(() => d.unlock()).not.toThrow()
    await flush()
    expect(d.status()).toBe('locked')
    f.ctx._set('running') // the user finally clicked and Chrome let it start
    expect(d.status()).toBe('unlocked')
    expect(seen).toContain('unlocked')
  })

  it('a rejected resume() does not throw', async () => {
    const f = makeFakes()
    f.ctx.resumeMode = 'reject'
    const d = createDirector(f.deps)
    expect(() => d.unlock()).not.toThrow()
    await flush()
    expect(d.status()).toBe('locked')
  })

  it('works when there is no AudioContext at all (makeContext returns null)', () => {
    const f = makeFakes({ ctx: null })
    f.deps.makeContext = vi.fn(() => null)
    const d = createDirector(f.deps)
    expect(() => d.unlock()).not.toThrow()
    expect(d.status()).toBe('unlocked') // a gesture happened; there is simply no graph to wait for
  })
})

describe('director subscribe / snapshot', () => {
  it('notifies subscribers on status change and stops after unsubscribe', () => {
    const f = makeFakes()
    const d = createDirector(f.deps)
    const cb = vi.fn()
    const off = d.subscribe(cb)
    d.unlock()
    expect(cb).toHaveBeenCalled()
    cb.mockClear()
    off()
    f.ctx._set('suspended')
    expect(cb).not.toHaveBeenCalled()
  })

  it('keeps the SAME snapshot object when nothing changed (React re-renders on identity)', () => {
    const f = makeFakes()
    const d = createDirector(f.deps)
    const a = d.getSnapshot()
    d.unlock() // ctx running -> changes
    const b = d.getSnapshot()
    expect(b).not.toBe(a)
    d.unlock() // nothing changes
    expect(d.getSnapshot()).toBe(b)
  })

  it('a throwing subscriber never breaks the director or other subscribers', () => {
    const f = makeFakes()
    const d = createDirector(f.deps)
    const ok = vi.fn()
    d.subscribe(() => { throw new Error('bad subscriber') })
    d.subscribe(ok)
    expect(() => d.unlock()).not.toThrow()
    expect(ok).toHaveBeenCalled()
  })
})

describe('installGestureUnlock', () => {
  it('unlocks on the first real gesture and returns an uninstaller', () => {
    const f = makeFakes()
    const d = createDirector(f.deps)
    const target = new EventTarget()
    const off = d.installGestureUnlock(target)
    expect(d.status()).toBe('locked')
    target.dispatchEvent(new Event('pointerdown'))
    expect(f.ctx.resumeCalls).toBe(1)
    expect(d.status()).toBe('unlocked')
    off()
    f.ctx._set('suspended')
    target.dispatchEvent(new Event('keydown'))
    expect(f.ctx.resumeCalls).toBe(1) // uninstalled: no second unlock
  })

  it('also listens for keydown and click', () => {
    for (const type of ['keydown', 'click']) {
      const f = makeFakes()
      const d = createDirector(f.deps)
      const target = new EventTarget()
      d.installGestureUnlock(target)
      target.dispatchEvent(new Event(type))
      expect(f.ctx.resumeCalls).toBe(1)
    }
  })
})

describe('preview mode', () => {
  it('play() in preview returns a no-op handle: no context, no element, no claim, no breadcrumb', () => {
    const f = makeFakes()
    const d = createDirector(f.deps)
    d.setPreview(true)
    const h = d.play({ kind: 'file', url: '/a.mp3' }, { slideId: 's1' })
    expect(h.state).toBe('preview')
    expect(() => { h.stop(); h.retry(); h.onEnded(() => {}) }).not.toThrow()
    expect(f.deps.makeContext).not.toHaveBeenCalled()
    expect(f.deps.makeElement).not.toHaveBeenCalled()
    expect(f.deps.breadcrumb).not.toHaveBeenCalled()
    expect(d.getSnapshot().blocked).toEqual([])
  })

  it('warm() is a no-op in preview', () => {
    const f = makeFakes()
    const d = createDirector(f.deps)
    d.setPreview(true)
    d.warm({ kind: 'youtube', videoId: 'v' })
    expect(f.youtube.warm).not.toHaveBeenCalled()
  })
})
