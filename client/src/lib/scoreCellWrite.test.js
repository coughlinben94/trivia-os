import { describe, it, expect } from 'vitest'
import { createScoreChain, createScoreRemote, validScoreValue, buildCellWrite, scoresView, SCORE_MIN, SCORE_MAX } from './scoreCellWrite.js'

// In-memory scoreboard_teams: no network, ever.
function fakeDb(rows) {
  const db = { rows: structuredClone(rows), log: [], readError: null, upsertError: null, gate: null }
  db.readTeams = async showId => {
    db.log.push(['read', showId])
    if (db.gate) await db.gate
    if (db.readError) return { data: null, error: db.readError }
    return { data: structuredClone(db.rows.filter(r => r.show_id === showId)), error: null }
  }
  db.upsertRow = async row => {
    db.log.push(['upsert', row.id])
    if (db.upsertError) return { error: db.upsertError }
    db.rows = db.rows.map(r => (r.id === row.id ? structuredClone(row) : r))
    return { error: null }
  }
  return db
}

const COLS = [{ key: 'r_a', label: 'R1' }, { key: 'r_b', label: 'R2' }, { key: 'bonus', label: '?' }]
const ROWS = [
  { id: 't1', show_id: 'show', name: 'Quizzly Bears', sort_order: 0, scores: { r_a: 5, r_b: { written: 4, phone: { slideX: 3, slideY: 2 } } } },
  { id: 't2', show_id: 'show', name: 'Trivia Newton John', sort_order: 1, scores: { r_a: { written: 7, phone: 0 } } },
]
const set = (chain, over = {}) => chain.setCell({ showId: 'show', cols: COLS, teamId: 't1', colKey: 'r_b', value: 12, expectOld: 9, ...over })

describe('validScoreValue', () => {
  it.each([
    [7, true], [0, true], [-3, true], [SCORE_MIN, true], [SCORE_MAX, true],
    [NaN, false], [Infinity, false], [-Infinity, false], [1.5, false], ['7', false], [null, false], [undefined, false],
    [SCORE_MAX + 1, false], [SCORE_MIN - 1, false], [1e9, false], [true, false], [{}, false],
  ])('%p -> %p', (v, ok) => expect(validScoreValue(v)).toBe(ok))
  it('bounds are -999..999', () => {
    expect([SCORE_MIN, SCORE_MAX]).toEqual([-999, 999])
  })
})

describe('buildCellWrite (mirrors ScoreboardModal updateScore + mergeScoreEdit)', () => {
  it('keeps every phoneBySlide bucket and sets written so the cell total is the new value', () => {
    const row = buildCellWrite(ROWS[0], 'r_b', 12)
    expect(row).toEqual({
      id: 't1', show_id: 'show', name: 'Quizzly Bears', sort_order: 0,
      scores: { r_a: 5, r_b: { written: 7, phone: { slideX: 3, slideY: 2 } } },
    })
  })
  it('a legacy plain number becomes the modal\'s {written, phone:{}} shape', () => {
    expect(buildCellWrite(ROWS[0], 'r_a', 6).scores.r_a).toEqual({ written: 6, phone: {} })
  })
  it('a legacy flat phone number is kept under __legacy, never dropped', () => {
    const row = { ...ROWS[1], scores: { r_a: { written: 1, phone: 4 } } }
    expect(buildCellWrite(row, 'r_a', 10).scores.r_a).toEqual({ written: 6, phone: { __legacy: 4 } })
  })
  it('an empty cell starts from zero', () => {
    expect(buildCellWrite(ROWS[1], 'bonus', 2).scores.bonus).toEqual({ written: 2, phone: {} })
  })
})

describe('scoresView', () => {
  it('teams sorted by place, tie-aware, with per-column written+phone cells', () => {
    const rows = [...ROWS, { id: 't3', show_id: 'show', name: 'Tied', sort_order: 2, scores: { r_a: 14 } }]
    const v = scoresView(rows, COLS)
    expect(v.cols).toEqual(COLS)
    expect(v.teams.map(t => [t.name, t.total, t.place])).toEqual([
      ['Quizzly Bears', 14, 1], ['Tied', 14, 1], ['Trivia Newton John', 7, 3],
    ])
    expect(v.teams[0].cells).toEqual([
      { key: 'r_a', label: 'R1', value: 5, phone: 0 },
      { key: 'r_b', label: 'R2', value: 9, phone: 5 },
      { key: 'bonus', label: '?', value: 0, phone: 0 },
    ])
  })
  it('a team on zero has no place yet (the modal shows a dash)', () => {
    const v = scoresView([{ id: 'z', show_id: 'show', name: 'Zero', sort_order: 0, scores: {} }], COLS)
    expect(v.teams[0].place).toBe(null)
  })
})

