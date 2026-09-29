// The laptop's score chain (iPad remote spec §6, phase 3 reduced: dispute
// fixes only). ONE promise chain per Live Mode: the iPad's score.set and
// lockAndScore's scoreboard_teams read-then-upsert both run on it, so neither
// can land between the other's read and its upsert (the lost-update race).
//
// Supabase is injected (readTeams/updateScores) so tests never touch the network.
//   readTeams(showId, signal)  -> Promise<{ data: rows, error }>
//   updateScores(row, signal)  -> Promise<{ data: matchedRows, error }>
//     update({ scores }).eq('id').eq('show_id').select('id'): only the scores
//     column, and a row deleted since the read matches nothing (never
//     resurrected, as an upsert would).
// Every call gets an AbortSignal that fires after timeoutMs (abort, not a
// race: a raced-out fetch could still land its write after a later segment).
import { normalizeRoundScore, roundScoreTotal, addStats } from './scoreboardMath.js'

export const SCORE_CALL_TIMEOUT_MS = 10000

// Runs fn(signal), aborting the signal after ms. A throw comes back as
// { data: null, error }, the shape supabase-js returns for an abort.
export async function withTimeout(fn, ms = SCORE_CALL_TIMEOUT_MS) {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), ms)
  try { return await fn(ac.signal) } catch (error) { return { data: null, error } } finally { clearTimeout(t) }
}

export const SCORE_MIN = -999
export const SCORE_MAX = 999
export const validScoreValue = v => Number.isInteger(v) && v >= SCORE_MIN && v <= SCORE_MAX

// A cell's value is what every scoreboard shows for it: written + phone.
const cellValue = (row, key) => roundScoreTotal(row?.scores?.[key])

// The write for "this cell now totals `value`": id and show_id (the update's
// filters) plus the new scores; name and sort_order are never resent. Same shape the laptop's
// ScoreboardModal writes for a typed cell ({written, phone: phoneBySlide},
// merged onto a fresh read as mergeScoreEdit does), except phoneBySlide comes
// from the FRESH row, and written absorbs the difference so every phone bucket
// stays exactly as it was. Totals and places are never stored; every surface
// recomputes them from `scores`.
export function buildCellWrite(row, colKey, value) {
  const split = normalizeRoundScore(row.scores?.[colKey])
  return {
    id: row.id, show_id: row.show_id,
    scores: { ...row.scores, [colKey]: { written: value - split.phone, phone: split.phoneBySlide } },
  }
}

