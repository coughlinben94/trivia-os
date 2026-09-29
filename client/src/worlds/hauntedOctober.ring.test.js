import { describe, it, expect } from 'vitest'
import { hauntedOctoberRing } from './hauntedOctober.ring.js'
import { RING_WORLDS, isPickableWorld, ringWorldFor } from '../lib/ringWorldFor.js'
import { RING_VERSION } from '../lib/ringCertification.js'
import { THEMES, getTheme } from '../themes/index.js'
import { contrastRatio } from '../lib/contrast.js'

describe('haunted-october registration (Phase 1 stub)', () => {
  it('is registered and has the 13-station contract', () => {
    expect(RING_WORLDS['haunted-october']).toBe(hauntedOctoberRing)
    expect(hauntedOctoberRing.stations).toHaveLength(13)
    expect(hauntedOctoberRing.slots).toHaveLength(13)
    expect(hauntedOctoberRing.stations[hauntedOctoberRing.musicStation].key).toBe('harvest moon')
    expect(hauntedOctoberRing.stations[hauntedOctoberRing.pinAt].key).toBe(hauntedOctoberRing.pinKey)
  })

  it('theme text clears the 7:1 floor the space world uses', () => {
    const t = getTheme('haunted-october')
    expect(t.id).toBe('haunted-october')
    expect(t.fonts).toEqual({ display: 'Boogaloo', body: 'DM Sans', ui: 'DM Sans' })
    expect(contrastRatio(t.colors.text, t.colors.bg)).toBeGreaterThanOrEqual(7)
    for (const q of hauntedOctoberRing.qColours) expect(contrastRatio(q, t.colors.bgDeep)).toBeGreaterThanOrEqual(7)
  })

  it('leaves the bespoke halloween theme untouched', () => {
    const h = THEMES.find(t => t.id === 'halloween')
    expect(h.colors).toEqual({ bg: '#060008', bgDeep: '#030005', accent: '#380858', highlight: '#a000ff', text: '#e0c0f8', textMuted: '#604080', shinyBg: '#0a0010', shinyAccent: '#ff6800' })
    expect(RING_WORLDS.halloween).toBeUndefined()
  })
})

describe('ringWorldFor: autoDraw off keeps the fixed authored order', () => {
  const keys = w => w.stations.map(s => s.key)
  const authored = keys(hauntedOctoberRing)
  const theme = getTheme('haunted-october')
  it.each([undefined, 'a', 'show-1', 'trivia-2026-10-31'])('showId=%s', (showId) => {
    expect(ringWorldFor(theme, showId)).toBe(hauntedOctoberRing)
  })
  it('ignores a saved ringWorld arrangement', () => {
    const saved = { ...theme, ringWorld: { ringVersion: RING_VERSION, stations: [...authored].reverse(), palette: { colors: ['#ff2200'], weights: [1] } } }
    expect(keys(ringWorldFor(saved, 'show-1'))).toEqual(authored)
  })
})

describe('host pickers: isPickableWorld', () => {
  it('offers space, hides the unapproved world and every non-ring theme', () => {
    expect(isPickableWorld('midnight-galaxy')).toBe(true)
    expect(isPickableWorld('haunted-october')).toBe(false)
    expect(isPickableWorld('halloween')).toBe(false)
    expect(isPickableWorld('pure-michigan')).toBe(false)
    // Same list both pickers render (LiveMode filters THEMES by this alone).
    expect(THEMES.filter(t => isPickableWorld(t.id)).map(t => t.id)).toEqual(['midnight-galaxy'])
  })
})
