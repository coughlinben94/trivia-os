// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@sentry/react', () => ({ captureMessage: vi.fn(), addBreadcrumb: vi.fn() }))
vi.mock('../../../lib/youtubeWarmAudio.js', () => ({ warmYoutubeAudio: vi.fn(), claimYoutubeAudio: vi.fn() }))

import { ringBell, STRIKES, PARTIALS } from './LastCallSlide.jsx'
import { director } from '../../../audio/director.js'

// The bell is synthesized: STRIKES x PARTIALS oscillators scheduled on the audio clock. It must
// use the director's ONE shared context, never ring late on a locked tab, and never close it.
let made
class FakeAC {
  constructor(state) {
    this.state = state
    this.currentTime = 5
    this.destination = {}
    this.oscs = []
    this.closed = false
    made.push(this)
  }
  addEventListener() {}
  createGain() { return { gain: { value: 1, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} } }
  createOscillator() { const o = { frequency: {}, connect() {}, start: vi.fn(), stop: vi.fn() }; this.oscs.push(o); return o }
  resume() { return this.state === 'running' ? Promise.resolve() : new Promise(() => {}) }
  close() { this.closed = true; return Promise.resolve() }
}

beforeEach(() => {
  vi.useFakeTimers()
  made = []
  director._internals.reset()
})
afterEach(() => { director._internals.reset(); vi.useRealTimers(); delete globalThis.AudioContext })

describe('ringBell', () => {
  it('schedules every partial of every strike on the shared running context', async () => {
    globalThis.AudioContext = class extends FakeAC { constructor() { super('running') } }
    ringBell()
    await vi.advanceTimersByTimeAsync(0)
    expect(made).toHaveLength(1)
    expect(made[0].oscs).toHaveLength(STRIKES.length * PARTIALS.length)
    const t0 = 5 + 0.05
    expect(made[0].oscs[0].start).toHaveBeenCalledWith(t0 + STRIKES[0])
    expect(made[0].oscs[PARTIALS.length].start).toHaveBeenCalledWith(t0 + STRIKES[1])
  })

  it('two bells use ONE context, and the shared context is never closed', async () => {
    globalThis.AudioContext = class extends FakeAC { constructor() { super('running') } }
    ringBell()
    await vi.advanceTimersByTimeAsync(0)
    ringBell()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(made).toHaveLength(1)
    expect(made[0].closed).toBe(false)
  })

  it('a locked tab stays silent (nothing scheduled to ring late at the next click) and is reported', async () => {
    globalThis.AudioContext = class extends FakeAC { constructor() { super('suspended') } }
    ringBell()
    await vi.advanceTimersByTimeAsync(1000)
    expect(made[0].oscs).toHaveLength(0)
    const Sentry = await import('@sentry/react')
    expect(Sentry.captureMessage).toHaveBeenCalledWith('audio: play blocked (last-call bell)', expect.anything())
  })

  it('no AudioContext at all never throws', async () => {
    delete globalThis.AudioContext
    expect(() => ringBell()).not.toThrow()
    await vi.advanceTimersByTimeAsync(1000)
  })
})
