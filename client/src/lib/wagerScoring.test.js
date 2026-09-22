import { describe, it, expect } from 'vitest'
import {
  WAGER_TIERS,
  getWagerTier,
  parseWagerNumber,
  teamsToBeat,
  wagerTierBar,
  wagerTierReachable,
  wagerOddsLine,
  scoreWagerRound,
  computeWagerScoreUpdates,
} from './wagerScoring.js'

const byId = id => WAGER_TIERS.find(t => t.id === id)

describe('WAGER_TIERS', () => {
  it('is exactly the three tiers at the spec point values and thresholds', () => {
    expect(WAGER_TIERS.map(t => [t.id, t.points, t.threshold])).toEqual([
      ['safe', 10, 0.5],
      ['fire', 20, 0.75],
      ['sun', 30, 0.9],
    ])
  })
  it('carries an escalating emoji per tier — candle, fire, plain sun', () => {
    // There is no matchstick emoji in Unicode (verified by a full-codespace
    // name scan for "MATCH"), so the small-flame step is U+1F56F CANDLE. The
    // sun is the FACELESS U+2600, not U+1F31E SUN WITH FACE. Both of those are
    // text-presentation by default and carry the U+FE0F variation selector
    // that forces emoji presentation — drop VS16 and some phones render a flat
    // monochrome glyph. This test is here to catch exactly that kind of silent
    // codepoint drift.
    expect(WAGER_TIERS.map(t => t.emoji)).toEqual(['\u{1F56F}\u{FE0F}', '\u{1F525}', '\u{2600}\u{FE0F}'])
  })

  it('falls back to safe for an unknown or missing tier id', () => {
    expect(getWagerTier('sun').id).toBe('sun')
    expect(getWagerTier('nonsense').id).toBe('safe')
    expect(getWagerTier(undefined).id).toBe('safe')
    expect(getWagerTier(null).id).toBe('safe')
  })
})

describe('teamsToBeat — the one threshold rule shared by the picker copy and scoring', () => {
  it('converts each tier threshold into a whole number of OTHER teams to beat', () => {
    // 12 teams in the room → 11 others to be measured against.
    expect(teamsToBeat(0.5, 12)).toBe(6)   // ceil(0.5 * 11)
    expect(teamsToBeat(0.75, 12)).toBe(9)  // ceil(0.75 * 11)
    expect(teamsToBeat(0.9, 12)).toBe(10)  // ceil(0.9 * 11)
  })

  it('asks nothing of a room with one team or none', () => {
    expect(teamsToBeat(0.9, 1)).toBe(0)
    expect(teamsToBeat(0.9, 0)).toBe(0)
    expect(teamsToBeat(0.9, undefined)).toBe(0)
  })

  it('is the exact integer restatement of the fraction the scorer uses', () => {
    // For every room size and tier, the team that beat exactly wagerTierBar
    // others must WIN, and the team one short of it must LOSE. If these two
    // ever disagreed, the picker would promise a bar the scorer does not use.
    for (let n = 2; n <= 30; n++) {
      for (const tier of WAGER_TIERS) {
        const need = wagerTierBar(tier.id, n)
        // Build a room of n teams with distinct distances 0..n-1, all on this
        // tier. The team at index i beats (n - 1 - i) others.
        const entries = Array.from({ length: n }, (_, i) => ({ teamId: `t${i}`, tier: tier.id, guess: i }))
        const results = scoreWagerRound({ entries, correctAnswer: 0 })
        // A bar that got pushed past what's reachable in this room (see the
        // wagerTierBar collision tests below) has no team AT the bar — nobody
        // COULD have beaten that many others out of n-1. But that's exactly
        // the property that matters most here: every team on this tier must
        // still cleanly LOSE, not crash, not win by some off-by-one in the
        // comparison. Assert that instead of skipping the room entirely.
        if (need > n - 1) {
          expect(results.every(r => !r.won)).toBe(true)
          continue
        }
        const atBar = results.find(r => r.beaten === need)
        expect(atBar.won).toBe(true)
        if (need > 0) {
          const justUnder = results.find(r => r.beaten === need - 1)
          expect(justUnder.won).toBe(false)
        }
      }
    }
  })
})

