// Awards slide: a pool of 8 awards (plus an opt-in 9th), computed from the
// scoreboard_teams rows as they stand when the slide runs (it sits between
// Bonus 1 and Bonus 2, so the night is nearly over but not final). Pure.
//
// Shared rules:
// - Named teams only (pickableTeams). Round values go through the shared
//   normalizer (roundScoreTotal), never scores[key] directly.
// - The bonus column is left out of everything, places included.
// - "Played" rounds = rounds at least one team has an entry for, in scoreboard
//   order (deriveRoundCols, by round.number). A round nobody has graded yet
//   doesn't exist here.
// - Places are cumulative after each played round, ranked with the shared
//   tie-aware computePlaces (1224). A team is only ranked in a snapshot once it
//   has a score in some round so far, so a late joiner never counts as "last"
//   for rounds it wasn't in the room for.
// - Best Round, Most Consistent and Late Bloomer use NORMAL rounds only.
//   Swing and PYL run on their own point scales (PYL especially) and would
//   swamp a round-to-round comparison; they get their own awards instead.
//
// Each award is { id, title, teamNames[], statLine, strength } or null if it
// doesn't qualify. `strength` (roughly 0..1) says how remarkable it is and is
// only used to pick the 3 shown in Auto mode.
// ponytail: strength formulas are hand-tuned guesses, retune after a few real nights.
import { deriveRoundCols, roundScoreTotal, computePlaces, pickableTeams, normalizeRoundScore } from './scoreboardMath.js'
import { ordinal } from './roundClimbers.js'

export const AWARD_POOL = [
  { id: 'best-round',       title: 'Best Round' },
  { id: 'biggest-comeback', title: 'Biggest Comeback' },
  { id: 'most-consistent',  title: 'Most Consistent' },
  { id: 'hot-streak',       title: 'Hot Streak' },
  { id: 'late-bloomer',     title: 'Late Bloomer' },
  { id: 'swing-champion',   title: 'Swing Champion' },
  { id: 'pyl-king',         title: 'Press Your Luck King' },
  { id: 'wire-to-wire',     title: 'Wire to Wire' },
  // Opt-in only (slide data.bruisedApple), never picked on strength.
  { id: 'bruised-apple',    title: 'Bruised Apple' },
]
const TITLE = Object.fromEntries(AWARD_POOL.map(a => [a.id, a.title]))

export const AWARDS_SHOWN = 3
const MAX_NAMES = 2
const MIN_COMEBACK_TEAMS = 4
const MIN_COMEBACK_GAP = 3
const MIN_CONSISTENT_ROUNDS = 3
const MIN_CONSISTENT_TEAMS = 4
const MIN_STREAK = 3
const MIN_BLOOM_ROUNDS = 4
const MIN_BLOOM_JUMP = 2
const MIN_WIRE_ROUNDS = 3
const MIN_WIRE_TEAMS = 4

const hasScore = (scores, key) => {
  const v = scores?.[key]
  return v !== undefined && v !== null && v !== ''
}
const pts = n => `${n} point${n === 1 ? '' : 's'}`
const fmt = n => (Number.isInteger(n) ? String(n) : n.toFixed(1))
const clamp01 = n => Math.max(0, Math.min(1, n))
const avg = xs => xs.reduce((s, x) => s + x, 0) / xs.length
const isSpecial = c => c.label === 'SW' || c.label === 'PYL'

function roundName(label) {
  if (label === 'SW') return 'the Swing Round'
  if (label === 'PYL') return 'Press Your Luck'
  return `Round ${String(label).replace(/^R/, '')}`
}

function rankBy(list, key) {
  const sorted = list.slice().sort((a, b) => b[key] - a[key])
  const places = computePlaces(sorted, key)
  return new Map(sorted.map((t, i) => [t.id, places[i]]))
}

const award = (id, teamNames, statLine, strength) => ({ id, title: TITLE[id], teamNames, statLine, strength })

// A plain number (even 0) is a typed score. The { written, phone } shape with
// written 0 is the phone fold-in's placeholder before any written score exists.
const isWritten = raw => raw == null || typeof raw !== 'object' || normalizeRoundScore(raw).written !== 0

// Everything the awards read, computed once.
function buildBoard(show, teams) {
  const cols = deriveRoundCols(show ?? {}).filter(c => c.key !== 'bonus')
  const named = pickableTeams(teams ?? []).map(t => ({ id: t.id ?? t.name, name: t.name.trim(), scores: t.scores ?? {} }))
  // A round counts once someone has WRITTEN points in it. The phone fold-in
  // writes { written: 0, phone } into the round as each phone question is
  // revealed, long before Ben types the written scores; counting that as a
  // played round would rank everyone on phone points alone and, with the
  // slide freezing on its first awards, lock that in.
  const played = cols.filter(c => named.some(t => hasScore(t.scores, c.key) && isWritten(t.scores[c.key])))
  const field = named
    .filter(t => played.some(c => hasScore(t.scores, c.key)))
    .map(t => {
      const round = Object.fromEntries(played.map(c => [c.key, roundScoreTotal(t.scores[c.key])]))
      return { ...t, round, total: played.reduce((s, c) => s + round[c.key], 0) }
    })
  const snaps = played.map((_, i) => {
    const through = played.slice(0, i + 1)
    const inPlay = field
      .filter(t => through.some(c => hasScore(t.scores, c.key)))
      .map(t => ({ id: t.id, cum: through.reduce((s, c) => s + t.round[c.key], 0) }))
    return rankBy(inPlay, 'cum')
  })
  const now = snaps.length ? snaps[snaps.length - 1] : new Map()
  return { played, normal: played.filter(c => !isSpecial(c)), field, snaps, now }
}

