import { describe, it, expect } from 'vitest'
import { insertAfterSlideId } from './questionNumbering.js'

function slide(id, type = 'question') {
  return { id, type }
}

describe('insertAfterSlideId', () => {
  // Bug this guards against: a winner-reveal slide is stored with its
  // roundId set to the show's last round, so it counted as that round's own
  // "last slide" — any add to the final round landed AFTER winner-reveal,
  // breaking Display.jsx's Final Break auto-jump (which requires
  // winner-reveal to stay the show's literal last slide).

  it('inserts after the round\'s last slide when there is no winner-reveal involved', () => {
    const roundSlides = [slide('q1'), slide('q2'), slide('q3')]
    expect(insertAfterSlideId(roundSlides, roundSlides)).toBe('q3')
  })

  it('skips a winner-reveal tagged with this round and inserts before it instead', () => {
    const roundSlides = [slide('q1'), slide('q2'), slide('winner', 'winner-reveal')]
    expect(insertAfterSlideId(roundSlides, roundSlides)).toBe('q2')
  })

  it('falls back to the show-wide last non-winner-reveal slide when the round is empty', () => {
    const allSorted = [slide('r1q1'), slide('r1q2'), slide('winner', 'winner-reveal')]
    expect(insertAfterSlideId([], allSorted)).toBe('r1q2')
  })

  it('returns null when there is truly nothing insertable (a brand-new, all-winner-reveal show)', () => {
    const allSorted = [slide('winner', 'winner-reveal')]
    expect(insertAfterSlideId([], allSorted)).toBe(null)
  })
})
