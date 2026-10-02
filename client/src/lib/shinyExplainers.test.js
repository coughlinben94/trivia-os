import { describe, it, expect } from 'vitest'
import { hasExplainer, explainerImageUrls, EXPLAINER_BEAT_PARTS, SHINY_EXPLAINERS, getShinyExplainer, explainerCopy, choiceVariantKey, wagerThresholdWords } from './shinyExplainers.js'
import { DEFAULT_TIER_ID, WAGER_TIERS, getWagerTier, scoreWagerRound, wagerTierBar } from './wagerScoring.js'
import { scoreMovieChainSubmission } from './movieChainScoring.js'
import { scoreChoiceSubmission } from './choiceScoring.js'
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
  const ruleTypes = ['bendle', 'pin', 'hues-cues', 'wager', 'order', 'drop', 'movie-chain', 'choice', 'matching']
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
    for (const type of ['race', 'venn', 'grid', 'image', 'audio', 'video', 'text', 'list', 'elimination']) {
      expect(getShinyExplainer('fmt_generated_x', type)).toBeNull()
    }
  })
  it('every rendererKey is unique', () => {
    const keys = SHINY_EXPLAINERS.map(d => d.rendererKey)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('card scoring copy matches the scorers', () => {
  it('wager lines state the bars in words, every tier point value, ties and the default', () => {
    const [line, rest] = getShinyExplainer({ inputType: 'wager' }).scoring
    expect(line).toBe('Beat at least half / three-quarters / nearly all of the other teams to win +10 / +20 / +30.')
    expect(line).not.toMatch(/%/)
    for (const tier of WAGER_TIERS) expect(line).toContain(`+${tier.points}`)
    expect(rest).toBe(`Ties don't count as beating. Miss your bar: 0. No wager = ${getWagerTier(DEFAULT_TIER_ID).label}.`)
  })
  it('wager words are true lower bounds: each real bar is at or above the stated fraction', () => {
    const fraction = { half: 0.5, 'three-quarters': 0.75, 'nearly all': 0.9 }
    const words = wagerThresholdWords.split(' / ')
    expect(words).toHaveLength(WAGER_TIERS.length)
    WAGER_TIERS.forEach((tier, i) => {
      expect(fraction[words[i]]).toBe(tier.threshold)
      for (let room = 2; room <= 30; room++) {
        expect(wagerTierBar(tier.id, room) / (room - 1)).toBeGreaterThanOrEqual(tier.threshold)
      }
    })
    // Up to 10 teams Sun means beating every other team; "Play It Safe" is
    // what a team that never picks is scored as.
    for (let room = 2; room <= 10; room++) expect(wagerTierBar('sun', room)).toBeGreaterThanOrEqual(room - 1)
  })
  it('wager ties do not count as beating', () => {
    const results = scoreWagerRound({ entries: [{ teamId: 'a', tier: 'safe', guess: 10 }, { teamId: 'b', tier: 'safe', guess: 10 }], correctAnswer: 12 })
    expect(results.every(r => r.beaten === 0 && !r.won)).toBe(true)
  })
  it('movie chain: a repeated movie or actor scores 0, as the card says', () => {
    const base = { startId: 'Q1', endId: 'Q3', announcedCount: 3, castByMovie: new Map([['Q1', new Set(['Q9'])], ['Q2', new Set(['Q9'])], ['Q3', new Set(['Q9'])]]) }
    expect(scoreMovieChainSubmission({ movies: ['Q1', 'Q2', 'Q3'], performers: ['Q9', 'Q9'] }, base).points).toBe(0)
    expect(getShinyExplainer({ inputType: 'movie-chain' }).scoring.join(' ')).toContain('repeated movie or actor scores 0')
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

describe('choice card variants (stamped shinyMultiSelect)', () => {
  const choice = getShinyExplainer({ inputType: 'choice' })
  it('variant key comes only from a boolean stamp', () => {
    expect(choiceVariantKey({ shinyMultiSelect: true })).toBe('multi')
    expect(choiceVariantKey({ shinyMultiSelect: false })).toBe('single')
    expect(choiceVariantKey({})).toBeNull()
    expect(choiceVariantKey(undefined)).toBeNull()
  })
  it('single-pick copy says tap one; multi-pick copy says tap every one that fits', () => {
    const single = explainerCopy(choice, { shinyMultiSelect: false })
    const multi = explainerCopy(choice, { shinyMultiSelect: true })
    expect(single.action).toBe('Tap the one right answer on your phone, then lock it in.')
    expect(multi.action).toBe('Tap every answer that fits on your phone, then lock it in.')
    for (const copy of [single, multi]) {
      expect(copy.scoring.length).toBeGreaterThanOrEqual(1)
      expect(copy.scoring.length).toBeLessThanOrEqual(2)
      expect(copy.scoring.join(' ')).not.toMatch(/\+\d|[1-9]\d* points/)
    }
  })
  it('an older title without the stamp gets the generic both-kinds copy', () => {
    expect(explainerCopy(choice, {})).toEqual({ action: choice.action, scoring: choice.scoring })
  })
  it('the copy matches the scorer: single = right pick scores, wrong pick 0; multi = exact set only', () => {
    expect(scoreChoiceSubmission(['b'], ['b'], 5)).toBe(5)
    expect(scoreChoiceSubmission(['a'], ['b'], 5)).toBe(0)
    expect(scoreChoiceSubmission(['a', 'b'], ['a', 'b'], 5)).toBe(5)
    expect(scoreChoiceSubmission(['a'], ['a', 'b'], 5)).toBe(0)
    expect(scoreChoiceSubmission(['a', 'b', 'c'], ['a', 'b'], 5)).toBe(0)
  })
  it('formats without variants ignore the stamp', () => {
    const order = getShinyExplainer({ inputType: 'order' })
    expect(explainerCopy(order, { shinyMultiSelect: true })).toEqual({ action: order.action, scoring: order.scoring })
  })
})