describe('wagerTierBar — collision resolution, Ben 2026-08-16: always push the harder tier up', () => {
  it('separates Fire and Sun when their raw ceilings collide in a small room', () => {
    // 4 teams (3 others): raw teamsToBeat gives Fire ceil(.75*3)=3 and
    // Sun ceil(.9*3)=3 — identical, making Fire a dominated tier (same bar,
    // lower payout). wagerTierBar must keep them apart.
    expect(teamsToBeat(0.75, 4)).toBe(3)
    expect(teamsToBeat(0.9, 4)).toBe(3)
    expect(wagerTierBar('fire', 4)).toBe(3)
    expect(wagerTierBar('sun', 4)).toBe(4)
  })

  it('never lowers a tier below its own raw ceiling — only pushes harder ones up', () => {
    // 12 teams: raw ceilings are already 6/9/10, no collision — bars must
    // match teamsToBeat exactly, unchanged.
    expect(wagerTierBar('safe', 12)).toBe(6)
    expect(wagerTierBar('fire', 12)).toBe(9)
    expect(wagerTierBar('sun', 12)).toBe(10)
  })

  it('is strictly increasing safe < fire < sun for every room size, including tiny ones', () => {
    for (let n = 2; n <= 30; n++) {
      const safe = wagerTierBar('safe', n)
      const fire = wagerTierBar('fire', n)
      const sun = wagerTierBar('sun', n)
      expect(fire).toBeGreaterThan(safe)
      expect(sun).toBeGreaterThan(fire)
    }
  })

  it('keeps the lone-team shortcut — every tier stays at 0 with nobody to beat', () => {
    expect(wagerTierBar('safe', 1)).toBe(0)
    expect(wagerTierBar('fire', 1)).toBe(0)
    expect(wagerTierBar('sun', 1)).toBe(0)
    expect(wagerTierBar('sun', 0)).toBe(0)
    expect(wagerTierBar('sun', undefined)).toBe(0)
  })

  it('can push Sun past what a tiny room can ever reach — that is the intended tradeoff', () => {
    // 3 teams (2 others): Fire raw=ceil(.75*2)=2, Sun raw=ceil(.9*2)=2 — same
    // collision. Bumped Sun bar is 3, but only 2 others exist to beat, so
    // Sun is unreachable in a 3-team room. Ben's explicit call: better an
    // occasionally-impossible top tier than a dominated Fire tier.
    expect(wagerTierBar('fire', 3)).toBe(2)
    expect(wagerTierBar('sun', 3)).toBe(3)
  })
})

describe('wagerOddsLine — the picker copy', () => {
  it('states the bar as a head count of other teams, never a percentage', () => {
    expect(wagerOddsLine('safe', 12)).toBe('Beat 6 of 11 teams to win')
    expect(wagerOddsLine('fire', 12)).toBe('Beat 9 of 11 teams to win')
    expect(wagerOddsLine('sun', 12)).toBe('Beat 10 of 11 teams to win')
  })
  it('singularizes a two-team room', () => {
    expect(wagerOddsLine('safe', 2)).toBe('Beat 1 of 1 team to win')
  })
  it('says a bumped-past-reach bar in words instead of an impossible fraction', () => {
    // 2 teams, 1 other: safe/fire/sun raw ceilings all collide at 1, so the
    // collision bump pushes fire to 2 and sun to 3 — both past the only
    // 1 other team that exists. "Beat 3 of 1 team" would be nonsense.
    expect(wagerTierBar('fire', 2)).toBe(2)
    expect(wagerTierBar('sun', 2)).toBe(3)
    expect(wagerOddsLine('fire', 2)).toBe('Not in play tonight — too few teams')
    expect(wagerOddsLine('sun', 2)).toBe('Not in play tonight — too few teams')
    expect(wagerTierReachable('fire', 2)).toBe(false)
    expect(wagerTierReachable('sun', 2)).toBe(false)
    expect(wagerTierReachable('safe', 2)).toBe(true)
  })
  it('handles the one-team room', () => {
    expect(wagerOddsLine('sun', 1)).toBe('Only team here — any wager pays')
  })
  it('returns null while the team count is still unknown, so nothing wrong renders', () => {
    expect(wagerOddsLine('safe', 0)).toBe(null)
    expect(wagerOddsLine('safe', undefined)).toBe(null)
  })
  it('reflects the collision-bumped bar, matching what the scorer will actually require', () => {
    // Fire's bumped bar (3) still fits inside a 4-team room (3 others) — a
    // real, printable fraction. Sun's bumped bar (4) exceeds it, so it falls
    // to the long-shot phrasing instead of a nonsense "4 of 3".
    expect(wagerOddsLine('fire', 4)).toBe('Beat 3 of 3 teams to win')
    expect(wagerOddsLine('sun', 4)).toBe('Not in play tonight — too few teams')
  })
})

