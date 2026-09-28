import { describe, it, expect } from 'vitest'
import { computeAwards, pickAwards, nightAwards, AWARD_POOL } from './nightAwards.js'

// Four normal rounds (a-d), a Swing round and a PYL round, numbered in play
// order. Scores key off round id, the same `r_${id}` format scoreboard_teams uses.
const show = {
  rounds: [
    { id: 'a', number: 1, roundNumber: 1 },
    { id: 'b', number: 2, roundNumber: 2 },
    { id: 's', number: 3, roundType: 'swing' },
    { id: 'c', number: 4, roundNumber: 3 },
    { id: 'p', number: 5, roundType: 'pyl' },
    { id: 'd', number: 6, roundNumber: 4 },
  ],
  slides: [],
}
const KEYS = ['a', 'b', 's', 'c', 'p', 'd']
// team('X', [a, b, s, c, p, d]) — undefined leaves that round unscored.
const team = (name, vals = [], extra = {}) => {
  const scores = {}
  KEYS.forEach((k, i) => { if (vals[i] !== undefined) scores[`r_${k}`] = vals[i] })
  return { id: name, name, scores: { ...scores, ...extra } }
}
const byId = (awards, id) => awards.find(a => a.id === id) ?? null

describe('nightAwards: pool', () => {
  it('has 8 auto awards plus the opt-in Bruised Apple', () => {
    expect(AWARD_POOL.map(a => a.id)).toEqual([
      'best-round', 'biggest-comeback', 'most-consistent', 'hot-streak',
      'late-bloomer', 'swing-champion', 'pyl-king', 'wire-to-wire', 'bruised-apple',
    ])
  })

  it('no teams, or nobody scored: nothing qualifies, never throws', () => {
    expect(computeAwards(show, [])).toEqual([])
    expect(computeAwards(show, null)).toEqual([])
    expect(computeAwards({ rounds: [], slides: [] }, [team('A', [5])])).toEqual([])
    expect(computeAwards(show, [team('A'), team('B')])).toEqual([])
  })

  it('every award has the documented shape', () => {
    const teams = [team('A', [10, 9, 5, 8, 20, 9]), team('B', [4, 5, 3, 6, 10, 12])]
    for (const a of computeAwards(show, teams)) {
      expect(Object.keys(a).sort()).toEqual(['id', 'statLine', 'strength', 'teamNames', 'title'])
      expect(a.teamNames.length).toBeGreaterThan(0)
      expect(typeof a.strength).toBe('number')
    }
  })
})

describe('Best Round', () => {
  it('finds the highest single normal-round score', () => {
    const a = byId(computeAwards(show, [team('A', [5, 12]), team('B', [9, 6])]), 'best-round')
    expect(a).toMatchObject({ title: 'Best Round', teamNames: ['A'], statLine: '12 points in Round 2' })
  })

  it('reads {written, phone} split scores through the shared normalizer', () => {
    const a = byId(computeAwards(show, [
      team('A', [{ written: 6, phone: { s1: 3, s2: 4 } }]),
      team('B', [10]),
    ]), 'best-round')
    expect(a.teamNames).toEqual(['A'])
    expect(a.statLine).toBe('13 points in Round 1')
  })

  it('ignores the bonus column and Swing/PYL rounds (they have their own awards)', () => {
    const a = byId(computeAwards(show, [
      team('A', [5, 5, 30, 5, 40, 5], { bonus: 99 }),
      team('B', [8, 5, 1, 5, 1, 5]),
    ]), 'best-round')
    expect(a.teamNames).toEqual(['B'])
  })

  it('ties show both names; more than 2 tied caps at 2', () => {
    const two = byId(computeAwards(show, [team('B', [10]), team('A', [10]), team('C', [3])]), 'best-round')
    expect(two.teamNames).toEqual(['A', 'B'])
    const three = byId(computeAwards(show, [team('C', [10]), team('B', [10]), team('A', [10])]), 'best-round')
    expect(three.teamNames).toHaveLength(2)
  })

  it('tied in different rounds says "a single round"', () => {
    const a = byId(computeAwards(show, [team('A', [10, 1]), team('B', [1, 10])]), 'best-round')
    expect(a.statLine).toBe('10 points in a single round')
  })

  it('skips blank-named teams', () => {
    const a = byId(computeAwards(show, [team('A', [5]), { id: 'x', name: '  ', scores: { r_a: 50 } }]), 'best-round')
    expect(a.teamNames).toEqual(['A'])
  })

  it('does not qualify when every round score is 0', () => {
    expect(byId(computeAwards(show, [team('A', [0]), team('B', [0])]), 'best-round')).toBeNull()
  })
})

