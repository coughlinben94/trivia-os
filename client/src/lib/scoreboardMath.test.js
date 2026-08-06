import { describe, it, expect } from 'vitest'
import { normalizeRoundScore, computeTotal, roundScoreTotal } from './scoreboardMath.js'

describe('normalizeRoundScore', () => {
  it('treats a legacy plain number as written-only', () => {
    expect(normalizeRoundScore(12)).toEqual({ written: 12, phone: 0 })
  })
  it('treats null/undefined as zero/zero', () => {
    expect(normalizeRoundScore(null)).toEqual({ written: 0, phone: 0 })
    expect(normalizeRoundScore(undefined)).toEqual({ written: 0, phone: 0 })
  })
  it('passes through an already-split value, defaulting missing halves to 0', () => {
    expect(normalizeRoundScore({ written: 8, phone: 6 })).toEqual({ written: 8, phone: 6 })
    expect(normalizeRoundScore({ written: 8 })).toEqual({ written: 8, phone: 0 })
    expect(normalizeRoundScore({ phone: 6 })).toEqual({ written: 0, phone: 6 })
  })
  it('treats a non-numeric legacy value as zero', () => {
    expect(normalizeRoundScore('')).toEqual({ written: 0, phone: 0 })
  })
})

describe('computeTotal', () => {
  const cols = [{ key: 'r_1', label: 'R1' }, { key: 'r_2', label: 'R2' }, { key: 'bonus', label: '?' }]

  it('sums legacy plain-number rounds same as before', () => {
    expect(computeTotal({ r_1: 10, r_2: 5, bonus: 2 }, cols)).toBe(17)
  })
  it('sums written+phone for split rounds', () => {
    expect(computeTotal({ r_1: { written: 10, phone: 0 }, r_2: { written: 8, phone: 6 }, bonus: 2 }, cols)).toBe(26)
  })
  it('sums a mixed show — some rounds legacy, some split', () => {
    expect(computeTotal({ r_1: 10, r_2: { written: 8, phone: 6 }, bonus: null }, cols)).toBe(24)
  })
  it('ignores keys not present in cols', () => {
    expect(computeTotal({ r_1: 10, r_99: 1000 }, [{ key: 'r_1', label: 'R1' }])).toBe(10)
  })
  it('returns 0 for missing/invalid scores object', () => {
    expect(computeTotal(null, cols)).toBe(0)
    expect(computeTotal(undefined, cols)).toBe(0)
  })
})

describe('roundScoreTotal', () => {
  it('returns a legacy plain number unchanged', () => {
    expect(roundScoreTotal(10)).toBe(10)
  })
  it('sums written+phone for a split round instead of NaN', () => {
    expect(roundScoreTotal({ written: 8, phone: 6 })).toBe(14)
  })
  it('returns 0 for null/undefined', () => {
    expect(roundScoreTotal(null)).toBe(0)
    expect(roundScoreTotal(undefined)).toBe(0)
  })
})
