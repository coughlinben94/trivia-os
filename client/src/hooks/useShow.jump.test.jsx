// @vitest-environment jsdom
// useShow's jumpTo against a fake supabase: NO network, no real writes. The
// fake records every shows update so the test can read what would be written.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

const db = vi.hoisted(() => ({ row: null, updates: [], teamSelects: 0, holdTeams: null }))

vi.mock('../lib/supabase.js', () => {
  const query = table => {
    const q = {
      _table: table, _patch: null,
      select() { return q },
      eq() { return q },
      order() { return q },
      update(patch) { q._patch = patch; return q },
      single() { return Promise.resolve({ data: db.row, error: null }) },
      maybeSingle() { return Promise.resolve({ data: db.row, error: null }) },
      then(res, rej) {
        if (q._patch) { db.updates.push({ table, patch: q._patch }); return Promise.resolve({ error: null }).then(res, rej) }
        if (table === 'teams') {
          db.teamSelects++
          const out = { data: [{ id: 't1' }, { id: 't2' }], error: null }
          return (db.holdTeams ?? Promise.resolve()).then(() => out).then(res, rej)
        }
        return Promise.resolve({ data: [], error: null }).then(res, rej)
      },
    }
    return q
  }
  const channel = { on() { return channel }, subscribe() { return channel } }
  return { supabase: { from: query, channel: () => channel, removeChannel() {} } }
})
vi.mock('../lib/questionRows.js', () => ({ archiveShow: vi.fn(() => Promise.resolve(true)) }))

const { useShow } = await import('./useShow.js')
const { archiveShow } = await import('../lib/questionRows.js')

const match = extra => ({ isShiny: true, shinyInputSchema: { type: 'matching' }, ...extra })
const SLIDES = [
  { id: 'a', order: 0, type: 'question', data: { questionNumber: 1 } },
  { id: 'b', order: 1, type: 'question', data: { questionNumber: 2 } },
  { id: 'c', order: 2, type: 'question', data: match({ matchingLocked: true }) },
  { id: 'd', order: 3, type: 'question', data: { questionNumber: 4 } },
  { id: 'e', order: 4, type: 'team-picker', data: {} },
]

let host, root, api
function Probe() { api = useShow(); return null }
const flush = () => act(async () => { for (let i = 0; i < 5; i++) await Promise.resolve() })
const lastShowWrite = () => db.updates.filter(u => u.table === 'shows').at(-1)?.patch

beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  db.row = {
    id: 'show1', title: 'T', slides: structuredClone(SLIDES), rounds: [],
    current_slide_index: 0, current_slide_id: 'a', is_live: true,
    audio_playing: null,
  }
  db.updates = []
  db.teamSelects = 0
  db.holdTeams = null
  archiveShow.mockClear()
  localStorage.setItem('trivia-os:activeShowId', 'show1')
  host = document.createElement('div')
  root = createRoot(host)
  await act(async () => root.render(<Probe />))
  await flush()
})
afterEach(() => { act(() => root.unmount()); localStorage.clear() })

describe('useShow.jumpTo', () => {
  it('moves local state before any await and writes one patch: index, non-null id, answer_reveal off', async () => {
    let p
    act(() => { p = api.jumpTo(3) })
    // Optimistic: already there, synchronously inside the same act.
    expect(api.show.showState).toMatchObject({ currentSlideIndex: 3, currentSlideId: 'd', answerReveal: false })
    await act(async () => { await p })
    const patch = lastShowWrite()
    expect(patch).toMatchObject({ current_slide_index: 3, current_slide_id: 'd', answer_reveal: false })
    expect(patch).not.toHaveProperty('is_live')
    expect(patch).not.toHaveProperty('updated_at')
    expect(archiveShow).not.toHaveBeenCalled()
    expect(db.teamSelects).toBe(0)
  })

  it('jump back then forward to an already-scored question keeps its locks', async () => {
    // Walk forward: a -> b -> c -> d, so furthest = 3.
    for (let i = 0; i < 3; i++) await act(async () => { await api.nextSlide() })
    expect(api.show.showState.currentSlideIndex).toBe(3)
    // Next onto c was a fresh entry (not revealed) and cleared the rehearsal
    // lock; lock it again as if Ben scored it live.
    await act(async () => { api.updateSlide('c', { data: { ...api.show.slides[2].data, matchingLocked: true } }) })
    await act(async () => { await api.jumpTo(0) })
    await act(async () => { await api.jumpTo(2) })
    const c = lastShowWrite().slides.find(s => s.id === 'c')
    expect(c.data.matchingLocked).toBe(true)
  })

  it('after a /host reload mid-show (furthest mark back at 0), jump back then forward keeps a locked, unrevealed question locked', async () => {
    // Host.jsx auto-resumes Live Mode without goLiveFrom, so the ref starts
    // at 0 while the row is already on slide 4: a locked matching question
    // whose answers are not revealed yet.
    act(() => root.unmount())
    db.row = {
      ...db.row,
      slides: [...structuredClone(SLIDES).slice(0, 4), { id: 'e', order: 4, type: 'question', data: match({ matchingLocked: true }) }],
      current_slide_index: 4, current_slide_id: 'e',
    }
    root = createRoot(host)
    await act(async () => root.render(<Probe />))
    await flush()
    expect(api.show.showState.currentSlideIndex).toBe(4)
    await act(async () => { await api.jumpTo(1) })
    await act(async () => { await api.jumpTo(4) })
    expect(lastShowWrite().slides.find(s => s.id === 'e').data.matchingLocked).toBe(true)
  })

  it('goLiveFrom resets the furthest mark', async () => {
    for (let i = 0; i < 3; i++) await act(async () => { await api.nextSlide() })
    await act(async () => { await api.goLiveFrom(0) })
    await act(async () => { api.updateSlide('c', { data: { ...api.show.slides[2].data, matchingLocked: true } }) })
    await act(async () => { await api.jumpTo(2) })
    // Never visited since the fresh go-live: a half-finished lock is stale.
    expect(lastShowWrite().slides.find(s => s.id === 'c').data.matchingLocked).toBe(false)
  })

  it('a team-picker target bakes its parts first (one teams read), then writes', async () => {
    let release
    db.holdTeams = new Promise(r => { release = r })
    let p
    act(() => { p = api.jumpTo(4) })
    // Bake pending: nothing moved yet.
    expect(api.show.showState.currentSlideIndex).toBe(0)
    release()
    await act(async () => { await p })
    expect(db.teamSelects).toBe(1)
    const patch = lastShowWrite()
    expect(patch.current_slide_id).toBe('e')
    expect(patch.slides.find(s => s.id === 'e').data.parts).toHaveLength(2 + 4)
  })

  it('out of range does nothing', async () => {
    const before = db.updates.length
    await act(async () => { await api.jumpTo(99) })
    expect(db.updates.length).toBe(before)
    expect(api.show.showState.currentSlideIndex).toBe(0)
  })
})
