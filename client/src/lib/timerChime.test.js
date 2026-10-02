// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@sentry/react', () => ({ captureMessage: vi.fn(), addBreadcrumb: vi.fn() }))
vi.mock('./youtubeWarmAudio.js', () => ({ warmYoutubeAudio: vi.fn(), claimYoutubeAudio: vi.fn() }))

const gain = vi.hoisted(() => ({ db: 6 }))
vi.mock('./audioNormalize.js', () => ({ analyzeAudioGain: vi.fn(async () => gain.db) }))

import { playTimerChime, unlockTimerAudio, warmTimerChime, resetTimerChimeCache, TIMER_BEEP_SRC } from './timerChime.js'
import { director } from '../audio/director.js'

// The host timer's "time's up" chime: three two-tone dings on the director's shared context.
let made
class FakeAC {
  constructor(state) {
    this.state = state
    this.currentTime = 2
    this.destination = {}
    this.oscs = []
    this.sources = []
    this.gains = []
    this.decodes = 0
    this.resumes = 0
    made.push(this)
  }
  decodeAudioData() { this.decodes++; return Promise.resolve({ duration: 1.62, id: 'beep' }) }
  createBufferSource() { const src = { buffer: null, playbackRate: { value: 1 }, connect: vi.fn(), start: vi.fn() }; this.sources.push(src); return src }
  addEventListener() {}
  createGain() { const g = { gain: { value: 1, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: vi.fn(function () { return this }) }; this.gains.push(g); return g }
  createOscillator() { const o = { type: '', frequency: {}, connect() { return { connect() {} } }, start: vi.fn(), stop: vi.fn() }; this.oscs.push(o); return o }
  resume() { this.resumes++; return this.state === 'running' ? Promise.resolve() : new Promise(() => {}) }
}

const okFetch = () => vi.fn(async () => ({ ok: true, blob: async () => ({ arrayBuffer: async () => new ArrayBuffer(8) }) }))
beforeEach(() => { vi.useFakeTimers(); made = []; director._internals.reset(); resetTimerChimeCache(); gain.db = 6; globalThis.fetch = okFetch() })
afterEach(() => { director._internals.reset(); vi.useRealTimers(); delete globalThis.AudioContext })

describe('playTimerChime', () => {
  it('plays the rules-slide beep clip three times, back to back at 2x speed, and resolves true', async () => {
    globalThis.AudioContext = class extends FakeAC { constructor() { super('running') } }
    const ok = await playTimerChime()
    expect(ok).toBe(true)
    const ac = made[0]
    expect(globalThis.fetch).toHaveBeenCalledWith(TIMER_BEEP_SRC)
    expect(TIMER_BEEP_SRC).toBe('/rules-beep.mp3') // the very file the rules slide plays
    expect(ac.sources).toHaveLength(3)
    for (const src of ac.sources) {
      expect(src.playbackRate.value).toBe(2)
      expect(src.buffer).toEqual({ duration: 1.62, id: 'beep' })
      expect(src.start).toHaveBeenCalledTimes(1)
    }
    const starts = ac.sources.map(src => src.start.mock.calls[0][0])
    expect(starts[0]).toBeCloseTo(2 + 0.05) // context clock 2s + the same small headroom the rules slide uses
    expect(starts[1] - starts[0]).toBeCloseTo(1.65 / 2) // exactly the rules slide's spacing
    expect(starts[2] - starts[1]).toBeCloseTo(1.65 / 2)
    expect(ac.oscs).toHaveLength(0) // not the synthesized dings
  })

  it('uses the same loudness boost the rules slide applies to that clip', async () => {
    gain.db = 6
    globalThis.AudioContext = class extends FakeAC { constructor() { super('running') } }
    await playTimerChime()
    expect(made[0].gains[0].gain.value).toBeCloseTo(Math.pow(10, 6 / 20))
    expect(made[0].sources[0].connect).toHaveBeenCalledWith(made[0].gains[0])
  })

  it('fetches and decodes the clip once, however many times the chime rings', async () => {
    globalThis.AudioContext = class extends FakeAC { constructor() { super('running') } }
    await playTimerChime(); await playTimerChime()
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
    expect(made[0].decodes).toBe(1)
    expect(made[0].sources).toHaveLength(6)
  })

  it('warmTimerChime fetches the clip ahead of time so the chime is not waiting on the network', async () => {
    await warmTimerChime()
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
    globalThis.AudioContext = class extends FakeAC { constructor() { super('running') } }
    await playTimerChime()
    expect(globalThis.fetch).toHaveBeenCalledTimes(1) // already warm
  })

  it('if the clip cannot load (offline TV), the old synthesized dings still ring', async () => {
    globalThis.fetch = vi.fn(async () => { throw new Error('offline') })
    globalThis.AudioContext = class extends FakeAC { constructor() { super('running') } }
    expect(await playTimerChime()).toBe(true)
    expect(made[0].sources).toHaveLength(0)
    expect(made[0].oscs).toHaveLength(3 * 2 * 2)
  })

  it('a clip that fails to decode also falls back to the dings, and never throws', async () => {
    globalThis.AudioContext = class extends FakeAC { constructor() { super('running') } decodeAudioData() { return Promise.reject(new Error('bad mp3')) } }
    expect(await playTimerChime()).toBe(true)
    expect(made[0].oscs).toHaveLength(3 * 2 * 2)
  })

  it('resolves false (and schedules nothing) on a locked tab, so the overlay can show its cue', async () => {
    globalThis.AudioContext = class extends FakeAC { constructor() { super('suspended') } }
    const p = playTimerChime()
    await vi.advanceTimersByTimeAsync(1600) // the chime waits up to 1.5s for a late resume
    expect(await p).toBe(false)
    expect(made[0].oscs).toHaveLength(0)
    expect(made[0].sources).toHaveLength(0)
  })

  it('a retry after the tab unlocked rings', async () => {
    let state = 'suspended'
    globalThis.AudioContext = class extends FakeAC { constructor() { super('suspended'); Object.defineProperty(this, 'state', { get: () => state }) } }
    const p = playTimerChime()
    await vi.advanceTimersByTimeAsync(1600)
    expect(await p).toBe(false)
    state = 'running'
    expect(await playTimerChime()).toBe(true)
    expect(made).toHaveLength(1) // the same context, not a second one
  })

  it('no AudioContext at all resolves false, never throws', async () => {
    const p = playTimerChime()
    await vi.advanceTimersByTimeAsync(1600)
    expect(await p).toBe(false)
  })

  it('unlockTimerAudio resumes the shared context and never throws', () => {
    globalThis.AudioContext = class extends FakeAC { constructor() { super('suspended') } }
    expect(() => unlockTimerAudio()).not.toThrow()
    expect(made[0].resumes).toBe(1)
  })
})

// From main (host timer review): a slow resume must still ring, a never-resuming context must give up.
function fakeContext({ resumeAfterMs }) {
  const ac = {
    state: 'suspended', currentTime: 0, destination: {},
    resume: () => new Promise(r => setTimeout(() => { ac.state = 'running'; r() }, resumeAfterMs)),
    createOscillator: () => ({ type: '', frequency: {}, connect: n => n, start: vi.fn(), stop: vi.fn() }),
    createGain: () => ({ gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: n => n }),
  }
  return ac
}

describe('playTimerChime resume wait (from main)', () => {
  beforeEach(() => { vi.resetModules() }) // a fresh director per case: these import the module dynamically
  it('still rings when the audio context takes ~800ms to resume', async () => {
    vi.useFakeTimers()
    const ac = fakeContext({ resumeAfterMs: 800 })
    globalThis.AudioContext = function () { return ac }
    const { playTimerChime } = await import('./timerChime.js')
    const p = playTimerChime()
    await vi.advanceTimersByTimeAsync(900)
    expect(await p).toBe(true)
  })
  it('gives up (so the click-for-sound cue shows) when the context never resumes', async () => {
    vi.useFakeTimers()
    const ac = { ...fakeContext({ resumeAfterMs: 1 }), resume: () => new Promise(() => {}) }
    globalThis.AudioContext = function () { return ac }
    const { playTimerChime } = await import('./timerChime.js')
    const p = playTimerChime()
    await vi.advanceTimersByTimeAsync(5000)
    expect(await p).toBe(false)
  })
})
