import { describe, it, expect } from 'vitest'
import { seededShuffle as orderShuffle } from './orderScoring.js'
import { seededShuffle as matchShuffle } from './matchingScoring.js'
import { hashSeed, mulberry32 } from './seededRandom.js'

// Frozen copy of TeamPickerSlide's old shuffle (no re-roll). Announced team
// orders must not change for a given seed.
function oldPlainShuffle(arr, seedStr) {
  const rand = mulberry32(hashSeed(String(seedStr)))
  const out = arr.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

const SEEDS = ['a', 'slide-1', 'show_x:3', 'Q7', 12345, 'zzzz']
const ids = n => Array.from({ length: n }, (_, i) => ({ id: `i${i}` }))
const idList = a => a.map(x => x.id).join(',')
const prims = n => Array.from({ length: n }, (_, i) => `p${i}`)

describe('seeded shuffle characterization (pins pre-refactor output)', () => {
  it('order', () => {
    expect(SEEDS.map(s => idList(orderShuffle(ids(6), s, ids(6).map(x => x.id))))).toMatchSnapshot()
  })
  it('order without answer key', () => {
    expect(SEEDS.map(s => idList(orderShuffle(ids(6), s)))).toMatchSnapshot()
  })
  it('matching', () => {
    expect(SEEDS.map(s => matchShuffle(prims(6), s).join(','))).toMatchSnapshot()
  })
  it('team picker plain shuffle', () => {
    expect(SEEDS.map(s => oldPlainShuffle(prims(8), s).join(','))).toMatchSnapshot()
  })
  // n=3 with many seeds so the re-roll branches actually fire
  const MANY = Array.from({ length: 60 }, (_, i) => `r${i}`)
  it('order re-roll path', () => {
    expect(MANY.map(s => idList(orderShuffle(ids(3), s, ['i0', 'i1', 'i2'])))).toMatchSnapshot()
  })
  it('matching re-roll path', () => {
    expect(MANY.map(s => matchShuffle(prims(3), s).join(','))).toMatchSnapshot()
  })
})
