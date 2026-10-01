import { describe, expect, it } from 'vitest'
import { chooseTarget, offsetFromLufs, validateMeasurement } from './loudness.js'

describe('offsetFromLufs', () => {
  it('computes a relative offset, rounded to tenths and clamped to gain bounds', () => {
    expect(offsetFromLufs(-20)).toBe(2)
    expect(offsetFromLufs(-18.04)).toBe(0)
    expect(offsetFromLufs(-60)).toBe(6)
    expect(offsetFromLufs(-5)).toBe(-8)
  })
})

describe('validateMeasurement', () => {
  const valid = { frames: 1_200_000, nonZeroFrames: 1_100_000, sampleRate: 48_000, peak: 0.9, lufs: -18 }
  it('accepts a sufficiently long, active capture', () => {
    expect(validateMeasurement(valid)).toEqual({ ok: true, reason: null })
  })
  it('accepts exact minimum duration and active-frame ratio boundaries', () => {
    expect(validateMeasurement({ ...valid, frames: 960_000, nonZeroFrames: 864_000 })).toEqual({ ok: true, reason: null })
  })
  it.each([
    [{ ...valid, frames: 900_000 }, 'too-short'],
    [{ ...valid, nonZeroFrames: 0 }, 'too-silent'],
    [{ ...valid, lufs: NaN }, 'invalid-lufs'],
    [{ ...valid, lufs: -51 }, 'invalid-lufs'],
    [{ ...valid, lufs: 1 }, 'invalid-lufs'],
  ])('rejects invalid capture: %s', (measurement, reason) => {
    expect(validateMeasurement(measurement)).toEqual({ ok: false, reason })
  })
})

describe('chooseTarget', () => {
  it('keeps the quietest tenth within master-volume headroom where possible', () => {
    const result = chooseTarget([-24, -22, -20, -18, -16, -14, -12, -10, -8, -6], { masterVolume: 0.8 })
    expect(result.headroomDb).toBeCloseTo(1.94, 1)
    expect(result.targetLufs).toBeLessThanOrEqual(-14)
    expect(result.targetLufs).toBeGreaterThanOrEqual(-24)
    expect(result.clippedQuietCount).toBe(0)
  })
  it('handles empty lists and extreme master volumes', () => {
    expect(chooseTarget([], { masterVolume: 0 })).toEqual({ targetLufs: -18, headroomDb: 0, clippedQuietCount: 0 })
    expect(chooseTarget([-30, -28], { masterVolume: 1 }).targetLufs).toBeGreaterThanOrEqual(-24)
  })
  it('reports quiet songs that cannot reach target inside headroom', () => {
    expect(chooseTarget([-30, -20, -18]).clippedQuietCount).toBe(1)
    expect(chooseTarget([-25, -20], { masterVolume: 0.8 }).targetLufs).toBe(-23.1)
    const decile = [-30, -20, ...Array.from({ length: 18 }, (_, i) => -19 + i / 2)]
    expect(chooseTarget(decile).targetLufs).toBe(-24)
    expect(chooseTarget(decile).clippedQuietCount).toBe(1)
  })
})
