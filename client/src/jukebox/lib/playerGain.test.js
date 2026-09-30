import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { effectiveVolume } from './jukeboxControls.js'

const hook = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../hooks/useSpotifyPlayer.js'), 'utf8')
const monitorSection = hook.split('// ─── Position monitor')[1].split('// ─── Force a fresh')[0]
const fadeOutSection = hook.split('// ─── Fade out and pause')[1].split('// ─── Pause immediately')[0]

describe('effective player volume', () => {
  it('multiplies master and song gain, preserving zero and capping at one', () => {
    expect(effectiveVolume(0.8, 0.5)).toBe(0.4)
    expect(effectiveVolume(0, 2)).toBe(0)
    expect(effectiveVolume(0.8, 2)).toBe(1)
  })
  it('routes monitor, fade-in, fade-out, and manual volume through eff()', () => {
    expect(monitorSection).toMatch(/const maxVol = eff\(\)/)
    expect(hook).toMatch(/fadeVolume\(0, eff\(\), gen, fadeInMs\)/)
    expect(fadeOutSection).toMatch(/const maxVol = eff\(\)[\s\S]*?fadeVolume\(maxVol, 0, gen, STOP_FADE_MS\)/)
    expect(hook).toMatch(/setVolume\(eff\(\)\)/)
  })
  it('stores gain before the zero-volume play handoff and exposes setTrackGain', () => {
    expect(hook).toMatch(/genRef\.current \+= 1[\s\S]*?trackGainRef\.current = gain[\s\S]*?player\.setVolume\(0\)/)
    expect(hook).toMatch(/setTrackGain/)
  })
})
