import { describe, it, expect } from 'vitest'
import { fixFor } from './remoteFix.js'

const q = (type, data = {}) => ({ id: 'x', type: 'question', data: { isShiny: true, shinyInputSchema: { type }, ...data } })

describe('fixFor: which slide can be fixed from the iPad', () => {
  it('a slide with no phone lock has nothing to fix', () => {
    expect(fixFor({ id: 'p', type: 'question', data: { questionNumber: 1 } })).toMatchObject({
      mechanic: null, canUnlock: false, unlockRefusal: 'nothing-to-fix', canRescore: false, rescoreRefusal: 'nothing-to-fix', rescoreLabel: null,
    })
    expect(fixFor(null)).toMatchObject({ mechanic: null, canUnlock: false, canRescore: false })
  })
  it('a phone-mechanic data blob on a non-question slide is not a phone question (LiveMode rule)', () => {
    expect(fixFor({ id: 'r', type: 'round-intro', data: { shinyInputSchema: { type: 'matching' }, matchingLocked: true } }).mechanic).toBe(null)
  })
})

describe('canRescore truth table', () => {
  const t = (slide, opts) => fixFor(slide, opts)
  it('unlocked: refused, lock first', () => {
    expect(t(q('matching'))).toMatchObject({ mechanic: 'matching', canRescore: false, rescoreRefusal: 'not-locked' })
  })
  it('locked, not revealed, idle: allowed, labelled Rescore', () => {
    expect(t(q('order', { orderLocked: true }))).toMatchObject({ canRescore: true, rescoreRefusal: null, rescoreLabel: 'Rescore' })
  })
  it('locked while that mechanic is scoring: refused', () => {
    expect(t(q('choice', { choiceLocked: true }), { busy: true })).toMatchObject({ canRescore: false, rescoreRefusal: 'scoring' })
  })
  it('countdown running: refused', () => {
    expect(t(q('choice', { choiceLocked: true, lockCountdownStartedAt: 5 }))).toMatchObject({ canRescore: false, rescoreRefusal: 'locking' })
  })
  it('revealed: refused (the TV already shows the result), matching the laptop hideMainPanel rule', () => {
    expect(t(q('hues-cues', { huesCuesLocked: true, huesCuesRevealed: true })))
      .toMatchObject({ canRescore: false, rescoreRefusal: 'already-revealed' })
  })
  it('revealed but the last scoring failed: allowed, labelled Retry scoring (laptop keeps Retry up then too)', () => {
    expect(t(q('matching', { matchingLocked: true, matchingRevealed: true }), { error: 'Scoring failed' }))
      .toMatchObject({ canRescore: true, rescoreLabel: 'Retry scoring' })
  })
  describe('wager, two phases', () => {
    it('tiers only: refused, the guesses are still open (would lock them early)', () => {
      expect(t(q('wager', { wagerTiersLocked: true, wagerTiers: {} }))).toMatchObject({ canRescore: false, rescoreRefusal: 'not-locked' })
    })
    it('both locked with a tier snapshot: allowed', () => {
      expect(t(q('wager', { wagerTiersLocked: true, wagerGuessesLocked: true, wagerTiers: {} }))).toMatchObject({ canRescore: true })
    })
    it('both locked but no tier snapshot: refused (the laptop button would re-lock tiers, not rescore)', () => {
      expect(t(q('wager', { wagerTiersLocked: true, wagerGuessesLocked: true }))).toMatchObject({ canRescore: false, rescoreRefusal: 'not-locked' })
    })
    it('revealed: refused', () => {
      expect(t(q('wager', { wagerTiersLocked: true, wagerGuessesLocked: true, wagerTiers: {}, wagerRevealed: true })))
        .toMatchObject({ canRescore: false, rescoreRefusal: 'already-revealed' })
    })
  })
  it('horse race: never from the iPad (laptop only), even when locked', () => {
    expect(t({ id: 'h', type: 'horse-race', data: { raceLocked: true } })).toMatchObject({
      mechanic: 'horse-race', canRescore: false, rescoreRefusal: 'laptop-only', rescoreLabel: null,
    })
  })
})

describe('canUnlock', () => {
  it('needs the LAST lock field set (what unlockPatch clears)', () => {
    expect(fixFor(q('matching'))).toMatchObject({ canUnlock: false, unlockRefusal: 'nothing-locked' })
    expect(fixFor(q('matching', { matchingLocked: true }))).toMatchObject({ canUnlock: true, unlockRefusal: null })
    // Wager tiers-only: unlockPatch would clear nothing that is set.
    expect(fixFor(q('wager', { wagerTiersLocked: true }))).toMatchObject({ canUnlock: false, unlockRefusal: 'nothing-locked' })
    expect(fixFor(q('wager', { wagerTiersLocked: true, wagerGuessesLocked: true }))).toMatchObject({ canUnlock: true })
  })
  it('stays allowed after the reveal (misclick recovery, same as the laptop)', () => {
    expect(fixFor(q('order', { orderLocked: true, orderRevealed: true })).canUnlock).toBe(true)
  })
  it('refused while that mechanic is scoring (its final write would re-lock) or counting down', () => {
    expect(fixFor(q('order', { orderLocked: true }), { busy: true })).toMatchObject({ canUnlock: false, unlockRefusal: 'scoring' })
    expect(fixFor(q('order', { orderLocked: true, lockCountdownStartedAt: 1 }))).toMatchObject({ canUnlock: false, unlockRefusal: 'locking' })
  })
  it('horse race has its own lock field', () => {
    expect(fixFor({ id: 'h', type: 'horse-race', data: {} })).toMatchObject({ canUnlock: false, unlockRefusal: 'nothing-locked' })
    expect(fixFor({ id: 'h', type: 'horse-race', data: { raceLocked: true } })).toMatchObject({ canUnlock: true })
    expect(fixFor({ id: 'h', type: 'horse-race', data: { raceLocked: true } }, { busy: true })).toMatchObject({ canUnlock: false, unlockRefusal: 'scoring' })
  })
})
