import { describe, it, expect } from 'vitest'
import { resolvePreviewShow } from './previewSlide.js'

describe('resolvePreviewShow', () => {
  const show = {
    current_slide_index: 0,
    scoreboard_visible: true,
    showState: { scoreboardVisible: true },
    slides: [
      { id: 'a', order: 2 },
      { id: 'b', order: 0 },
      { id: 'c', order: 1 },
    ],
  }

  it('leaves current_slide_index untouched when no target slide id is given', () => {
    expect(resolvePreviewShow(show, null).current_slide_index).toBe(show.current_slide_index)
  })

  it('points current_slide_index at the target slide, respecting order not array position', () => {
    const result = resolvePreviewShow(show, 'a')
    expect(result.current_slide_index).toBe(2) // 'a' has order 2, so it's last after sorting
  })

  it('finds a slide regardless of its position in the raw array', () => {
    const result = resolvePreviewShow(show, 'c')
    expect(result.current_slide_index).toBe(1)
  })

  it('falls back to current_slide_index unchanged when the target id no longer exists', () => {
    expect(resolvePreviewShow(show, 'ghost').current_slide_index).toBe(show.current_slide_index)
  })

  it('falls back to current_slide_index unchanged when the show has no slides', () => {
    const empty = { current_slide_index: 0, slides: [] }
    expect(resolvePreviewShow(empty, 'a').current_slide_index).toBe(0)
  })

  // A show whose scoreboard was left on from a real live session must never
  // show that overlay in Preview instead of the slide being edited (the
  // design-audit finding this guards against) — every path through this
  // function, target found or not, forces it off.
  it('always forces scoreboard_visible off, even with no target slide id', () => {
    expect(resolvePreviewShow(show, null).scoreboard_visible).toBe(false)
    expect(resolvePreviewShow(show, null).showState.scoreboardVisible).toBe(false)
  })

  it('always forces scoreboard_visible off when the target slide is found', () => {
    const result = resolvePreviewShow(show, 'a')
    expect(result.scoreboard_visible).toBe(false)
    expect(result.showState.scoreboardVisible).toBe(false)
  })

  it('always forces scoreboard_visible off when the target id is not found', () => {
    const result = resolvePreviewShow(show, 'ghost')
    expect(result.scoreboard_visible).toBe(false)
    expect(result.showState.scoreboardVisible).toBe(false)
  })

  it('handles a show with no showState', () => {
    const noShowState = { current_slide_index: 0, scoreboard_visible: true, slides: [] }
    expect(resolvePreviewShow(noShowState, null).scoreboard_visible).toBe(false)
    expect(resolvePreviewShow(noShowState, null).showState).toBeUndefined()
  })
})
