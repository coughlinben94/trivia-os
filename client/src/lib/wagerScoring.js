import { normalizeRoundScore } from './scoreboardMath.js'

// A wager question is scored RELATIVE TO THE ROOM, not against a fixed
// tolerance band around the true answer. Every team that submitted a guess is
// ranked by absolute distance from the true number; a team wins the tier it
// blind-wagered only if it beat enough of the REST of the room. Miss your
// tier's bar and you get zero — flatly, with no fallback to a lower tier you
// would have cleared. See docs/superpowers/plans/2026-08-16-wager-question-implementation.md.
//
// Emoji note: there is no matchstick emoji in Unicode (verified by scanning
// every assigned codepoint's name for "MATCH" — zero hits). U+1F56F CANDLE is
// the closest small-flame glyph, so the escalation reads candle → fire → sun.
// It needs the VS16 selector (U+FE0F) to render in emoji presentation, which
// is why the string below is '\u{1F56F}\u{FE0F}' and not the bare codepoint.
export const WAGER_TIERS = [
  { id: 'safe', emoji: '🕯️', label: 'Play It Safe',         points: 10, threshold: 0.50 },
  { id: 'fire', emoji: '🔥', label: 'Play With Fire',        points: 20, threshold: 0.75 },
  { id: 'sun',  emoji: '🌞', label: 'Fly Close To The Sun',  points: 30, threshold: 0.90 },
]

// Safe is the implicit no-risk default: a team that never picked a tier (joined
// late, phone died during the wager beat) is scored as if it played it safe.
export const DEFAULT_TIER_ID = 'safe'

export function getWagerTier(id) {
  return WAGER_TIERS.find(t => t.id === id) ?? WAGER_TIERS[0]
}

