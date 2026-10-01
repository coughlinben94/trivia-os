import { describe, it, expect } from 'vitest'
import { TEAM_COLORS, TEAM_COLOR_NAMES, TEAM_EMOJIS, teamNameError, emojisByName, normalizeTeamName, freeColors, pickFreeColor, colorsByName } from './teamColors.js'

describe('TEAM_COLORS', () => {
  it('is the 10-color palette, every entry named', () => {
    expect(TEAM_COLORS).toHaveLength(10)
    expect(new Set(TEAM_COLORS).size).toBe(10)
    for (const c of TEAM_COLORS) expect(TEAM_COLOR_NAMES[c]).toBeTruthy()
  })
})

describe('normalizeTeamName', () => {
  it('trims and lowercases', () => {
    expect(normalizeTeamName('  Quiz Khalifa ')).toBe('quiz khalifa')
  })
  it('tolerates null/undefined', () => {
    expect(normalizeTeamName(null)).toBe('')
    expect(normalizeTeamName(undefined)).toBe('')
  })
})

describe('freeColors', () => {
  it('returns the palette minus taken, in palette order', () => {
    expect(freeColors([TEAM_COLORS[0], TEAM_COLORS[2]])).toEqual(
      TEAM_COLORS.filter((_, i) => i !== 0 && i !== 2))
  })
  it('matches hex case-insensitively and ignores null/off-palette entries', () => {
    expect(freeColors([TEAM_COLORS[1].toUpperCase(), null, '#123456'])).toEqual(
      TEAM_COLORS.filter((_, i) => i !== 1))
  })
  it('handles no taken list', () => {
    expect(freeColors()).toEqual(TEAM_COLORS)
  })
})

describe('pickFreeColor', () => {
  it('keeps the preferred color when free', () => {
    expect(pickFreeColor([], TEAM_COLORS[4])).toBe(TEAM_COLORS[4])
  })
  it('defaults to the first free color with no preference', () => {
    expect(pickFreeColor([TEAM_COLORS[0]])).toBe(TEAM_COLORS[1])
  })
  it('moves to the next free color after a taken preference', () => {
    expect(pickFreeColor([TEAM_COLORS[4], TEAM_COLORS[5]], TEAM_COLORS[4])).toBe(TEAM_COLORS[6])
  })
  it('wraps around the palette', () => {
    const taken = TEAM_COLORS.slice(1)
    expect(pickFreeColor(taken, TEAM_COLORS[9])).toBe(TEAM_COLORS[0])
  })
  it('allows a repeat when every color is taken', () => {
    expect(pickFreeColor(TEAM_COLORS, TEAM_COLORS[3])).toBe(TEAM_COLORS[3])
    expect(pickFreeColor(TEAM_COLORS)).toBe(TEAM_COLORS[0])
  })
  it('treats an off-palette preference as no preference', () => {
    expect(pickFreeColor([TEAM_COLORS[0]], '#123456')).toBe(TEAM_COLORS[1])
  })
})

describe('colorsByName', () => {
  it('maps normalized name to color, skipping rows without a color', () => {
    const map = colorsByName([
      { name: ' Quiz Khalifa', color: '#f5c842' },
      { name: 'No Color', color: null },
      { name: null, color: '#e02020' },
    ])
    expect(map.get('quiz khalifa')).toBe('#f5c842')
    expect(map.has('no color')).toBe(false)
    expect(map.size).toBe(1)
  })
  it('tolerates null input', () => {
    expect(colorsByName(null).size).toBe(0)
  })
})

describe('teamNameError / emojis', () => {
  it('accepts letters, spaces, apostrophes, hyphens', () => {
    for (const n of ['Quiz Whiz', "O'Brien Crew", 'Anne-Marie', 'Zoë Fans', 'Beer Pressure']) {
      expect(teamNameError(n)).toBeNull()
    }
  })
  it('rejects digits, symbols, emoji, empty, too long', () => {
    for (const n of ['Team 7', 'Les!', '🔥 Fire', 'a_b', '', '   ', 'x'.repeat(31)]) {
      expect(teamNameError(n)).not.toBeNull()
    }
  })
  it('emojisByName keys by normalized name and skips blanks', () => {
    const m = emojisByName([{ name: ' Foo ', emoji: '🦊' }, { name: 'Bar', emoji: null }])
    expect(m.get('foo')).toBe('🦊')
    expect(m.has('bar')).toBe(false)
  })
  it('every preset emoji fits the 16-char DB limit and is unique', () => {
    expect(new Set(TEAM_EMOJIS).size).toBe(TEAM_EMOJIS.length)
    for (const e of TEAM_EMOJIS) expect(e.length).toBeLessThanOrEqual(16)
  })
})
