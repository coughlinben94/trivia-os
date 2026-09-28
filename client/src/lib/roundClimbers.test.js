import { describe, it, expect } from 'vitest'
import { computeClimbers, ordinal, CLOSE_CHASE_GAP, MAX_CLIMBERS } from './roundClimbers.js'

// Three rounds, numbered 1..3. Scores key off round id (`r_${id}`), the same
// format scoreboard_teams uses.
const show = {
  rounds: [
    { id: 'a', number: 1, roundNumber: 1 },
    { id: 'b', number: 2, roundNumber: 2 },
    { id: 'c', number: 3, roundNumber: 3 },
  ],
  slides: [],
}
const team = (name, r1, r2, r3, extra = {}) => {
  const scores = {}
  if (r1 !== undefined) scores.r_a = r1
  if (r2 !== undefined) scores.r_b = r2
  if (r3 !== undefined) scores.r_c = r3
  return { id: name, name, scores: { ...scores, ...extra } }
}

describe('computeClimbers: round lookup', () => {
  it('reports no-round when the slide has no round', () => {
    expect(computeClimbers(show, null, [team('A', 1, 1)]).status).toBe('no-round')
  })

  it('reports no-round when the round id is unknown', () => {
    expect(computeClimbers(show, 'zzz', [team('A', 1, 1)]).status).toBe('no-round')
  })

  it('reports first-round when there is nothing before this round', () => {
    const r = computeClimbers(show, 'a', [team('A', 5), team('B', 3)])
    expect(r.status).toBe('first-round')
    expect(r.climbers).toEqual([])
  })

  it('labels the current and previous rounds', () => {
    const r = computeClimbers(show, 'b', [team('A', 5, 0), team('B', 3, 9)])
    expect(r.roundLabel).toBe('R2')
    expect(r.prevRoundLabel).toBe('R1')
  })

  it('orders rounds by number, not array position', () => {
    const shuffled = { ...show, rounds: [show.rounds[2], show.rounds[0], show.rounds[1]] }
    const r = computeClimbers(shuffled, 'b', [team('A', 5, 0), team('B', 3, 9)])
    expect(r.prevRoundLabel).toBe('R1')
    expect(r.status).toBe('ok')
  })
})

describe('computeClimbers: basic climb', () => {
  it('finds the team that climbed and how far', () => {
    // After R1: A 10, B 8, C 2.  After R2: C 2+12=14, A 11, B 9.
    const r = computeClimbers(show, 'b', [team('A', 10, 1), team('B', 8, 1), team('C', 2, 12)])
    expect(r.status).toBe('ok')
    expect(r.climbers).toEqual([{ id: 'C', name: 'C', from: 3, to: 1, climb: 2, total: 14 }])
  })

  it('sorts bigger climbs first, then better current place', () => {
    const teams = [
      team('A', 10, 0),
      team('B', 9, 0),
      team('C', 8, 5),
      team('D', 7, 7),
      team('E', 1, 20),
      team('F', 0, 12),
    ]
    // After R1: A10 B9 C8 D7 E1 F0 -> places 1..6
    // After R2: E21 D14 C13 F12 A10 B9 -> E1 D2 C3 F4 A5 B6
    const r = computeClimbers(show, 'b', teams)
    expect(r.climbers.map(c => [c.name, c.climb])).toEqual([
      ['E', 4], ['D', 2], ['F', 2],
    ])
  })

  it('uses cumulative totals through each round, not just that round', () => {
    // R3 climb: after R2 A20 B18; after R3 B18+5=23, A20+1=21
    const r = computeClimbers(show, 'c', [team('A', 10, 10, 1), team('B', 9, 9, 5)])
    expect(r.climbers.map(c => c.name)).toEqual(['B'])
    expect(r.prevRoundLabel).toBe('R2')
  })

  it('reads { written, phone } split scores the same as plain numbers', () => {
    const r = computeClimbers(show, 'b', [
      team('A', 10, { written: 0, phone: {} }),
      team('B', { written: 4, phone: { s1: 2 } }, { written: 3, phone: { s2: 5 } }),
    ])
    // After R1: A10 B6. After R2: B14 A10.
    expect(r.climbers).toEqual([{ id: 'B', name: 'B', from: 2, to: 1, climb: 1, total: 14 }])
  })

  it('counts the bonus column in both snapshots, like the scoreboard does', () => {
    // A leads on bonus points, so B moving past A's round score is not a climb
    // to 1st: the board still has A on top.
    const r = computeClimbers(show, 'b', [
      team('A', 10, 0, undefined, { bonus: 50 }),
      team('B', 5, 6),
    ])
    expect(r.status).toBe('no-movement')
  })

  it('reports the place the scoreboard shows when bonus reorders the field', () => {
    const r = computeClimbers(show, 'b', [
      team('A', 10, 0, undefined, { bonus: 50 }),
      team('B', 5, 20),
      team('C', 8, 0),
    ])
    // Board after R2: A60, B25, C8. Before: A60, C8... B5 -> B is 3rd before? A60 C8 B5.
    expect(r.climbers).toEqual([{ id: 'B', name: 'B', from: 3, to: 2, climb: 1, total: 25 }])
  })
})