// Host-typed answers are free text ("1,200", "$5", "412 wings"). Pull one
// number out of that, or null if there isn't exactly one. A range ("12-15")
// deliberately parses to null — it isn't an answer this mechanic can score.
export function parseWagerNumber(raw) {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  if (typeof raw !== 'string') return null
  const cleaned = raw.replace(/,/g, '').replace(/[^0-9.\-]/g, '')
  if (!cleaned || cleaned === '-' || cleaned === '.') return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

// THE single threshold rule, used by BOTH the phone picker's "beat N of M
// teams" copy and the actual scoring below — they must never drift apart or a
// team gets shown one bar and scored against another.
//
// A team is compared against the OTHER teams in the pool (teamCount - 1), not
// against all of them including itself: with 8 teams the closest guess beats
// 7 of 7 others = 100%, so the 90% Sun tier is reachable in a real bar-sized
// room. Dividing by teamCount instead would cap the best possible team at
// (N-1)/N and make Sun unreachable below 10 teams.
//
// Rounding is CEILING, which is not a judgement call — it's the exact integer
// restatement of `beaten / (teamCount - 1) >= threshold` for an integer
// `beaten`, so the displayed count and the scored condition are the same
// inequality, not two approximations of it.
export function teamsToBeat(threshold, teamCount) {
  if (!Number.isFinite(teamCount) || teamCount <= 1) return 0
  return Math.ceil(threshold * (teamCount - 1))
}

// "Beat 6 of 11 teams" — the win bar as a real head count, never a percentage.
// The count comes from teamsToBeat(), the same function the scorer uses, so
// the bar a team is shown before it wagers and the bar applied at lock time
// are one rule, not two roundings of one idea.
//
// The denominator is the OTHER teams (teamCount - 1) — who a team is actually
// measured against. teamCount here is tonight's REGISTERED teams, while the
// scorer's pool is the teams that actually submitted a guess, so if part of
// the room never answers the real bar ends up easier than this line promised.
// That's the right direction to err for a number shown before anyone has
// answered. Returns null while the count is still unknown, so the caller can
// render nothing rather than a wrong number.
export function wagerOddsLine(threshold, teamCount) {
  if (!Number.isFinite(teamCount) || teamCount < 1) return null
  if (teamCount === 1) return 'Only team here — any wager pays'
  const others = teamCount - 1
  return `Beat ${teamsToBeat(threshold, teamCount)} of ${others} team${others === 1 ? '' : 's'}`
}

// Ranks every entry and applies each team's wagered tier. `entries` is
// [{ teamId, tier, guess }]; guess may be a raw string straight off the phone.
// Returns closest-first, with teams that never guessed last.
//
// Ties are handled by counting only STRICTLY-worse teams as beaten. Two teams
// equidistant from the answer therefore get an identical beaten-count, an
// identical rank, and an identical win/lose outcome — a tie can't produce an
// off-by-one that splits two teams who did exactly as well as each other. It
// also stays explainable out loud: "you beat 2 of the other 3 teams."
export function scoreWagerRound({ entries, correctAnswer }) {
  const correct = parseWagerNumber(correctAnswer)
  const rows = (entries ?? []).map(e => {
    const guess = parseWagerNumber(e.guess)
    const answered = guess != null && correct != null
    return {
      teamId: e.teamId,
      teamName: e.teamName ?? null,
      tier: getWagerTier(e.tier).id,
      guess,
      answered,
      distance: answered ? Math.abs(guess - correct) : null,
    }
  })

  // The ranking pool is only the teams that actually answered — a blank
  // submission isn't a bad guess, it's no guess, and it doesn't get to pad
  // out the room other teams are measured against.
  const pool = rows.filter(r => r.answered)
  const n = pool.length

  const scored = rows.map(r => {
    if (!r.answered) {
      return { ...r, beaten: 0, rank: null, beatFraction: null, points: 0, won: false }
    }
    const beaten = pool.filter(o => o.distance > r.distance).length
    const better = pool.filter(o => o.distance < r.distance).length
    const tier = getWagerTier(r.tier)
    // A lone answering team has nobody to beat, so it clears every bar.
    const won = beaten >= teamsToBeat(tier.threshold, n)
    return {
      ...r,
      beaten,
      rank: better + 1,
      beatFraction: n > 1 ? beaten / (n - 1) : 1,
      points: won ? tier.points : 0,
      won,
    }
  })

  return scored.sort((a, b) => {
    if (a.answered !== b.answered) return a.answered ? -1 : 1
    if (!a.answered) return 0
    return a.distance - b.distance
  })
}

// Pure fold-in, same contract as computeMatchingScoreUpdates: given scored
// results + live team registrations + the admin scoreboard, produce the
// scoreboard_teams rows to upsert. team_id <-> team name matching is
// case-insensitive/trimmed because `teams` (phone) and `scoreboard_teams`
// (host-typed) have no FK relationship. Writes the round's `phone` half only,
// preserving `written`, and OVERWRITES rather than adds so re-scoring after a
// failed attempt is idempotent.
export function computeWagerScoreUpdates({ results, teams, scoreboardTeams, roundKey }) {
  const teamIdToName = new Map((teams ?? []).map(t => [t.id, t.name.trim().toLowerCase()]))
  const updates = []
  for (const r of results ?? []) {
    const teamName = teamIdToName.get(r.teamId)
    if (!teamName) continue // no live registration — nothing to attribute this to
    const sbTeam = (scoreboardTeams ?? []).find(t => t.name.trim().toLowerCase() === teamName)
    if (!sbTeam) continue // host hasn't added this team to the admin scoreboard yet
    const prevSplit = normalizeRoundScore(sbTeam.scores?.[roundKey])
    const nextScores = { ...sbTeam.scores, [roundKey]: { written: prevSplit.written, phone: r.points } }
    updates.push({ id: sbTeam.id, show_id: sbTeam.show_id, name: sbTeam.name, scores: nextScores, sort_order: sbTeam.sort_order })
  }
  return updates
}
