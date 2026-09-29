// @vitest-environment jsdom
// Going live ends every OTHER live show (nothing else ever clears is_live), and
// never the show going live. Fake supabase: no network, records filters.
import { describe, it, expect, beforeEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { vi } from 'vitest'

const db = vi.hoisted(() => ({ row: null, calls: [], failOthers: false }))

vi.mock('../lib/supabase.js', () => {
  const query = table => {
    const q = {
      _patch: null, _filters: [],
      select() { return q },
      eq(c, v) { q._filters.push(['eq', c, v]); return q },
      neq(c, v) { q._filters.push(['neq', c, v]); return q },
      order() { return q },
      update(patch) { q._patch = patch; return q },
      single() { return Promise.resolve({ data: db.row, error: null }) },
      maybeSingle() { return Promise.resolve({ data: db.row, error: null }) },
      then(res, rej) {
        if (q._patch) {
          db.calls.push({ table, patch: q._patch, filters: q._filters })
          const isOthers = q._filters.some(f => f[0] === 'neq')
          return Promise.resolve({ error: isOthers && db.failOthers ? new Error('boom') : null }).then(res, rej)
        }
        return Promise.resolve({ data: table === 'teams' ? [] : [], error: null }).then(res, rej)
      },
    }
    return q
  }
  const channel = { on() { return channel }, subscribe() { return channel } }
  return { supabase: { from: query, channel: () => channel, removeChannel() {} } }
})
vi.mock('../lib/questionRows.js', () => ({ archiveShow: vi.fn(() => Promise.resolve(true)) }))

const { useShow } = await import('./useShow.js')

const SLIDES = [
  { id: 'a', order: 0, type: 'question', data: { questionNumber: 1 } },
  { id: 'b', order: 1, type: 'question', data: { questionNumber: 2 } },
]
let api
function Probe() { api = useShow(); return null }
const flush = () => act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve() })
const others = () => db.calls.filter(c => c.table === 'shows' && c.filters.some(f => f[0] === 'neq'))

beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  db.row = { id: 'tonight', title: 'T', slides: structuredClone(SLIDES), rounds: [], current_slide_index: 0, current_slide_id: 'a', is_live: false, audio_playing: null }
  db.calls = []
  db.failOthers = false
  localStorage.setItem('trivia-os:activeShowId', 'tonight')
  const host = document.createElement('div')
  await act(async () => createRoot(host).render(<Probe />))
  await flush()
})

describe('going live ends other live shows', () => {
  it('goLive ends every other live show, never this one', async () => {
    await act(async () => { await api.goLive() })
    await flush()
    expect(others()).toHaveLength(1)
    expect(others()[0].patch).toEqual({ is_live: false })
    expect(others()[0].filters).toEqual([['eq', 'is_live', true], ['neq', 'id', 'tonight']])
  })
  it('goLiveFrom does the same', async () => {
    await act(async () => { await api.goLiveFrom(1) })
    await flush()
    expect(others()).toHaveLength(1)
    expect(others()[0].filters).toEqual([['eq', 'is_live', true], ['neq', 'id', 'tonight']])
  })
  it('a failure ending the others is only logged: the show still goes live', async () => {
    db.failOthers = true
    await act(async () => { await api.goLive() })
    await flush()
    expect(db.calls.some(c => c.patch.is_live === true)).toBe(true)
  })
})
