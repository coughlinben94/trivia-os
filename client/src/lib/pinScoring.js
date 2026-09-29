import { haversineMiles } from './usProjection.js'
import { applyPhoneScoreUpdates } from './scoreboardMath.js'
import { normalizeTeamName } from './teamColors.js'

export const PIN_POINTS = 10
export const US_BOUNDS = { minLat: 24, maxLat: 50, minLon: -125.5, maxLon: -66 }

// phone_answers.answer has no shape check, so anything a phone sent is
// treated as hostile until it passes this.
export function isValidPin(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return false
  const { lat, lon } = p
  return Number.isFinite(lat) && Number.isFinite(lon)
    && lat >= US_BOUNDS.minLat && lat <= US_BOUNDS.maxLat
    && lon >= US_BOUNDS.minLon && lon <= US_BOUNDS.maxLon
}

// Top 40% of the room, rounded up, via integer math (no float drift):
// ceil(2N/5) === floor((2N + 4) / 5). Rooms under 5 teams: closest team only.
export function scoringGroupSize(roomSize) {
  if (!Number.isFinite(roomSize) || roomSize <= 0) return 0
  const n = Math.floor(roomSize)
  return n < 5 ? 1 : Math.floor((2 * n + 4) / 5)
}

// The room = teams that can actually be paid: a live `teams` row that matches
// a scoreboard row by trimmed, lowercased name (the same match
// applyPhoneScoreUpdates uses). Counting teams that can never be paid would
// raise the cutoff for nobody's benefit.
export function payableRoomSize(teams, scoreboardTeams) {
  const sbNames = new Set((scoreboardTeams ?? []).map(t => normalizeTeamName(t.name)))
  return (teams ?? []).filter(t => sbNames.has(normalizeTeamName(t.name))).length
}

// Room size precedence: the size saved at first lock wins (so Retry Scoring
// can't change who scores), then the host's override, then the payable count.
export function resolvePinRoomSize({ saved, override, payable }) {
  const ok = n => Number.isFinite(n) && n > 0
  return ok(saved) ? saved : ok(override) ? override : payable
}

export function scorePinRound({ entries, correct, roomSize }) {
  const k = scoringGroupSize(roomSize)
  const correctOk = isValidPin(correct)
  const rows = (entries ?? []).map(e => {
    const ok = correctOk && isValidPin(e.pin)
    const exact = ok ? haversineMiles(e.pin, correct) : null
    return {
      teamId: e.teamId,
      teamName: e.teamName ?? null,
      pin: ok ? { lat: e.pin.lat, lon: e.pin.lon } : null,
      exact,
      miles: ok ? Math.round(exact) : null,
      points: 0,
    }
  })
  const pinned = rows.filter(r => r.pin).sort((a, b) => a.exact - b.exact)
  if (k > 0 && pinned.length > 0) {
    const cutoff = pinned[Math.min(k, pinned.length) - 1].miles // whole miles, what the TV shows
    for (const r of pinned) if (r.miles <= cutoff) r.points = PIN_POINTS
  }
  return rows
    .sort((a, b) => {
      if (a.points !== b.points) return b.points - a.points
      if (a.exact == null) return b.exact == null ? 0 : 1
      if (b.exact == null) return -1
      return a.exact - b.exact
    })
    .map(({ exact, ...r }) => r)
}

// Same fold-in as every phone-scored mechanic: writes only this slide's
// entry into the round's phoneBySlide bucket, idempotent per slideId.
export function computePinScoreUpdates({ results, teams, scoreboardTeams, roundKey, slideId }) {
  return applyPhoneScoreUpdates({ results, teams, scoreboardTeams, roundKey, slideId })
}