describe('computeClimbers: ties', () => {
  it('uses tie-aware places on both sides', () => {
    // After R1: A10 B10 C5 -> places 1,1,3. After R2: C15 A10 B10 -> 1,2,2
    const r = computeClimbers(show, 'b', [team('A', 10, 0), team('B', 10, 0), team('C', 5, 10)])
    expect(r.climbers).toEqual([{ id: 'C', name: 'C', from: 3, to: 1, climb: 2, total: 15 }])
  })

  it('counts moving up into a shared place as a climb', () => {
    // After R1: A10 B8 -> 1,2. After R2: A10 B10 -> 1,1. B climbed one place.
    const r = computeClimbers(show, 'b', [team('A', 10, 0), team('B', 8, 2)])
    expect(r.climbers.map(c => [c.name, c.from, c.to])).toEqual([['B', 2, 1]])
  })

  it('breaks equal climbs by current place, landing in a tie counts', () => {
    // After R1: A20 B19 C18 D17 E16 -> 1..5
    // After R2: C22 D21 A20 E20 B19 -> C1 D2 A3 E3 B5
    const r = computeClimbers(show, 'b', [
      team('A', 20, 0),
      team('B', 19, 0),
      team('C', 18, 4),
      team('D', 17, 4),
      team('E', 16, 4),
    ])
    expect(r.climbers.map(c => [c.name, c.from, c.to, c.climb])).toEqual([
      ['C', 3, 1, 2], ['D', 4, 2, 2], ['E', 5, 3, 2],
    ])
  })

  it('includes a team tied with the 3rd climber', () => {
    const r = computeClimbers(show, 'b', [
      team('A', 40, 0),  // 1 -> 5
      team('B', 30, 0),  // 2 -> 6? see totals
      team('C', 20, 30), // 3 -> 1 (50)
      team('D', 10, 35), // 4 -> 2 (45)
      team('E', 5, 37),  // 5 -> 3 (42)
      team('F', 1, 40),  // 6 -> 4 (41)
    ])
    // After R2: C50 D45 E42 F41 A40 B30 -> every one of C,D,E,F climbed 2
    expect(r.climbers.map(c => c.name)).toEqual(['C', 'D', 'E', 'F'])
  })

  it('never shows more than MAX_CLIMBERS, even with a big tie', () => {
    const teams = []
    // 8 top teams collapse, 8 bottom teams each climb 8 places.
    for (let i = 0; i < 8; i++) teams.push(team(`Top${i}`, 100 - i, 0))
    for (let i = 0; i < 8; i++) teams.push(team(`Low${i}`, 50 - i, 60))
    const r = computeClimbers(show, 'b', teams)
    expect(r.climbers.length).toBe(MAX_CLIMBERS)
    expect(r.climbers.every(c => c.climb === 8)).toBe(true)
  })

  it('reports no-movement when every team is tied both times', () => {
    const r = computeClimbers(show, 'b', [team('A', 5, 5), team('B', 5, 5), team('C', 5, 5)])
    expect(r.status).toBe('no-movement')
    expect(r.climbers).toEqual([])
  })

  it('finds no climbers out of an all-way tie for first', () => {
    // All tied after R1 (place 1). Nobody can do better than 1st.
    const r = computeClimbers(show, 'b', [team('A', 5, 5), team('B', 5, 0), team('C', 5, 1)])
    expect(r.status).toBe('no-movement')
  })
})

