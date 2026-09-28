// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

// Rows each table returns, set per test. A chain that ignores its filters and
// resolves to { data } is all ScoreboardContent's two fetches need.
const db = { scoreboard_teams: [], teams: [] }
vi.mock('../../lib/supabase.js', () => {
  const chain = table => {
    const q = {
      select: () => q, eq: () => q, order: () => q,
      then: (res, rej) => Promise.resolve({ data: db[table] }).then(res, rej),
    }
    return q
  }
  const channel = { on: () => channel, subscribe: () => channel }
  return { supabase: { from: chain, channel: () => channel, removeChannel() {} } }
})

import { ThemeProvider } from '../shared/ThemeProvider.jsx'
import ScoreboardOverlay from './ScoreboardOverlay.jsx'

// The color mark is the only aria-hidden <span> in a row (the live-score
// flash is a div).
const dots = el => [...el.querySelectorAll('span[aria-hidden]')]

describe('<ScoreboardOverlay> team color mark', () => {
  let container, root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    globalThis.FontFace = class { load() { return Promise.resolve(this) } }
    if (!document.fonts) document.fonts = { add() {}, delete() {}, ready: Promise.resolve() }
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  const render = async () => {
    await act(async () => {
      root.render(<ThemeProvider><ScoreboardOverlay show={{ id: 's1', rounds: [], slides: [], scoreboard_visible: true }} /></ThemeProvider>)
    })
    await act(async () => { await new Promise(r => setTimeout(r, 0)) })
  }

  const board = [
    { id: '1', name: 'Alpha', scores: {} },
    { id: '2', name: 'Bravo', scores: {} },
  ]

  it('no team on the board has a color: no dot slot at all (same layout as before colors existed)', async () => {
    db.scoreboard_teams = board
    // A colored team that is not on the board must not switch the slot on.
    db.teams = [{ name: 'Alpha', color: null }, { name: 'Walk-off', color: '#e02020' }]
    await render()
    expect(container.textContent).toContain('Alpha')
    expect(dots(container)).toHaveLength(0)
  })

  it('one team has a color: every row reserves the slot, only that one is filled', async () => {
    db.scoreboard_teams = board
    db.teams = [{ name: ' alpha ', color: '#e02020' }]
    await render()
    const d = dots(container)
    expect(d).toHaveLength(2)
    expect(d.filter(s => s.style.background === 'transparent')).toHaveLength(1)
  })
})
