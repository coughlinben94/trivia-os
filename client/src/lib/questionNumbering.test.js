import { describe, it, expect } from 'vitest'
import { insertAfterSlideId, renumberRoundQuestions } from './questionNumbering.js'

function slide(id, type = 'question') {
  return { id, type }
}

function q(id, order, data = {}) {
  return { id, type: 'question', order, roundId: 'r1', data }
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

describe('renumberRoundQuestions', () => {
  it('numbers a plain sequence of regular questions 1..N', () => {
    const slides = [q('a', 0), q('b', 1), q('c', 2)]
    const result = renumberRoundQuestions(slides)
    expect(result.map(s => s.data.questionNumber)).toEqual([1, 2, 3])
    expect(result.map(s => s.data.questionLabel)).toEqual(['Q1', 'Q2', 'Q3'])
  })

  // Bendle's 3 step-slides are reveal beats of ONE question (one song, one
  // guess) — but each is its own real `type: 'question'` slide (2026-09-08
  // rebuild). Ben, reproducing this live: "bendle is 1 question" — the 3
  // steps had been eating 3 separate numbers (Q3/Q4/Q5 for one song),
  // visibly skipping straight from Q2 to Q6 in the sidebar.
  it('counts a 3-step Bendle group as one question, not three', () => {
    const slides = [
      q('q1', 0), q('q2', 1),
      { id: 'bendle-title', type: 'shiny-title', order: 2, roundId: 'r1', data: {} }, // not type 'question' — excluded from numbering naturally
      q('bendle-0', 3, { isShiny: true, bendleStepIndex: 0, questionLabel: 'Q3' }),
      q('bendle-1', 4, { isShiny: true, bendleStepIndex: 1, questionLabel: 'Q4' }),
      q('bendle-2', 5, { isShiny: true, bendleStepIndex: 2, questionLabel: 'Q5' }),
      q('q6', 6), q('q7', 7),
    ]
    const result = renumberRoundQuestions(slides)
    const numByI = id => result.find(s => s.id === id).data.questionNumber
    expect(numByI('q1')).toBe(1)
    expect(numByI('q2')).toBe(2)
    expect(numByI('bendle-0')).toBe(3)
    expect(numByI('bendle-1')).toBe(3) // same number as step 0, not 4
    expect(numByI('bendle-2')).toBe(3) // same number as step 0, not 5
    expect(numByI('q6')).toBe(4) // continues right after the Bendle group's ONE number
    expect(numByI('q7')).toBe(5)
  })

  it('leaves a shiny slide\'s own questionLabel alone (only questionNumber is recomputed)', () => {
    const slides = [q('a', 0, { isShiny: true, questionLabel: 'Q1', bendleStepIndex: 0 })]
    const result = renumberRoundQuestions(slides)
    expect(result[0].data.questionLabel).toBe('Q1')
    expect(result[0].data.questionNumber).toBe(1)
  })
})
