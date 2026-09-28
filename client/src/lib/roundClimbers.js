// "Biggest climbers" for the round-results reveal (biggest-climbers slide).
// Pure: takes the show (for its round order) and the scoreboard_teams rows,
// and says who gained the most places since the previous round.
//
// The rule:
// - Rounds are ordered the way the scoreboard orders them (deriveRoundCols,
//   by round.number). The bonus column counts in BOTH snapshots, exactly as
//   the TV scoreboard totals it, so a place shown here is the place the
//   scoreboard shows right after. (Left out, a team with bonus points could
//   read "1st" here and "2nd" on the board.)
// - "Before" = cumulative total through the previous round. "Now" = through
//   this round. Both ranked with the shared tie-aware computePlaces (1224),
//   so a team tied for 2nd sits at place 2 either way.
// - climb = place before - place now. Only climb > 0 counts.
// - Climbs are measured only among teams scored both before and now. A team
//   added mid-show (no earlier score) is still on the board for the chase,
//   but it never counts as a climber and never pushes others down.
// - Grading counts as done for a team once this round's key exists on its
//   scores (0 is a real score). One playing team missing it holds the whole
//   reveal ('incomplete'), so a half-graded board never shows fake moves.
//   Exception: a team with NO entry at all for LAST round (while other teams
//   have one) has left the room. It stays on the board at its old total but no
//   longer holds the reveal. A typed 0 last round is a real score (the team was
//   there and missed everything), so that team still holds until graded.
import { deriveRoundCols, computeTotal, computePlaces, pickableTeams } from './scoreboardMath.js'

// Show at most this many climbers. Ties at the 3rd slot are kept (nobody
// tied with a shown climber gets left off) until this cap.
export const TARGET_CLIMBERS = 3
export const MAX_CLIMBERS = 5
// First vs second within this many points reads as a race worth calling out.
export const CLOSE_CHASE_GAP = 3

const hasScore = (scores, key) => {
  const v = scores?.[key]
  return v !== undefined && v !== null && v !== ''
}

export function ordinal(n) {
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`
  return `${n}${{ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th'}`
}

function rankBy(list, key) {
  const sorted = list.slice().sort((a, b) => b[key] - a[key])
  const places = computePlaces(sorted, key)
  return new Map(sorted.map((t, i) => [t.id, places[i]]))
}

function closeChase(field) {
  if (field.length < 2) return null
  const sorted = field.slice().sort((a, b) => b.now - a.now)
  const [first, second, third] = sorted
  if (first.now === second.now) return null            // tied for first: no chase
  if (third && third.now === second.now) return null   // two chasers: not clean
  const gap = first.now - second.now
  return gap <= CLOSE_CHASE_GAP ? { leader: first.name, chaser: second.name, gap } : null
}

// Slide data is host-set JSON, so anything that isn't a positive whole
// number (absent, 0, NaN, negative, 2.5) means "skip nobody".
function normalizeExcludeTop(v) {
  const n = Number(v)
  return Number.isInteger(n) && n > 0 ? n : 0
}

// excludeTop: drop climbers whose place on the FULL board after this round is
// <= N (tie-inclusive), so the slide spotlights teams off the podium. Climb
// math is unchanged, so from/to stay honest. The chase line is about 1st and
// 2nd, so it's off whenever the top is skipped.
export function computeClimbers(show, roundId, teams, { excludeTop } = {}) {
  const skipTop = normalizeExcludeTop(excludeTop)
  const allCols = deriveRoundCols(show)
  const roundCols = allCols.filter(c => c.key !== 'bonus')
  const bonusCols = allCols.filter(c => c.key === 'bonus')
  const idx = roundCols.findIndex(c => c.key === `r_${roundId}`)
  const result = {
    status: 'ok',
    roundLabel: idx >= 0 ? roundCols[idx].label : null,
    prevRoundLabel: idx > 0 ? roundCols[idx - 1].label : null,
    climbers: [],
    chase: null,
    missing: [],
    excludeTop: skipTop,
  }
  if (roundId == null || idx < 0) return { ...result, status: 'no-round' }
  if (idx === 0) return { ...result, status: 'first-round' }

  const current = roundCols[idx]
  const through = roundCols.slice(0, idx + 1)
  const before = roundCols.slice(0, idx)

  const prevKey = before[before.length - 1].key
  // If nobody has a last-round entry, that round simply was not scored, which
  // says nothing about who left.
  const prevRoundScored = (teams ?? []).some(t => hasScore(t.scores, prevKey))

  // Playing = named and scored in at least one round so far. A blank row or
  // a team that has never been graded is not on the board yet.
  const field = pickableTeams(teams ?? [])
    .filter(t => through.some(c => hasScore(t.scores, c.key)))
    .map(t => ({
      id: t.id,
      name: t.name.trim(),
      graded: hasScore(t.scores, current.key),
      gone: prevRoundScored && !hasScore(t.scores, prevKey),
      comparable: before.some(c => hasScore(t.scores, c.key)),
      prev: computeTotal(t.scores, [...before, ...bonusCols]),
      now: computeTotal(t.scores, [...through, ...bonusCols]),
    }))
  if (!field.length) return { ...result, status: 'no-teams' }

  const missing = field.filter(t => !t.graded && !t.gone).map(t => t.name)
  if (missing.length) return { ...result, status: 'incomplete', missing }

  const chase = skipTop ? null : closeChase(field)
  const comparable = field.filter(t => t.comparable)
  if (comparable.length < 2 || field.length <= skipTop) return { ...result, status: 'too-few', chase }
  const boardPlace = rankBy(field, 'now')

  const placeBefore = rankBy(comparable, 'prev')
  const placeNow = rankBy(comparable, 'now')
  const moved = comparable
    .map(t => ({
      id: t.id,
      name: t.name,
      from: placeBefore.get(t.id),
      to: placeNow.get(t.id),
      climb: placeBefore.get(t.id) - placeNow.get(t.id),
      total: t.now,
    }))
    .filter(c => c.climb > 0 && boardPlace.get(c.id) > skipTop)
    .sort((a, b) => b.climb - a.climb || a.to - b.to || a.name.localeCompare(b.name))
  if (!moved.length) return { ...result, status: 'no-movement', chase }

  const cutClimb = moved[Math.min(TARGET_CLIMBERS, moved.length) - 1].climb
  const climbers = moved.filter(c => c.climb >= cutClimb).slice(0, MAX_CLIMBERS)
  return { ...result, climbers, chase }
}
