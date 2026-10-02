// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@sentry/react', () => ({ captureMessage: vi.fn(), addBreadcrumb: vi.fn() }))
vi.mock('../../../lib/youtubeWarmAudio.js', () => ({ warmYoutubeAudio: vi.fn(), claimYoutubeAudio: vi.fn() }))
vi.mock('../../../lib/audioNormalize.js', () => ({ analyzeAudioGain: vi.fn(async () => 3) }))

// The rules alert: three beeps scheduled on the audio clock, then Ben's voice line. The strobe
// and the reveal are driven by the REAL end of both, so these tests pin: the sequence order, the
// reveal-exactly-once, a locked tab, a cancel mid-sequence, and a dead/refused voice clip.
let made
class FakeAC {
  constructor(state) {
    this.state = state
    this.currentTime = 1
    this.destination = {}
    this.sources = []
    this.gains = []
    made.push(this)
  }
  addEventListener() {}
  createGain() { const g = { gain: { value: 1 }, connect() {}, disconnect() {} }; this.gains.push(g); return g }
  createMediaElementSource() { return { connect() {}, disconnect() {} } }
  createBufferSource() {
    const s = { buffer: null, playbackRate: { value: 1 }, connect() {}, start: vi.fn(), stop: vi.fn(), onended: null }
    this.sources.push(s)
    return s
  }
  decodeAudioData() { return Promise.resolve({}) }
  resume() { return this.state === 'running' ? Promise.resolve() : new Promise(() => {}) }
}

let mod, director
const flush = async () => { await vi.advanceTimersByTimeAsync(0); await vi.advanceTimersByTimeAsync(0) }
const psa = () => document.querySelector('audio')

beforeEach(async () => {
  vi.useFakeTimers()
  vi.resetModules()
  made = []
  globalThis.fetch = vi.fn(async () => ({ arrayBuffer: async () => new ArrayBuffer(8), blob: async () => new Blob(['x']) }))
  HTMLMediaElement.prototype.play = vi.fn(function () { Object.defineProperty(this, 'paused', { value: false, configurable: true }); return Promise.resolve() })
  Object.defineProperty(HTMLMediaElement.prototype, 'readyState', { get: () => 4, configurable: true })
  globalThis.AudioContext = class extends FakeAC { constructor() { super('running') } }
  director = (await import('../../../audio/director.js')).director
  mod = await import('./RulesSlide.jsx')
})
afterEach(() => { director._internals.reset(); vi.useRealTimers(); delete globalThis.AudioContext })

const endBeeps = ctx => ctx.sources.at(-1).onended()