describe('Biggest Comeback', () => {
  // After a: A1 B2 C3 D4 E5.  Through d: E climbs to 1st (worst 5th -> 1st = 4).
  const teams = [
    team('A', [10, 5, 0, 5, 0, 5]),
    team('B', [9, 5, 0, 5, 0, 5]),
    team('C', [8, 5, 0, 5, 0, 5]),
    team('D', [7, 5, 0, 5, 0, 5]),
    team('E', [1, 10, 0, 10, 0, 10]),
  ]

  it('worst cumulative place vs current place', () => {
    const a = byId(computeAwards(show, teams), 'biggest-comeback')
    expect(a).toMatchObject({ title: 'Biggest Comeback', teamNames: ['E'], statLine: '5th after Round 1, now 1st' })
  })

  it('needs at least 4 teams', () => {
    expect(byId(computeAwards(show, teams.slice(2)), 'biggest-comeback')).toBeNull()
  })

  it('needs a gap of at least 3 places', () => {
    const small = [team('A', [10, 5]), team('B', [9, 5]), team('C', [8, 5]), team('D', [1, 15])]
    // D: 4th -> 1st is a gap of 3, which counts
    expect(byId(computeAwards(show, small), 'biggest-comeback').teamNames).toEqual(['D'])
    const smaller = [team('A', [10, 5]), team('B', [9, 5]), team('C', [8, 5]), team('D', [1, 13])]
    // D: 4th -> tied 2nd, gap 2: no award
    expect(byId(computeAwards(show, smaller), 'biggest-comeback')).toBeNull()
  })

  it('ties on gap go to the better current place, then name', () => {
    const t = [
      team('A', [10, 0]), team('B', [9, 0]), team('C', [8, 0]), team('D', [7, 0]),
      team('Y', [1, 20]), team('X', [0, 18]),
    ]
    // Y: 5th -> 1st (4). X: 6th -> 2nd (4). Same gap, Y is higher now.
    expect(byId(computeAwards(show, t), 'biggest-comeback').teamNames).toEqual(['Y'])
  })

  it('a team that joined late is not ranked in rounds it missed', () => {
    const t = [
      team('A', [10, 1, 0, 1]), team('B', [9, 1, 0, 1]), team('C', [8, 1, 0, 1]),
      team('D', [7, 1, 0, 1]), team('Late', [undefined, 15, 0, 15]),
    ]
    // Late was never "5th after Round 1"; its first snapshot is 1st.
    expect(byId(computeAwards(show, t), 'biggest-comeback')).toBeNull()
  })
})

describe('Most Consistent', () => {
  const base = [
    team('Steady', [8, 9, 20, 8, 1, 9]),   // normal rounds 8..9, spread 1 (SW/PYL ignored)
    team('Wild', [2, 15, 0, 7, 0, 3]),
    team('Mid', [5, 9, 0, 6, 0, 8]),
    team('Ok', [6, 9, 0, 4, 0, 8]),
  ]

  it('smallest max-min spread across scored normal rounds', () => {
    const a = byId(computeAwards(show, base), 'most-consistent')
    expect(a).toMatchObject({ title: 'Most Consistent', teamNames: ['Steady'], statLine: 'Every round between 8 and 9 points' })
  })

  it('a zero spread reads as the same score every round', () => {
    const t = [...base.slice(1), team('Flat', [7, 7, 0, 7, 0, 7])]
    expect(byId(computeAwards(show, t), 'most-consistent').statLine).toBe('7 points every round')
  })

  it('only teams with 3+ scored rounds qualify, and it needs 4 of them', () => {
    const t = [...base.slice(0, 3), team('Short', [9, 9])]
    expect(byId(computeAwards(show, t), 'most-consistent')).toBeNull()
  })

  it('a team scoring 0 every round is never "most consistent"', () => {
    const t = [...base, team('Zero', [0, 0, 0, 0, 0, 0])]
    expect(byId(computeAwards(show, t), 'most-consistent').teamNames).toEqual(['Steady'])
  })
})

describe('Hot Streak', () => {
  it('longest run ending now, top 3 and never slipping', () => {
    const t = [
      team('A', [10, 10, 0, 10, 0, 10]),
      team('B', [9, 9, 0, 9, 0, 9]),
      team('C', [0, 0, 0, 20, 0, 15]),
      team('D', [8, 8, 0, 1, 0, 1]),
    ]
    const a = byId(computeAwards(show, t), 'hot-streak')
    // A holds 1st all 6 rounds, B holds 2nd all 6: same run, A is higher now.
    // C is only top 3 for the last 3.
    expect(a).toMatchObject({ title: 'Hot Streak', teamNames: ['A'], statLine: 'Top 3 for 6 rounds straight, never slipping' })
  })

  it('needs a run of at least 3 rounds', () => {
    const played2 = [team('A', [10, 10]), team('B', [9, 9]), team('C', [1, 1]), team('D', [0, 0])]
    expect(byId(computeAwards(show, played2), 'hot-streak')).toBeNull()
  })

  it('improving counts; a slip inside the top 3 breaks the run', () => {
    // A: 1,1,1 then 2,2,2 (slipped after c) -> run of 3.
    // B: 2,2,2 then 1,1,1 (improved) -> run of all 6.
    const t = [
      team('A', [10, 10, 0, 0, 0, 0]),
      team('B', [9, 9, 0, 20, 0, 1]),
      team('C', [1, 1, 0, 0, 0, 0]),
      team('D', [0, 0, 0, 0, 0, 0]),
    ]
    const a = byId(computeAwards(show, t), 'hot-streak')
    expect(a.teamNames).toEqual(['B'])
    expect(a.statLine).toBe('Top 3 for 6 rounds straight, never slipping')
  })
})

