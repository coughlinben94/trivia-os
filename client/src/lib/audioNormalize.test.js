import { describe, it, expect, vi, afterEach } from 'vitest'
import { analyzeAudioGain } from './audioNormalize.js'

// analyzeAudioGain decodes a file and returns the dB correction to reach -20 dB RMS (clamped
// +-12, peak-guarded). It must decode on an OfflineAudioContext: no running AudioContext is
// created (the audio director owns the one shared context).
afterEach(() => { delete globalThis.OfflineAudioContext; delete globalThis.AudioContext })

function withBuffer(samples) {
  const ctors = { offline: 0, live: 0 }
  globalThis.OfflineAudioContext = class { constructor() { ctors.offline++ } decodeAudioData() { return Promise.resolve({ numberOfChannels: 1, getChannelData: () => samples }) } }
  globalThis.AudioContext = class { constructor() { ctors.live++ } }
  return ctors
}
const file = { arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }

describe('analyzeAudioGain', () => {
  it('decodes on an OfflineAudioContext and never builds a live AudioContext', async () => {
    const ctors = withBuffer(new Float32Array([0.1, -0.1, 0.1, -0.1]))
    await analyzeAudioGain(file)
    expect(ctors).toEqual({ offline: 1, live: 0 })
  })

  it('a quiet clip is boosted toward -20 dB RMS (here +6 dB: rms 0.1 -> -20 dB is already target; 0.05 needs +6)', async () => {
    withBuffer(new Float32Array(100).fill(0.05).map((v, i) => (i % 2 ? -v : v)))
    const db = await analyzeAudioGain(file)
    expect(db).toBeCloseTo(6.02, 1)
  })

  it('a hot clip is reduced', async () => {
    withBuffer(new Float32Array(100).fill(0.5).map((v, i) => (i % 2 ? -v : v)))
    expect(await analyzeAudioGain(file)).toBeLessThan(0)
  })

  it('silence and decode failures give 0, never throw', async () => {
    withBuffer(new Float32Array(10))
    expect(await analyzeAudioGain(file)).toBe(0)
    globalThis.OfflineAudioContext = class { decodeAudioData() { return Promise.reject(new Error('bad')) } }
    expect(await analyzeAudioGain(file)).toBe(0)
  })
})