// What the iPad's drawer shows: teams by place, ranked by the modal's own addStats.
export function scoresView(rows, cols) {
  const teams = addStats(rows ?? [], cols)
    .sort((a, b) => b._total - a._total || (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map(t => ({
      id: t.id, name: t.name, total: t._total, place: typeof t._place === 'number' ? t._place : null,
      cells: cols.map(c => {
        const s = normalizeRoundScore(t.scores?.[c.key])
        return { key: c.key, label: c.label, value: s.written + s.phone, phone: s.phone }
      }),
    }))
  return { cols: cols.map(c => ({ key: c.key, label: c.label })), teams }
}

export function createScoreChain({ readTeams, updateScores, timeoutMs = SCORE_CALL_TIMEOUT_MS }) {
  let tail = Promise.resolve()
  let depth = 0
  let since = 0

  // Runs fn after everything queued before it. Rejections reach the caller
  // but never break the chain for the next segment.
  function run(fn) {
    if (depth++ === 0) since = Date.now()
    const p = tail.then(() => fn())
    tail = p.catch(() => {})
    return p.finally(() => { depth-- })
  }
  // null when empty, else a promise that settles once nothing is queued.
  function whenIdle() {
    if (depth === 0) return null
    return (async () => { while (depth > 0) await tail })()
  }

  async function read(showId) {
    const { data, error } = await withTimeout(signal => readTeams(showId, signal), timeoutMs)
    return error || !Array.isArray(data) ? null : data
  }

  async function getScores({ showId, cols }) {
    const rows = await read(showId)
    return rows ? { view: scoresView(rows, cols) } : { refuse: 'scores-unreadable' }
  }

  function setCell({ showId, cols, teamId, colKey, value, expectOld }) {
    if (!validScoreValue(value)) return Promise.resolve({ refuse: 'bad-score' })
    const col = cols.find(c => c.key === colKey)
    if (!col) return Promise.resolve({ refuse: 'bad-column' })
    return run(async () => {
      const rows = await read(showId)
      if (!rows) return { refuse: 'scores-unreadable' }
      const team = rows.find(r => r.id === teamId)
      if (!team) return { refuse: 'no-team' }
      const old = cellValue(team, colKey)
      if (typeof expectOld !== 'number' || old !== expectOld) return { refuse: 'changed-underneath' }
      const base = { teamId, teamName: team.name, colKey, colLabel: col.label, old }
      if (value === old) return { ok: true, ...base, value, view: scoresView(rows, cols) }
      let aborted = false
      const { data: hit, error } = await withTimeout(signal => {
        signal.addEventListener('abort', () => { aborted = true })
        return updateScores(buildCellWrite(team, colKey, value), signal)
      }, timeoutMs)
      // Timed out: the write may still have reached the database.
      if (aborted) return { refuse: 'save-unconfirmed' }
      if (error) return { refuse: 'score-not-saved', error }
      if (!Array.isArray(hit) || hit.length === 0) return { refuse: 'score-not-saved' } // row gone since the read
      // Report what the database now says, not what we meant to write.
      const after = await read(showId)
      const saved = after?.find(r => r.id === teamId)
      if (!saved || cellValue(saved, colKey) !== value) return { refuse: 'save-unconfirmed' }
      return { ok: true, ...base, value: cellValue(saved, colKey), view: scoresView(after, cols) }
    })
  }

  return { run, depth: () => depth, busySince: () => since, whenIdle, setCell, getScores }
}

// Performs a planned scores-get / score-set / scores-hide (hostCommands.js)
// for LiveMode and the relay's stub host alike. Holds the drawer's view: only
// attached to the snapshot between a scores-get and a scores-hide.
//   onChange()      the view changed: resend the snapshot
//   onSaved(change) a score.set landed: laptop notice + log
// perform returns { ok, later }: `later` settles to { done } or { refuse }.
export function createScoreRemote({ chain, onChange = () => {}, onSaved = () => {} }) {
  let open = false
  let gen = 0 // bumped on hide, so a read that lands after the drawer closed is dropped
  let view = null
  let getting = null // the scores-get in flight: a second one shares it
  const show = (g, v) => { if (open && g === gen && v) { view = v; onChange() } }
  const refresh = (g, ctx) => chain.getScores(ctx).then(r => show(g, r.view))

  function perform(plan, { showId, cols }) {
    const ctx = { showId, cols }
    if (plan.run === 'scores-hide') {
      open = false; gen++; view = null; getting = null; onChange()
      return { ok: true }
    }
    const g = gen
    if (plan.run === 'scores-get') {
      open = true
      if (!getting) {
        const p = chain.getScores(ctx).then(r => { show(g, r.view); return r.refuse ? { refuse: r.refuse } : { done: null } })
        getting = p
        p.finally(() => { if (getting === p) getting = null })
      }
      return { ok: true, later: getting }
    }
    const { teamId, colKey, value, expectOld } = plan
    const later = chain.setCell({ ...ctx, teamId, colKey, value, expectOld }).then(async r => {
      if (r.refuse) {
        if (r.error) console.error('[remote] score.set failed', r.error)
        await refresh(g, ctx) // show the real number, so the next try starts from it
        return { refuse: r.refuse }
      }
      show(g, r.view)
      const change = { team: r.teamName, col: r.colLabel, from: r.old, to: r.value, teamId, colKey }
      // onSaved may add fields for the iPad (LiveMode: winnerStale).
      const extra = r.old !== r.value ? onSaved(change) : null
      return { done: { ...change, ...extra } }
    })
    return { ok: true, later }
  }

  // Re-read for an open drawer (after lockAndScore, or the laptop's score
  // table closing); nothing while it is closed.
  const refreshIfOpen = ctx => (open ? refresh(gen, ctx) : Promise.resolve())
  return { perform, refresh: refreshIfOpen, view: () => (open ? view : null) }
}
