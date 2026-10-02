// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

const upsert = vi.fn()
vi.mock('../lib/supabase.js', () => ({
  supabase: { from: (table) => ({ upsert: (...a) => upsert(table, ...a) }) },
}))

const { usePhoneAnswerSave } = await import('./usePhoneAnswerSave.js')

let host, root, api, errSpy
function Harness(props) {
  api = usePhoneAnswerSave(props)
  return null
}
const slide = { id: 's1', showId: 'show_1' }
const team = { id: 't1', showId: 'show_t' }
// React's own act() warning also lands on console.error, so find ours by text.
const logged = (text) => errSpy.mock.calls.find(c => typeof c[0] === 'string' && c[0].includes(text))
const mount = (over = {}) =>
  act(() => root.render(<Harness preview={false} slide={slide} team={team} board="TestBoard" noun="test" {...over} />))

beforeEach(() => {
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  upsert.mockReset()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  errSpy.mockRestore()
  vi.useRealTimers()
})

describe('usePhoneAnswerSave', () => {
  it('upserts one row per team+slide with the answer it was given', async () => {
    upsert.mockResolvedValue({ error: null })
    mount()
    let ok
    await act(async () => { ok = await api.saveAnswer({ pick: 'a' }) })
    expect(ok).toBe(true)
    expect(upsert).toHaveBeenCalledWith(
      'phone_answers',
      { show_id: 'show_1', slide_id: 's1', team_id: 't1', answer: { pick: 'a' } },
      { onConflict: 'slide_id,team_id' },
    )
    expect(api.saveFailed).toBe(false)
  })

  it('falls back to the team show id when the slide has none', async () => {
    upsert.mockResolvedValue({ error: null })
    mount({ slide: { id: 's1' } })
    await act(async () => { await api.saveAnswer(1) })
    expect(upsert.mock.calls[0][1].show_id).toBe('show_t')
  })

  it('does nothing and reports success in preview', async () => {
    mount({ preview: true })
    let ok
    await act(async () => { ok = await api.saveAnswer(1) })
    expect(ok).toBe(true)
    expect(upsert).not.toHaveBeenCalled()
  })

  it('reports a Supabase error as failed, then clears the flag on the next success', async () => {
    upsert.mockResolvedValueOnce({ error: new Error('nope') }).mockResolvedValueOnce({ error: null })
    mount()
    let ok
    await act(async () => { ok = await api.saveAnswer(1) })
    expect(ok).toBe(false)
    expect(api.saveFailed).toBe(true)
    expect(logged('[TestBoard] test save failed')).toBeTruthy()
    await act(async () => { ok = await api.saveAnswer(2) })
    expect(ok).toBe(true)
    expect(api.saveFailed).toBe(false)
  })

  it('treats a thrown request as a failed save', async () => {
    upsert.mockRejectedValueOnce(new Error('boom'))
    mount()
    let ok
    await act(async () => { ok = await api.saveAnswer(1) })
    expect(ok).toBe(false)
    expect(api.saveFailed).toBe(true)
  })

  it('runs saves one after another, in call order', async () => {
    let release
    upsert.mockImplementationOnce(() => new Promise(r => { release = () => r({ error: null }) }))
    upsert.mockResolvedValueOnce({ error: null })
    mount()
    let p1, p2
    await act(async () => {
      p1 = api.saveAnswer('first')
      p2 = api.saveAnswer('second')
      await Promise.resolve()
    })
    expect(upsert).toHaveBeenCalledTimes(1)
    expect(upsert.mock.calls[0][1].answer).toBe('first')
    await act(async () => { release(); await p1; await p2 })
    expect(upsert).toHaveBeenCalledTimes(2)
    expect(upsert.mock.calls[1][1].answer).toBe('second')
  })

  it('gives up on a request that never settles after 8s and lets the next save through', async () => {
    vi.useFakeTimers()
    upsert.mockImplementationOnce(() => new Promise(() => {}))
    upsert.mockResolvedValueOnce({ error: null })
    mount()
    let p1, p2
    await act(async () => {
      p1 = api.saveAnswer('stuck')
      p2 = api.saveAnswer('next')
      await Promise.resolve()
    })
    await act(async () => { await vi.advanceTimersByTimeAsync(8000) })
    expect(await p1).toBe(false)
    expect(await p2).toBe(true)
    expect(logged('[TestBoard] test save failed')[1].message).toBe('test save timed out')
    expect(upsert.mock.calls[1][1].answer).toBe('next')
  })
})
