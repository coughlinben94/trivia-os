import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import { REMOTE_LOOK, lookCssVars, lookFontsHref, LOOK_DERIVED } from './remoteLook.js'

const root = new URL('../../../', import.meta.url)
const read = rel => fs.readFileSync(new URL(rel, root), 'utf8')

describe('REMOTE_LOOK', () => {
  it('has exactly the Remote Look Lab "Copy settings" shape and Ben\'s values', () => {
    expect(REMOTE_LOOK).toEqual({
      colors: { night: '#0a1710', surface: '#13261a', raised: '#1b3324', text: '#f5f0e8', next: '#60c000', nextink: '#06200a', amber: '#f2b632', red: '#b8161a' },
      type: { display: 'Lilita One', body: 'Nunito' },
      sizes: { nextWordPx: 120, cuePx: 50, buttonHeightPx: 130, cornerRadiusPx: 35 },
    })
  })
})

describe('lookCssVars', () => {
  it('maps the default look to the --rl-* custom properties, fonts with real fallbacks', () => {
    const v = lookCssVars(REMOTE_LOOK)
    expect(Object.keys(v)).toEqual([
      '--rl-night', '--rl-surface', '--rl-raised', '--rl-text', '--rl-next', '--rl-nextink', '--rl-amber', '--rl-red',
      '--rl-display', '--rl-body', '--rl-word', '--rl-cue', '--rl-bh', '--rl-r',
    ])
    expect(v).toMatchObject({
      '--rl-night': '#0a1710', '--rl-text': '#f5f0e8', '--rl-next': '#60c000', '--rl-red': '#b8161a',
      '--rl-word': '120px', '--rl-cue': '50px', '--rl-bh': '130px', '--rl-r': '35px',
    })
    expect(v['--rl-display']).toMatch(/^"Lilita One", .*sans-serif$/)
    expect(v['--rl-body']).toMatch(/^"Nunito", .*sans-serif$/)
  })
  it('derived shades only reference the look vars, never a literal colour', () => {
    for (const val of Object.values(LOOK_DERIVED)) {
      expect(val).toMatch(/var\(--rl-/)
      expect(val).not.toMatch(/#[0-9a-f]{3,6}/i)
    }
  })
})

describe('lookFontsHref', () => {
  it('builds one Google Fonts stylesheet URL for both families, spaces as +, swap', () => {
    expect(lookFontsHref(REMOTE_LOOK)).toBe(
      'https://fonts.googleapis.com/css2?family=Lilita+One&family=Nunito:wght@400;600;700;800&display=swap',
    )
    expect(lookFontsHref({ ...REMOTE_LOOK, type: { display: 'Bebas Neue', body: 'Open Sans' } })).toBe(
      'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Open+Sans:wght@400;600;700;800&display=swap',
    )
  })
})

describe('drift guards', () => {
  it('the manifest colours match colors.night (the manifest cannot read the JS file)', () => {
    const m = JSON.parse(read('public/remote-manifest.json'))
    expect(m.theme_color).toBe(REMOTE_LOOK.colors.night)
    expect(m.background_color).toBe(REMOTE_LOOK.colors.night)
  })
  it('Remote.jsx has no hard-coded look colours or look fonts left', () => {
    const src = read('client/src/views/Remote.jsx')
    const old = ['#0a1710', '#13261a', '#1b3324', '#f5f0e8', '#60c000', '#06200a', '#f2b632', '#b8161a', '#58b000', '#244130', '#e4dfd6', '#1a1206', '#ff6b5e', '#a01215']
    for (const hex of old) expect(src.toLowerCase()).not.toContain(hex)
    expect(src).not.toMatch(/#[0-9a-f]{6}\b/i)
    expect(src).not.toMatch(/Boogaloo|DM Sans/)
  })
})