describe('computeClimbers: nobody moved', () => {
  it('reports no-movement when order holds', () => {
    const r = computeClimbers(show, 'b', [team('A', 10, 5), team('B', 8, 4), team('C', 2, 1)])
    expect(r.status).toBe('no-movement')
    expect(r.climbers).toEqual([])
  })
})

describe('computeClimbers: incomplete grading', () => {
  it('holds the reveal while any playing team lacks this round', () => {
    const r = computeClimbers(show, 'b', [team('A', 10, 5), team('B', 8), team('C', 2, 12)])
    expect(r.status).toBe('incomplete')
    expect(r.missing).toEqual(['B'])
    expect(r.climbers).toEqual([])
    expect(r.chase).toBeNull()
  })

  it('treats nobody graded yet as incomplete', () => {
    const r = computeClimbers(show, 'b', [team('A', 10), team('B', 8)])
    expect(r.status).toBe('incomplete')
    expect(r.missing).toEqual(['A', 'B'])
  })

  it('counts a score of 0 as graded', () => {
    const r = computeClimbers(show, 'b', [team('A', 10, 0), team('B', 8, 0)])
    expect(r.status).toBe('no-movement')
  })

  it('does not hold the reveal for a team that also scored nothing last round', () => {
    // Gone scored R1 only. R2 and R3 are both blank: it left, so R3 reveals.
    const r = computeClimbers(show, 'c', [team('A', 10, 1, 1), team('B', 5, 2, 20), team('Gone', 8)])
    expect(r.status).toBe('ok')
    expect(r.missing).toEqual([])
    expect(r.climbers.map(c => c.name)).toEqual(['B'])
  })

  it('still holds for a team that scored a real 0 last round and is not graded yet', () => {
    const r = computeClimbers(show, 'c', [team('A', 10, 5, 5), team('B', 8, 6, 7), team('Zero', 9, 0)])
    expect(r.status).toBe('incomplete')
    expect(r.missing).toEqual(['Zero'])
  })

  it('does not call everyone gone when nobody was scored last round', () => {
    const r = computeClimbers(show, 'c', [team('A', 10, undefined, undefined), team('B', 8)])
    expect(r.status).toBe('incomplete')
    expect(r.missing).toEqual(['A', 'B'])
  })

  it('still holds for a team that scored last round but is missing this one', () => {
    const r = computeClimbers(show, 'c', [team('A', 10, 1, 1), team('B', 5, 6, 20), team('Late', 8, 4)])
    expect(r.status).toBe('incomplete')
    expect(r.missing).toEqual(['Late'])
  })

  it('treats a missing earlier round as 0, not as ungraded', () => {
    // B skipped R1 entirely but has R2 and R3; R3 view is still complete.
    const r = computeClimbers(show, 'c', [team('A', 10, 1, 1), team('B', undefined, 5, 9)])
    expect(r.status).toBe('ok')
    expect(r.climbers.map(c => c.name)).toEqual(['B'])
  })
})

describe('computeClimbers: odd rosters', () => {
  it('ignores a team with no scores at all', () => {
    const r = computeClimbers(show, 'b', [team('A', 10, 0), team('B', 5, 6), { id: 'x', name: 'Ghost', scores: {} }])
    expect(r.status).toBe('ok')
    expect(r.missing).toEqual([])
  })

  it('ignores a team with null scores', () => {
    const r = computeClimbers(show, 'b', [team('A', 10, 0), team('B', 5, 6), { id: 'x', name: 'Ghost', scores: null }])
    expect(r.status).toBe('ok')
  })

  it('ignores unnamed rows', () => {
    const r = computeClimbers(show, 'b', [team('A', 10, 0), team('B', 5, 6), team('  ', 1, 99)])
    expect(r.climbers.map(c => c.name)).toEqual(['B'])
  })

  it('reports no-teams with an empty roster', () => {
    expect(computeClimbers(show, 'b', []).status).toBe('no-teams')
    expect(computeClimbers(show, 'b', null).status).toBe('no-teams')
  })

  it('reports too-few with one team', () => {
    expect(computeClimbers(show, 'b', [team('A', 10, 5)]).status).toBe('too-few')
  })

  it('works with exactly two teams', () => {
    const r = computeClimbers(show, 'b', [team('A', 10, 0), team('B', 5, 6)])
    expect(r.status).toBe('ok')
    expect(r.climbers).toEqual([{ id: 'B', name: 'B', from: 2, to: 1, climb: 1, total: 11 }])
  })

  it('never lists a team added mid-show as a climber', () => {
    // New joined in R2 (no R1 score) and scored big.
    const r = computeClimbers(show, 'b', [team('A', 10, 0), team('B', 8, 0), team('New', undefined, 30)])
    expect(r.climbers.map(c => c.name)).not.toContain('New')
    expect(r.status).toBe('no-movement')
  })

  it('does not let a mid-show team fake a drop or climb for others', () => {
    // Without the new team: A1 B2 before and after. New sits on top now.
    const r = computeClimbers(show, 'b', [team('A', 10, 0), team('B', 8, 1), team('New', undefined, 30)])
    expect(r.status).toBe('no-movement')
  })

  it('reports too-few when only one team is comparable', () => {
    const r = computeClimbers(show, 'b', [team('A', 10, 0), team('New', undefined, 30)])
    expect(r.status).toBe('too-few')
  })

  it('passes very long team names through untouched', () => {
    const long = 'The Quizzly Bears Who Definitely Did Not Look Anything Up On Their Phones Tonight'
    const r = computeClimbers(show, 'b', [team('A', 10, 0), team(long, 5, 6)])
    expect(r.climbers[0].name).toBe(long)
  })

  it('trims whitespace in names', () => {
    const r = computeClimbers(show, 'b', [team('A', 10, 0), { id: 'b', name: '  Bee  ', scores: { r_a: 5, r_b: 6 } }])
    expect(r.climbers[0].name).toBe('Bee')
  })
})

