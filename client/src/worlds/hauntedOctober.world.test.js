// Forest world data (Halloween forest spec §2.4, Phase 3b-3).
import { describe, it, expect, vi, afterEach } from 'vitest'
import { makeHauntedWorld } from './hauntedOctober.world.js'
import { makeForest } from './forest/forestGen.js'
import { getTheme } from '../themes/index.js'

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
