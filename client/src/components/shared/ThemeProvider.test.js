import { describe, it, expect } from 'vitest'
import { applyOverrides } from './ThemeProvider.jsx'
import { getTheme } from '../../themes/index.js'
import { contrastRatio } from '../../lib/contrast.js'

describe('applyOverrides — highlight contrast floor', () => {
  it('floors a low-contrast highlight override against bg/bgDeep', () => {
    const base = getTheme('pure-michigan')
    // Same hex as base.colors.bg — the exact shape of the live bug: a host
    // picks a highlight that blends into the background, blanking out the
    // #1 team's name/score on ScoreboardOverlay.jsx.
    const overrides = { colors: { highlight: base.colors.bg } }
    const themed = applyOverrides(base, overrides)
    expect(contrastRatio(themed.colors.highlight, themed.colors.bg)).toBeGreaterThanOrEqual(3)
    expect(contrastRatio(themed.colors.highlight, themed.colors.bgDeep)).toBeGreaterThanOrEqual(3)
  })

  it('leaves accent unfloored (still decorative-only)', () => {
    const base = getTheme('pure-michigan')
    const overrides = { colors: { accent: base.colors.bg } }
    const themed = applyOverrides(base, overrides)
    expect(themed.colors.accent).toBe(base.colors.bg)
  })
})