describe('computeClimbers: close chase', () => {
  it('names a close race for first', () => {
    const r = computeClimbers(show, 'b', [team('A', 10, 10), team('B', 8, 10), team('C', 1, 1)])
    expect(r.chase).toEqual({ leader: 'A', chaser: 'B', gap: 2 })
  })

  it('works even when nobody moved', () => {
    const r = computeClimbers(show, 'b', [team('A', 10, 10), team('B', 8, 10)])
    expect(r.status).toBe('no-movement')
    expect(r.chase).toEqual({ leader: 'A', chaser: 'B', gap: 2 })
  })

  it('skips the chase when the gap is wide', () => {
    const r = computeClimbers(show, 'b', [team('A', 30, 10), team('B', 8, 10)])
    expect(r.chase).toBeNull()
  })

  it(`allows a gap of exactly CLOSE_CHASE_GAP (${CLOSE_CHASE_GAP})`, () => {
    const r = computeClimbers(show, 'b', [team('A', 10 + CLOSE_CHASE_GAP, 0), team('B', 10, 0)])
    expect(r.chase?.gap).toBe(CLOSE_CHASE_GAP)
  })

  it('skips the chase when first place is tied', () => {
    const r = computeClimbers(show, 'b', [team('A', 10, 10), team('B', 10, 10), team('C', 19, 0)])
    expect(r.chase).toBeNull()
  })

  it('skips the chase when second place is tied', () => {
    const r = computeClimbers(show, 'b', [team('A', 12, 10), team('B', 10, 10), team('C', 10, 10)])
    expect(r.chase).toBeNull()
  })

  it('includes a mid-show team in the chase, since it is on the board', () => {
    const r = computeClimbers(show, 'b', [team('A', 10, 10), team('New', undefined, 19), team('B', 1, 1)])
    expect(r.chase).toEqual({ leader: 'A', chaser: 'New', gap: 1 })
  })
})

describe('ordinal', () => {
  it('formats places', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(ordinal))
      .toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '101st', '111th'])
  })
})

