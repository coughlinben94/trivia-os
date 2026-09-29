// The laptop's score chain (iPad remote spec §6, phase 3 reduced: dispute
// fixes only). ONE promise chain per Live Mode: the iPad's score.set and
// lockAndScore's scoreboard_teams read-then-upsert both run on it, so neither
// can land between the other's read and its upsert (the lost-update race).
//
// Supabase is injected (readTeams/upsertRow) so tests never touch the network.
//   readTeams(showId) -> Promise<{ data: rows, error }>
//   upsertRow(row)    -> Promise<{ error }>
import { normalizeRoundScore, roundScoreTotal, addStats } from './scoreboardMath.js'

export const SCORE_MIN = -999
export const SCORE_MAX = 999
export const validScoreValue = v => Number.isInteger(v) && v >= SCORE_MIN && v <= SCORE_MAX

// A cell's value is what every scoreboard shows for it: written + phone.
const cellValue = (row, key) => roundScoreTotal(row?.scores?.[key])

// The new row for "this cell now totals `value`". Same shape the laptop's
// ScoreboardModal writes for a typed cell ({written, phone: phoneBySlide},
// merged onto a fresh read as mergeScoreEdit does), except phoneBySlide comes
// from the FRESH row, and written absorbs the difference so every phone bucket
// stays exactly as it was. Totals and places are never stored; every surface
// recomputes them from `scores`.
export function buildCellWrite(row, colKey, value) {
  const split = normalizeRoundScore(row.scores?.[colKey])
  return {
    id: row.id, show_id: row.show_id, name: row.name, sort_order: row.sort_order,
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

export function createScoreChain({ readTeams, upsertRow }) {
  let tail = Promise.resolve()
  let depth = 0

  // Runs fn after everything queued before it. Rejections reach the caller
  // but never break the chain for the next segment.
  function run(fn) {
    depth++
    const p = tail.then(() => fn())
    tail = p.catch(() => {})
    return p.finally(() => { depth-- })
  }

  async function read(showId) {
    try {
      const { data, error } = await readTeams(showId)
      return error || !Array.isArray(data) ? null : data
    } catch { return null }
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
      let error
      try { ({ error } = await upsertRow(buildCellWrite(team, colKey, value))) } catch (e) { error = e }
      if (error) return { refuse: 'score-not-saved', error }
      // Report what the database now says, not what we meant to write.
      const after = await read(showId)
      const saved = after?.find(r => r.id === teamId)
      if (!saved || cellValue(saved, colKey) !== value) return { refuse: 'save-unconfirmed' }
      return { ok: true, ...base, value: cellValue(saved, colKey), view: scoresView(after, cols) }
    })
  }

  return { run, depth: () => depth, setCell, getScores }
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
  const show = (g, v) => { if (open && g === gen && v) { view = v; onChange() } }
  const refresh = (g, ctx) => chain.getScores(ctx).then(r => show(g, r.view))

  function perform(plan, { showId, cols }) {
    const ctx = { showId, cols }
    if (plan.run === 'scores-hide') {
      open = false; gen++; view = null; onChange()
      return { ok: true }
    }
    const g = gen
    if (plan.run === 'scores-get') {
      open = true
      return { ok: true, later: chain.getScores(ctx).then(r => { show(g, r.view); return r.refuse ? { refuse: r.refuse } : { done: null } }) }
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
      if (r.old !== r.value) onSaved(change)
      return { done: change }
    })
    return { ok: true, later }
  }

  return { perform, view: () => (open ? view : null) }
}