describe('createScoreChain.setCell', () => {
  it('fresh read, builds from THAT read, upserts that row only, re-reads and reports the saved value', async () => {
    const db = fakeDb(ROWS)
    const chain = createScoreChain(db)
    // Someone (a phone fold-in) changed the row after the iPad's snapshot: the
    // write must build on the fresh bucket, not a stale copy.
    db.rows[0].scores.r_b.phone.slideZ = 0
    const res = await set(chain)
    expect(res).toMatchObject({ ok: true, old: 9, value: 12, teamName: 'Quizzly Bears', colLabel: 'R2' })
    expect(db.log).toEqual([['read', 'show'], ['upsert', 't1'], ['read', 'show']])
    expect(db.rows[0].scores.r_b).toEqual({ written: 7, phone: { slideX: 3, slideY: 2, slideZ: 0 } })
    expect(db.rows[1]).toEqual(ROWS[1])
    expect(res.view.teams[0].total).toBe(17)
  })
  it('refuses changed-underneath when the fresh cell differs from what the iPad showed; no write', async () => {
    const db = fakeDb(ROWS)
    const chain = createScoreChain(db)
    expect(await set(chain, { expectOld: 8 })).toMatchObject({ refuse: 'changed-underneath' })
    expect(db.log).toEqual([['read', 'show']])
  })
  it('refuses a team that is not in the fresh read (deleted, or another show)', async () => {
    const db = fakeDb(ROWS)
    expect(await set(createScoreChain(db), { teamId: 'gone' })).toMatchObject({ refuse: 'no-team' })
    expect(db.log).toEqual([['read', 'show']])
  })
  it('refuses a column that is not a derived round column', async () => {
    const db = fakeDb(ROWS)
    expect(await set(createScoreChain(db), { colKey: 'r_zzz' })).toMatchObject({ refuse: 'bad-column' })
    expect(db.log).toEqual([])
  })
  it('refuses a bad value before touching the database', async () => {
    const db = fakeDb(ROWS)
    const chain = createScoreChain(db)
    for (const value of [NaN, Infinity, 1.5, '7', null, 5000, -5000]) {
      expect(await set(chain, { value })).toMatchObject({ refuse: 'bad-score' })
    }
    expect(db.log).toEqual([])
  })
  it('surfaces a read error, never swallows it; no write', async () => {
    const db = fakeDb(ROWS)
    db.readError = { message: 'offline' }
    expect(await set(createScoreChain(db))).toMatchObject({ refuse: 'scores-unreadable' })
    expect(db.log).toEqual([['read', 'show']])
  })
  it('surfaces an upsert error, never swallows it', async () => {
    const db = fakeDb(ROWS)
    db.upsertError = { message: 'rls' }
    const res = await set(createScoreChain(db))
    expect(res).toMatchObject({ refuse: 'score-not-saved' })
    expect(db.rows[0].scores.r_b.written).toBe(4)
  })
  it('a re-read that does not show the new value is reported, not claimed as saved', async () => {
    const db = fakeDb(ROWS)
    const chain = createScoreChain({ readTeams: db.readTeams, upsertRow: async () => ({ error: null }) })
    expect(await set(chain)).toMatchObject({ refuse: 'save-unconfirmed' })
  })
  it('same value as now: no write', async () => {
    const db = fakeDb(ROWS)
    expect(await set(createScoreChain(db), { value: 9 })).toMatchObject({ ok: true, old: 9, value: 9 })
    expect(db.log).toEqual([['read', 'show']])
  })
  it('a thrown read is caught and surfaced', async () => {
    const chain = createScoreChain({ readTeams: async () => { throw new Error('boom') }, upsertRow: async () => ({ error: null }) })
    expect(await set(chain)).toMatchObject({ refuse: 'scores-unreadable' })
    expect(chain.depth()).toBe(0)
  })
})