describe('Late Bloomer', () => {
  it('biggest jump from first-half to second-half average of normal rounds', () => {
    const t = [
      team('Bloom', [2, 4, 0, 10, 0, 12]),
      team('Flat', [8, 8, 0, 8, 0, 8]),
      team('Fade', [12, 10, 0, 4, 0, 2]),
    ]
    const a = byId(computeAwards(show, t), 'late-bloomer')
    expect(a).toMatchObject({ title: 'Late Bloomer', teamNames: ['Bloom'], statLine: 'Averaged 3 early, 11 late' })
  })

  it('needs 4 scored normal rounds', () => {
    const t = [team('Bloom', [2, 4, 0, 10]), team('Flat', [8, 8, 0, 8])]
    expect(byId(computeAwards(show, t), 'late-bloomer')).toBeNull()
  })

  it('no qualifying jump (under 2 points) means no award', () => {
    const t = [team('A', [5, 5, 0, 6, 0, 5]), team('B', [8, 8, 0, 8, 0, 8])]
    expect(byId(computeAwards(show, t), 'late-bloomer')).toBeNull()
  })

  it('shows one decimal for uneven averages', () => {
    const t = [team('A', [2, 3, 0, 9, 0, 10]), team('B', [8, 8, 0, 8, 0, 8])]
    expect(byId(computeAwards(show, t), 'late-bloomer').statLine).toBe('Averaged 2.5 early, 9.5 late')
  })
})

describe('Swing Champion / Press Your Luck King', () => {
  const t = [team('A', [5, 5, 12, 5, 30]), team('B', [5, 5, 12, 5, 40]), team('C', [5, 5, 3, 5, 10])]

  it('highest Swing Round score, ties share it', () => {
    const a = byId(computeAwards(show, t), 'swing-champion')
    expect(a).toMatchObject({ title: 'Swing Champion', teamNames: ['A', 'B'], statLine: '12 points in the Swing Round' })
  })

  it('highest PYL score', () => {
    const a = byId(computeAwards(show, t), 'pyl-king')
    expect(a).toMatchObject({ title: 'Press Your Luck King', teamNames: ['B'], statLine: '40 points in Press Your Luck' })
  })

  it('finds a legacy swing round by its slides, not its position', () => {
    const legacy = {
      rounds: [{ id: 'a', number: 1, roundNumber: 1 }, { id: 'x', number: 2 }],
      slides: [{ roundId: 'x', type: 'swing-round-intro' }],
    }
    const a = byId(computeAwards(legacy, [{ id: 'A', name: 'A', scores: { r_a: 1, r_x: 9 } }]), 'swing-champion')
    expect(a.teamNames).toEqual(['A'])
  })

  it('no swing/PYL round, or nobody scored there: no award', () => {
    const noSpecial = { rounds: show.rounds.filter(r => !r.roundType), slides: [] }
    const aw = computeAwards(noSpecial, t)
    expect(byId(aw, 'swing-champion')).toBeNull()
    expect(byId(aw, 'pyl-king')).toBeNull()
    expect(byId(computeAwards(show, [team('A', [5, 5, 0, 5, 0])]), 'swing-champion')).toBeNull()
  })
})