describe('computeClimbers: excludeTop', () => {
  // After R1: A40 B30 C20 D10 E5 F1 -> 1..6
  // After R2: C50 D45 E42 F41 A40 B30 -> C1 D2 E3 F4 A5 B6 (C,D,E,F each +2)
  const six = [
    team('A', 40, 0), team('B', 30, 0), team('C', 20, 30),
    team('D', 10, 35), team('E', 5, 37), team('F', 1, 40),
  ]

  it('drops climbers now sitting in the top N, keeps honest places', () => {
    const r = computeClimbers(show, 'b', six, { excludeTop: 3 })
    expect(r.status).toBe('ok')
    expect(r.excludeTop).toBe(3)
    expect(r.climbers).toEqual([{ id: 'F', name: 'F', from: 6, to: 4, climb: 2, total: 41 }])
  })

  it('turns off the chase line when skipping the top', () => {
    const r = computeClimbers(show, 'b', [team('A', 10, 10), team('B', 8, 10), team('C', 1, 1), team('D', 0, 3)], { excludeTop: 3 })
    expect(r.chase).toBeNull()
  })

  it('reports no-movement when every climber is in the top N', () => {
    // C jumps 3 -> 1, nobody else moves.
    const r = computeClimbers(show, 'b', [team('A', 10, 0), team('B', 9, 0), team('C', 8, 5), team('D', 1, 0)], { excludeTop: 3 })
    expect(r.status).toBe('no-movement')
    expect(r.excludeTop).toBe(3)
    expect(r.climbers).toEqual([])
  })

  it('works with 4 teams: 4th place can still be a climber', () => {
    const r = computeClimbers(show, 'b', [team('A', 10, 0), team('B', 9, 0), team('C', 1, 0), team('D', 0, 2)], { excludeTop: 3 })
    // After R1: A B C D. After R2: A10 B9 D2 C1. D went 4th to 3rd, inside the top 3.
    expect(r.status).toBe('no-movement')
    const r2 = computeClimbers(show, 'b', [team('A', 10, 0), team('B', 9, 0), team('C', 8, 0), team('D', 1, 0), team('E', 0, 3)], { excludeTop: 3 })
    // E 5 -> 4
    expect(r2.climbers.map(c => [c.name, c.from, c.to])).toEqual([['E', 5, 4]])
  })

  it('reports too-few with exactly N or fewer teams', () => {
    expect(computeClimbers(show, 'b', [team('A', 10, 0), team('B', 5, 6), team('C', 1, 1)], { excludeTop: 3 }).status).toBe('too-few')
    expect(computeClimbers(show, 'b', [team('A', 10, 0), team('B', 5, 6)], { excludeTop: 3 }).status).toBe('too-few')
  })

  it('excludes a whole tie straddling place N', () => {
    // After R1: A50 B40 C30 D20 E10 F0 -> 1..6
    // After R2: A50 B40 D35 E35 F35 C30 -> A1 B2 D3 E3 F3 C6. D,E,F all tied 3rd.
    const r = computeClimbers(show, 'b', [
      team('A', 50, 0), team('B', 40, 0), team('C', 30, 0),
      team('D', 20, 15), team('E', 10, 25), team('F', 0, 35),
    ], { excludeTop: 3 })
    expect(r.status).toBe('no-movement')
  })

  it('uses the full board place, so a mid-show team in the top N still counts toward it', () => {
    // New sits 1st now. A10 B9 C8 D1 E0 before; after: New30 A10 B9 C8 E4 D1.
    // Among comparable teams E climbs 5 -> 4, but on the full board E is 5th.
    const r = computeClimbers(show, 'b', [
      team('New', undefined, 30), team('A', 10, 0), team('B', 9, 0), team('C', 8, 0),
      team('D', 1, 0), team('E', 0, 4),
    ], { excludeTop: 3 })
    expect(r.climbers.map(c => c.name)).toEqual(['E'])
    const r2 = computeClimbers(show, 'b', [
      team('New', undefined, 30), team('A', 10, 0), team('B', 9, 0),
      team('C', 1, 0), team('D', 0, 2),
    ], { excludeTop: 3 })
    // D climbs 4 -> 3 among comparable, but is 4th on the full board: kept.
    expect(r2.climbers.map(c => c.name)).toEqual(['D'])
  })

  it('still holds the reveal while grading is incomplete', () => {
    const r = computeClimbers(show, 'b', [...six.slice(0, 5), team('F', 1)], { excludeTop: 3 })
    expect(r.status).toBe('incomplete')
    expect(r.missing).toEqual(['F'])
  })

  it.each([
    ['absent', undefined],
    ['0', 0],
    ['NaN', NaN],
    ['negative', -2],
    ['non-integer', 2.5],
    ['string', 'abc'],
  ])('treats excludeTop %s as off', (_, excludeTop) => {
    const opts = excludeTop === undefined ? undefined : { excludeTop }
    const r = computeClimbers(show, 'b', six, opts)
    expect(r.excludeTop).toBe(0)
    expect(r.climbers.map(c => c.name)).toEqual(['C', 'D', 'E', 'F'])
  })

  it('accepts a numeric string like "3" from slide data', () => {
    expect(computeClimbers(show, 'b', six, { excludeTop: '3' }).excludeTop).toBe(3)
  })
})
