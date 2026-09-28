import { describe, it, expect } from 'vitest'
import { nextPressCue, nextPressGate } from './nextPressCue.js'

const s = (type, data = {}) => ({ id: type, type, data })

describe('nextPressCue', () => {
  it('null at the end of the show', () => {
    expect(nextPressCue({ slide: s('winner-reveal'), nextSlide: null })).toBe(null)
  })
  it('names the landing slide', () => {
    expect(nextPressCue({ slide: s('question'), nextSlide: s('round-intro', { roundNumber: 3 }) })).toBe('Show Round 3')
    expect(nextPressCue({ slide: s('question'), nextSlide: s('grading-break') })).toBe('Start grading break')
    expect(nextPressCue({ slide: s('question'), nextSlide: s('question', { questionNumber: 4 }) })).toBe('Show question 4')
  })
  it('steps through parts before leaving', () => {
    const slide = s('question', { parts: [{}, {}, {}, {}], currentPart: 1 })
    expect(nextPressCue({ slide, nextSlide: s('question') })).toBe('Reveal 3 of 4')
    const last = s('question', { parts: [{}, {}, {}, {}], currentPart: 3 })
    expect(nextPressCue({ slide: last, nextSlide: s('grading-break') })).toBe('Start grading break')
  })
  it('audio beats advance; lock beats audio; scoring beats all', () => {
    const wager = s('question', { isShiny: true, shinyInputSchema: { type: 'wager' } })
    expect(nextPressCue({ slide: wager, nextSlide: s('question'), audioPending: true })).toBe('Lock wagers')
    expect(nextPressCue({ slide: s('question'), nextSlide: s('question'), audioPending: true })).toBe('Play clip')
    expect(nextPressCue({ slide: wager, nextSlide: null, scoringBusy: true })).toBe('Scoring…')
  })
})

describe('nextPressGate', () => {
  const wager = (data = {}) => s('question', { isShiny: true, shinyInputSchema: { type: 'wager' }, ...data })
  const g = p => nextPressGate({ nextSlide: s('question'), ...p })
  it('one gate per cue branch', () => {
    expect(g({ slide: wager(), scoringBusy: true })).toEqual({ label: 'Scoring…', gate: 'scoring' })
    expect(g({ slide: s('question'), saving: true })).toEqual({ label: 'Saving scores…', gate: 'saving' })
    expect(g({ slide: wager() })).toEqual({ label: 'Lock wagers', gate: 'lock' })
    expect(g({ slide: wager({ wagerTiersLocked: true }) })).toEqual({ label: 'Lock answers', gate: 'lock' })
    expect(g({ slide: wager({ lockCountdownStartedAt: 1 }) })).toEqual({ label: 'Locking…', gate: 'locking' })
    expect(g({ slide: wager({ wagerTiersLocked: true, wagerGuessesLocked: true }) })).toEqual({ label: 'Press Answer to reveal', gate: 'reveal-owed' })
    expect(g({ slide: s('question'), audioPending: true })).toEqual({ label: 'Play clip', gate: 'audio' })
    expect(g({ slide: s('pre-show', { walkoutSong: { trigger: 'invoke', videoId: 'v' } }) })).toEqual({ label: 'Play walkout song', gate: 'walkout' })
    expect(g({ slide: s('question', { parts: [{}, {}] }) })).toEqual({ label: 'Reveal 2 of 2', gate: 'reveal-part' })
    expect(g({ slide: s('question') })).toEqual({ label: 'Show question', gate: 'advance' })
    expect(nextPressGate({ slide: s('winner-reveal'), nextSlide: null })).toEqual({ label: null, gate: null })
  })
  it('a revealed phone question just advances', () => {
    expect(g({ slide: wager({ wagerTiersLocked: true, wagerGuessesLocked: true, wagerRevealed: true }) }).gate).toBe('advance')
  })
  it('an already-invoked walkout song advances', () => {
    expect(g({ slide: s('pre-show', { walkoutSong: { trigger: 'invoke', videoId: 'v', invoked: true } }) }).gate).toBe('advance')
  })
})
