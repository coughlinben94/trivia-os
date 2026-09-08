import { describe, it, expect } from 'vitest'
import { computeRmsEnvelope, resampleEnvelope, normalizeEnvelope } from './bendleAudioAnalysis.js'

describe('computeRmsEnvelope', () => {
  it('returns one window of 0 for silence', () => {
    const silence = new Float32Array(4410) // 0.1s @ 44100
    expect(computeRmsEnvelope(silence, 44100, 0.1)).toEqual([0])
  })

  it('computes RMS for a constant-amplitude signal', () => {
    const samples = new Float32Array(100).fill(0.5)
    const windows = computeRmsEnvelope(samples, 100, 0.5) // 2 windows of 50 samples
    expect(windows).toHaveLength(2)
    windows.forEach(w => expect(w).toBeCloseTo(0.5, 5))
  })

  it('handles a final partial window', () => {
    const samples = new Float32Array(120).fill(1)
    const windows = computeRmsEnvelope(samples, 100, 1) // window size 100, 120 samples -> 2 windows
    expect(windows).toHaveLength(2)
    expect(windows[1]).toBeCloseTo(1, 5) // partial window, still all 1s
  })
})

describe('resampleEnvelope', () => {
  it('averages source values into fewer buckets', () => {
    expect(resampleEnvelope([0, 0, 10, 10], 2)).toEqual([0, 10])
  })

  it('returns zeros for an empty envelope', () => {
    expect(resampleEnvelope([], 4)).toEqual([0, 0, 0, 0])
  })

  it('upsamples a short envelope without crashing', () => {
    const result = resampleEnvelope([5], 3)
    expect(result).toHaveLength(3)
    result.forEach(v => expect(v).toBe(5))
  })
})

describe('normalizeEnvelope', () => {
  it('scales values to [0, 1] against their own peak', () => {
    expect(normalizeEnvelope([0, 5, 10])).toEqual([0, 0.5, 1])
  })

  it('returns all zeros when every value is zero', () => {
    expect(normalizeEnvelope([0, 0, 0])).toEqual([0, 0, 0])
  })
})
