// client/src/lib/bendleGuessScoring.js
// Bendle phone guess (spec 2026-10-02): grading a team's one locked guess,
// scoring it, and finding the three step slides of one Bendle. Pure — no
// network. The lock, results and overrides live on the step-3 slide
// (bendleLockSlide); scores are keyed to that slide id, never a row's own.
import { BENDLE_STEP_POINTS } from './bendleScoring.js'
import { applyPhoneScoreUpdates } from './scoreboardMath.js'
import { isBendleShiny } from './shinySeries.js'

export const BENDLE_OVERRIDE_POINTS = Object.freeze([0, ...[...BENDLE_STEP_POINTS].sort((a, b) => a - b)])

const FEAT_RE = /(^|\s)(?:feat|ft|featuring)\b\.?.*$/
const MAX_FIELD = 200

export function stripAccents(s) {
  return String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '')
}

// Spec order: accents, lowercase, & -> and, brackets, trailing " - tag",
// feat., leading "the", punctuation, spaces.
export function normalizeText(raw) {
  return stripAccents(raw)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .replace(/\s+[-–—]\s+.*$/, '')
    .replace(FEAT_RE, '')
    .replace(/^\s*the\s+/, '')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const compact = s => s.replace(/ /g, '')

// Damerau-Levenshtein, optimal string alignment variant (adjacent swap = 1).
export function osaDistance(a, b) {
  const m = a.length, n = b.length
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...new Array(n).fill(0)])
  for (let j = 0; j <= n; j++) d[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
    }
  }
  return d[m][n]
}

// `target` is the song side; its length sets the tolerance, so a title of 4
// characters or fewer must match exactly.
function withinTolerance(guess, target) {
  if (!guess || !target) return false
  const tol = Math.min(2, Math.floor(target.length / 5))
  if (tol === 0) return guess === target
  return Math.abs(guess.length - target.length) <= tol && osaDistance(guess, target) <= tol
}

export function titleMatches(guessTitle, song) {
  const g = compact(normalizeText(guessTitle))
  if (!g || !song) return false
  return [song.title, song.answer, ...(song.aliases ?? [])]
    .some(c => withinTolerance(g, compact(normalizeText(c))))
}

// Main artists only: featured artists are dropped before the split.
export function splitArtists(raw) {
  return stripAccents(raw).toLowerCase().replace(FEAT_RE, '')
    .split(/&|,|\band\b/)
    .map(normalizeText)
    .filter(Boolean)
}

export function gradeGuess(guess, song) {
  if (!guess || !song) return false
  if (!titleMatches(guess.title, song)) return false
  const g = splitArtists(guess.artist)
  const s = splitArtists(song.artist)
  if (g.length === 0 || s.length === 0) return true
  return g.some(a => s.some(b => withinTolerance(compact(a), compact(b))))
}

export function stepPoints(stepIndex) {
  return BENDLE_STEP_POINTS[stepIndex] ?? 0
}

export function parseGuess(answer) {
  if (!answer || typeof answer !== 'object' || typeof answer.title !== 'string') return null
  const title = answer.title.trim().slice(0, MAX_FIELD)
  if (!normalizeText(title)) return null
  const artist = typeof answer.artist === 'string' && answer.artist.trim() ? answer.artist.trim().slice(0, MAX_FIELD) : null
  return { title, artist, source: answer.source === 'catalog' ? 'catalog' : 'typed', qid: typeof answer.qid === 'string' ? answer.qid : null }
}

export function guessLabel(guess) {
  if (!guess) return 'No guess'
  return guess.artist ? `${guess.title} - ${guess.artist}` : guess.title
}

const byReveal = (a, b) => b.points - a.points
  || (b.guess ? 1 : 0) - (a.guess ? 1 : 0)
  || String(a.teamName).localeCompare(String(b.teamName))

export function applyBendleOverrides(results, overrides = {}) {
  return (results ?? []).map(r => {
    const o = overrides?.[r.teamId]
    const overridden = BENDLE_OVERRIDE_POINTS.includes(o)
    return { ...r, points: overridden ? o : r.autoPoints, overridden }
  }).sort(byReveal)
}

// rows: phone_answers { team_id, slide_id, answer }; stepIds[i] = step i's slide id.
export function gradeBendleGroup({ rows, stepIds, song, teams, overrides = {} }) {
  const stepOf = new Map((stepIds ?? []).map((id, i) => [id, i]).filter(([id]) => id))
  const byTeam = new Map()
  for (const row of rows ?? []) {
    const step = stepOf.get(row.slide_id)
    if (step === undefined) continue
    const prev = byTeam.get(row.team_id)
    if (!prev || step < prev.step) byTeam.set(row.team_id, { step, guess: parseGuess(row.answer) })
  }
  const results = (teams ?? []).map(team => {
    const hit = byTeam.get(team.id)
    const guess = hit?.guess ?? null
    const correct = !!guess && gradeGuess(guess, song)
    return { teamId: team.id, teamName: team.name, guess, stepIndex: hit ? hit.step : null, correct, autoPoints: correct ? stepPoints(hit.step) : 0 }
  })
  return applyBendleOverrides(results, overrides)
}

export function computeBendleScoreUpdates({ results, teams, scoreboardTeams, roundKey, lockSlideId }) {
  return applyPhoneScoreUpdates({ results, teams, scoreboardTeams, roundKey, slideId: lockSlideId })
}

export function bendleGroupSlides(slides, slide) {
  const gid = slide?.data?.shinyGroupId
  if (!gid || !slide.data || !isBendleShiny(slide.data)) return []
  return (slides ?? [])
    .filter(s => s?.type === 'question' && s.data && isBendleShiny(s.data) && s.data.shinyGroupId === gid)
    .sort((a, b) => (a.data.bendleStepIndex ?? 0) - (b.data.bendleStepIndex ?? 0))
}

export function bendleStepIds(slides, slide) {
  const ids = []
  for (const s of bendleGroupSlides(slides, slide)) ids[s.data.bendleStepIndex ?? 0] = s.id
  return ids
}

export function bendleLockSlide(slides, slide) {
  return bendleGroupSlides(slides, slide).find(s => s.data.bendleStepIndex === 2) ?? null
}

export function bendleConfigError(data) {
  if (!data?.shinyGroupId) return 'This Bendle has no group id. Recreate this Bendle from Add Shiny.'
  if (!data.bendleSongId) return 'Pick a song for this Bendle first.'
  return null
}
