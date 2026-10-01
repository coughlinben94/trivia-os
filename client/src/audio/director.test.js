// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@sentry/react', () => ({ captureMessage: vi.fn(), addBreadcrumb: vi.fn() }))
vi.mock('../lib/youtubeWarmAudio.js', () => ({ warmYoutubeAudio: vi.fn(), claimYoutubeAudio: vi.fn() }))

import { createDirector } from './director.js'
import { FakeContext, FakeElement, makeFakes } from './director.fakes.js'

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

const flush = async () => { await Promise.resolve(); await Promise.resolve() }

describe('director status and unlock', () => {
  it('is locked with no context and no user activation', () => {
    const f = makeFakes()
    const d = createDirector(f.deps)
    expect(d.status()).toBe('locked')
    expect(d.getSnapshot()).toEqual({ status: 'locked', blocked: [], playing: [] })
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
    expect(f.events[0]).toMatchObject({ level: 'warning', message: 'audio: play blocked (upload)' })
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

  it("a handle's own retry() performs the unlock (a gesture), not just retryBlocked()", async () => {
    const f = makeFakes({ ctx: new FakeContext('suspended') })
    withPlayMode(f, 'reject')
    const d = createDirector(f.deps)
    const h = d.play(clip, { slideId: 's1' })
    await flush()
    expect(h.state).toBe('blocked')
    const before = f.ctx.resumeCalls
    h.retry()
    expect(f.ctx.resumeCalls).toBeGreaterThan(before)
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

import { fakeYoutube } from './director.fakes.js'

describe('director plays YouTube clips', () => {
  const clip = { kind: 'youtube', videoId: 'vid1', start: 10, end: 40, volume: 80 }

  it('claims the warm player and drives it: volume, unmute, seek to start, play', () => {
    const f = makeFakes({ ctx: new FakeContext('running'), youtube: fakeYoutube({ state: 1, muted: false }) })
    const d = createDirector(f.deps)
    d.play(clip, { slideId: 's1' })
    expect(f.youtube.claim).toHaveBeenCalledWith('vid1', 10, 40)
    const p = f.youtube.claims[0].player
    expect(p.setVolume).toHaveBeenCalledWith(80)
    expect(p.unMute).toHaveBeenCalled()
    expect(p.seekTo).toHaveBeenCalledWith(10, true)
    expect(p.playVideo).toHaveBeenCalled()
  })

  it('passes end as null (never 0/undefined) so warm and claim share one pool key', () => {
    const f = makeFakes({ ctx: new FakeContext('running') })
    const d = createDirector(f.deps)
    d.warm({ kind: 'youtube', videoId: 'v' })
    d.play({ kind: 'youtube', videoId: 'v' }, { slideId: 's1' })
    expect(f.youtube.warm).toHaveBeenCalledWith('v', 0, null)
    expect(f.youtube.claim).toHaveBeenCalledWith('v', 0, null)
  })

  it('becomes playing as soon as the player reports PLAYING and is unmuted (no 2s wait)', () => {
    const f = makeFakes({ ctx: new FakeContext('running'), youtube: fakeYoutube({ state: 1, muted: false }) })
    const d = createDirector(f.deps)
    const h = d.play(clip, { slideId: 's1' })
    expect(h.state).toBe('pending')
    f.youtube.claims[0].stateCb(1)
    expect(h.state).toBe('playing')
  })

  it('a player that is not sounding after 2s is blocked (state 2 paused), reported once', () => {
    const f = makeFakes({ ctx: new FakeContext('running'), youtube: fakeYoutube({ state: 2 }) })
    const d = createDirector(f.deps)
    const h = d.play(clip, { slideId: 's1' })
    vi.advanceTimersByTime(2000)
    expect(h.state).toBe('blocked')
    expect(h.reason).toBe('not-sounding')
    expect(f.events).toHaveLength(1)
    expect(f.events[0]).toMatchObject({ message: 'audio: play blocked (youtube)' })
  })

  it('buffering (state 3) is not a block: slow network, not the autoplay policy', () => {
    const f = makeFakes({ ctx: new FakeContext('running'), youtube: fakeYoutube({ state: 3 }) })
    const d = createDirector(f.deps)
    const h = d.play(clip, { slideId: 's1' })
    vi.advanceTimersByTime(2000)
    expect(h.state).toBe('playing')
  })

  it('a muted player is not sounding', () => {
    const f = makeFakes({ ctx: new FakeContext('running'), youtube: fakeYoutube({ state: 1, muted: true }) })
    const d = createDirector(f.deps)
    const h = d.play(clip, { slideId: 's1' })
    vi.advanceTimersByTime(2000)
    expect(h.state).toBe('blocked')
  })

  it('a YouTube API that never loads (player never ready) is blocked after 2s', () => {
    const yt = fakeYoutube()
    yt.neverReady = true
    const f = makeFakes({ ctx: new FakeContext('running'), youtube: yt })
    const d = createDirector(f.deps)
    const h = d.play(clip, { slideId: 's1' })
    vi.advanceTimersByTime(2000)
    expect(h.state).toBe('blocked')
    expect(h.reason).toBe('not-ready') // slow load, told apart from an autoplay-policy block
    expect(f.youtube.claims[0].player.playVideo).not.toHaveBeenCalled()
  })

  it('retry() drives the player again from a gesture; a still-silent retry blocks again', () => {
    const yt = fakeYoutube({ state: 2 })
    const f = makeFakes({ ctx: new FakeContext('running'), youtube: yt })
    const d = createDirector(f.deps)
    const h = d.play(clip, { slideId: 's1' })
    vi.advanceTimersByTime(2000)
    expect(h.state).toBe('blocked')
    d.retryBlocked()
    expect(h.state).toBe('pending')
    expect(yt.claims[0].player.playVideo).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(2000)
    expect(h.state).toBe('blocked')
    expect(f.events).toHaveLength(1)
    yt.state = 1 // it finally plays
    vi.advanceTimersByTime(1000)
    expect(h.state).toBe('playing')
  })

  it("a YouTube handle's own retry() performs the unlock (a gesture) before driving the player", () => {
    const f = makeFakes({ ctx: new FakeContext('suspended'), youtube: fakeYoutube({ state: 2 }) })
    const d = createDirector(f.deps)
    const h = d.play(clip, { slideId: 's1' })
    vi.advanceTimersByTime(2000)
    expect(h.state).toBe('blocked')
    expect(f.deps.makeContext).not.toHaveBeenCalled() // the YouTube path needs no Web Audio graph until a gesture
    h.retry()
    expect(f.deps.makeContext).toHaveBeenCalledTimes(1)
    expect(f.ctx.resumeCalls).toBe(1)
  })

  it('ENDED (state 0): onEnded fires, the claim is destroyed, and the clip is re-warmed for an instant replay', () => {
    const f = makeFakes({ ctx: new FakeContext('running'), youtube: fakeYoutube({ state: 1 }) })
    const d = createDirector(f.deps)
    const h = d.play(clip, { slideId: 's1' })
    const onEnded = vi.fn()
    h.onEnded(onEnded)
    f.youtube.claims[0].stateCb(0)
    expect(onEnded).toHaveBeenCalledTimes(1)
    expect(h.state).toBe('ended')
    expect(f.youtube.claims[0].destroyed).toBe(true)
    expect(f.youtube.warm).toHaveBeenCalledWith('vid1', 10, 40)
  })

  it('backstop: a clip with an end is ended by a timer if YouTube never reports ENDED', () => {
    const f = makeFakes({ ctx: new FakeContext('running'), youtube: fakeYoutube({ state: 1 }) })
    const d = createDirector(f.deps)
    const h = d.play(clip, { slideId: 's1' })
    f.youtube.claims[0].stateCb(1)
    vi.advanceTimersByTime((40 - 10) * 1000 + 499)
    expect(h.state).toBe('playing')
    vi.advanceTimersByTime(1)
    expect(h.state).toBe('ended')
  })

  it('stop() destroys the claim and cancels the backstop', () => {
    const f = makeFakes({ ctx: new FakeContext('running'), youtube: fakeYoutube({ state: 1 }) })
    const d = createDirector(f.deps)
    const h = d.play(clip, { slideId: 's1' })
    h.stop()
    expect(f.youtube.claims[0].destroyed).toBe(true)
    expect(vi.getTimerCount()).toBe(0) // the end backstop and the sound check are both gone
    vi.advanceTimersByTime(60000)
    expect(h.state).toBe('stopped')
  })

  it('warm() forwards to the pool; a malformed clip to warm() is ignored, not thrown', () => {
    const f = makeFakes({ ctx: new FakeContext('running') })
    const d = createDirector(f.deps)
    d.warm({ kind: 'youtube', videoId: 'v', start: 5, end: 25 })
    expect(f.youtube.warm).toHaveBeenCalledWith('v', 5, 25)
    expect(() => d.warm({ kind: 'youtube' })).not.toThrow()
    expect(() => d.warm(null)).not.toThrow()
    expect(f.youtube.warm).toHaveBeenCalledTimes(1)
  })

  it('a YouTube clip and a file clip can play at once, each with its own handle', async () => {
    const f = makeFakes({ ctx: new FakeContext('running'), youtube: fakeYoutube({ state: 1 }) })
    const d = createDirector(f.deps)
    const a = d.play(clip, { slideId: 's1' })
    const b = d.play({ kind: 'file', url: '/a.mp3' }, { slideId: 's2' })
    await flush()
    expect(a.state).not.toBe('stopped')
    expect(b.state).toBe('playing')
  })
})

describe('director never throws into the show', () => {
  it('a breadcrumb or event sink that throws does not break play()', async () => {
    const f = makeFakes({ ctx: new FakeContext('running') })
    f.deps.breadcrumb = vi.fn(() => { throw new Error('sentry down') })
    f.deps.event = vi.fn(() => { throw new Error('sentry down') })
    const d = createDirector(f.deps)
    expect(() => d.play({ kind: 'file', url: '/a.mp3' }, { slideId: 's1' })).not.toThrow()
    await flush()
  })

  it('a context whose createMediaElementSource throws falls back to element volume and still plays', async () => {
    const f = makeFakes({ ctx: new FakeContext('running') })
    f.ctx.createMediaElementSource = () => { throw new Error('graph failed') }
    const d = createDirector(f.deps)
    const h = d.play({ kind: 'file', url: '/a.mp3', gainDb: -6 }, { slideId: 's1' })
    await flush()
    expect(f.elements[0].volume).toBeCloseTo(0.5012, 3)
    expect(h.state).toBe('playing')
  })

  it('a YouTube claim() that throws becomes a blocked handle, not an exception', () => {
    const yt = fakeYoutube()
    yt.claim = vi.fn(() => { throw new Error('iframe api exploded') })
    const f = makeFakes({ ctx: new FakeContext('running'), youtube: yt })
    const d = createDirector(f.deps)
    let h
    expect(() => { h = d.play({ kind: 'youtube', videoId: 'v' }, { slideId: 's1' }) }).not.toThrow()
    expect(h.state).toBe('blocked')
    expect(h.reason).toBe('start-threw')
  })

  it('an onEnded callback that throws does not stop the others or the director', async () => {
    const f = makeFakes({ ctx: new FakeContext('running') })
    const d = createDirector(f.deps)
    const h = d.play({ kind: 'file', url: '/a.mp3' }, { slideId: 's1' })
    await flush()
    const second = vi.fn()
    h.onEnded(() => { throw new Error('bad cb') })
    h.onEnded(second)
    expect(() => f.elements[0].emit('ended')).not.toThrow()
    expect(second).toHaveBeenCalled()
  })

  it('stop() after ended, and a second stop(), are harmless', async () => {
    const f = makeFakes({ ctx: new FakeContext('running') })
    const d = createDirector(f.deps)
    const h = d.play({ kind: 'file', url: '/a.mp3' }, { slideId: 's1' })
    await flush()
    f.elements[0].emit('ended')
    expect(() => { h.stop(); h.stop(); h.retry() }).not.toThrow()
    expect(h.state).toBe('ended')
  })

  it('snapshot.blocked lists only blocked clips and clears when they stop', async () => {
    const f = makeFakes({ ctx: new FakeContext('running') })
    const orig = f.deps.makeElement.getMockImplementation()
    f.deps.makeElement.mockImplementation(() => { const el = orig(); el.playMode = 'reject'; return el })
    const d = createDirector(f.deps)
    const a = d.play({ kind: 'file', url: '/a.mp3' }, { slideId: 's1' })
    const b = d.play({ kind: 'file', url: '/b.mp3' }, { slideId: 's2' })
    await flush()
    expect(d.getSnapshot().blocked.map(x => x.slideId).sort()).toEqual(['s1', 's2'])
    a.stop()
    expect(d.getSnapshot().blocked.map(x => x.slideId)).toEqual(['s2'])
    b.stop()
    expect(d.getSnapshot().blocked).toEqual([])
  })
})

describe('module hygiene', () => {
  it('the app singleton exists and has the public API', async () => {
    const mod = await import('./director.js')
    for (const k of ['status', 'unlock', 'installGestureUnlock', 'subscribe', 'getSnapshot', 'setPreview', 'warm', 'play', 'retryBlocked']) {
      expect(typeof mod.director[k]).toBe('function')
    }
  })
})

describe('review fixes (2026-10-01)', () => {
  const runningFakes = opts => makeFakes({ ctx: new FakeContext('running'), ...opts })
  const fileClip = { kind: 'file', url: '/a.mp3' }

  it('replaying the same clip from an onEnded callback keeps the NEW handle live', () => {
    const f = runningFakes()
    const d = createDirector(f.deps)
    let second = null
    const first = d.play(fileClip, { slideId: 's' })
    first.onEnded(() => { second = d.play(fileClip, { slideId: 's' }) })
    f.elements[0].emit('ended')
    expect(second).not.toBeNull()
    expect(d._internals.handles.get(second.key)).toBe(second)
    d.stopSlide('s')
    expect(f.elements[1].paused).toBe(true) // the new copy really stops; no double playback
  })

  it('a blocked 4s YouTube clip is NOT ended by the backstop while it is silent', () => {
    const f = runningFakes({ youtube: fakeYoutube({ state: 1, muted: true }) })
    const d = createDirector(f.deps)
    const h = d.play({ kind: 'youtube', videoId: 'v', start: 0, end: 4 }, { slideId: 's' })
    vi.advanceTimersByTime(5000)
    expect(h.state).toBe('blocked')
    expect(d.getSnapshot().blocked).toHaveLength(1)
  })

  it('a blocked clip shorter than the sound check is still reported', () => {
    const f = runningFakes({ youtube: fakeYoutube({ state: 1, muted: true }) })
    const d = createDirector(f.deps)
    d.play({ kind: 'youtube', videoId: 'v', start: 0, end: 1 }, { slideId: 's' })
    vi.advanceTimersByTime(2100)
    expect(f.events).toHaveLength(1)
  })

  it('an end at or before the start means no end (no instant backstop)', () => {
    const f = runningFakes()
    const d = createDirector(f.deps)
    const h = d.play({ kind: 'youtube', videoId: 'v', start: 10, end: 5 }, { slideId: 's' })
    vi.advanceTimersByTime(6000)
    expect(h.state).toBe('playing')
  })

  it('the end backstop still ends a sounding clip, counted from when sound started', () => {
    const f = runningFakes()
    const d = createDirector(f.deps)
    const h = d.play({ kind: 'youtube', videoId: 'v', start: 0, end: 4 }, { slideId: 's' })
    vi.advanceTimersByTime(2000) // sounding at the check
    expect(h.state).toBe('playing')
    vi.advanceTimersByTime(4400)
    expect(h.state).toBe('playing')
    vi.advanceTimersByTime(300)
    expect(h.state).toBe('ended')
  })

  it('a late play() rejection never moves a playing clip back to blocked', async () => {
    const f = runningFakes()
    let rejectPlay
    f.deps.makeElement = vi.fn(() => {
      const el = new FakeElement()
      el.play = () => { el.paused = false; return new Promise((_, rej) => { rejectPlay = rej }) }
      f.elements.push(el)
      return el
    })
    const d = createDirector(f.deps)
    const h = d.play(fileClip, { slideId: 's' })
    vi.advanceTimersByTime(2000)
    expect(h.state).toBe('playing')
    rejectPlay(new DOMException('late', 'AbortError'))
    await flush()
    expect(h.state).toBe('playing')
    expect(f.events).toHaveLength(0)
  })

  it('pause() and resume() park and restart a file clip, and the snapshot follows', async () => {
    const f = runningFakes()
    const d = createDirector(f.deps)
    const h = d.play(fileClip, { slideId: 's' })
    await flush()
    expect(h.state).toBe('playing')
    expect(d.getSnapshot().playing).toEqual([{ key: h.key, slideId: 's', part: 0, paused: false }])
    h.pause()
    expect(h.state).toBe('paused')
    expect(f.elements[0].paused).toBe(true)
    expect(d.getSnapshot().playing[0].paused).toBe(true)
    h.resume()
    expect(h.state).toBe('playing')
    expect(f.elements[0].paused).toBe(false)
    expect(d.getSnapshot().playing[0].paused).toBe(false)
  })

  it('pause() and resume() keep a YouTube player parked, not destroyed', () => {
    const f = runningFakes()
    const d = createDirector(f.deps)
    const h = d.play({ kind: 'youtube', videoId: 'v' }, { slideId: 's' })
    vi.advanceTimersByTime(2000)
    h.pause()
    expect(f.youtube.claims[0].player.pauseVideo).toHaveBeenCalled()
    expect(f.youtube.claims[0].destroyed).toBe(false)
    h.resume()
    expect(f.youtube.claims[0].player.playVideo).toHaveBeenCalledTimes(2)
    expect(h.state).toBe('playing')
  })

  it('pause() on a clip that is not playing does nothing', () => {
    const f = makeFakes()
    f.ctx.resumeMode = 'hang'
    const d = createDirector(f.deps)
    const h = d.play(fileClip, { slideId: 's' })
    expect(() => h.pause()).not.toThrow()
    expect(h.state).not.toBe('paused')
  })

  it('stopping removes the clip from the playing list', async () => {
    const f = runningFakes()
    const d = createDirector(f.deps)
    const h = d.play(fileClip, { slideId: 's' })
    await flush()
    h.stop()
    expect(d.getSnapshot().playing).toEqual([])
  })

  it('getContext() returns the one shared context', () => {
    const f = runningFakes()
    const d = createDirector(f.deps)
    expect(d.getContext()).toBe(f.ctx)
    d.play(fileClip, { slideId: 's' })
    expect(f.deps.makeContext).toHaveBeenCalledTimes(1)
  })

  it('stopSlide() stops only that slide; stopAll() stops everything', async () => {
    const f = runningFakes()
    const d = createDirector(f.deps)
    const a = d.play(fileClip, { slideId: 'a' })
    const b = d.play(fileClip, { slideId: 'b' })
    d.stopSlide('a')
    expect(a.state).toBe('stopped')
    expect(b.state).not.toBe('stopped')
    d.stopAll()
    expect(b.state).toBe('stopped')
    expect(d._internals.handles.size).toBe(0)
  })

  it('a click replays a blocked clip; an Escape key does not count as a gesture', async () => {
    const f = makeFakes()
    f.ctx.resumeMode = 'hang'
    f.deps.makeElement = vi.fn(() => { const el = new FakeElement(); el.playMode = 'reject'; f.elements.push(el); return el })
    const d = createDirector(f.deps)
    const target = new EventTarget()
    d.installGestureUnlock(target)
    const h = d.play(fileClip, { slideId: 's' })
    await flush()
    expect(h.state).toBe('blocked')
    const el = f.elements[0]
    const before = el.playCalls
    const esc = new Event('keydown'); esc.key = 'Escape'
    target.dispatchEvent(esc)
    expect(el.playCalls).toBe(before)
    target.dispatchEvent(new Event('pointerdown'))
    expect(el.playCalls).toBeGreaterThan(before)
  })
})