describe('playAlertSequence', () => {
  it('schedules three beeps 1.65/2 s apart at 2x speed on the ONE shared context', async () => {
    const done = vi.fn()
    mod.playAlertSequence(done, { cancelled: false }, 'rules-1')
    await flush()
    expect(made).toHaveLength(1)
    const src = made[0].sources
    expect(src).toHaveLength(3)
    expect(src.every(s => s.playbackRate.value === 2)).toBe(true)
    const t0 = src[0].start.mock.calls[0][0]
    expect(src[1].start).toHaveBeenCalledWith(t0 + mod.RULES_BEEP_DURATION_S)
    expect(src[2].start).toHaveBeenCalledWith(t0 + 2 * mod.RULES_BEEP_DURATION_S)
    expect(done).not.toHaveBeenCalled()
    expect(psa()).toBeNull() // the voice line waits for the LAST beep's real end
  })

  it('after the last beep ends the voice line plays (loudness-corrected), and the reveal fires once when IT ends', async () => {
    const done = vi.fn()
    mod.playAlertSequence(done, { cancelled: false }, 'rules-1')
    await flush()
    endBeeps(made[0])
    await flush()
    expect(psa().getAttribute('src')).toBe('/rules-psa.mp3')
    expect(done).not.toHaveBeenCalled()
    psa().dispatchEvent(new Event('ended'))
    expect(done).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(20_000)
    expect(done).toHaveBeenCalledTimes(1)
    expect(made).toHaveLength(1) // still one context: the voice boost is the director's gain node, not a second AudioContext
  })

  it('a locked tab skips the sound, reveals right away, and is reported', async () => {
    globalThis.AudioContext = class extends FakeAC { constructor() { super('suspended') } }
    const done = vi.fn()
    mod.playAlertSequence(done, { cancelled: false }, 'rules-1')
    await vi.advanceTimersByTimeAsync(2000)
    expect(done).toHaveBeenCalledTimes(1)
    expect(made[0].sources).toHaveLength(0)
    const Sentry = await import('@sentry/react')
    expect(Sentry.captureMessage).toHaveBeenCalledWith('audio: play blocked (rules alert)', expect.anything())
  })

  it('stopAlertSequence mid-beeps silences them and never starts the voice line or the reveal', async () => {
    const done = vi.fn()
    const handles = { cancelled: false }
    mod.playAlertSequence(done, handles, 'rules-1')
    await flush()
    mod.stopAlertSequence(handles)
    expect(made[0].sources.every(s => s.stop.mock.calls.length > 0)).toBe(true)
    endBeeps(made[0])
    await flush()
    expect(psa()).toBeNull()
    expect(done).not.toHaveBeenCalled()
  })

  it('stopAlertSequence during the voice line cuts it and does not reveal', async () => {
    const done = vi.fn()
    const handles = { cancelled: false }
    mod.playAlertSequence(done, handles, 'rules-1')
    await flush()
    endBeeps(made[0])
    await flush()
    expect(psa()).toBeTruthy()
    mod.stopAlertSequence(handles)
    expect(psa()).toBeNull()
    expect(done).not.toHaveBeenCalled()
  })

  it('a dead voice file reveals instead of leaving the screen strobing', async () => {
    HTMLMediaElement.prototype.play = vi.fn(() => Promise.reject(new DOMException('no source', 'NotSupportedError')))
    const done = vi.fn()
    mod.playAlertSequence(done, { cancelled: false }, 'rules-1')
    await flush()
    endBeeps(made[0])
    await flush()
    await vi.advanceTimersByTimeAsync(100)
    expect(done).toHaveBeenCalledTimes(1)
  })

  it('a refused voice line (autoplay block) reveals 2s later', async () => {
    HTMLMediaElement.prototype.play = vi.fn(() => Promise.reject(new DOMException('blocked', 'NotAllowedError')))
    const done = vi.fn()
    mod.playAlertSequence(done, { cancelled: false }, 'rules-1')
    await flush()
    endBeeps(made[0])
    await flush()
    expect(done).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(2100)
    expect(done).toHaveBeenCalledTimes(1)
    expect(psa()).toBeNull() // released: a later click cannot bring the voice line back over the rules
  })

  it('stopAlertSequence while the voice line\'s loudness is still being measured never plays it', async () => {
    const { analyzeAudioGain } = await import('../../../lib/audioNormalize.js')
    let release
    analyzeAudioGain.mockReset()
    analyzeAudioGain.mockImplementationOnce(async () => 3) // the beep's
    analyzeAudioGain.mockImplementationOnce(() => new Promise(r => { release = r })) // the voice line's: pending
    const done = vi.fn()
    const handles = { cancelled: false }
    mod.playAlertSequence(done, handles, 'rules-1')
    await flush()
    endBeeps(made[0])
    await flush()
    mod.stopAlertSequence(handles)
    release(6)
    await flush()
    expect(psa()).toBeNull()
    expect(done).not.toHaveBeenCalled()
  })

  it('the voice line gets its own loudness correction (not the beep\'s)', async () => {
    const { analyzeAudioGain } = await import('../../../lib/audioNormalize.js')
    analyzeAudioGain.mockReset()
    analyzeAudioGain.mockImplementationOnce(async () => 3) // beep
    analyzeAudioGain.mockImplementationOnce(async () => 6) // voice line
    mod.playAlertSequence(vi.fn(), { cancelled: false }, 'rules-1')
    await flush()
    endBeeps(made[0])
    await flush()
    expect(made[0].gains.some(g => Math.abs(g.gain.value - Math.pow(10, 6 / 20)) < 1e-6)).toBe(true)
  })
})