// Highest single score across `cols`; ties share it (capped, by name).
function topScore(b, cols) {
  const hits = []
  for (const t of b.field) for (const c of cols) {
    if (hasScore(t.scores, c.key)) hits.push({ id: t.id, name: t.name, v: t.round[c.key], label: c.label })
  }
  if (!hits.length) return null
  const best = Math.max(...hits.map(h => h.v))
  if (!(best > 0)) return null
  const top = hits.filter(h => h.v === best)
  const topIds = new Set(top.map(h => h.id))
  const next = Math.max(0, ...hits.filter(h => !topIds.has(h.id)).map(h => h.v))
  const names = [...new Set(top.map(h => h.name))].sort((x, y) => x.localeCompare(y)).slice(0, MAX_NAMES)
  const labels = new Set(top.map(h => h.label))
  return { best, names, margin: (best - next) / best, label: labels.size === 1 ? [...labels][0] : null }
}

// Better current place, then name.
const byPlaceThenName = b => (x, y) => b.now.get(x.id) - b.now.get(y.id) || x.name.localeCompare(y.name)

function bestRound(b) {
  const t = topScore(b, b.normal)
  if (!t) return null
  const where = t.label ? roundName(t.label) : 'a single round'
  return award('best-round', t.names, `${pts(t.best)} in ${where}`, 0.5 + 0.3 * t.margin)
}

function specialRound(b, id, label) {
  const t = topScore(b, b.played.filter(c => c.label === label))
  if (!t) return null
  return award(id, t.names, `${pts(t.best)} in ${roundName(label)}`, 0.45 + 0.3 * t.margin)
}

function biggestComeback(b) {
  if (b.field.length < MIN_COMEBACK_TEAMS || b.snaps.length < 2) return null
  const cands = b.field.map(t => {
    let worst = 0, worstAt = -1
    b.snaps.forEach((snap, i) => {
      const p = snap.get(t.id)
      if (p !== undefined && p > worst) { worst = p; worstAt = i }
    })
    return { ...t, worst, worstAt, gap: worst - b.now.get(t.id) }
  }).filter(c => c.gap >= MIN_COMEBACK_GAP)
  if (!cands.length) return null
  const [w] = cands.sort((x, y) => y.gap - x.gap || byPlaceThenName(b)(x, y))
  const stat = `${ordinal(w.worst)} after ${roundName(b.played[w.worstAt].label)}, now ${ordinal(b.now.get(w.id))}`
  return award('biggest-comeback', [w.name], stat, 0.3 + 0.7 * clamp01(w.gap / (b.field.length - 1)))
}

function mostConsistent(b) {
  const cands = b.field.map(t => {
    const vals = b.normal.filter(c => hasScore(t.scores, c.key)).map(c => t.round[c.key])
    return { ...t, vals, sum: vals.reduce((s, v) => s + v, 0) }
  }).filter(t => t.vals.length >= MIN_CONSISTENT_ROUNDS && t.sum > 0)
    .map(t => ({ ...t, min: Math.min(...t.vals), max: Math.max(...t.vals), spread: Math.max(...t.vals) - Math.min(...t.vals) }))
  if (cands.length < MIN_CONSISTENT_TEAMS) return null
  const meanSpread = avg(cands.map(c => c.spread))
  const [w] = cands.sort((x, y) => x.spread - y.spread || y.sum - x.sum || x.name.localeCompare(y.name))
  const stat = w.spread === 0 ? `${pts(w.min)} every round` : `Every round between ${w.min} and ${w.max} points`
  const strength = meanSpread > 0 ? 0.3 + 0.5 * clamp01(1 - w.spread / meanSpread) : 0.3
  return award('most-consistent', [w.name], stat, strength)
}

// Run of rounds ending now, every one in the top 3, each place the same or
// better than the round before.
function hotStreak(b) {
  // Top 3 means nothing on a tiny board.
  if (b.field.length < 4) return null
  const n = b.snaps.length
  const cands = b.field.map(t => {
    const p = b.snaps.map(s => s.get(t.id))
    let run = 0
    for (let j = n - 1; j >= 0; j--) {
      if (p[j] === undefined || p[j] > 3) break
      if (j < n - 1 && p[j + 1] > p[j]) break
      run++
    }
    return { ...t, run }
  }).filter(c => c.run >= MIN_STREAK)
  if (!cands.length) return null
  const [w] = cands.sort((x, y) => y.run - x.run || byPlaceThenName(b)(x, y))
  return award('hot-streak', [w.name], `Top 3 for ${w.run} rounds straight, never slipping`, 0.2 + 0.6 * (w.run / n))
}

