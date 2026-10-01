// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@sentry/react', () => ({ captureMessage: vi.fn(), addBreadcrumb: vi.fn() }))
vi.mock('./youtubeWarmAudio.js', () => ({ warmYoutubeAudio: vi.fn(), claimYoutubeAudio: vi.fn() }))

import { playTimerChime, unlockTimerAudio } from './timerChime.js'
import { director } from '../audio/director.js'

// The host timer's "time's up" chime: three two-tone dings on the director's shared context.
let made
class FakeAC {
  constructor(state) {
    this.state = state
    this.currentTime = 2
    this.destination = {}
    this.oscs = []
    this.resumes = 0
    made.push(this)
  }
  addEventListener() {}
  createGain() { return { gain: { value: 1, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() { return this } } }
  createOscillator() { const o = { type: '', frequency: {}, connect() { return { connect() {} } }, start: vi.fn(), stop: vi.fn() }; this.oscs.push(o); return o }
  resume() { this.resumes++; return this.state === 'running' ? Promise.resolve() : new Promise(() => {}) }
}

beforeEach(() => { vi.useFakeTimers(); made = []; director._internals.reset() })
afterEach(() => { director._internals.reset(); vi.useRealTimers(); delete globalThis.AudioContext })

describe('playTimerChime', () => {
  it('rings six dings (3 x two notes, each with an overtone) on the shared running context and resolves true', async () => {
    globalThis.AudioContext = class extends FakeAC { constructor() { super('running') } }
    const ok = await playTimerChime()
    expect(ok).toBe(true)
    expect(made).toHaveLength(1)
    expect(made[0].oscs).toHaveLength(3 * 2 * 2)
  })

  it('resolves false (and schedules nothing) on a locked tab, so the overlay can show its cue', async () => {
    globalThis.AudioContext = class extends FakeAC { constructor() { super('suspended') } }
    const p = playTimerChime()
    await vi.advanceTimersByTimeAsync(1000)
    expect(await p).toBe(false)
    expect(made[0].oscs).toHaveLength(0)
  })

  it('a retry after the tab unlocked rings', async () => {
    let state = 'suspended'
    globalThis.AudioContext = class extends FakeAC { constructor() { super('suspended'); Object.defineProperty(this, 'state', { get: () => state }) } }
    const p = playTimerChime()
    await vi.advanceTimersByTimeAsync(1000)
    expect(await p).toBe(false)
    state = 'running'
    expect(await playTimerChime()).toBe(true)
    expect(made).toHaveLength(1) // the same context, not a second one
  })

  it('no AudioContext at all resolves false, never throws', async () => {
    const p = playTimerChime()
    await vi.advanceTimersByTimeAsync(1000)
    expect(await p).toBe(false)
  })

  it('unlockTimerAudio resumes the shared context and never throws', () => {
    globalThis.AudioContext = class extends FakeAC { constructor() { super('suspended') } }
    expect(() => unlockTimerAudio()).not.toThrow()
    expect(made[0].resumes).toBe(1)
  })
})
