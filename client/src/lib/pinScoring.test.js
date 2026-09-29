import { describe, it, expect } from 'vitest'
import { scorePinRound, scoringGroupSize, payableRoomSize, resolvePinRoomSize, isValidPin, PIN_POINTS } from './pinScoring.js'

const CORRECT = { lat: 41.8781, lon: -87.6298 } // Chicago
// ~1 degree of latitude = ~69 miles; build pins by offsetting latitude
const pinAt = (miles) => ({ lat: CORRECT.lat + miles / 69.0, lon: CORRECT.lon })
const entry = (id, miles) => {
  const pin = miles == null ? null : pinAt(miles)
  if (pin && !isValidPin(pin)) throw new Error(`entry(${id}, ${miles}): pin at lat ${pin.lat} exceeds bounds`)
  return { teamId: id, teamName: id, pin }
}

describe('scoringGroupSize', () => {
  it('follows the spec table', () => {
    const table = { 1: 1, 2: 1, 3: 1, 4: 1, 5: 2, 10: 4, 15: 6, 20: 8, 25: 10, 35: 14, 60: 24 }
    for (const [n, k] of Object.entries(table)) expect(scoringGroupSize(Number(n))).toBe(k)
  })
  it('is 0 for an empty or invalid room', () => {
    expect(scoringGroupSize(0)).toBe(0)
    expect(scoringGroupSize(undefined)).toBe(0)
    expect(scoringGroupSize(-3)).toBe(0)
  })
})

describe('isValidPin', () => {
  it('accepts a lower-48 point and rejects junk', () => {
    expect(isValidPin({ lat: 41, lon: -87 })).toBe(true)
    for (const bad of [null, undefined, {}, { lat: 'a', lon: -87 }, { lat: NaN, lon: -87 }, { lat: 60, lon: -87 }, { lat: 41, lon: 10 }, [41, -87], 'x']) {
      expect(isValidPin(bad)).toBe(false)
    }
  })
})

describe('scorePinRound', () => {
  it('scores the closest 40% of a 10-team room (4 teams), flat 10', () => {
    const entries = Array.from({ length: 10 }, (_, i) => entry(`t${i}`, (i + 1) * 50))
    const r = scorePinRound({ entries, correct: CORRECT, roomSize: 10 })
    expect(r.filter(x => x.points === PIN_POINTS).map(x => x.teamId)).toEqual(['t0', 't1', 't2', 't3'])
    expect(r.filter(x => x.points === 0)).toHaveLength(6)
  })
  it('small room (<5): only the closest team scores', () => {
    const r = scorePinRound({ entries: [entry('a', 300), entry('b', 100), entry('c', 200)], correct: CORRECT, roomSize: 3 })
    expect(r.filter(x => x.points > 0).map(x => x.teamId)).toEqual(['b'])
  })
  it('ties at the cutoff all score (compared on whole miles)', () => {
    // roomSize 5 -> 2 score. b and c are both ~200 mi, so both score.
    // b=200 and c=200.2 both round to 200 whole miles (tie at the cutoff).
    // d=400 and e=500 are beyond the cutoff and score 0.
    const entries = [entry('a', 50), entry('b', 200), entry('c', 200.2), entry('d', 400), entry('e', 500)]
    const r = scorePinRound({ entries, correct: CORRECT, roomSize: 5 })
    expect(r.filter(x => x.points > 0).map(x => x.teamId).sort()).toEqual(['a', 'b', 'c'])
    expect(r.find(x => x.teamId === 'b').miles).toBe(r.find(x => x.teamId === 'c').miles)
    expect(r.filter(x => x.teamId === 'd' || x.teamId === 'e').every(x => x.points === 0)).toBe(true)
  })
  it('a team with no or invalid pin scores 0, sorts last, and still counts toward the room', () => {
    const entries = [entry('a', 10), entry('b', 20), { teamId: 'z', teamName: 'z', pin: { lat: NaN, lon: 1 } }, entry('n', null)]
    const r = scorePinRound({ entries, correct: CORRECT, roomSize: 10 })
    expect(r.slice(-2).every(x => x.points === 0 && x.miles === null && x.pin === null)).toBe(true)
    expect(r.filter(x => x.points > 0).map(x => x.teamId)).toEqual(['a', 'b'])
  })
  it('fewer pins than the group size: every pinned team scores', () => {
    const r = scorePinRound({ entries: [entry('a', 50), entry('b', 100)], correct: CORRECT, roomSize: 25 })
    expect(r.every(x => x.points === PIN_POINTS)).toBe(true)
  })
  it('returns miles as whole numbers, sorted closest first', () => {
    const r = scorePinRound({ entries: [entry('b', 300), entry('a', 100)], correct: CORRECT, roomSize: 10 })
    expect(r.map(x => x.teamId)).toEqual(['a', 'b'])
    expect(Number.isInteger(r[0].miles)).toBe(true)
    expect(r[0]).not.toHaveProperty('exact')
  })
  it('scores nobody with a missing/invalid correct spot or empty room', () => {
    expect(scorePinRound({ entries: [entry('a', 1)], correct: null, roomSize: 5 }).every(x => x.points === 0)).toBe(true)
    expect(scorePinRound({ entries: [entry('a', 1)], correct: CORRECT, roomSize: 0 }).every(x => x.points === 0)).toBe(true)
  })
  it('all-identical pins all tie and all score', () => {
    const entries = ['a', 'b', 'c', 'd', 'e', 'f'].map(id => entry(id, 100))
    expect(scorePinRound({ entries, correct: CORRECT, roomSize: 6 }).every(x => x.points === PIN_POINTS)).toBe(true)
  })
})

describe('payableRoomSize', () => {
  it('counts only teams that have a matching scoreboard row (trim + lowercase)', () => {
    const teams = [{ id: '1', name: ' Quiz Kids ' }, { id: '2', name: 'ghost' }, { id: '3', name: 'Pints' }]
    const sb = [{ id: 's1', name: 'quiz kids' }, { id: 's3', name: 'PINTS' }]
    expect(payableRoomSize(teams, sb)).toBe(2)
  })
})

describe('resolvePinRoomSize', () => {
  it('saved beats override beats payable', () => {
    expect(resolvePinRoomSize({ saved: 7, override: 9, payable: 12 })).toBe(7)
    expect(resolvePinRoomSize({ saved: undefined, override: 9, payable: 12 })).toBe(9)
    expect(resolvePinRoomSize({ saved: undefined, override: undefined, payable: 12 })).toBe(12)
  })
  it('falls through on 0, NaN, negative or non-numbers', () => {
    expect(resolvePinRoomSize({ saved: 0, override: 9, payable: 12 })).toBe(9)
    expect(resolvePinRoomSize({ saved: NaN, override: 9, payable: 12 })).toBe(9)
    expect(resolvePinRoomSize({ saved: 5, override: 0, payable: 12 })).toBe(5)
    expect(resolvePinRoomSize({ saved: null, override: -2, payable: 12 })).toBe(12)
    expect(resolvePinRoomSize({ saved: '8', override: null, payable: 12 })).toBe(12)
  })
})
