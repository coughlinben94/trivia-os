import { describe, it, expect } from 'vitest'
import { resolvePreviewShow } from './previewSlide.js'

describe('resolvePreviewShow', () => {
  const show = {
    current_slide_index: 0,
    slides: [
      { id: 'a', order: 2 },
      { id: 'b', order: 0 },
      { id: 'c', order: 1 },
    ],
  }

  it('returns the show unchanged when no target slide id is given', () => {
    expect(resolvePreviewShow(show, null)).toBe(show)
  })

  it('points current_slide_index at the target slide, respecting order not array position', () => {
    const result = resolvePreviewShow(show, 'a')
    expect(result.current_slide_index).toBe(2) // 'a' has order 2, so it's last after sorting
  })

  it('finds a slide regardless of its position in the raw array', () => {
    const result = resolvePreviewShow(show, 'c')
    expect(result.current_slide_index).toBe(1)
  })

  it('falls back to the show unchanged when the target id no longer exists', () => {
    expect(resolvePreviewShow(show, 'ghost')).toBe(show)
  })

  it('falls back to the show unchanged when the show has no slides', () => {
    const empty = { current_slide_index: 0, slides: [] }
    expect(resolvePreviewShow(empty, 'a')).toBe(empty)
  })
})
