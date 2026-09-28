import { describe, it, expect } from 'vitest'
import { THEMES } from '../themes/index.js'
import { contrastRatio } from './contrast.js'

// Answer reveal + question counter render theme.colors.text on theme.colors.bg.
describe('theme text vs bg contrast', () => {
  it('covers all 21 themes', () => expect(THEMES).toHaveLength(21))
  for (const t of THEMES) {
    it(`${t.id}: text on bg >= 4.5`, () => {
      expect(contrastRatio(t.colors.text, t.colors.bg)).toBeGreaterThanOrEqual(4.5)
    })
  }
})
