import { describe, it, expect } from 'vitest'
import { mergeShowStateRow } from './showStateMerge.js'

const prev = {
  id: 's1', slides: [{ id: 'a' }], rounds: [],
  showState: { currentSlideIndex: 2, currentSlideId: 'c', isLive: true, scoreboardVisible: false, scoresRevealed: false, answerReveal: false },
}

describe('mergeShowStateRow', () => {
  it('applies the state fields and leaves slides/rounds alone', () => {
    const next = mergeShowStateRow(prev, { id: 's1', current_slide_index: 5, current_slide_id: 'f', scoreboard_visible: true })
    expect(next.showState.currentSlideIndex).toBe(5)
    expect(next.showState.currentSlideId).toBe('f')
    expect(next.showState.scoreboardVisible).toBe(true)
    expect(next.slides).toBe(prev.slides)
  })

  it('keeps existing values for columns absent from the row (realtime omits unchanged ones)', () => {
    const next = mergeShowStateRow(prev, { id: 's1', answer_reveal: true })
    expect(next.showState.currentSlideIndex).toBe(2)
    expect(next.showState.isLive).toBe(true)
    expect(next.showState.answerReveal).toBe(true)
  })

  it('keepNav skips the nav fields but still applies the toggles', () => {
    const next = mergeShowStateRow(prev, { id: 's1', current_slide_index: 9, current_slide_id: 'z', scores_revealed: true }, { keepNav: true })
    expect(next.showState.currentSlideIndex).toBe(2)
    expect(next.showState.currentSlideId).toBe('c')
    expect(next.showState.scoresRevealed).toBe(true)
  })

  it('ignores a row for another show, or no show loaded', () => {
    expect(mergeShowStateRow(prev, { id: 'other', is_live: false })).toBe(prev)
    expect(mergeShowStateRow(null, { id: 's1' })).toBeNull()
  })
})
