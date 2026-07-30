import { describe, it, expect } from 'vitest'
import { scoreMatchingSubmission, seededShuffle } from './matchingScoring.js'

describe('scoreMatchingSubmission', () => {
  it('scores zero for no pairs', () => {
    expect(scoreMatchingSubmission([], 2)).toBe(0)
  })
  it('scores zero for a null/undefined answer', () => {
    expect(scoreMatchingSubmission(null, 2)).toBe(0)
    expect(scoreMatchingSubmission(undefined, 2)).toBe(0)
  })
  it('counts only pairs where leftId matches rightId', () => {
    const answer = [
      { leftId: 'p1', rightId: 'p1' }, // correct
      { leftId: 'p2', rightId: 'p3' }, // wrong
      { leftId: 'p4', rightId: 'p4' }, // correct
    ]
    expect(scoreMatchingSubmission(answer, 2)).toBe(4)
  })
  it('gives partial credit for a partial submission', () => {
    expect(scoreMatchingSubmission([{ leftId: 'p1', rightId: 'p1' }], 3)).toBe(3)
  })
  it('ignores malformed entries rather than throwing', () => {
    const answer = [{ leftId: 'p1' }, { rightId: 'p2' }, null, {}]
    expect(scoreMatchingSubmission(answer, 5)).toBe(0)
  })
})

describe('seededShuffle', () => {
  const items = [{ id: 'p0' }, { id: 'p1' }, { id: 'p2' }, { id: 'p3' }]

  it('is a permutation — same elements, same length', () => {
    const shuffled = seededShuffle(items, 'slide_abc')
    expect(shuffled).toHaveLength(items.length)
    expect(shuffled.map(i => i.id).sort()).toEqual(items.map(i => i.id).sort())
  })
  it('is deterministic — same seed always gives the same order', () => {
    const a = seededShuffle(items, 'slide_abc').map(i => i.id)
    const b = seededShuffle(items, 'slide_abc').map(i => i.id)
    expect(a).toEqual(b)
  })
  it('is not just a mirror of the input for a 2-item case', () => {
    // The bug this replaces: sort().reverse() on 2 alphabetically-adjacent
    // ids always produces the exact reverse — solvable without reading it.
    // A real seeded shuffle should NOT reliably do that across many seeds.
    const twoItems = [{ id: 'p0' }, { id: 'p1' }]
    const mirrors = Array.from({ length: 20 }, (_, i) =>
      seededShuffle(twoItems, `slide_${i}`).map(x => x.id).join(',') === 'p1,p0'
    )
    expect(mirrors.some(m => !m)).toBe(true)
  })
  it('does not mutate the input array', () => {
    const copy = [...items]
    seededShuffle(items, 'seed')
    expect(items).toEqual(copy)
  })
})
