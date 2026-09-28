// Frozen snapshot of what ringWorldFor() returns for the space world, captured on
// pre-Halloween code (origin/main 08f249c). Halloween Phase 1 must leave these
// byte-identical. Update ONLY on purpose: `npx vitest run -u <this file>` and say why in the commit.
import { describe, it, expect } from 'vitest'
import { ringWorldFor } from './ringWorldFor.js'
import { getTheme } from '../themes/index.js'

const theme = getTheme('midnight-galaxy')
const keysOf = w => w.stations.map(s => `${s.key}|${s.prim}|${s.hue}`)

describe('ringWorldFor snapshot (space world)', () => {
  it.each([undefined, 'a', 'show-1', 'show-2', 'trivia-2026-09-28'])('showId=%s', (showId) => {
    const w = ringWorldFor(theme, showId)
    expect(keysOf(w)).toMatchSnapshot()
    expect(w.stations[10].key).toBe('eclipse')
  })
  it('worldPalette tier stays on the fixed authored order', () => {
    const t = { ...theme, worldPalette: { colors: ['#ff2200', '#ffd400'], weights: [0.55, 0.45] } }
    expect(keysOf(ringWorldFor(t, 'show-1'))).toMatchSnapshot()
  })
  it('non-ring theme has no world', () => {
    expect(ringWorldFor(getTheme('pure-michigan'), 'a')).toBeUndefined()
  })
  it('full world data (sky, tints, anchors) unchanged for no showId', () => {
    const w = ringWorldFor(theme, undefined)
    expect(JSON.parse(JSON.stringify(w))).toMatchSnapshot()
  })
})
