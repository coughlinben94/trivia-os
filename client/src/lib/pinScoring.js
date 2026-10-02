import { haversineMiles } from './usProjection.js'
import { applyPhoneScoreUpdates } from './scoreboardMath.js'
import { normalizeTeamName } from './teamColors.js'

export const PIN_POINTS = 10
export const PIN_WINNER_FRACTION = Object.freeze({ numerator: 2, denominator: 5 })
export const PIN_MIN_ROOM_FOR_FRACTION = 5
export const US_BOUNDS = { minLat: 24, maxLat: 50, minLon: -125.5, maxLon: -66 }

export const PIN_SPOT_ERROR = 'Set the true spot first — click the map in the slide editor'

// A Pin It question slide the host cannot lock yet (no valid true spot). Drives the
// build-list badge and LiveMode's Next guard, so both agree with the lock preCheck.
export function pinMissingSpot(slide) {
  return slide?.type === 'question' && slide.data?.shinyInputSchema?.type === 'pin' && !isValidPin(slide.data.pinAnswer)
}

// Host panel line once pins are locked and scored.
export function pinLockedStatus(data) {
  const room = Number.isFinite(data?.pinRoomSize) ? `room of ${data.pinRoomSize}` : 'room size not recorded'
  return `Pins locked and scored (${room}) — press A to reveal the true spot on the TV.`
}

// phone_answers.answer has no shape check, so anything a phone sent is
// treated as hostile until it passes this.
export function isValidPin(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return false
  const { lat, lon } = p
  return Number.isFinite(lat) && Number.isFinite(lon)
    && lat >= US_BOUNDS.minLat && lat <= US_BOUNDS.maxLat
    && lon >= US_BOUNDS.minLon && lon <= US_BOUNDS.maxLon
}

// Host-typed "lat, lon" (strict: two signed decimals, optional leading + / trailing dot, comma between).
export function parsePinPaste(text) {
  const m = String(text ?? '').trim().match(/^([+-]?\d+(?:\.\d*)?)\s*,\s*([+-]?\d+(?:\.\d*)?)$/)
  const pin = m ? { lat: parseFloat(m[1]), lon: parseFloat(m[2]) } : null
  return pin && isValidPin(pin) ? pin : null
}

// Top PIN_WINNER_FRACTION of the room, rounded up, via integer math (no float drift).
// Rooms under PIN_MIN_ROOM_FOR_FRACTION teams: closest team only.
export function scoringGroupSize(roomSize) {
  if (!Number.isFinite(roomSize) || roomSize <= 0) return 0
  const n = Math.floor(roomSize)
  if (n < PIN_MIN_ROOM_FOR_FRACTION) return 1
  const { numerator, denominator } = PIN_WINNER_FRACTION
  return Math.floor((numerator * n + denominator - 1) / denominator)
}

// The room = teams that can actually be paid: a live `teams` row that matches
// a scoreboard row by trimmed, lowercased name (the same match
// applyPhoneScoreUpdates uses). Counting teams that can never be paid would
// raise the cutoff for nobody's benefit.
export function payableRoomSize(teams, scoreboardTeams) {
  const sbNames = new Set((scoreboardTeams ?? []).map(t => normalizeTeamName(t.name)))
  return (teams ?? []).filter(t => sbNames.has(normalizeTeamName(t.name))).length
}

// Only payable teams (live team row + scoreboard row) take part in the round,
// so an unpaid team can never take a scoring slot it can't be paid for.
export function payableEntries(entries, teams, scoreboardTeams) {
  const sbNames = new Set((scoreboardTeams ?? []).map(t => normalizeTeamName(t.name)))
  const payableIds = new Set((teams ?? []).filter(t => sbNames.has(normalizeTeamName(t.name))).map(t => t.id))
  return (entries ?? []).filter(e => payableIds.has(e.teamId))
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

// The whole lock-and-score computation for one Pin It slide, pure so it can be
// tested without LiveMode. `data` is slide.data (pinAnswer, saved room size,
// host override). Room size: saved wins (Retry Scoring can't change who scores),
// then the override, then the payable count.
export function buildPinRound({ answers, teams, scoreboardTeams, data, roundKey, slideId }) {
  const teamIdToName = new Map((teams ?? []).map(t => [t.id, t.name]))
  const entries = payableEntries(
    (answers ?? []).map(a => ({ teamId: a.team_id, teamName: teamIdToName.get(a.team_id) ?? null, pin: a.answer })),
    teams, scoreboardTeams,
  )
  const roomSize = resolvePinRoomSize({
    saved: data.pinRoomSize,
    override: data.pinRoomSizeOverride,
    payable: payableRoomSize(teams, scoreboardTeams),
  })
  const results = scorePinRound({ entries, correct: data.pinAnswer, roomSize })
  const updates = computePinScoreUpdates({ results, teams, scoreboardTeams, roundKey, slideId })
  return {
    results,
    updates,
    extraData: { pinRoomSize: roomSize },
    unmatchedError: answers.length > 0 && updates.length === 0
      ? 'No pins could be matched to the scoreboard — check team names match, then retry'
      : null,
  }
}
