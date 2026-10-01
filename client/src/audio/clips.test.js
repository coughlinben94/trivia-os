import { describe, it, expect } from 'vitest'
import { dbToGain, normalizeClip, clipKey } from './clips.js'

describe('dbToGain', () => {
  it('converts decibels to linear gain', () => {
    expect(dbToGain(0)).toBe(1)
    expect(dbToGain(20)).toBeCloseTo(10, 6)
    expect(dbToGain(-20)).toBeCloseTo(0.1, 6)
    expect(dbToGain(6)).toBeCloseTo(1.9953, 3)
  })
  it('treats missing or non-finite values as 0 dB', () => {
    expect(dbToGain(undefined)).toBe(1)
    expect(dbToGain(null)).toBe(1)
    expect(dbToGain(NaN)).toBe(1)
  })
})

describe('normalizeClip', () => {
  it('fills youtube defaults and keeps end null when absent or 0', () => {
    expect(normalizeClip({ kind: 'youtube', videoId: 'abc' })).toEqual({
      kind: 'youtube', videoId: 'abc', start: 0, end: null, volume: 100, part: 0,
    })
    expect(normalizeClip({ kind: 'youtube', videoId: 'abc', start: 12.5, end: 0 }).end).toBeNull()
    expect(normalizeClip({ kind: 'youtube', videoId: 'abc', start: 10, end: 40, volume: 80, part: 2 })).toEqual({
      kind: 'youtube', videoId: 'abc', start: 10, end: 40, volume: 80, part: 2,
    })
  })

  it('keeps a numeric loopTo and drops a junk one', () => {
    expect(normalizeClip({ kind: 'file', url: '/a.mp3', loopTo: 181 }).loopTo).toBe(181)
    expect(normalizeClip({ kind: 'file', url: '/a.mp3', loopTo: 'x' }).loopTo).toBe(null)
  })

  it('fills file defaults', () => {
    expect(normalizeClip({ kind: 'file', url: '/a.mp3' })).toEqual({
      kind: 'file', url: '/a.mp3', gainDb: 0, loop: false, start: 0, loopTo: null, part: 0,
    })
    expect(normalizeClip({ kind: 'file', url: '/a.mp3', gainDb: 6, loop: true, start: 181, part: 1 })).toEqual({
      kind: 'file', url: '/a.mp3', gainDb: 6, loop: true, start: 181, loopTo: null, part: 1,
    })
  })

  it('throws a clear error for bad input', () => {
    expect(() => normalizeClip(null)).toThrow(/must be an object/)
    expect(() => normalizeClip({ kind: 'youtube' })).toThrow(/videoId/)
    expect(() => normalizeClip({ kind: 'file' })).toThrow(/url/)
    expect(() => normalizeClip({ kind: 'bendle', songId: 's' })).toThrow(/unsupported audio clip kind: bendle/)
    expect(() => normalizeClip({ kind: 'nope' })).toThrow(/unsupported audio clip kind: nope/)
  })
})

describe('clipKey', () => {
  const yt = (extra = {}) => normalizeClip({ kind: 'youtube', videoId: 'abc', ...extra })
  it('is stable for the same slide, part and source', () => {
    expect(clipKey('s1', yt())).toBe(clipKey('s1', yt()))
  })
  it('differs by slide, part, kind and source', () => {
    const base = clipKey('s1', yt())
    expect(clipKey('s2', yt())).not.toBe(base)
    expect(clipKey('s1', yt({ part: 1 }))).not.toBe(base)
    expect(clipKey('s1', normalizeClip({ kind: 'file', url: 'abc' }))).not.toBe(base)
    expect(clipKey('s1', yt({ videoId: 'xyz' }))).not.toBe(base)
  })
  it('treats a missing slide id as empty', () => {
    expect(clipKey(null, yt())).toBe(clipKey(undefined, yt()))
  })
})
