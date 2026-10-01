import { describe, it, expect, vi, afterEach } from 'vitest'

// The chime waits a moment for a suspended AudioContext to resume. A resume that
// succeeds a little late (a busy TV tab) must still ring, not show "click for sound".
function fakeContext({ resumeAfterMs }) {
  const ac = {
    state: 'suspended', currentTime: 0, destination: {},
    resume: () => new Promise(r => setTimeout(() => { ac.state = 'running'; r() }, resumeAfterMs)),
    createOscillator: () => ({ type: '', frequency: {}, connect: n => n, start: vi.fn(), stop: vi.fn() }),
    createGain: () => ({ gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: n => n }),
  }
  return ac
}

afterEach(() => { vi.useRealTimers(); vi.resetModules(); delete globalThis.AudioContext })

describe('playTimerChime', () => {
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
