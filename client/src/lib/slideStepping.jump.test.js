import { describe, it, expect } from 'vitest'
import { computeJumpStep } from './slideStepping.js'

const match = extra => ({ isShiny: true, shinyInputSchema: { type: 'matching' }, ...extra })
const make = () => [
  { id: 'a', order: 0, type: 'round-intro', data: { roundTitle: 'R1' } },
  { id: 'b', order: 1, type: 'question', data: { questionNumber: 1 } },
  { id: 'c', order: 2, type: 'question', data: match({ matchingLocked: true, matchingLockedAt: 't' }) },
  { id: 'd', order: 3, type: 'question', data: match({ matchingLocked: true, matchingRevealed: true }) },
  { id: 'e', order: 4, type: 'flip-em-down', data: { elimStep: 2 } },
  { id: 'f', order: 5, type: 'question', data: { isShiny: true, parts: [{}, {}, {}], currentPart: 2, lockCountdownPhase: 'matching', lockCountdownStartedAt: 9 } },
]
const show = (cur, slides = make()) => ({ slides, currentSlideIndex: cur })
const byId = (patch, id) => patch.slides.find(s => s.id === id)

describe('computeJumpStep', () => {
  it('lands on the target with a non-null current_slide_id and answer_reveal folded in', () => {
    expect(computeJumpStep(show(0), 1)).toMatchObject({ current_slide_index: 1, current_slide_id: 'b', answer_reveal: false })
  })
  it('patches only the target slide: every other slide object is untouched', () => {
    const s = show(0)
    const patch = computeJumpStep(s, 5)
    patch.slides.forEach((slide, i) => { if (slide.id !== 'f') expect(slide).toBe(s.slides[i]) })
  })
  it('out of range is null (nothing to write)', () => {
    expect(computeJumpStep(show(0), 6)).toBe(null)
    expect(computeJumpStep(show(0), -1)).toBe(null)
  })
  it('back to a locked (scored, not yet revealed) question keeps its locks', () => {
    expect(byId(computeJumpStep(show(4), 2), 'c').data).toMatchObject({ matchingLocked: true, matchingLockedAt: 't' })
  })
  it('forward past anything visited onto a stale half-finished lock resets it (fresh entry, same as Next)', () => {
    expect(byId(computeJumpStep(show(0), 2), 'c').data.matchingLocked).toBe(false)
  })
  it('jump back, then forward to an already-scored question (at or below furthest) keeps its locks', () => {
    // Ben was on c (index 2, scored) and went on to e (index 4); jumps back to b.
    const back = computeJumpStep(show(4), 1, { furthest: 4 })
    const then = { slides: back.slides, currentSlideIndex: 1 }
    expect(byId(computeJumpStep(then, 2, { furthest: 4 }), 'c').data.matchingLocked).toBe(true)
    // Without the furthest mark (target > current) the same jump would clear it.
    expect(byId(computeJumpStep(then, 2), 'c').data.matchingLocked).toBe(false)
  })
  it('forward onto a fully scored AND revealed question keeps it, as Next does', () => {
    expect(byId(computeJumpStep(show(0), 3), 'd').data).toMatchObject({ matchingLocked: true, matchingRevealed: true })
  })
  it('keeps a Flip hint step on a revisit, resets it on a fresh forward entry', () => {
    expect(byId(computeJumpStep(show(5), 4), 'e').data.elimStep).toBe(2)
    expect(byId(computeJumpStep(show(0), 4), 'e').data.elimStep).toBe(0)
  })
  it('always starts a series at part 0 and clears a stale lock countdown', () => {
    expect(byId(computeJumpStep(show(0), 5), 'f').data).toMatchObject({ currentPart: 0, lockCountdownPhase: null, lockCountdownStartedAt: null })
  })
  it('uses pre-baked slides when given (team-picker)', () => {
    const baked = make().map(s => (s.id === 'b' ? { ...s, data: { ...s.data, parts: [null, null] } } : s))
    expect(byId(computeJumpStep(show(0), 1, { slides: baked }), 'b').data.parts).toEqual([null, null])
  })
})
