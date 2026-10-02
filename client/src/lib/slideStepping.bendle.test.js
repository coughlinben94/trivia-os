// client/src/lib/slideStepping.bendle.test.js
import { describe, it, expect } from 'vitest'
import {
  PHONE_MECHANICS, REVEAL_FIELD, pendingLockPhase, pendingReveal, unlockPatch, withEntryState,
  computeNextStep, computePrevStep, computeJumpStep, lockSlideFor, liveSlideOpenForPhones, phonePhaseKey,
} from './slideStepping.js'

const noTeams = async () => 0
const bendle = (id, order, step, extra = {}) => ({ id, order, type: 'question', roundId: 'r1',
  data: { isShiny: true, shinyInputSchema: { type: 'bendle' }, shinyGroupId: 'g1', bendleStepIndex: step, bendleSongId: 'bnd_1', ...extra } })
const plain = (id, order) => ({ id, order, type: 'question', roundId: 'r1', data: { text: id } })
const title = { id: 't', order: 1, type: 'shiny-title', roundId: 'r1', data: { isShiny: true, shinyGroupId: 'g1' } }
const show = (slides, idx) => ({ slides, currentSlideIndex: idx, currentSlideId: [...slides].sort((a, b) => a.order - b.order)[idx].id })
const dataOf = (patch, id) => patch.slides.find(s => s.id === id).data
const LOCKED = { bendleLocked: true, bendleLockedAt: '2026-10-02T20:00:00Z' }
const DONE = { ...LOCKED, bendleRevealed: true, bendleResults: [{ teamId: 'p1', points: 30 }], bendleOverrides: { p1: 30 } }
const deck = (s3extra = {}) => [plain('q0', 0), title, bendle('s1', 2, 0), bendle('s2', 3, 1), bendle('s3', 4, 2, s3extra), plain('q5', 5)]

describe('PHONE_MECHANICS.bendle', () => {
  it('is registered with lockHere on step 3 only', () => {
    const m = PHONE_MECHANICS.bendle
    expect(m.lockFields).toEqual(['bendleLocked'])
    expect(m.revealField).toBe('bendleRevealed')
    expect(m.clearFields).toEqual(['bendleResults', 'bendleLockedAt'])
    expect(m.freshClearFields).toEqual(['bendleOverrides'])
    expect([0, 1, 2].map(i => m.lockHere({ bendleStepIndex: i }))).toEqual([false, false, true])
    expect(REVEAL_FIELD.bendle).toBe('bendleRevealed')
  })
  it('lock and reveal are pending only on step 3', () => {
    const [s1, s2, s3] = deck().slice(2, 5)
    expect([s1, s2, s3].map(pendingLockPhase)).toEqual([null, null, 'bendle'])
    expect(pendingLockPhase(bendle('s3', 4, 2, LOCKED))).toBe(null)
    expect(pendingReveal(bendle('s1', 2, 0, LOCKED))).toBe(null) // even a stray flag on step 1
    expect(pendingReveal(bendle('s3', 4, 2, LOCKED))).toBe('bendle')
    expect(pendingReveal(bendle('s3', 4, 2, DONE))).toBe(null)
  })
  it('unlockPatch clears lock, reveal, results and lock time, keeps overrides', () => {
    expect(unlockPatch('bendle', DONE)).toEqual({ bendleLocked: false, bendleRevealed: false, bendleResults: null, bendleLockedAt: null })
  })
  it('lockSlideFor points every step at step 3', () => {
    const slides = deck()
    expect(lockSlideFor(slides, slides[2]).id).toBe('s3')
    expect(lockSlideFor(slides, slides[4]).id).toBe('s3')
    expect(lockSlideFor(slides, slides[0]).id).toBe('q0')
  })
})

describe('entry and replay protection', () => {
  it('fresh entry into step 1 clears a stale lock on step 3, overrides included', async () => {
    const patch = await computeNextStep(show(deck(DONE).map(s => s.id === 's3' ? { ...s, data: { ...s.data, bendleRevealed: false } } : s), 1), noTeams)
    expect(patch.current_slide_id).toBe('s1')
    expect(dataOf(patch, 's3')).toMatchObject({ bendleLocked: false, bendleResults: null, bendleLockedAt: null, bendleOverrides: null })
  })
  it('a fully finished Bendle re-entered from the title keeps its results', async () => {
    const patch = await computeNextStep(show(deck(DONE), 1), noTeams)
    expect(dataOf(patch, 's3')).toMatchObject({ bendleLocked: true, bendleRevealed: true })
  })
  it('replaying step 2 then Next back onto a locked step 3 keeps the lock', async () => {
    const back = await computePrevStep(show(deck(LOCKED), 4), noTeams)
    expect(back.current_slide_id).toBe('s2')
    expect(dataOf(back, 's3').bendleLocked).toBe(true)
    const fwd = await computeNextStep({ slides: back.slides, currentSlideIndex: 3, currentSlideId: 's2' }, noTeams)
    expect(fwd.current_slide_id).toBe('s3')
    expect(dataOf(fwd, 's3')).toMatchObject({ bendleLocked: true, bendleLockedAt: LOCKED.bendleLockedAt })
  })
  it('Prev from step 2 to step 1 keeps a locked step 3', async () => {
    const back = await computePrevStep(show(deck(LOCKED), 3), noTeams)
    expect(dataOf(back, 's3').bendleLocked).toBe(true)
  })
  it('jump: within the group protects; from outside and unvisited resets', () => {
    const fromS1 = computeJumpStep(show(deck(LOCKED), 2), 4, { furthest: 2 })
    expect(dataOf(fromS1, 's3').bendleLocked).toBe(true)
    const fromStart = computeJumpStep(show(deck(LOCKED), 0), 4, { furthest: 0 })
    expect(dataOf(fromStart, 's3').bendleLocked).toBe(false)
    const visited = computeJumpStep(show(deck(LOCKED), 5), 2, { furthest: 5 })
    expect(dataOf(visited, 's3').bendleLocked).toBe(true)
  })
  it('goLiveFrom-style protected entry into step 1 keeps a locked group', () => {
    const slides = deck(LOCKED)
    const out = withEntryState(slides, slides[2], { currentPart: 0, protectInProgress: true })
    expect(out.find(s => s.id === 's3').data.bendleLocked).toBe(true)
  })
})

describe('phone helpers for Join', () => {
  it('phones stay open on steps 1-2 until the group locks, then close on every step', () => {
    const open = deck()
    expect([2, 3, 4].map(i => liveSlideOpenForPhones(open, open[i]))).toEqual([true, true, true])
    const locked = deck(LOCKED)
    expect([2, 3, 4].map(i => liveSlideOpenForPhones(locked, locked[i]))).toEqual([false, false, false])
    expect(liveSlideOpenForPhones(open, open[0])).toBe(false)
  })
  it('the phase key changes with the slide and with the group lock', () => {
    const open = deck(), locked = deck(LOCKED)
    expect(phonePhaseKey(open, open[2])).not.toBe(phonePhaseKey(open, open[3]))
    expect(phonePhaseKey(open, open[3])).not.toBe(phonePhaseKey(locked, locked[3]))
  })
})