describe('parseWagerNumber', () => {
  it('passes finite numbers straight through', () => {
    expect(parseWagerNumber(412)).toBe(412)
    expect(parseWagerNumber(0)).toBe(0)
    expect(parseWagerNumber(-3.5)).toBe(-3.5)
  })
  it('rejects non-finite numbers', () => {
    expect(parseWagerNumber(NaN)).toBe(null)
    expect(parseWagerNumber(Infinity)).toBe(null)
  })
  it('parses plain numeric strings', () => {
    expect(parseWagerNumber('412')).toBe(412)
    expect(parseWagerNumber('  8.5 ')).toBe(8.5)
  })
  it('strips commas, currency, and trailing units a host might type', () => {
    expect(parseWagerNumber('1,200')).toBe(1200)
    expect(parseWagerNumber('$5')).toBe(5)
    expect(parseWagerNumber('412 wings')).toBe(412)
  })
  it('returns null for anything that is not one number', () => {
    expect(parseWagerNumber('')).toBe(null)
    expect(parseWagerNumber('   ')).toBe(null)
    expect(parseWagerNumber('a lot')).toBe(null)
    expect(parseWagerNumber('12-15')).toBe(null) // a range is not an answer
    expect(parseWagerNumber('12 to 15')).toBe(null) // a range spelled out is still a range
    expect(parseWagerNumber('about 250 (2024)')).toBe(null) // two numbers, not one
    expect(parseWagerNumber(null)).toBe(null)
    expect(parseWagerNumber(undefined)).toBe(null)
    expect(parseWagerNumber({})).toBe(null)
  })
  it('still parses genuine single numbers with commas, currency, decimals, and negatives', () => {
    expect(parseWagerNumber('12-15')).toBe(null)
    expect(parseWagerNumber('-15')).toBe(-15)
    expect(parseWagerNumber('12.5')).toBe(12.5)
    expect(parseWagerNumber('$1,234')).toBe(1234)
    expect(parseWagerNumber('1,200')).toBe(1200)
  })
})

