import { describe, it, expect } from 'vitest'
import { relativeLuminance, contrastRatio, ensureLegibleTextColor } from './colorContrast.js'

describe('relativeLuminance', () => {
  it('white is 1, black is 0', () => {
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 2)
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 2)
  })
})

describe('contrastRatio', () => {
  it('white on black is 21:1', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 0)
  })
})

describe('ensureLegibleTextColor', () => {
  it('passes through a color that already meets the floor', () => {
    // #e2ccff against luma-34-equivalent bg easily clears 7:1
    const result = ensureLegibleTextColor('#e2ccff', '#222222')
    expect(result).toBe('#e2ccff')
  })
  it('lightens a color that fails the floor, preserving hue', () => {
    // #4a1a8f (Midnight Galaxy's real theme.colors.accent) against a dark bg
    // is the actual live bug this fix closes - roughly 1.4:1, must be lightened
    const result = ensureLegibleTextColor('#4a1a8f', '#222222')
    expect(contrastRatio(result, '#222222')).toBeGreaterThanOrEqual(7)
    expect(relativeLuminance(result)).toBeGreaterThanOrEqual(0.45)
  })
})
