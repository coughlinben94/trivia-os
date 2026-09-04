import { normalizeRoundScore } from './scoreboardMath.js'

// The default tier ladder: earlier layers are harder to guess, so they pay
// more. Not exposed for per-slide editing in this build (mirrors WAGER_TIERS
// being fixed, not configurable) — a follow-up if the defaults don't hold up
// live. See docs/superpowers/specs/2026-09-04-bendle-layered-audio-question-design.md.
export const BENDLE_TIERS = [
  { id: 'drums',  label: 'Drums Only',        atSeconds: 0,  points: 40 },
  { id: 'bass',   label: '+ Bass',            atSeconds: 20, points: 30 },
  { id: 'other',  label: '+ Everything Else', atSeconds: 40, points: 20 },
  { id: 'vocals', label: '+ Vocals',          atSeconds: 60, points: 10 },
]

function normalize(s) {
  return (s ?? '').toString().trim().toLowerCase()
}

// Exact-after-normalize match against the canonical answer or any alias.
// No fuzzy-distance library — aliases are how this codebase already covers
// real spelling/title variants (same bar every other free-text answer in
// this app clears).
export function matchesBendleAnswer(guess, answer, aliases) {
  const g = normalize(guess)
  if (!g) return false
  if (g === normalize(answer)) return true
  return (aliases ?? []).some(a => normalize(a) === g)
}

// Which tier was active at this many elapsed seconds. Tiers must be in
// ascending atSeconds order (same load-bearing-order contract WAGER_TIERS
// documents) — walks forward and returns the LAST tier whose atSeconds <=
// elapsed, defaulting to the first tier for anything before/at zero.
export function resolveBendleTier(elapsedSeconds, tiers) {
  const list = tiers ?? BENDLE_TIERS
  let active = list[0]
  for (const tier of list) {
    if (tier.atSeconds <= elapsedSeconds) active = tier
    else break
  }
  return active
}

// entries: [{ teamId, teamName, guess, elapsedSeconds }]. song: { answer, aliases }.
// A team with no guess (guess == null) scores 0, sorted last — same "no
// guess isn't a bad guess, it's no guess" convention scoreWagerRound uses.
export function scoreBendleRound({ entries, song, tiers = BENDLE_TIERS }) {
  const rows = (entries ?? []).map(e => {
    const correct = e.guess != null && matchesBendleAnswer(e.guess, song?.answer, song?.aliases)
    const tier = correct && e.elapsedSeconds != null ? resolveBendleTier(e.elapsedSeconds, tiers) : null
    return {
      teamId: e.teamId,
      teamName: e.teamName ?? null,
      guess: e.guess ?? null,
      elapsedSeconds: e.elapsedSeconds ?? null,
      correct,
      tierId: tier?.id ?? null,
      points: tier?.points ?? 0,
    }
  })

  return rows.sort((a, b) => {
    if (a.correct !== b.correct) return a.correct ? -1 : 1
    if (!a.correct) return 0
    return a.elapsedSeconds - b.elapsedSeconds
  })
}

// Same fold-in contract as computeWagerScoreUpdates — writes only this
// slide's entry into the round's phoneBySlide bucket, preserving every
// other phone-scored slide already in the round. Dedupes by scoreboard team
// id (last write wins) so a host data-entry name collision can't crash the
// upsert's ON CONFLICT clause.
export function computeBendleScoreUpdates({ results, teams, scoreboardTeams, roundKey, slideId }) {
  const teamIdToName = new Map((teams ?? []).map(t => [t.id, t.name.trim().toLowerCase()]))
  const updates = []
  for (const r of results ?? []) {
    const teamName = teamIdToName.get(r.teamId)
    if (!teamName) continue
    const sbTeam = (scoreboardTeams ?? []).find(t => t.name.trim().toLowerCase() === teamName)
    if (!sbTeam) continue
    const prevSplit = normalizeRoundScore(sbTeam.scores?.[roundKey])
    const nextPhone = { ...prevSplit.phoneBySlide, [slideId]: r.points }
    const nextScores = { ...sbTeam.scores, [roundKey]: { written: prevSplit.written, phone: nextPhone } }
    updates.push({ id: sbTeam.id, show_id: sbTeam.show_id, name: sbTeam.name, scores: nextScores, sort_order: sbTeam.sort_order })
  }
  return [...new Map(updates.map(u => [u.id, u])).values()]
}
