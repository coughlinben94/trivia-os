import { describe, it, expect } from 'vitest'
import {
  DEFAULT_DROP_TOTAL, dropChip, isValidAlloc, scoreDropSubmission,
  dropSequence, dropStepCount, summarizeDrop, computeDropScoreUpdates, survivorShifts,
} from './dropScoring.js'

const ids = ['a', 'b', 'c', 'd']

describe('dropChip', () => {
  it('is 5 for totals divisible by 5, else 1', () => {
    expect(dropChip(30)).toBe(5)
    expect(dropChip(25)).toBe(5)
    expect(dropChip(12)).toBe(1)
  })
})

describe('isValidAlloc', () => {
  it('accepts whole numbers summing to the total', () => {
    expect(isValidAlloc({ a: 15, b: 5, c: 10, d: 0 }, ids, 30)).toBe(true)
  })
  it('rejects a wrong sum', () => {
    expect(isValidAlloc({ a: 15, b: 5, c: 5, d: 0 }, ids, 30)).toBe(false)
    expect(isValidAlloc({ a: 30, b: 5, c: 0, d: 0 }, ids, 30)).toBe(false)
  })
  it('rejects negatives, fractions, non-objects, unknown ids', () => {
    expect(isValidAlloc({ a: 35, b: -5, c: 0, d: 0 }, ids, 30)).toBe(false)
    expect(isValidAlloc({ a: 29.5, b: 0.5, c: 0, d: 0 }, ids, 30)).toBe(false)
    expect(isValidAlloc(null, ids, 30)).toBe(false)
    expect(isValidAlloc([30, 0, 0, 0], ids, 30)).toBe(false)
    expect(isValidAlloc({ a: 15, zzz: 15 }, ids, 30)).toBe(false)
  })
  it('treats missing ids as 0', () => {
    expect(isValidAlloc({ a: 30 }, ids, 30)).toBe(true)
  })
})

describe('scoreDropSubmission', () => {
  it('pays the points placed on the correct tile', () => {
    expect(scoreDropSubmission({ a: 15, b: 5, c: 10, d: 0 }, 'c', ids, 30)).toBe(10)
    expect(scoreDropSubmission({ a: 30 }, 'a', ids, 30)).toBe(30)
  })
  it('pays 0 when the correct tile got nothing', () => {
    expect(scoreDropSubmission({ a: 30 }, 'b', ids, 30)).toBe(0)
  })
  it('pays 0 for an invalid submission, even if the correct tile has points', () => {
    expect(scoreDropSubmission({ a: 40 }, 'a', ids, 30)).toBe(0)
    expect(scoreDropSubmission({ a: 10 }, 'a', ids, 30)).toBe(0)
  })
  it('pays 0 with no correct tile set', () => {
    expect(scoreDropSubmission({ a: 30 }, null, ids, 30)).toBe(0)
    expect(scoreDropSubmission({ a: 30 }, 'nope', ids, 30)).toBe(0)
  })
})

describe('dropSequence / dropStepCount', () => {
  const data = { options: ids.map(id => ({ id, label: id.toUpperCase() })), correctId: 'b' }
  it('lists wrong tiles in authored order, skipping the correct one', () => {
    expect(dropSequence(data)).toEqual(['a', 'c', 'd'])
    expect(dropStepCount(data)).toBe(3)
  })
  it('with no correct tile every tile is a drop candidate', () => {
    expect(dropSequence({ ...data, correctId: null })).toEqual(['a', 'b', 'c', 'd'])
  })
  it('ignores blank options', () => {
    const d = { options: [{ id: 'a', label: 'A' }, { id: 'x', label: '' }, { id: 'b', label: 'B' }], correctId: 'a' }
    expect(dropSequence(d)).toEqual(['b'])
  })
})

describe('summarizeDrop', () => {
  it('sums points per tile and counts all-ins, ignoring invalid rows', () => {
    const answers = [
      { team_id: 't1', answer: { a: 30 } },
      { team_id: 't2', answer: { a: 15, b: 15 } },
      { team_id: 't3', answer: { a: 99 } }, // invalid
      { team_id: 't4', answer: null },
    ]
    expect(summarizeDrop(answers, ids, 'a', 30)).toEqual({
      totals: { a: 45, b: 15, c: 0, d: 0 }, allIn: 1, teams: 2,
    })
  })
})

describe('computeDropScoreUpdates', () => {
  it('writes each valid team its correct-tile points into phoneBySlide', () => {
    const teams = [{ id: 't1', name: 'Foo' }, { id: 't2', name: 'Bar' }]
    const scoreboardTeams = [
      { id: 's1', show_id: 'sh', name: 'foo', scores: {}, sort_order: 0 },
      { id: 's2', show_id: 'sh', name: 'bar', scores: {}, sort_order: 1 },
    ]
    const updates = computeDropScoreUpdates({
      answers: [
        { team_id: 't1', answer: { a: 20, b: 10 } },
        { team_id: 't2', answer: { b: 30 } },
      ],
      teams, scoreboardTeams, roundKey: 'r_1', correctId: 'a', optionIds: ids, total: 30, slideId: 'sl',
    })
    const byId = Object.fromEntries(updates.map(u => [u.id, u.scores.r_1.phone.sl]))
    expect(byId).toEqual({ s1: 20, s2: 0 })
  })
  it('scores a registered team that never submitted as 0', () => {
    const teams = [{ id: 't1', name: 'Foo' }]
    const scoreboardTeams = [{ id: 's1', show_id: 'sh', name: 'foo', scores: {}, sort_order: 0 }]
    const updates = computeDropScoreUpdates({
      answers: [], teams, scoreboardTeams, roundKey: 'r_1', correctId: 'a', optionIds: ids, total: 30, slideId: 'sl',
    })
    expect(updates[0].scores.r_1.phone.sl).toBe(0)
  })
})

it('default total is 30', () => expect(DEFAULT_DROP_TOTAL).toBe(30))

describe('survivorShifts', () => {
  it('moves nothing while every tile is still up', () => {
    expect(survivorShifts([false, false, false, false])).toEqual([0, 0, 0, 0])
  })
  it('a lone survivor slides to the middle of the row', () => {
    // 4 slots, tile B (index 1) is the only one left: its slot is 0.5 pitches left of centre
    expect(survivorShifts([true, false, true, true])).toEqual([0, 0.5, 0, 0])
    // tile D alone: 1.5 pitches right of centre, slides left
    expect(survivorShifts([true, true, true, false])).toEqual([0, 0, 0, -1.5])
  })
  it('two survivors close up around the middle', () => {
    // survivors B (1) and D (3) -> a centred pair at -0.5 / +0.5 pitches; they sit at -0.5 / +1.5
    expect(survivorShifts([true, false, true, false])).toEqual([0, 0, 0, -1])
    // survivors A and B are already centred as a pair at -1.5/-0.5 -> shift +1 each
    expect(survivorShifts([false, false, true, true])).toEqual([1, 1, 0, 0])
  })
  it('a full row, or an empty one, has no shifts', () => {
    expect(survivorShifts([true, true, true, true])).toEqual([0, 0, 0, 0])
    expect(survivorShifts([])).toEqual([])
  })
})
