import { describe, it, expect } from 'vitest'
import { walkoutClip, WALKOUT_FADE_MS } from './walkoutAudio.js'
import { normalizeClip } from '../audio/clips.js'

describe('walkoutClip (audio-director clip)', () => {
  it('is null without a video', () => {
    expect(walkoutClip(null)).toBeNull()
    expect(walkoutClip({})).toBeNull()
    expect(walkoutClip({ videoId: '' })).toBeNull()
  })

  it('maps the editor fields to a director clip with an out-point instead of a player end', () => {
    expect(walkoutClip({ videoId: 'w', start: 12, end: 90, volume: 80 }, 'fade')).toEqual({
      kind: 'youtube', videoId: 'w', start: 12, volume: 80, outPoint: 90, onOut: 'fade', fadeMs: WALKOUT_FADE_MS, part: 0,
    })
  })

  it('defaults: start 0, volume 100, untrimmed (outPoint null)', () => {
    const c = walkoutClip({ videoId: 'w' }, 'loop')
    expect([c.start, c.volume, c.outPoint, c.onOut]).toEqual([0, 100, null, 'loop'])
  })

  it('ducks multiplicatively: 75% of the corrected volume', () => {
    expect(walkoutClip({ videoId: 'w', volume: 80 }, 'loop', 0.75).volume).toBe(60)
    expect(walkoutClip({ videoId: 'w' }, 'loop', 0.75).volume).toBe(75)
  })

  it('survives normalizeClip with no player end, so warm and claim share the pool key videoId:start:', () => {
    const c = normalizeClip(walkoutClip({ videoId: 'w', start: 12, end: 90 }, 'fade'))
    expect(c.end).toBeNull()
    expect(c.outPoint).toBe(90)
  })
})
