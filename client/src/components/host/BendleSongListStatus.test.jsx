// @vitest-environment jsdom
// client/src/components/host/BendleSongListStatus.test.jsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

const rpc = vi.fn()
vi.mock('../../lib/supabase.js', () => ({ supabase: {
  rpc: (...a) => rpc(...a),
  from: () => ({ select: async () => ({ data: [], error: null }) }),
} }))
const { default: BendleSongListStatus } = await import('./BendleSongListStatus.jsx')

globalThis.IS_REACT_ACT_ENVIRONMENT = true
let root, host, urlN = 0
beforeEach(() => {
  rpc.mockReset()
  globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ rows: [['Africa', 'Toto', 50]] }) }))
})
afterEach(() => { act(() => root?.unmount()); host?.remove() })
const tick = (ms = 0) => act(() => new Promise(r => setTimeout(r, ms)))
async function render(song) {
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  await act(async () => root.render(<BendleSongListStatus song={song} catalogUrl={`/cat-status-${++urlN}.json`} />))
  await tick(600) // past the debounce
}

describe('<BendleSongListStatus>', () => {
  it('a song already in the list says so and adds nothing', async () => {
    await render({ id: 'a', title: 'Africa - 2018 Remaster', answer: 'Africa', artist: 'Toto' })
    expect(host.textContent).toContain('In song list')
    expect(rpc).not.toHaveBeenCalled()
  })
  it('a missing song is added automatically', async () => {
    rpc.mockResolvedValue({ data: true, error: null })
    await render({ id: 'b', title: 'Uptown Funk', answer: 'Uptown Funk', artist: 'Mark Ronson' })
    expect(rpc).toHaveBeenCalledWith('add_bendle_song_extra', { p_title: 'Uptown Funk', p_artist: 'Mark Ronson', p_norm_key: 'uptown funk|mark ronson' })
    expect(host.textContent).toContain('Added to song list')
  })
  it('a failed add shows an error with Retry, and Retry can succeed', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'not authorized' } })
    await render({ id: 'c', title: 'Shut Up and Dance', answer: 'Shut Up and Dance', artist: 'Walk the Moon' })
    expect(host.querySelector('[role="alert"]').textContent).toContain('not authorized')
    rpc.mockResolvedValueOnce({ data: true, error: null })
    await act(async () => [...host.querySelectorAll('button')].find(b => b.textContent === 'Retry').click())
    await tick(600)
    expect(host.textContent).toContain('Added to song list')
  })
})