describe('scoreWagerRound — relative-to-the-room ranking', () => {
  // Eight teams, distances 0..7 from the true answer. beatFraction is the
  // share of the OTHER seven teams each one beat, so the closest team beats
  // 7/7 = 1.0 and can actually reach the 90% Sun threshold in an 8-team room.
  const eight = Array.from({ length: 8 }, (_, i) => ({ teamId: `t${i}`, tier: 'safe', guess: 100 + i }))

  it('ranks by absolute distance from the true answer, closest first', () => {
    const results = scoreWagerRound({ entries: eight, correctAnswer: 100 })
    expect(results.map(r => r.teamId)).toEqual(['t0', 't1', 't2', 't3', 't4', 't5', 't6', 't7'])
    expect(results.map(r => r.distance)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    expect(results.map(r => r.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })

  it('measures distance absolutely — over and under are equally close', () => {
    const results = scoreWagerRound({
      entries: [{ teamId: 'over', tier: 'safe', guess: 110 }, { teamId: 'under', tier: 'safe', guess: 90 }],
      correctAnswer: 100,
    })
    expect(results.map(r => r.distance)).toEqual([10, 10])
  })

  it('beatFraction is over the OTHER teams, so the closest team beats 100% of the room', () => {
    const results = scoreWagerRound({ entries: eight, correctAnswer: 100 })
    expect(results[0].beatFraction).toBeCloseTo(1)
    expect(results[1].beatFraction).toBeCloseTo(6 / 7)
    expect(results[7].beatFraction).toBeCloseTo(0)
  })

  it('Safe pays out to exactly the better half of an 8-team room', () => {
    const results = scoreWagerRound({ entries: eight, correctAnswer: 100 })
    expect(results.map(r => r.points)).toEqual([10, 10, 10, 10, 0, 0, 0, 0])
    expect(results.map(r => r.won)).toEqual([true, true, true, true, false, false, false, false])
  })

  it('Fire needs 75% and Sun needs 90% of the same 8-team room', () => {
    const fire = scoreWagerRound({ entries: eight.map(e => ({ ...e, tier: 'fire' })), correctAnswer: 100 })
    expect(fire.map(r => r.points)).toEqual([20, 20, 0, 0, 0, 0, 0, 0])
    const sun = scoreWagerRound({ entries: eight.map(e => ({ ...e, tier: 'sun' })), correctAnswer: 100 })
    expect(sun.map(r => r.points)).toEqual([30, 0, 0, 0, 0, 0, 0, 0])
  })

  it('missing your tier threshold is a flat zero — no fallback to a tier you would have made', () => {
    // t2 beat 71% of the room: enough for Safe, not for Fire. It wagered Fire.
    const entries = eight.map((e, i) => (i === 2 ? { ...e, tier: 'fire' } : e))
    const results = scoreWagerRound({ entries, correctAnswer: 100 })
    const t2 = results.find(r => r.teamId === 't2')
    expect(t2.beatFraction).toBeGreaterThan(byId('safe').threshold)
    expect(t2.points).toBe(0)
    expect(t2.won).toBe(false)
  })

  it('a wrong-tier gamble can score less than a worse guess on a safer tier', () => {
    // The room's second-closest team wagered Sun and gets nothing; the fourth
    // closest played Safe and banks 10. That asymmetry is the whole mechanic.
    const entries = eight.map((e, i) => (i === 1 ? { ...e, tier: 'sun' } : e))
    const results = scoreWagerRound({ entries, correctAnswer: 100 })
    expect(results.find(r => r.teamId === 't1').points).toBe(0)
    expect(results.find(r => r.teamId === 't3').points).toBe(10)
  })

  it('treats a missing or unknown tier as Safe', () => {
    const results = scoreWagerRound({
      entries: [
        { teamId: 'a', guess: 100 },
        { teamId: 'b', tier: 'bogus', guess: 101 },
      ],
      correctAnswer: 100,
    })
    expect(results.map(r => r.tier)).toEqual(['safe', 'safe'])
    expect(results.map(r => r.points)).toEqual([10, 0])
  })
})

describe('scoreWagerRound — ties', () => {
  it('gives two equidistant teams an identical rank, beatFraction, and outcome', () => {
    const entries = [
      { teamId: 'a', tier: 'fire', guess: 95 },  // distance 5
      { teamId: 'b', tier: 'fire', guess: 105 }, // distance 5 — dead tie with a
      { teamId: 'c', tier: 'fire', guess: 120 },
      { teamId: 'd', tier: 'fire', guess: 140 },
    ]
    const results = scoreWagerRound({ entries, correctAnswer: 100 })
    const a = results.find(r => r.teamId === 'a')
    const b = results.find(r => r.teamId === 'b')
    expect(a.distance).toBe(b.distance)
    expect(a.rank).toBe(b.rank)
    expect(a.beatFraction).toBe(b.beatFraction)
    expect(a.points).toBe(b.points)
    expect(a.won).toBe(b.won)
  })

  it('counts only strictly-worse teams as beaten — a tie is not a win over your twin', () => {
    // Two tied at the front of a 4-team room each beat 2 of the other 3 (66%):
    // Safe clears, Fire does not. Both get the same answer, which is the point.
    const entries = [
      { teamId: 'a', tier: 'safe', guess: 95 },
      { teamId: 'b', tier: 'fire', guess: 105 },
      { teamId: 'c', tier: 'safe', guess: 120 },
      { teamId: 'd', tier: 'safe', guess: 140 },
    ]
    const results = scoreWagerRound({ entries, correctAnswer: 100 })
    expect(results.find(r => r.teamId === 'a').beatFraction).toBeCloseTo(2 / 3)
    expect(results.find(r => r.teamId === 'b').beatFraction).toBeCloseTo(2 / 3)
    expect(results.find(r => r.teamId === 'a').points).toBe(10)
    expect(results.find(r => r.teamId === 'b').points).toBe(0)
  })

  it('a whole room tied on the same guess all get the same (zero-beat) result', () => {
    const entries = ['a', 'b', 'c', 'd'].map(id => ({ teamId: id, tier: 'safe', guess: 50 }))
    const results = scoreWagerRound({ entries, correctAnswer: 100 })
    expect(results.every(r => r.beatFraction === 0)).toBe(true)
    expect(results.every(r => r.rank === 1)).toBe(true)
    expect(results.every(r => r.points === 0)).toBe(true)
  })

  it('keeps rank consistent after a tie — competition ranking, not a dense one', () => {
    const entries = [
      { teamId: 'a', tier: 'safe', guess: 100 },
      { teamId: 'b', tier: 'safe', guess: 105 },
      { teamId: 'c', tier: 'safe', guess: 95 },
      { teamId: 'd', tier: 'safe', guess: 120 },
    ]
    // distances: a=0, b=5, c=5, d=20 → ranks 1, 2, 2, 4
    const results = scoreWagerRound({ entries, correctAnswer: 100 })
    expect(results.map(r => r.rank)).toEqual([1, 2, 2, 4])
  })
})

describe('scoreWagerRound — non-answerers and degenerate rooms', () => {
  it('scores a team that never guessed at zero and leaves it out of the ranking pool', () => {
    const entries = [
      { teamId: 'a', tier: 'safe', guess: 100 },
      { teamId: 'b', tier: 'safe', guess: 200 },
      { teamId: 'ghost', tier: 'sun', guess: null },
    ]
    const results = scoreWagerRound({ entries, correctAnswer: 100 })
    const ghost = results.find(r => r.teamId === 'ghost')
    expect(ghost.answered).toBe(false)
    expect(ghost.points).toBe(0)
    expect(ghost.rank).toBe(null)
    expect(ghost.beatFraction).toBe(null)
    // Pool is 2, not 3 — 'a' beat the one other team that actually answered.
    expect(results.find(r => r.teamId === 'a').beatFraction).toBe(1)
  })

  it('sorts non-answerers last, after every real guess', () => {
    const entries = [
      { teamId: 'ghost', tier: 'safe', guess: '' },
      { teamId: 'a', tier: 'safe', guess: 100 },
    ]
    expect(scoreWagerRound({ entries, correctAnswer: 100 }).map(r => r.teamId)).toEqual(['a', 'ghost'])
  })

  it('parses string guesses the phone may have stored', () => {
    const results = scoreWagerRound({
      entries: [{ teamId: 'a', tier: 'safe', guess: '1,000' }, { teamId: 'b', tier: 'safe', guess: '2000' }],
      correctAnswer: 1000,
    })
    expect(results[0].teamId).toBe('a')
    expect(results[0].distance).toBe(0)
  })

  it('a single answering team beats the whole (empty) rest of the room', () => {
    const results = scoreWagerRound({ entries: [{ teamId: 'solo', tier: 'sun', guess: 5 }], correctAnswer: 100 })
    expect(results[0].beatFraction).toBe(1)
    expect(results[0].points).toBe(30)
  })

  it('handles an empty room', () => {
    expect(scoreWagerRound({ entries: [], correctAnswer: 100 })).toEqual([])
    expect(scoreWagerRound({ entries: null, correctAnswer: 100 })).toEqual([])
  })

  it('scores everyone zero when the true answer is not a number', () => {
    const entries = [{ teamId: 'a', tier: 'safe', guess: 100 }, { teamId: 'b', tier: 'safe', guess: 101 }]
    const results = scoreWagerRound({ entries, correctAnswer: 'about four hundred' })
    expect(results.every(r => r.points === 0)).toBe(true)
    expect(results.every(r => r.distance === null)).toBe(true)
  })
})

describe('computeWagerScoreUpdates', () => {
  const teams = [{ id: 'team_1', name: 'The Quizzlers' }, { id: 'team_2', name: 'Wing Nuts' }]
  const scoreboardTeams = [
    { id: 'sb_1', show_id: 'show_1', name: '  the quizzlers  ', scores: { r_1: { written: 5, phone: 0 } }, sort_order: 0 },
    { id: 'sb_2', show_id: 'show_1', name: 'Wing Nuts', scores: {}, sort_order: 1 },
  ]

  it('matches teams case-insensitively and trimmed, preserving the written half', () => {
    const results = [
      { teamId: 'team_1', points: 20 },
      { teamId: 'team_2', points: 0 },
    ]
    const updates = computeWagerScoreUpdates({ results, teams, scoreboardTeams, roundKey: 'r_1', slideId: 'slide_wager' })
    expect(updates).toEqual([
      { id: 'sb_1', show_id: 'show_1', name: '  the quizzlers  ', scores: { r_1: { written: 5, phone: { slide_wager: 20 } } }, sort_order: 0 },
      { id: 'sb_2', show_id: 'show_1', name: 'Wing Nuts', scores: { r_1: { written: 0, phone: { slide_wager: 0 } } }, sort_order: 1 },
    ])
  })

  it('skips a result whose team has no live registration', () => {
    const results = [{ teamId: 'ghost_team', points: 30 }]
    expect(computeWagerScoreUpdates({ results, teams, scoreboardTeams, roundKey: 'r_1', slideId: 'slide_wager' })).toEqual([])
  })

  it('skips a team with no scoreboard row yet', () => {
    const results = [{ teamId: 'team_1', points: 30 }]
    expect(computeWagerScoreUpdates({ results, teams, scoreboardTeams: [], roundKey: 'r_1', slideId: 'slide_wager' })).toEqual([])
  })

  it('overwrites this slide only, so re-scoring the same slide is idempotent', () => {
    const already = [{ ...scoreboardTeams[0], scores: { r_1: { written: 5, phone: { slide_wager: 20 } } } }]
    const results = [{ teamId: 'team_1', points: 20 }]
    const [update] = computeWagerScoreUpdates({ results, teams, scoreboardTeams: already, roundKey: 'r_1', slideId: 'slide_wager' })
    expect(update.scores.r_1).toEqual({ written: 5, phone: { slide_wager: 20 } })
  })

  it('adds to, rather than overwrites, a different phone-scored slide already in the round', () => {
    const already = [{ ...scoreboardTeams[0], scores: { r_1: { written: 5, phone: { slide_matching: 8 } } } }]
    const results = [{ teamId: 'team_1', points: 20 }]
    const [update] = computeWagerScoreUpdates({ results, teams, scoreboardTeams: already, roundKey: 'r_1', slideId: 'slide_wager' })
    expect(update.scores.r_1).toEqual({ written: 5, phone: { slide_matching: 8, slide_wager: 20 } })
  })

  it('does not disturb other rounds on the row', () => {
    const sb = [{ ...scoreboardTeams[0], scores: { r_0: 10, r_1: { written: 5, phone: 0 } } }]
    const results = [{ teamId: 'team_1', points: 10 }]
    const [update] = computeWagerScoreUpdates({ results, teams, scoreboardTeams: sb, roundKey: 'r_1', slideId: 'slide_wager' })
    expect(update.scores.r_0).toBe(10)
  })

  it('dedupes by id instead of crashing when two scoreboard rows collide on the same normalized name', () => {
    // Host data-entry accident: two scoreboard_teams rows both typed as "the
    // quizzlers" (different case/spacing). Both live teams below normalize to
    // that same name, so .find() resolves both onto the SAME sbTeam.id — a
    // duplicate id in the upsert array used to crash the whole round's
    // scoring (Postgres ON CONFLICT can't affect one row twice).
    const collidingTeams = [
      { id: 'team_1', name: 'The Quizzlers' },
      { id: 'team_2', name: '  THE QUIZZLERS  ' },
    ]
    const collidingScoreboard = [
      { id: 'sb_1', show_id: 'show_1', name: 'the quizzlers', scores: {}, sort_order: 0 },
    ]
    const results = [
      { teamId: 'team_1', points: 10 },
      { teamId: 'team_2', points: 30 },
    ]
    const updates = computeWagerScoreUpdates({ results, teams: collidingTeams, scoreboardTeams: collidingScoreboard, roundKey: 'r_1', slideId: 'slide_wager' })
    expect(updates).toHaveLength(1)
    const ids = updates.map(u => u.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
