import { describe, it, expect } from 'vitest'
import { lockRefusal, HUES_CUES_ANSWER_ERROR, WAGER_ANSWER_ERROR, WAGER_TIERS_ERROR } from './lockRefusal.js'
import { planHostCommand } from './hostCommands.js'

const shiny = (type, data = {}) => ({ id: 'q', type: 'question', data: { isShiny: true, shinyInputSchema: { type }, ...data } })

describe('lockRefusal', () => {
  it('hues & cues: refuses with no valid square, clear with one', () => {
    expect(lockRefusal(shiny('hues-cues'))).toBe(HUES_CUES_ANSWER_ERROR)
    expect(lockRefusal(shiny('hues-cues', { answer: 'zz' }))).toBe(HUES_CUES_ANSWER_ERROR)
    expect(lockRefusal(shiny('hues-cues', { answer: 'A1' }))).toBe(null)
  })
  it('wager tiers phase never refuses (handleLockWagers has no preCheck)', () => {
    expect(lockRefusal(shiny('wager'))).toBe(null)
  })
  it('wager guesses phase: refuses on non-number answer or missing tier snapshot', () => {
    const g = extra => shiny('wager', { wagerTiersLocked: true, ...extra })
    expect(lockRefusal(g({ answer: 'lots', wagerTiers: {} }))).toBe(WAGER_ANSWER_ERROR)
    expect(lockRefusal(g({ answer: '42' }))).toBe(WAGER_TIERS_ERROR)
    expect(lockRefusal(g({ answer: '42', wagerTiers: {} }))).toBe(null)
  })
  it('already-locked and other mechanics are untouched', () => {
    expect(lockRefusal(shiny('hues-cues', { huesCuesLocked: true }))).toBe(null)
    expect(lockRefusal(shiny('choice'))).toBe(null)
    expect(lockRefusal(null)).toBe(null)
  })
})

describe('Next uses it (via planHostCommand)', () => {
  const next = ctx => planHostCommand({ cmd: 'next' }, ctx)
  it('hues & cues with no answer: refuses, no countdown', () => {
    const s = shiny('hues-cues')
    expect(next({ lockPhase: 'huesCues', lockBlocked: lockRefusal(s) })).toEqual({ refuse: 'lock-blocked', message: HUES_CUES_ANSWER_ERROR })
  })
  it('hues & cues with a valid answer, and choice: countdown starts as before', () => {
    expect(next({ lockPhase: 'huesCues', lockBlocked: lockRefusal(shiny('hues-cues', { answer: 'A1' })) })).toEqual({ run: 'start-lock-countdown', phase: 'huesCues' })
    expect(next({ lockPhase: 'choice', lockBlocked: lockRefusal(shiny('choice')) })).toEqual({ run: 'start-lock-countdown', phase: 'choice' })
  })
})
