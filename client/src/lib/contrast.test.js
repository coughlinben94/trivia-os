import { describe, it, expect } from 'vitest'
import { relativeLuminance, contrastRatio, floorContrast } from './contrast.js'

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

describe('floorContrast', () => {
  it('passes through a color that already clears the floor', () => {
    // #e2ccff against a near-black bg easily clears 7:1
    expect(floorContrast('#e2ccff', ['#222222'], 7)).toBe('#e2ccff')
  })

  it('lightens a color that fails the floor, preserving hue direction', () => {
    // #4a1a8f is Midnight Galaxy's real theme.colors.accent - the actual
    // live bug this fix closes. Raw contrast against the display bg is
    // ~1.8:1; midnightGalaxy.ring.js must never ship this as text.
    const bg = '#040010' // theme.colors.bgDeep
    expect(contrastRatio('#4a1a8f', bg)).toBeLessThan(2)
    const fixed = floorContrast('#4a1a8f', [bg], 7)
    expect(contrastRatio(fixed, bg)).toBeGreaterThanOrEqual(7)
  })

  it('clears the floor against every background when given more than one, using the default minRatio', () => {
    // mirrors ThemeProvider.jsx's real call shape: floorContrast(textMuted, [bg, bgDeep])
    const result = floorContrast('#2a1a3a', ['#08001a', '#040010'])
    expect(contrastRatio(result, '#08001a')).toBeGreaterThanOrEqual(3)
    expect(contrastRatio(result, '#040010')).toBeGreaterThanOrEqual(3)
  })
})
