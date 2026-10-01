import { describe, it, expect } from 'vitest'
import { computeNextStep, computePrevStep, pendingLockPhase, unlockPatch, patchSlideData } from './slideStepping.js'
import { nextPressGate } from './nextPressCue.js'
import { lockRefusal } from './lockRefusal.js'
import { dropSequence, dropOptions, summarizeDrop, computeDropScoreUpdates } from './dropScoring.js'

// A whole Drop question run start to finish through the REAL host code: the
// same step, cue, refusal and scoring functions LiveMode calls, with 6 teams
// that split their 25 points differently. Only the Supabase reads/writes are
// replaced by plain arrays. This is the closest thing to a show without phones.

const noTeams = async () => 0
const tiles = ['Superior', 'Michigan', 'Huron', 'Erie'].map((label, i) => ({ id: `d${i}`, label }))
const total = 25

const teams = ['Quizzy Rascals', 'Cider Sippers', 'Les Quizerables', 'Trivia Newton John', 'Pun Intended', 'Late Joiners']
  .map((name, i) => ({ id: `t${i}`, name }))
const scoreboard = () => teams.map((t, i) => ({ id: `s${i}`, show_id: 'sh', name: t.name.toLowerCase(), scores: {}, sort_order: i }))

// what each team locked in on its phone (Late Joiners never submitted)
const answers = [
  { team_id: 't0', answer: { d0: 0, d1: 25, d2: 0, d3: 0 } },   // all in on the right tile
  { team_id: 't1', answer: { d0: 5, d1: 10, d2: 10, d3: 0 } },  // hedged
  { team_id: 't2', answer: { d0: 25, d1: 0, d2: 0, d3: 0 } },   // all in on a wrong tile
  { team_id: 't3', answer: { d0: 0, d1: 15, d2: 0, d3: 10 } },
  { team_id: 't4', answer: { d0: 10, d1: 10, d2: 10, d3: 10 } }, // 40 points: cheating / bug, must score 0
]

const slideOf = (data = {}) => ({
  id: 'drop1', order: 1, type: 'question', roundId: 'r1',
  data: { isShiny: true, shinyInputSchema: { type: 'drop' }, text: 'Which lake is wholly in the US?', options: tiles, correctId: 'd1', ...data },
})
const intro = { id: 'intro', order: 0, type: 'title', roundId: 'r1', data: {} }
const next = { id: 'q2', order: 2, type: 'question', roundId: 'r1', data: {} }
const showAt = (drop, index = 1) => ({ slides: [intro, drop, next], currentSlideIndex: index, currentSlideId: index === 1 ? 'drop1' : 'q2' })
const dropOf = patch => patch.slides.find(s => s.id === 'drop1')

// Exactly what lockAndScore + handleLockAndScoreDrop write when Ben locks.
function lockAndScore(slide, { seed = 4242 } = {}) {
  const optionIds = dropOptions(slide.data).map(o => o.id)
  const updates = computeDropScoreUpdates({
    answers, teams, scoreboardTeams: scoreboard(), roundKey: 'r_r1',
    correctId: slide.data.correctId, optionIds, total, slideId: slide.id,
  })
  const data = {
    ...slide.data, dropLocked: true, dropLockedAt: 'now', dropSeed: slide.data.dropSeed ?? seed,
    dropResults: summarizeDrop(answers, optionIds, slide.data.correctId, total),
    dropStep: slide.data.dropStep ?? 0, dropRevealed: false,
  }
  return { slide: { ...slide, data }, updates }
}
const pointsByName = updates => Object.fromEntries(updates.map(u => [u.name, u.scores.r_r1.phone.drop1]))

