import { describe, it, expect } from 'vitest'
import { initialLiveMode, goLiveAction } from './goLive.js'

describe('initialLiveMode', () => {
  it('follows showState.isLive', () => {
    expect(initialLiveMode({ showState: { isLive: true } })).toBe(true)
    expect(initialLiveMode({ showState: { isLive: false } })).toBe(false)
    expect(initialLiveMode(null)).toBe(false)
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
