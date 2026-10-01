// Test-only fakes for the audio director. Not imported by app code.
import { vi } from 'vitest'

// A Web Audio context whose state the test controls. resumeMode:
//   'ok'     resume() settles and the context becomes 'running'
//   'hang'   resume() NEVER settles (what Chrome does with no user gesture)
//   'reject' resume() rejects
export class FakeContext {
  constructor(state = 'suspended') {
    this.state = state
    this.destination = { name: 'destination' }
    this.listeners = new Set()
    this.resumeCalls = 0
    this.resumeMode = 'ok'
    this.currentTime = 10 // audio clock, seconds
    this.gains = []
    this.sources = []
  }
  addEventListener(type, cb) { if (type === 'statechange') this.listeners.add(cb) }
  removeEventListener(type, cb) { this.listeners.delete(cb) }
  _set(state) { this.state = state; this.listeners.forEach(cb => cb()) }
  createGain() {
    const g = {
      gain: { value: 1, linearRampToValueAtTime: vi.fn(), cancelScheduledValues: vi.fn(), setValueAtTime: vi.fn() },
      connect: vi.fn(),
      disconnect: vi.fn(),
    }
    this.gains.push(g)
    return g
  }
  createMediaElementSource(el) {
    const s = { el, connect: vi.fn(), disconnect: vi.fn() }
    this.sources.push(s)
    return s
  }
  resume() {
    this.resumeCalls++
    if (this.resumeMode === 'hang') return new Promise(() => {})
    if (this.resumeMode === 'reject') return Promise.reject(new Error('resume refused'))
    this._set('running')
    return Promise.resolve()
  }
}

// An <audio> element. playMode: 'ok' | 'reject' (NotAllowedError) | 'hang' | 'throw'.
export class FakeElement {
  constructor() {
    this.paused = true
    this.ended = false
    this.currentTime = 0
    this.loop = false
    this.src = ''
    this.preload = ''
    this.readyState = 4 // HAVE_ENOUGH_DATA; tests lower it to model a file still buffering
    this.volume = 1
    this.playMode = 'ok'
    this.playCalls = 0
    this.listeners = {}
  }
  addEventListener(type, cb) { (this.listeners[type] ||= []).push(cb) }
  removeAttribute(name) { if (name === 'src') this.src = '' }
  emit(type) { (this.listeners[type] || []).forEach(cb => cb()) }
  play() {
    this.playCalls++
    if (this.playMode === 'throw') throw new Error('play threw')
    if (this.playMode === 'reject') return Promise.reject(new DOMException('blocked', 'NotAllowedError'))
    if (this.playMode === 'hang') return new Promise(() => {})
    this.paused = false
    return Promise.resolve()
  }
  pause() { this.paused = true }
}

// A fake lib/youtubeWarmAudio.js. `yt.state` / `yt.muted` drive what every claimed
// player reports; set yt.neverReady = true to model a YouTube API that never loads.
export function fakeYoutube({ state = 1, muted = false } = {}) {
  const yt = { state, muted, neverReady: false, claims: [] }
  yt.warm = vi.fn()
  yt.claim = vi.fn((videoId, start, end) => {
    const player = {
      setVolume: vi.fn(),
      unMute: vi.fn(),
      seekTo: vi.fn(),
      playVideo: vi.fn(),
      pauseVideo: vi.fn(),
      getPlayerState: () => yt.state,
      isMuted: () => yt.muted,
    }
    const h = {
      videoId, start, end, player, destroyed: false, readyCbs: [], stateCb: null,
      whenReady(cb) { if (yt.neverReady) this.readyCbs.push(cb); else cb(player) },
      onStateChange(cb) { this.stateCb = cb },
      destroy() { this.destroyed = true },
    }
    yt.claims.push(h)
    return h
  })
  return yt
}

// A complete deps object plus handles the test can poke. Timers stay real so
// vi.useFakeTimers() controls them.
export function makeFakes({ ctx = new FakeContext('suspended'), activation = false, youtube = fakeYoutube() } = {}) {
  const f = {
    ctx,
    elements: [],
    youtube,
    activation,
    breadcrumbs: [],
    events: [],
  }
  f.deps = {
    makeContext: vi.fn(() => f.ctx),
    makeElement: vi.fn(() => { const el = new FakeElement(); f.elements.push(el); return el }),
    youtube: f.youtube,
    hasUserActivation: () => f.activation,
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: id => clearTimeout(id),
    now: () => Date.now(),
    breadcrumb: vi.fn((message, data) => { f.breadcrumbs.push({ message, data }) }),
    event: vi.fn((level, message, extra) => { f.events.push({ level, message, extra }) }),
  }
  return f
}
