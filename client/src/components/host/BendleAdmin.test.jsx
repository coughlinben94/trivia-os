// client/src/components/host/BendleAdmin.test.jsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

// Importing BendleAdmin.jsx pulls in ../../lib/supabase.js, which throws at
// module init without VITE_SUPABASE_URL/ANON_KEY — mock it per the house
// pattern (see BendleSongSearch.test.jsx) so the pure statusLabel export can
// be tested without a real client. `from` is new here (Step 1 above added
// the SONG_LIST_COLUMNS query this mock answers) — songsFixture is mutated
// per-test before rendering.
let songsFixture = []
let lastSelectColumns = null
vi.mock('../../lib/supabase.js', () => ({
  supabase: {
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: () => {},
    from: () => ({
      select: columns => { lastSelectColumns = columns; return { order: () => Promise.resolve({ data: songsFixture }) } },
    }),
  },
}))

const { default: BendleAdmin, statusLabel } = await import('./BendleAdmin.jsx')

describe('statusLabel', () => {
  it('labels requested', () => expect(statusLabel('requested')).toBe('⏳ Queued'))
  it('labels processing', () => expect(statusLabel('processing')).toBe('⚙️ Processing'))
  it('labels ready', () => expect(statusLabel('ready')).toBe('✅ Ready'))
  it('labels failed', () => expect(statusLabel('failed')).toBe('❌ Failed'))
})

describe('<BendleAdmin> song list', () => {
  const settle = () => act(async () => { await new Promise(r => setTimeout(r, 0)) })

  it('shows a Scrub toggle only for ready songs, and the saved start time', async () => {
    songsFixture = [
      { id: 'bnd_1', title: 'Hey Jude', status: 'ready', artist: 'The Beatles',
        drums_url: 'd.mp3', bass_url: 'b.mp3', other_url: 'o.mp3', start_offset_seconds: 42 },
      { id: 'bnd_2', title: 'Yesterday', status: 'processing', artist: 'The Beatles',
        drums_url: null, bass_url: null, other_url: null, start_offset_seconds: 0 },
    ]
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => { root.render(<BendleAdmin onClose={() => {}} />) })
    await settle()

    expect(container.textContent).toContain('Starts at 0:42')
    const scrubButtons = [...container.querySelectorAll('button')].filter(b => b.textContent.includes('Scrub'))
    expect(scrubButtons).toHaveLength(1) // only the ready song gets one

    act(() => root.unmount())
    container.remove()
  })

  // Regression: the list refetch (mount/insert/delete) used to leave
  // end_offset_seconds out of its column select, so a saved end trim
  // reset to "full duration" every time the panel reloaded, even though
  // the DB still had the real value (Ben: "the scrubbed end doesn't
  // keep it").
  it('fetches end_offset_seconds along with the rest of the song list columns', async () => {
    songsFixture = []
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => { root.render(<BendleAdmin onClose={() => {}} />) })
    await settle()

    expect(lastSelectColumns).toContain('end_offset_seconds')

    act(() => root.unmount())
    container.remove()
  })
})
