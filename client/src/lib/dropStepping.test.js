import { describe, it, expect } from 'vitest'
import {
  computeNextStep, computePrevStep, withEntryState,
  pendingLockPhase, pendingReveal, unlockPatch, PHONE_MECHANICS,
} from './slideStepping.js'
import { isDropShiny } from './shinySeries.js'
import { nextPressGate } from './nextPressCue.js'
import { lockRefusal } from './lockRefusal.js'
import { dropSequence } from './dropScoring.js'

const noTeams = async () => 0
const options = ['a', 'b', 'c', 'd'].map(id => ({ id, label: id.toUpperCase() }))
const dropSlide = (data = {}) => ({
  id: 'd1', order: 0, type: 'question', roundId: 'r1',
  data: {
    isShiny: true, shinyInputSchema: { type: 'drop' }, text: 'Q?',
    options, correctId: 'b', dropLocked: true, dropStep: 0, ...data,
  },
})
const after = { id: 'n', order: 1, type: 'question', roundId: 'r1', data: {} }
const show = (s, extra = {}) => ({ slides: [s, after], currentSlideIndex: 0, currentSlideId: s.id, ...extra })
const dataOf = (patch, id = 'd1') => patch.slides.find(s => s.id === id).data

describe('isDropShiny', () => {
  it('keys off shinyInputSchema.type', () => {
    expect(isDropShiny(dropSlide().data)).toBe(true)
    expect(isDropShiny({ shinyInputSchema: { type: 'choice' } })).toBe(false)
  })
})

describe('registry', () => {
  it('registers drop as a phone mechanic with its own lock + reveal fields', () => {
    expect(PHONE_MECHANICS.drop.lockFields).toEqual(['dropLocked'])
    expect(PHONE_MECHANICS.drop.revealField).toBe('dropRevealed')
  })
  it('an unlocked drop slide owes a lock, a locked one owes no A-reveal (Next owns it)', () => {
    expect(pendingLockPhase(dropSlide({ dropLocked: false }))).toBe('drop')
    expect(pendingLockPhase(dropSlide())).toBe(null)
    expect(pendingReveal(dropSlide())).toBe(null)
  })
  it('unlock rewinds the drops and clears the stored results', () => {
    expect(unlockPatch('drop', dropSlide().data)).toEqual({
      dropLocked: false, dropRevealed: false, dropStep: null, dropResults: null, dropSeed: null,
    })
  })
  it('refuses to lock with no correct tile set', () => {
    expect(lockRefusal(dropSlide({ dropLocked: false, correctId: null }))).toMatch(/correct tile/i)
    expect(lockRefusal(dropSlide({ dropLocked: false }))).toBe(null)
  })
})

describe('Next steps one tile off per press after lock', () => {
  it('press 1 and 2 drop a tile, press 3 drops the last and marks revealed', async () => {
    let s = dropSlide()
    let patch = await computeNextStep(show(s), noTeams)
    expect(dataOf(patch).dropStep).toBe(1)
    expect(dataOf(patch).dropRevealed).toBe(false)
    expect(patch.current_slide_index).toBeUndefined()

    s = { ...s, data: dataOf(patch) }
    patch = await computeNextStep(show(s), noTeams)
    expect(dataOf(patch).dropStep).toBe(2)
    expect(dataOf(patch).dropRevealed).toBe(false)

    s = { ...s, data: dataOf(patch) }
    patch = await computeNextStep(show(s), noTeams)
    expect(dataOf(patch).dropStep).toBe(3)
    expect(dataOf(patch).dropRevealed).toBe(true)
  })
  it('the press after the last drop leaves the slide', async () => {
    const s = dropSlide({ dropStep: 3, dropRevealed: true })
    const patch = await computeNextStep(show(s), noTeams)
    expect(patch.current_slide_id).toBe('n')
  })
  it('does not step while unlocked (Next belongs to the lock countdown there)', async () => {
    const s = dropSlide({ dropLocked: false })
    const patch = await computeNextStep(show(s), noTeams)
    expect(patch.current_slide_id).toBe('n')
  })
})

describe('Prev puts tiles back', () => {
  it('steps dropStep down and clears revealed', async () => {
    const s = dropSlide({ dropStep: 3, dropRevealed: true })
    const patch = await computePrevStep(show(s), noTeams)
    expect(dataOf(patch).dropStep).toBe(2)
    expect(dataOf(patch).dropRevealed).toBe(false)
  })
  it('at step 0 it leaves the slide as normal', async () => {
    const before = { id: 'p', order: -1, type: 'question', roundId: 'r1', data: {} }
    const s = dropSlide()
    const patch = await computePrevStep({ slides: [before, s], currentSlideIndex: 1, currentSlideId: 'd1' }, noTeams)
    expect(patch.current_slide_id).toBe('p')
  })
})

describe('entry state', () => {
  it('fresh entry resets lock, reveal, step and results', () => {
    const s = dropSlide({ dropStep: 2, dropRevealed: true, dropResults: { totals: {}, allIn: 1, teams: 2 } })
    const out = withEntryState([s], s).find(x => x.id === 'd1').data
    expect(out.dropLocked).toBe(false)
    expect(out.dropRevealed).toBe(false)
    expect(out.dropStep).toBe(null)
    expect(out.dropResults).toBe(null)
  })
  it('re-entry keeps progress', () => {
    const s = dropSlide({ dropStep: 2 })
    const out = withEntryState([s], s, { protectInProgress: true }).find(x => x.id === 'd1').data
    expect(out.dropLocked).toBe(true)
    expect(out.dropStep).toBe(2)
  })
})

describe('Next cue', () => {
  it('names the tile Next will drop, by letter and text', () => {
    // tiles a b c d, b is correct, no seed: fall order a, c, d. One already fell, so c is next.
    const cue = nextPressGate({ slide: dropSlide({ dropStep: 1 }), nextSlide: after })
    expect(cue.gate).toBe('reveal-part')
    expect(cue.label).toBe('Drop tile C · C')
    expect(nextPressGate({ slide: dropSlide({ dropStep: 0 }), nextSlide: after }).label).toBe('Drop tile A · A')
  })
  it('follows the seeded random order, not the left-to-right order', () => {
    const d = dropSlide({ dropStep: 0, dropSeed: 3 })
    const first = dropSequence(d.data)[0]
    const letter = String.fromCharCode(65 + ['a', 'b', 'c', 'd'].indexOf(first))
    expect(nextPressGate({ slide: d, nextSlide: after }).label).toMatch(new RegExp(`^Drop tile ${letter} `))
  })
  it('falls back to just the letter when the tile has no text (photo tile)', () => {
    const photo = dropSlide({ options: options.map(o => ({ ...o, label: '', image: 'x.png' })), dropStep: 0 })
    expect(nextPressGate({ slide: photo, nextSlide: after }).label).toBe('Drop tile A')
  })
  it('asks for the lock first when unlocked', () => {
    expect(nextPressGate({ slide: dropSlide({ dropLocked: false }), nextSlide: after }).gate).toBe('lock')
  })
  it('falls through to advance once every wrong tile is gone', () => {
    expect(nextPressGate({ slide: dropSlide({ dropStep: 3, dropRevealed: true }), nextSlide: after }).gate).toBe('advance')
  })
})
