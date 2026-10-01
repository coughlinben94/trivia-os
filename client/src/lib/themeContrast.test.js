import { describe, it, expect } from 'vitest'
import { THEMES } from '../themes/index.js'
import { contrastRatio, floorContrast } from './contrast.js'

// Answer reveal + question counter render theme.colors.text on theme.colors.bg.
describe('theme text vs bg contrast', () => {
  it('covers all 22 themes', () => expect(THEMES).toHaveLength(22))
  for (const t of THEMES) {
    it(`${t.id}: text on bg >= 4.5`, () => {
      expect(contrastRatio(t.colors.text, t.colors.bg)).toBeGreaterThanOrEqual(4.5)
    })
  }
})

// Phase 3d-1: phones theme themselves only from these colors (Join.jsx), so
// haunted-october gets the same 7:1 floor as space for body text. Join.jsx
// uses `accent` only as a fill/border/spinner (never as text color); its
// text-on-accent buttons are '#fff' on solid accent.
describe('haunted-october phone palette (3d-1)', () => {
  const c = THEMES.find(t => t.id === 'haunted-october').colors
  it('text on bg and bgDeep >= 7', () => {
    expect(contrastRatio(c.text, c.bg)).toBeGreaterThanOrEqual(7)
    expect(contrastRatio(c.text, c.bgDeep)).toBeGreaterThanOrEqual(7)
    expect(floorContrast(c.text, [c.bg, c.bgDeep], 7)).toBe(c.text)
  })
  it('highlight on bg >= 7', () => {
    expect(contrastRatio(c.highlight, c.bg)).toBeGreaterThanOrEqual(7)
  })
  it('#fff button text on solid accent >= 7', () => {
    expect(contrastRatio('#ffffff', c.accent)).toBeGreaterThanOrEqual(7)
  })
  // KNOWN SHORTFALL (palette is Ben's, not edited here): accent on bg is
  // ~2.58:1, under the 3:1 non-text UI floor. it.fails flips red the day
  // the palette clears 3:1, so this line gets promoted to a plain it().
  it.fails('accent on bg >= 3 (currently ~2.58)', () => {
    expect(contrastRatio(c.accent, c.bg)).toBeGreaterThanOrEqual(3)
  })
})
