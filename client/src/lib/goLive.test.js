import { describe, it, expect } from 'vitest'
import { initialLiveMode, goLiveAction } from './goLive.js'

describe('initialLiveMode', () => {
  const now = Date.parse('2026-09-28T12:00:00Z')
  it('recent live -> resume', () => {
    expect(initialLiveMode({ updatedAt: '2026-09-28T10:00:00Z', showState: { isLive: true } }, now)).toBe(true)
  })
  it('stale live -> build', () => {
    expect(initialLiveMode({ updatedAt: '2026-09-20T10:00:00Z', showState: { isLive: true } }, now)).toBe(false)
    expect(initialLiveMode({ showState: { isLive: true } }, now)).toBe(false)
  })
  it('not live -> build', () => {
    expect(initialLiveMode({ updatedAt: '2026-09-28T11:00:00Z', showState: { isLive: false } }, now)).toBe(false)
    expect(initialLiveMode(null, now)).toBe(false)
  })
})

describe('goLiveAction', () => {
  const slides = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  it('starts fresh when not live', () => {
    expect(goLiveAction({ isLive: false, currentSlideIndex: 2 }, slides)).toEqual({ resume: false })
  })
  it('resumes at current slide when live', () => {
    expect(goLiveAction({ isLive: true, currentSlideIndex: 1 }, slides)).toMatchObject({ resume: true, index: 1, number: 2, slide: { id: 'b' } })
  })
  it('clamps a stale index', () => {
    expect(goLiveAction({ isLive: true, currentSlideIndex: 9 }, slides).index).toBe(2)
  })
})
