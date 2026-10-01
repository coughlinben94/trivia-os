// Forest world data (Halloween forest spec §2.4, Phase 3b-3).
import { describe, it, expect, vi, afterEach } from 'vitest'
import { makeHauntedWorld } from './hauntedOctober.world.js'
import { makeForest } from './forest/forestGen.js'
import { getTheme } from '../themes/index.js'
import { contrastRatio } from '../lib/contrast.js'
import { readFileSync } from 'node:fs'

describe('makeHauntedWorld', () => {
  const w = makeHauntedWorld()

  it('returns the validated forest world shape', () => {
    expect(w).toMatchObject({
      renderer: 'forest', id: 'haunted-october', type: 'terrestrial', name: 'Haunted October',
      approved: false, layers: { stars: false }, musicStation: 10, walk: { durMs: 4000, stepM: 6 },
    })
    expect(w.stations).toHaveLength(13)
    expect(new Set(w.stations.map(s => s.key)).size).toBe(13)
    expect(w.stations[w.musicStation].key).toBe('harvest moon')
    expect(w.sky).toHaveLength(4)
    for (const c of w.sky) expect(c).toMatch(/^#[0-9a-f]{6}$/i)
    // WarpTransition reads these on every grading-break warp.
    expect(w.tints.starTint3).toMatch(/^#[0-9a-f]{6}$/i)
    expect(w.tints.drift).toMatch(/^#[0-9a-f]{6}$/i)
    expect(w.tints.starTint3).toBe(getTheme('haunted-october').colors.highlight)
  })

  it('station keys are forestGen\'s landmark names in order (station 10 renamed harvest moon)', () => {
    const names = makeForest().names
    expect(w.stations.map(s => s.key)).toEqual(names.map((n, i) => (i === 10 ? 'harvest moon' : n)))
  })
})

describe('phone skies (/join Tier 2 backdrop)', () => {
  const w = makeHauntedWorld()
  const skies = w.phone.skies
  const scene = readFileSync(new URL('./forest/forestScene.js', import.meta.url), 'utf8')
  const gen = readFileSync(new URL('./forest/forestGen.js', import.meta.url), 'utf8')

  it('13 entries of {top, mid, horizon} valid hex', () => {
    expect(skies).toHaveLength(13)
    for (const s of skies) {
      expect(Object.keys(s).sort()).toEqual(['horizon', 'mid', 'top'])
      for (const c of Object.values(s)) expect(c).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it('derived from the TV sky: base gradient + the three .sl sky cards, composited', () => {
    // Source colors still exist where the derivation says they come from.
    for (const src of ['#08090b 48px', '#16171a 468px', '#28292b 738px', 'data-st="0"', 'rgba(150,86,40,.32)', 'data-st="3"', "'#b4c6de', .21", 'data-st="10"']) {
      expect(scene).toContain(src)
    }
    expect(gen).toContain('<stop offset="0" stop-color="#e88a3a" stop-opacity=".4"/>')
    expect(gen).toContain('<stop offset=".35" stop-color="#c8662a" stop-opacity=".15"/>')
    const base = { top: '#08090b', mid: '#16171a', horizon: '#28292b' }
    for (const st of [1, 2, 4, 5, 6, 7, 8, 9, 11, 12]) expect(skies[st]).toEqual(base)
    // Hand-computed composites (round(base*(1-a) + card*a) per channel).
    expect(skies[0]).toEqual({ ...base, horizon: '#4b372a' })   // 40*.68+150*.32=75.2 ...
    expect(skies[3]).toEqual({ top: '#181b1f', mid: '#373c43', horizon: '#2e3033' })
    expect(skies[10]).toEqual({ top: '#623d1e', mid: '#31231c', horizon: '#28292b' })
  })

  it('cream theme text clears 7:1 on every station band (brightest pixel = lightest band)', () => {
    const text = getTheme('haunted-october').colors.text
    expect(text).toBe('#fff1dc')
    for (const s of skies) for (const c of Object.values(s)) expect(contrastRatio(text, c)).toBeGreaterThanOrEqual(7)
  })
})

describe('THEMES entry missing', () => {
  afterEach(() => {
    vi.doUnmock('../themes/index.js')
    vi.resetModules()
    vi.restoreAllMocks()
  })

  it('makeHauntedWorld returns null + console.error; ringWorldFor still loads and space resolves', async () => {
    vi.resetModules()
    vi.doMock('../themes/index.js', async (importOriginal) => {
      const mod = await importOriginal()
      return { ...mod, THEMES: mod.THEMES.filter(t => t.id !== 'haunted-october') }
    })
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { makeHauntedWorld: make } = await import('./hauntedOctober.world.js')
    expect(make()).toBeNull()
    expect(err).toHaveBeenCalledWith(expect.stringContaining('haunted-october'))

    const { RING_WORLDS, ringWorldFor, isPickableWorld } = await import('../lib/ringWorldFor.js')
    expect(RING_WORLDS['haunted-october']).toBeUndefined()
    expect(ringWorldFor({ id: 'haunted-october' })).toBeUndefined()
    const space = ringWorldFor({ id: 'midnight-galaxy', colors: { text: '#fff', textMuted: '#aaa' } })
    expect(space).toBe(RING_WORLDS['midnight-galaxy'])
    expect(space.stations[10].key).toBe('eclipse')
    expect(isPickableWorld('midnight-galaxy')).toBe(true)
  })
})
