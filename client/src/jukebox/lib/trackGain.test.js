import { describe, expect, it } from 'vitest'
import { GAIN_DB_MAX, GAIN_DB_MIN, songGain, slimSavedSong } from './track.js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

describe('songGain', () => {
  it('uses zero dB by default and converts valid dB to a linear ratio', () => {
    expect(songGain({})).toBe(1)
    expect(songGain({ gainDb: -6 })).toBeCloseTo(10 ** (-6 / 20))
  })
  it('treats non-finite or non-numeric values as zero and clamps bounds', () => {
    expect([NaN, Infinity, '3', null].map(gainDb => songGain({ gainDb }))).toEqual([1, 1, 1, 1])
    expect(GAIN_DB_MIN).toBe(-8)
    expect(GAIN_DB_MAX).toBe(6)
    expect(songGain({ gainDb: -80 })).toBeCloseTo(10 ** (-8 / 20))
    expect(songGain({ gainDb: 60 })).toBeCloseTo(10 ** (6 / 20))
  })
})

describe('slimSavedSong', () => {
  it('preserves per-song trim, gradient, and loudness audit fields', () => {
    expect(slimSavedSong({ id: 's', uri: 'spotify:track:s', name: 'Song', duration_ms: 40000, gainDb: 2.4, measuredLufs: -17.3, measuredAt: '2026-09-30', startMs: 20, stopMs: 30000, gradientOverride: '#123456', gradientOverride1: '#abcdef' })).toMatchObject({ gainDb: 2.4, measuredLufs: -17.3, measuredAt: '2026-09-30', startMs: 20, stopMs: 30000, gradientOverride: '#123456', gradientOverride1: '#abcdef' })
  })
})

describe('Jukebox save paths', () => {
  it('uses shared saved-song mapper for both persistence whitelists', () => {
    const source = readFileSync(resolve(root, 'components/Jukebox.jsx'), 'utf8')
    expect((source.match(/map\(slimSavedSong\)|\[slimSavedSong\(song\)/g) ?? []).length).toBe(2)
  })
})