describe('the chain: one at a time, in order, both directions', () => {
  it('a score.set queued behind a lockAndScore segment waits for its read AND upsert', async () => {
    const db = fakeDb(ROWS)
    const chain = createScoreChain(db)
    let release
    const segment = chain.run(async () => {
      db.log.push(['lock-read'])
      await new Promise(r => { release = r })
      db.log.push(['lock-upsert'])
      return 'done'
    })
    const s = set(chain)
    expect(chain.depth()).toBe(2)
    await Promise.resolve()
    expect(db.log).toEqual([['lock-read']])
    release()
    expect(await segment).toBe('done')
    await s
    expect(db.log).toEqual([['lock-read'], ['lock-upsert'], ['read', 'show'], ['upsert', 't1'], ['read', 'show']])
    expect(chain.depth()).toBe(0)
  })
  it('a lockAndScore segment queued behind a score.set waits for its upsert', async () => {
    const db = fakeDb(ROWS)
    let open
    db.gate = new Promise(r => { open = r })
    const chain = createScoreChain(db)
    const s = set(chain)
    const segment = chain.run(async () => { db.log.push(['lock-read']) })
    await Promise.resolve()
    expect(db.log).toEqual([['read', 'show']])
    db.gate = null
    open()
    await Promise.all([s, segment])
    expect(db.log).toEqual([['read', 'show'], ['upsert', 't1'], ['read', 'show'], ['lock-read']])
  })
  it('a segment that throws still frees the chain and rethrows to its caller', async () => {
    const chain = createScoreChain(fakeDb(ROWS))
    await expect(chain.run(async () => { throw new Error('x') })).rejects.toThrow('x')
    expect(chain.depth()).toBe(0)
    expect(await chain.run(async () => 1)).toBe(1)
  })
  it('depth counts queued plus running work and is 0 when idle', async () => {
    const chain = createScoreChain(fakeDb(ROWS))
    expect(chain.depth()).toBe(0)
    const a = chain.run(async () => {})
    expect(chain.depth()).toBe(1)
    await a
    expect(chain.depth()).toBe(0)
  })
})

describe('createScoreChain.getScores (read only, off the chain)', () => {
  it('returns the view from a fresh read and never writes', async () => {
    const db = fakeDb(ROWS)
    const chain = createScoreChain(db)
    const res = await chain.getScores({ showId: 'show', cols: COLS })
    expect(res.view.teams.map(t => t.id)).toEqual(['t1', 't2'])
    expect(db.log).toEqual([['read', 'show']])
    expect(chain.depth()).toBe(0)
  })
  it('a read error is surfaced', async () => {
    const db = fakeDb(ROWS)
    db.readError = { message: 'x' }
    expect(await createScoreChain(db).getScores({ showId: 'show', cols: COLS })).toEqual({ refuse: 'scores-unreadable' })
  })
})

describe('createScoreRemote (what LiveMode and the stub host both perform)', () => {
  const plans = {
    get: { run: 'scores-get' }, hide: { run: 'scores-hide' },
    set: { run: 'score-set', teamId: 't1', colKey: 'r_b', value: 12, expectOld: 9 },
  }
  const make = db => {
    const seen = { changes: 0, saved: [] }
    const remote = createScoreRemote({ chain: createScoreChain(db), onChange: () => seen.changes++, onSaved: c => seen.saved.push(c) })
    return { remote, seen }
  }
  const ctx = { showId: 'show', cols: COLS }
  it('closed by default: nothing attached, nothing read', () => {
    const db = fakeDb(ROWS)
    expect(make(db).remote.view()).toBe(null)
    expect(db.log).toEqual([])
  })
  it('scores-get opens and attaches the fresh view; scores-hide drops it', async () => {
    const { remote } = make(fakeDb(ROWS))
    const res = remote.perform(plans.get, ctx)
    expect(await res.later).toEqual({ done: null })
    expect(remote.view().teams).toHaveLength(2)
    remote.perform(plans.hide, ctx)
    expect(remote.view()).toBe(null)
  })
  it('score-set reports the change, refreshes the view, and calls onSaved once', async () => {
    const { remote, seen } = make(fakeDb(ROWS))
    await remote.perform(plans.get, ctx).later
    const out = await remote.perform(plans.set, ctx).later
    expect(out).toEqual({ done: { team: 'Quizzly Bears', col: 'R2', from: 9, to: 12, teamId: 't1', colKey: 'r_b' } })
    expect(remote.view().teams[0].total).toBe(17)
    expect(seen.saved).toEqual([out.done])
  })
  it('a refused score-set refreshes the view so the iPad sees the real number', async () => {
    const db = fakeDb(ROWS)
    const { remote, seen } = make(db)
    await remote.perform(plans.get, ctx).later
    db.rows[0].scores.r_b.written = 6
    expect(await remote.perform(plans.set, ctx).later).toEqual({ refuse: 'changed-underneath' })
    expect(remote.view().teams[0].cells[1].value).toBe(11)
    expect(seen.saved).toEqual([])
  })
  it('a result landing after the drawer closed does not re-attach it', async () => {
    const { remote } = make(fakeDb(ROWS))
    const pending = remote.perform(plans.get, ctx).later
    remote.perform(plans.hide, ctx)
    await pending
    expect(remote.view()).toBe(null)
  })
})