describe('Wire to Wire', () => {
  it('led after the first round and still top 3', () => {
    const t = [
      team('A', [10, 1, 0, 1]),
      team('B', [5, 10, 0, 10]),
      team('C', [4, 5, 0, 5]),
      team('D', [3, 5, 0, 1]),
    ]
    // A led after R1 (10), now 3rd (12 vs B 25, C 14)
    const a = byId(computeAwards(show, t), 'wire-to-wire')
    expect(a).toMatchObject({ title: 'Wire to Wire', teamNames: ['A'], statLine: 'Led after Round 1, still 3rd' })
  })

  it('still leading reads "still on top"', () => {
    const t = [team('A', [10, 5, 0, 5]), team('B', [5, 5, 0, 5]), team('C', [4, 4, 0, 4]), team('D', [1, 1, 0, 1])]
    expect(byId(computeAwards(show, t), 'wire-to-wire').statLine).toBe('Led after Round 1, still on top')
  })

  it('fell out of the top 3: no award', () => {
    const t = [team('A', [10, 0, 0, 0]), team('B', [5, 10, 0, 10]), team('C', [4, 10, 0, 10]), team('D', [3, 10, 0, 10])]
    expect(byId(computeAwards(show, t), 'wire-to-wire')).toBeNull()
  })

  it('needs 3 played rounds and 4 teams', () => {
    const t = [team('A', [10, 5]), team('B', [5, 5]), team('C', [4, 4]), team('D', [1, 1])]
    expect(byId(computeAwards(show, t), 'wire-to-wire')).toBeNull()
  })
})

describe('Bruised Apple', () => {
  const t = [team('A', [10, 10, 0, 10]), team('B', [5, 5, 0, 5]), team('Z', [1, 1, 0, 1])]

  it('off unless the flag is on', () => {
    expect(byId(computeAwards(show, t), 'bruised-apple')).toBeNull()
  })

  it('last place, playful', () => {
    const a = byId(computeAwards(show, t, { bruisedApple: true }), 'bruised-apple')
    expect(a.teamNames).toEqual(['Z'])
    expect(a.title).toBe('Bruised Apple')
  })
})

describe('pickAwards', () => {
  const aw = (id, strength, teamNames) => ({ id, title: id, teamNames, statLine: '', strength })

  it('auto: top 3 by strength, ties by pool order', () => {
    const list = [aw('best-round', 0.5, ['A']), aw('biggest-comeback', 0.9, ['B']), aw('most-consistent', 0.5, ['C']), aw('hot-streak', 0.2, ['D'])]
    expect(pickAwards(list, []).map(a => a.id)).toEqual(['biggest-comeback', 'best-round', 'most-consistent'])
  })

  it('spreads the love: skips a second award for the same team when another team is available', () => {
    const list = [aw('best-round', 0.9, ['A']), aw('biggest-comeback', 0.8, ['A']), aw('most-consistent', 0.3, ['B']), aw('hot-streak', 0.2, ['C'])]
    expect(pickAwards(list).map(a => a.id)).toEqual(['best-round', 'most-consistent', 'hot-streak'])
  })

  it('falls back to repeats when no other team is available', () => {
    const list = [aw('best-round', 0.9, ['A']), aw('biggest-comeback', 0.8, ['A']), aw('most-consistent', 0.3, ['B'])]
    expect(pickAwards(list).map(a => a.id)).toEqual(['best-round', 'most-consistent', 'biggest-comeback'])
  })

  it('pinned awards come first in host order; a pin that did not qualify is filled by auto', () => {
    const list = [aw('best-round', 0.9, ['A']), aw('most-consistent', 0.3, ['B']), aw('wire-to-wire', 0.5, ['C'])]
    expect(pickAwards(list, ['wire-to-wire', 'late-bloomer']).map(a => a.id)).toEqual(['wire-to-wire', 'best-round', 'most-consistent'])
  })

  it('bad awardIds values are treated as auto', () => {
    const list = [aw('best-round', 0.9, ['A'])]
    expect(pickAwards(list, 'nope').map(a => a.id)).toEqual(['best-round'])
    expect(pickAwards(list, null).map(a => a.id)).toEqual(['best-round'])
  })

  it('fewer than 3 qualify: show what qualifies; none: empty', () => {
    expect(pickAwards([aw('best-round', 0.5, ['A'])])).toHaveLength(1)
    expect(pickAwards([])).toEqual([])
  })

  it('Bruised Apple is never auto-picked into a strength slot, and takes the last card when on', () => {
    const list = [aw('best-round', 0.9, ['A']), aw('most-consistent', 0.3, ['B']), aw('hot-streak', 0.2, ['C']), aw('bruised-apple', 0, ['Z'])]
    expect(pickAwards(list).map(a => a.id)).toEqual(['best-round', 'most-consistent', 'bruised-apple'])
    expect(pickAwards(list, ['bruised-apple']).map(a => a.id)).toEqual(['best-round', 'most-consistent', 'bruised-apple'])
  })
})

describe('nightAwards (slide entry point)', () => {
  it('computes and picks from slide data', () => {
    const t = [team('A', [10, 9, 5, 8, 20, 9]), team('B', [4, 5, 3, 6, 10, 12]), team('C', [1, 1, 1, 1, 1, 1])]
    const res = nightAwards(show, t, { awardIds: ['pyl-king'] })
    expect(res[0].id).toBe('pyl-king')
    expect(res.length).toBeLessThanOrEqual(3)
    expect(nightAwards(show, [], undefined)).toEqual([])
  })
})