// First half vs second half of the team's scored normal rounds (the middle
// round of an odd count sits out).
function lateBloomer(b) {
  const cands = b.field.map(t => {
    const vals = b.normal.filter(c => hasScore(t.scores, c.key)).map(c => t.round[c.key])
    if (vals.length < MIN_BLOOM_ROUNDS) return null
    const half = Math.floor(vals.length / 2)
    const early = avg(vals.slice(0, half))
    const late = avg(vals.slice(vals.length - half))
    return { ...t, early, late, jump: late - early }
  }).filter(c => c && c.jump >= MIN_BLOOM_JUMP)
  if (!cands.length) return null
  const [w] = cands.sort((x, y) => y.jump - x.jump || byPlaceThenName(b)(x, y))
  return award('late-bloomer', [w.name], `Averaged ${fmt(w.early)} early, ${fmt(w.late)} late`, 0.3 + 0.5 * clamp01(w.jump / Math.max(w.late, 1)))
}

function wireToWire(b) {
  if (b.snaps.length < MIN_WIRE_ROUNDS || b.field.length < MIN_WIRE_TEAMS) return null
  const first = b.snaps[0]
  const ws = b.field
    .filter(t => first.get(t.id) === 1 && b.now.get(t.id) <= 3)
    .sort(byPlaceThenName(b))
    .slice(0, MAX_NAMES)
  if (!ws.length) return null
  const lead = b.now.get(ws[0].id)
  const where = roundName(b.played[0].label)
  const stat = ws.length > 1
    ? `Led after ${where}, both still top 3`
    : `Led after ${where}, still ${lead === 1 ? 'on top' : ordinal(lead)}`
  return award('wire-to-wire', ws.map(t => t.name), stat, lead === 1 ? 0.75 : 0.55)
}

function bruisedApple(b) {
  if (b.field.length < 3) return null
  const last = Math.max(...b.field.map(t => b.now.get(t.id)))
  if (last === 1) return null // everyone tied for first: nobody is last
  const names = b.field.filter(t => b.now.get(t.id) === last).map(t => t.name)
    .sort((x, y) => x.localeCompare(y)).slice(0, MAX_NAMES)
  return award('bruised-apple', names, `${ordinal(last)} place. Bruised, not beaten.`, 0)
}

// Every qualifying award, in pool order.
export function computeAwards(show, teams, { bruisedApple: withBruised = false } = {}) {
  const b = buildBoard(show, teams)
  if (!b.field.length) return []
  return [
    bestRound(b),
    biggestComeback(b),
    mostConsistent(b),
    hotStreak(b),
    lateBloomer(b),
    specialRound(b, 'swing-champion', 'SW'),
    specialRound(b, 'pyl-king', 'PYL'),
    wireToWire(b),
    withBruised ? bruisedApple(b) : null,
  ].filter(Boolean)
}

// Host pins (awardIds) first, in the host's order; pins that didn't qualify
// are dropped and the gap filled by Auto. Auto = highest strength, ties by
// pool order, and a team that already has a card is skipped while an award
// for a different team is still available. Bruised Apple, when on, is never
// a strength pick: it always takes the last card.
export function pickAwards(awards, awardIds, count = AWARDS_SHOWN) {
  const list = awards ?? []
  const byId = new Map(list.map(a => [a.id, a]))
  const bruised = byId.get('bruised-apple')
  const slots = count - (bruised ? 1 : 0)
  const picked = []
  for (const id of new Set(Array.isArray(awardIds) ? awardIds : [])) {
    if (picked.length < slots && id !== 'bruised-apple' && byId.has(id)) picked.push(byId.get(id))
  }
  const rest = list
    .map((a, i) => ({ a, i }))
    .filter(({ a }) => a !== bruised && !picked.includes(a))
    .sort((x, y) => y.a.strength - x.a.strength || x.i - y.i)
    .map(({ a }) => a)
  const used = new Set(picked.flatMap(a => a.teamNames))
  for (const a of rest) {
    if (picked.length >= slots) break
    if (a.teamNames.some(n => used.has(n))) continue
    picked.push(a)
    a.teamNames.forEach(n => used.add(n))
  }
  for (const a of rest) {
    if (picked.length >= slots) break
    if (!picked.includes(a)) picked.push(a)
  }
  if (bruised) picked.push(bruised)
  return picked
}

// Slide entry point: slide.data carries awardIds (pins) and bruisedApple.
export function nightAwards(show, teams, data) {
  return pickAwards(computeAwards(show, teams, { bruisedApple: !!data?.bruisedApple }), data?.awardIds)
}
