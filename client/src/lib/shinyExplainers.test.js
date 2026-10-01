import { describe, it, expect } from 'vitest'
import { hasExplainer, explainerImageUrls, EXPLAINER_BEAT_PARTS, SHINY_EXPLAINERS, getShinyExplainer } from './shinyExplainers.js'
import { WAGER_TIERS, getWagerTier, scoreWagerRound } from './wagerScoring.js'
import { DEFAULT_ORDER_POINTS, scoreOrderSubmission } from './orderScoring.js'
import { HUES_CUES_SCORE_BANDS } from './huesCuesScoring.js'

describe('shinyExplainers registry', () => {
  it('knows "Not So Different" by its format id', () => {
    expect(hasExplainer('fmt_not_so_different')).toBe(true)
  })
  it('has no explainer for any other format, or for a missing id', () => {
    expect(hasExplainer('fmt_venn')).toBe(false)
    expect(hasExplainer(undefined)).toBe(false)
  })
  it('the beat list is two entries: title beat then explainer beat', () => {
    expect(EXPLAINER_BEAT_PARTS).toHaveLength(2)
  })
})

describe('explainerImageUrls', () => {
  it('"Not So Different" has four headshots under /explainers/not-so-different/', () => {
    const urls = explainerImageUrls('fmt_not_so_different')
    expect(urls).toHaveLength(4)
    for (const u of urls) expect(u).toMatch(/^\/explainers\/not-so-different\/[a-z]+\.jpg$/)
  })
  it('other formats and a missing id have none', () => {
    expect(explainerImageUrls('fmt_venn')).toEqual([])
    expect(explainerImageUrls(undefined)).toEqual([])
  })
})

describe('rules-card entries by input_schema.type', () => {
  const ruleTypes = ['bendle', 'pin', 'hues-cues', 'wager', 'order']
  it.each(ruleTypes)('%s resolves to exactly one rules definition', type => {
    const matches = SHINY_EXPLAINERS.filter(d => d.inputType === type)
    expect(matches).toHaveLength(1)
    // A generated format id must not matter — only the schema type.
    expect(getShinyExplainer('fmt_generated_x', type)).toBe(matches[0])
    expect(getShinyExplainer({ formatId: 'fmt_generated_x', inputType: type })).toBe(matches[0])
    expect(matches[0].mode).toBe('rules')
    expect(matches[0].action).toBeTruthy()
    expect(matches[0].scoring.length).toBeGreaterThanOrEqual(1)
    expect(matches[0].scoring.length).toBeLessThanOrEqual(2)
  })
  it('formats without a card stay out', () => {
    for (const type of ['choice', 'matching', 'race', 'venn', 'grid', 'image', 'audio', 'video', 'text', 'list', 'elimination']) {
      expect(getShinyExplainer('fmt_generated_x', type)).toBeNull()
    }
  })
  it('every rendererKey is unique', () => {
    const keys = SHINY_EXPLAINERS.map(d => d.rendererKey)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('card scoring copy matches the scorers', () => {
  it('wager line lists every tier threshold and point value from WAGER_TIERS', () => {
    const line = getShinyExplainer({ inputType: 'wager' }).scoring[0]
    expect(line).toBe('Be closer than 50% / 75% / 90% of the other teams to win +10 / +20 / +30.')
    for (const tier of WAGER_TIERS) {
      expect(line).toContain(`${Math.round(tier.threshold * 100)}%`)
      expect(line).toContain(`+${tier.points}`)
    }
  })
  it('wager: a team that misses its bar scores 0, and a winner scores its tier points', () => {
    const results = scoreWagerRound({
      entries: [
        { teamId: 'a', tier: 'fire', guess: 405 }, { teamId: 'b', tier: 'sun', guess: 430 },
        { teamId: 'c', tier: 'safe', guess: 450 }, { teamId: 'd', tier: 'fire', guess: 300 },
        { teamId: 'e', tier: 'safe', guess: 600 },
      ],
      correctAnswer: 412,
    })
    const byId = Object.fromEntries(results.map(r => [r.teamId, r.points]))
    expect(byId).toEqual({ a: getWagerTier('fire').points, b: 0, c: getWagerTier('safe').points, d: 0, e: 0 })
  })
  it('order is all-or-nothing, as the card says', () => {
    const correct = ['a', 'b', 'c', 'd']
    expect(scoreOrderSubmission(correct, correct, DEFAULT_ORDER_POINTS)).toBe(DEFAULT_ORDER_POINTS)
    expect(scoreOrderSubmission(['a', 'c', 'b', 'd'], correct, DEFAULT_ORDER_POINTS)).toBe(0)
    expect(getShinyExplainer({ inputType: 'order' }).scoring.join(' ')).not.toMatch(/\+\d|[1-9]\d* points/)
  })
  it('hues-cues line matches HUES_CUES_SCORE_BANDS', () => {
    const line = getShinyExplainer({ inputType: 'hues-cues' }).scoring[0]
    for (const band of HUES_CUES_SCORE_BANDS) expect(line).toContain(`+${band.points}`)
  })
})
