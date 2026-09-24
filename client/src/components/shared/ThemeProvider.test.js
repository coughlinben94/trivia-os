import { describe, it, expect } from 'vitest'
import { applyOverrides } from './ThemeProvider.jsx'
import { getTheme } from '../../themes/index.js'
import { contrastRatio } from '../../lib/contrast.js'
import { ringWorldFor } from '../../lib/ringWorldFor.js'
import { midnightGalaxyRing } from '../../worlds/midnightGalaxy.ring.js'
import { RING_VERSION } from '../../lib/ringCertification.js'

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

describe('applyOverrides — ringWorld round-trip (regression: a drawn-world pick used to be dropped here, making the whole feature inert)', () => {
  it('carries overrides.ringWorld through to a theme ringWorldFor can resolve into the reordered stations', () => {
    const base = getTheme('midnight-galaxy')
    const authoredKeys = midnightGalaxyRing.stations.map(s => s.key)
    const swappedKeys = authoredKeys.map((k, i) => (i === 0 ? authoredKeys[10] : i === 10 ? authoredKeys[0] : k))
    const overrides = {
      ringWorld: {
        rowId: 'row-1',
        seed: 'showSeed:abc',
        ringVersion: RING_VERSION,
        stations: swappedKeys,
        palette: { colors: ['#22c55e', '#eab308'], weights: [0.5, 0.5], drift: { arc: 30 } },
      },
    }

    const themed = applyOverrides(base, overrides)
    const world = ringWorldFor(themed)

    expect(world.stations.map(s => s.key)).toEqual(swappedKeys)
  })
})