describe('a whole Drop question, host side', () => {
  it('the phones are open, Next starts the lock, and an unset correct tile is refused', () => {
    const open = slideOf()
    expect(pendingLockPhase(open)).toBe('drop')
    expect(nextPressGate({ slide: open, nextSlide: next }).gate).toBe('lock')
    expect(lockRefusal(open)).toBe(null)
    expect(lockRefusal(slideOf({ correctId: null }))).toMatch(/correct tile/i)
  })

  it('scores all six teams correctly, including the cheater and the team that never submitted', () => {
    const { updates } = lockAndScore(slideOf())
    expect(pointsByName(updates)).toEqual({
      'quizzy rascals': 25,       // all in on Michigan
      'cider sippers': 10,        // 10 on Michigan
      'les quizerables': 0,       // all in on the wrong tile
      'trivia newton john': 15,   // 15 on Michigan
      'pun intended': 0,          // 40 points placed: invalid, scored 0
      'late joiners': 0,          // never submitted: a real 0, not skipped
    })
  })

  it('stores the room totals the TV shows, and only counts valid splits', () => {
    const { slide } = lockAndScore(slideOf())
    expect(slide.data.dropResults).toEqual({
      totals: { d0: 30, d1: 50, d2: 10, d3: 10 }, allIn: 1, teams: 4,
    })
  })

  it('then each Next drops one wrong tile in the seeded order, never the correct one, and the cue names it', async () => {
    let { slide } = lockAndScore(slideOf())
    const order = dropSequence(slide.data)
    expect(order).toHaveLength(3)
    expect(order).not.toContain('d1')
    const fell = []
    for (let press = 1; press <= 3; press++) {
      const cue = nextPressGate({ slide, nextSlide: next })
      expect(cue.gate).toBe('reveal-part')
      const idx = tiles.findIndex(t => t.id === order[press - 1])
      expect(cue.label).toBe(`Drop tile ${String.fromCharCode(65 + idx)} · ${tiles[idx].label}`)
      const patch = await computeNextStep(showAt(slide), noTeams)
      slide = dropOf(patch)
      fell.push(slide.data.dropStep)
      expect(slide.data.dropRevealed).toBe(press === 3)
    }
    expect(fell).toEqual([1, 2, 3])
    // after the last drop the cue is the ordinary "go to the next slide"
    expect(nextPressGate({ slide, nextSlide: next }).gate).toBe('advance')
    const leave = await computeNextStep(showAt(slide), noTeams)
    expect(leave.current_slide_id).toBe('q2')
  })

  it('Prev puts a tile back one at a time and un-reveals, then Next drops it again', async () => {
    let { slide } = lockAndScore(slideOf())
    for (let i = 0; i < 3; i++) slide = dropOf(await computeNextStep(showAt(slide), noTeams))
    expect(slide.data.dropRevealed).toBe(true)
    slide = dropOf(await computePrevStep(showAt(slide), noTeams))
    expect([slide.data.dropStep, slide.data.dropRevealed]).toEqual([2, false])
    slide = dropOf(await computeNextStep(showAt(slide), noTeams))
    expect([slide.data.dropStep, slide.data.dropRevealed]).toEqual([3, true])
  })

  it('Ben picked the wrong correct tile: fixing it re-scores everyone and restarts the drops, with no double counting', async () => {
    let { slide, updates } = lockAndScore(slideOf())
    for (let i = 0; i < 2; i++) slide = dropOf(await computeNextStep(showAt(slide), noTeams))
    expect(slide.data.dropStep).toBe(2)
    // fixDropCorrect: new correct tile, drops rewound, then scored again against the SAME scoreboard rows
    const fixed = { ...slide, data: { ...slide.data, correctId: 'd0', dropStep: 0, dropRevealed: false, dropResults: null } }
    const again = lockAndScore(fixed)
    const rescored = pointsByName(again.updates)
    expect(rescored['les quizerables']).toBe(25)   // was 0, all in on Superior
    expect(rescored['quizzy rascals']).toBe(0)     // was 25
    expect(rescored['cider sippers']).toBe(5)
    // idempotent: re-scoring writes the slide's own entry, it does not add on top of the earlier 25/10/0/15
    const sample = again.updates.find(u => u.name === 'quizzy rascals')
    expect(Object.keys(sample.scores.r_r1.phone)).toEqual(['drop1'])
    expect(again.slide.data.dropStep).toBe(0)
    expect(dropSequence(again.slide.data)).not.toContain('d0')
    expect(dropSequence(again.slide.data).sort()).toEqual(['d1', 'd2', 'd3'])
    void updates
  })

  it('Unlock reopens the phones and clears the drops, results and seed; a replay reshuffles', async () => {
    let { slide } = lockAndScore(slideOf(), { seed: 1 })
    slide = dropOf(await computeNextStep(showAt(slide), noTeams))
    const patch = unlockPatch('drop', slide.data)
    const reopened = patchSlideData([slide], 'drop1', patch)[0]
    expect(reopened.data.dropLocked).toBe(false)
    expect(reopened.data.dropStep).toBe(null)
    expect(reopened.data.dropResults).toBe(null)
    expect(reopened.data.dropSeed).toBe(null)
    expect(pendingLockPhase(reopened)).toBe('drop')
    const replay = lockAndScore(reopened, { seed: 987654 }).slide
    expect(replay.data.dropSeed).toBe(987654)
  })

  it('across many seeds the correct tile never falls and every wrong tile falls exactly once', () => {
    for (let seed = 0; seed < 500; seed++) {
      const order = dropSequence({ ...slideOf().data, dropSeed: seed })
      expect(order).toHaveLength(3)
      expect(new Set(order).size).toBe(3)
      expect(order).not.toContain('d1')
    }
  })
})
