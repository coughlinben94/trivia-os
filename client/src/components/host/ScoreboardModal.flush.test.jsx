// @vitest-environment jsdom
// Closing the score table must not leave a typed score to fire up to 500ms
// later (after the iPad may already have saved that cell): every pending
// debounced save runs the moment the modal unmounts. Supabase is a fake.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

const calls = []
function builder(table) {
  const e = { table, op: null, args: null }
  const q = {
    select() { e.op ??= 'select'; return q },
    upsert(p) { e.op = 'upsert'; e.args = p; return q },
    update(p) { e.op = 'update'; e.args = p; return q },
    insert(p) { e.op = 'insert'; e.args = p; return q },
    eq() { return q }, order() { return q }, single() { return q }, abortSignal() { return q },
    then(res, rej) {
      calls.push(e)
      const data = table === 'scoreboard_teams' && e.op === 'select'
        ? [{ id: 't1', show_id: 'show1', name: 'Bears', sort_order: 0, scores: { r_r1: { written: 4, phone: {} } } }]
        : null
      return Promise.resolve({ data: e.op === 'select' && data ? (q.isSingle ? data[0] : data) : null, error: null }).then(res, rej)
    },
  }
  const single = q.single
  q.single = () => { q.isSingle = true; return single() }
  return q
}
vi.mock('../../lib/supabase.js', () => ({ supabase: { from: t => builder(t) } }))
vi.mock('../shared/ThemeProvider.jsx', () => ({ useTheme: () => ({ theme: {} }) }))

const { default: ScoreboardModal } = await import('./ScoreboardModal.jsx')

const SHOW = { id: 'show1', rounds: [{ id: 'r1', number: 1, title: 'Round 1' }], slides: [] }
let host, root
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  calls.length = 0
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => host.remove())
const tick = ms => act(() => new Promise(r => setTimeout(r, ms)))
const type = (input, value) => act(() => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
})

describe('ScoreboardModal unmount', () => {
  it('a score typed just before closing is saved at once, not 500ms after the close', async () => {
    act(() => root.render(<ScoreboardModal show={SHOW} onClose={() => {}} />))
    await tick(20)
    const input = host.querySelector('input[type="number"]')
    expect(input).toBeTruthy()
    type(input, '9')
    calls.length = 0
    act(() => root.unmount())
    await tick(50) // well inside the old 500ms debounce
    const sb = calls.filter(c => c.table === 'scoreboard_teams').map(c => c.op)
    expect(sb).toEqual(['select', 'upsert'])
    expect(calls.find(c => c.op === 'upsert').args.scores.r_r1.written).toBe(9)
    await tick(600)
    expect(calls.filter(c => c.table === 'scoreboard_teams' && c.op === 'upsert')).toHaveLength(1) // not twice
  })
  it('score saves run on the host score chain when one is given (queued with the iPad edits)', async () => {
    const queued = []
    const runOnScoreChain = fn => { queued.push(fn); return fn() }
    act(() => root.render(<ScoreboardModal show={SHOW} onClose={() => {}} runOnScoreChain={runOnScoreChain} />))
    await tick(20)
    type(host.querySelector('input[type="number"]'), '7')
    calls.length = 0
    act(() => root.unmount())
    await tick(50)
    expect(queued).toHaveLength(1)
    expect(calls.find(c => c.op === 'upsert').args.scores.r_r1.written).toBe(7)
  })
})
