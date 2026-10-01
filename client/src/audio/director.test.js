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

describe('director plays file clips', () => {
  const clip = { kind: 'file', url: '/a.mp3', gainDb: 6, start: 0 }
  // Make every element the director creates start in a given play mode.
  const withPlayMode = (f, mode) => {
    const orig = f.deps.makeElement.getMockImplementation()
    f.deps.makeElement.mockImplementation(() => { const el = orig(); el.playMode = mode; return el })
  }

  it('routes the element through the shared context with dB gain and starts playing', async () => {
    const f = makeFakes({ ctx: new FakeContext('running') })
    const d = createDirector(f.deps)
    const h = d.play(clip, { slideId: 's1' })
    await flush()
    const el = f.elements[0]
    expect(el.src).toBe('/a.mp3')
    expect(el.playCalls).toBe(1)
    expect(f.ctx.sources[0].el).toBe(el)
    expect(f.ctx.gains[0].gain.value).toBeCloseTo(1.9953, 3)
    expect(f.ctx.gains[0].connect).toHaveBeenCalledWith(f.ctx.destination)
    expect(h.state).toBe('playing')
  })

  it('reports requested then started with the elapsed ms (breadcrumbs, no Sentry event)', async () => {
    const f = makeFakes({ ctx: new FakeContext('running') })
    const d = createDirector(f.deps)
    d.play(clip, { slideId: 's1' })
    await flush()
    expect(f.breadcrumbs.map(b => b.message)).toEqual(['audio requested', 'audio started'])
    expect(f.breadcrumbs[0].data).toMatchObject({ kind: 'file', slideId: 's1', part: 0 })
    expect(f.breadcrumbs[1].data).toMatchObject({ kind: 'file', slideId: 's1', afterBlock: false })
    expect(f.events).toEqual([])
  })

  it('honors start offset and loop', () => {
    const f = makeFakes({ ctx: new FakeContext('running') })
    const d = createDirector(f.deps)
    d.play({ kind: 'file', url: '/theme.mp3', start: 181, loop: true }, { slideId: 's1' })
    expect(f.elements[0].currentTime).toBe(181)
    expect(f.elements[0].loop).toBe(true)
  })

  it('a rejected play() (NotAllowedError) is blocked with reason not-allowed and reported ONCE', async () => {
    const f = makeFakes({ ctx: new FakeContext('running') })
    withPlayMode(f, 'reject')
    const d = createDirector(f.deps)
    const h = d.play(clip, { slideId: 's1' })
    await flush()
    expect(h.state).toBe('blocked')
    expect(h.reason).toBe('not-allowed')
    expect(d.getSnapshot().blocked).toEqual([{ key: h.key, slideId: 's1', kind: 'file', part: 0, reason: 'not-allowed' }])
    expect(f.events).toHaveLength(1)
    expect(f.events[0]).toMatchObject({ level: 'warning', message: 'audio: play blocked (file)' })
    expect(f.events[0].extra).toMatchObject({ slideId: 's1', part: 0, reason: 'not-allowed' })
    // the same clip blocked again does not send a second Sentry event
    d.play(clip, { slideId: 's1' })
    await flush()
    expect(f.events).toHaveLength(1)
  })

  it('a play() that throws synchronously is blocked with reason play-threw', async () => {
    const f = makeFakes({ ctx: new FakeContext('running') })
    withPlayMode(f, 'throw')
    const d = createDirector(f.deps)
    const h = d.play(clip, { slideId: 's1' })
    expect(h.state).toBe('blocked')
    expect(h.reason).toBe('play-threw')
  })

  it('a suspended context whose resume() hangs: blocked "not-sounding" after 2s (the check starts at the request)', async () => {
    const f = makeFakes({ ctx: new FakeContext('suspended') })
    f.ctx.resumeMode = 'hang'
    const d = createDirector(f.deps)
    const h = d.play(clip, { slideId: 's1' })
    await flush()
    expect(f.elements[0].playCalls).toBe(1) // play() IS called; it just cannot be heard
    expect(h.state).toBe('pending')
    vi.advanceTimersByTime(1999)
    expect(h.state).toBe('pending')
    vi.advanceTimersByTime(1)
    expect(h.state).toBe('blocked')
    expect(h.reason).toBe('not-sounding')
  })

  it('an element whose own play() NEVER settles is still reported (the check does not wait for play())', async () => {
    const f = makeFakes({ ctx: new FakeContext('running') })
    withPlayMode(f, 'hang')
    const d = createDirector(f.deps)
    const h = d.play(clip, { slideId: 's1' })
    await flush()
    expect(h.state).toBe('pending')
    vi.advanceTimersByTime(2000)
    expect(h.state).toBe('blocked')
    expect(h.reason).toBe('not-sounding')
  })

  it('while blocked it keeps re-checking: a slow start that finally sounds clears itself', async () => {
    const f = makeFakes({ ctx: new FakeContext('suspended') })
    f.ctx.resumeMode = 'hang'
    const d = createDirector(f.deps)
    const h = d.play(clip, { slideId: 's1' })
    await flush()
    vi.advanceTimersByTime(2000)
    expect(h.state).toBe('blocked')
    f.ctx._set('running') // the user clicked; the element is already playing
    vi.advanceTimersByTime(1000)
    expect(h.state).toBe('playing')
    expect(d.getSnapshot().blocked).toEqual([])
    expect(f.breadcrumbs.at(-1)).toMatchObject({ message: 'audio started', data: { afterBlock: true } })
  })

  it('retryBlocked(): unlocks (a gesture), replays, and the clip plays', async () => {
    const f = makeFakes({ ctx: new FakeContext('running') })
    withPlayMode(f, 'reject')
    const d = createDirector(f.deps)
    const h = d.play(clip, { slideId: 's1' })
    await flush()
    expect(h.state).toBe('blocked')
    f.elements[0].playMode = 'ok' // the click made playback allowed
    d.retryBlocked()
    expect(h.state).toBe('pending') // cleared while retrying
    expect(d.getSnapshot().blocked).toEqual([])
    await flush()
    expect(f.elements[0].playCalls).toBe(2)
    expect(h.state).toBe('playing')
  })

  it('a retry that is STILL silent raises the block again (not a silent second failure)', async () => {
    const f = makeFakes({ ctx: new FakeContext('running') })
    withPlayMode(f, 'reject')
    const d = createDirector(f.deps)
    const h = d.play(clip, { slideId: 's1' })
    await flush()
    d.retryBlocked()
    await flush()
    expect(h.state).toBe('blocked')
    expect(f.events).toHaveLength(1) // still one Sentry event for this clip
  })

  it("emits the element's ended event to onEnded exactly once and releases the clip", async () => {
    const f = makeFakes({ ctx: new FakeContext('running') })
    const d = createDirector(f.deps)
    const h = d.play(clip, { slideId: 's1' })
    await flush()
    const onEnded = vi.fn()
    h.onEnded(onEnded)
    f.elements[0].emit('ended')
    f.elements[0].emit('ended')
    expect(onEnded).toHaveBeenCalledTimes(1)
    expect(h.state).toBe('ended')
  })

  it('stop() pauses the element, disconnects the graph, and cancels the sound check', async () => {
    const f = makeFakes({ ctx: new FakeContext('suspended') })
    f.ctx.resumeMode = 'hang'
    const d = createDirector(f.deps)
    const h = d.play(clip, { slideId: 's1' })
    h.stop()
    expect(h.state).toBe('stopped')
    expect(f.elements[0].paused).toBe(true)
    expect(f.ctx.sources[0].disconnect).toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0) // no timer survives a stopped clip
    vi.advanceTimersByTime(5000)
    expect(f.events).toEqual([])
    expect(h.state).toBe('stopped')
  })

  it('playing the same slide+part again stops the earlier handle (one live handle per clip)', async () => {
    const f = makeFakes({ ctx: new FakeContext('running') })
    const d = createDirector(f.deps)
    const first = d.play(clip, { slideId: 's1' })
    const second = d.play(clip, { slideId: 's1' })
    expect(first.state).toBe('stopped')
    expect(second.state).not.toBe('stopped')
  })

  it('with no AudioContext at all, plays through the element with a capped volume', async () => {
    const f = makeFakes({ ctx: null })
    f.deps.makeContext = vi.fn(() => null)
    const d = createDirector(f.deps)
    const h = d.play({ kind: 'file', url: '/a.mp3', gainDb: 12 }, { slideId: 's1' })
    await flush()
    expect(f.elements[0].volume).toBe(1) // 12 dB would be 3.98: capped at 1
    expect(f.elements[0].playCalls).toBe(1)
    expect(h.state).toBe('playing')
  })

  it('leaving preview makes play() live again', () => {
    const f = makeFakes({ ctx: new FakeContext('running') })
    const d = createDirector(f.deps)
    d.setPreview(true)
    d.setPreview(false)
    expect(d.play({ kind: 'file', url: '/a.mp3' }, { slideId: 's1' }).state).not.toBe('preview')
  })

  it('a bad clip throws a clear error to the caller (it never reaches the TV)', () => {
    const f = makeFakes({ ctx: new FakeContext('running') })
    const d = createDirector(f.deps)
    expect(() => d.play({ kind: 'bendle', songId: 's' }, { slideId: 's1' })).toThrow(/unsupported audio clip kind: bendle/)
    expect(() => d.play({ kind: 'file' }, { slideId: 's1' })).toThrow(/url/)
  })
})
