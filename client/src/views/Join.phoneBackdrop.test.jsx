// client/src/views/Join.phoneBackdrop.test.jsx
// @vitest-environment jsdom
// Tier 2 phone backdrop (Phase 3d-3/3d-4), through the REAL Join view with a
// mocked Supabase client: forest theme mounts it behind waiting + live and
// follows the HOST index; every other theme renders no backdrop at all.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { THEMES } from '../themes/index.js'
import { resolveRingSlideIndex } from '../lib/ringStationResolver.js'
import { sortSlides } from '../lib/slideStepping.js'

const db = { show: null, team: null }
const showListeners = []
function query(table) {
  const row = () => ({ data: table === 'shows' ? db.show : table === 'teams' ? db.team : null, error: null })
  const list = () => ({ data: [], error: null })
  const q = new Proxy({}, {
    get(_, k) {
      if (k === 'then') return (a, b) => Promise.resolve(list()).then(a, b)
      if (k === 'single' || k === 'maybeSingle') return () => Promise.resolve(row())
      return () => q
    },
  })
  return q
}
vi.mock('../lib/supabase.js', () => ({
  supabase: {
    from: t => query(t),
    channel: () => {
      const ch = {
        on: (_e, filter, cb) => { if (filter?.table === 'shows') showListeners.push(cb); return ch },
        subscribe: cb => { cb?.('SUBSCRIBED'); return ch },
        unsubscribe: () => {}, send: () => {}, track: () => {},
      }
      return ch
    },
    removeChannel: () => {},
    rpc: () => Promise.resolve({ data: null, error: null }),
    auth: { getSession: () => Promise.resolve({ data: { session: null } }), signInAnonymously: () => Promise.resolve({ data: null, error: { status: 400 } }) },
  },
}))

const { default: Join } = await import('./Join.jsx')
const { phoneBackdropLoader } = await import('../components/join/phoneBackdropThemes.js')
const realLoad = phoneBackdropLoader.load

// order fields deliberately out of array order: Join must sort like the TV.
const SLIDES = [
  { id: 's2', order: 2, type: 'question', data: { text: 'Q one?', answer: 'a' } },
  { id: 's0', order: 0, type: 'pre-show', data: {} },
  { id: 's1', order: 1, type: 'round-intro', data: { roundNumber: 1, title: 'R1' } },
  { id: 's3', order: 3, type: 'scoreboard', data: {} },                     // not ring-visible
  { id: 's4', order: 4, type: 'question', data: { text: 'Q two?', answer: 'b' } },
  { id: 's5', order: 5, type: 'team-picker', data: { parts: [{}, {}, {}], currentPart: 2 } }, // landed: peeks to s6
  { id: 's6', order: 6, type: 'question', data: { text: 'Q three?', answer: 'c' } },
]

let host, root
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  showListeners.length = 0
  localStorage.clear()
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} }
  window.matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.restoreAllMocks()
})

async function mountJoin({ themeId, isLive, index = 0 }) {
  db.show = { id: 'show_t', theme_id: themeId, is_live: isLive, current_slide_index: index, current_slide_id: isLive ? 'x' : null, slides: SLIDES, updated_at: '2026-10-01T00:00:00Z' }
  db.team = { id: 'team_t', name: 'Ghouls', color: '#ff0000', powerup_used: false }
  localStorage.setItem('trivia-os:team:show_t', JSON.stringify({ id: 'team_t', name: 'Ghouls', color: '#ff0000', showId: 'show_t' }))
  await act(async () => {
    root.render(<MemoryRouter initialEntries={['/join?show=show_t']}><Join /></MemoryRouter>)
  })
  for (let i = 0; i < 5; i++) await act(async () => { await new Promise(r => setTimeout(r, 0)) })
}
const backdrop = () => host.querySelector('[data-phone-backdrop]')
// The backdrop arrives via dynamic import: poll (real timers) until it shows.
async function waitForBackdrop() {
  for (let i = 0; i < 200 && !backdrop(); i++) await act(async () => { await new Promise(r => setTimeout(r, 10)) })
  return backdrop()
}
async function hostMovesTo(index, n) {
  await act(async () => {
    for (const cb of showListeners) cb({ new: { id: 'show_t', current_slide_index: index, current_slide_id: 'x', is_live: true, updated_at: `2026-10-01T00:00:0${n}Z` } })
  })
}

describe('Join phone backdrop', () => {
  it('forest theme, waiting (not live): backdrop at station 0, waiting root transparent', async () => {
    await mountJoin({ themeId: 'haunted-october', isLive: false, index: 4 })
    await waitForBackdrop()
    expect(host.textContent).toContain('Waiting for Ben')
    expect(backdrop()).not.toBeNull()
    expect(backdrop().getAttribute('data-phone-backdrop')).toBe('0')
    expect(backdrop().getAttribute('aria-hidden')).toBe('true')
  })

  it('forest theme, live: station = TV resolver on the HOST index, incl. hidden slides and team-picker peek', async () => {
    await mountJoin({ themeId: 'haunted-october', isLive: true, index: 4 })
    await waitForBackdrop()
    const sorted = sortSlides(SLIDES)
    expect(backdrop().getAttribute('data-phone-backdrop')).toBe(String(resolveRingSlideIndex(sorted, 4) % 13))
    expect(backdrop().getAttribute('data-phone-backdrop')).toBe('3') // pre-show, round-intro, Q1, (scoreboard skipped), Q2
    await hostMovesTo(3, 1) // scoreboard: not ring-visible, holds the previous count
    expect(backdrop().getAttribute('data-phone-backdrop')).toBe('2')
    await hostMovesTo(5, 2) // landed team-picker peeks to s6, like the TV
    expect(backdrop().getAttribute('data-phone-backdrop')).toBe(String(resolveRingSlideIndex(sorted, 5) % 13))
    expect(backdrop().getAttribute('data-phone-backdrop')).toBe('4')
  })

  it('a team browsing behind the host (viewedIndex < hostIndex) does not move the backdrop', async () => {
    localStorage.setItem('trivia-os:followMode', 'manual')
    await mountJoin({ themeId: 'haunted-october', isLive: true, index: 2 })
    await waitForBackdrop()
    localStorage.setItem('trivia-os:followMode', 'manual')
    expect(backdrop().getAttribute('data-phone-backdrop')).toBe('2')
    await hostMovesTo(6, 3) // manual mode keeps viewedIndex at 2
    expect(host.textContent).toContain('Current Slide') // proof the phone is behind live
    expect(host.textContent).toContain('Q one?')
    expect(backdrop().getAttribute('data-phone-backdrop')).toBe(String(resolveRingSlideIndex(sortSlides(SLIDES), 6) % 13))
    expect(backdrop().getAttribute('data-phone-backdrop')).toBe('4')
  })

  it('forest theme: exactly one dynamic load; roots keep the original gradient until it resolves', async () => {
    let release
    const gate = new Promise(r => { release = r })
    const spy = vi.spyOn(phoneBackdropLoader, 'load').mockImplementation(() => gate.then(() => realLoad()))
    await mountJoin({ themeId: 'haunted-october', isLive: false })
    expect(spy).toHaveBeenCalledTimes(1)
    expect(backdrop()).toBeNull()
    const waitingRoot = [...host.querySelectorAll('div')].find(d => d.style.minHeight === '100dvh')
    expect(waitingRoot.getAttribute('style')).toContain('background: linear-gradient(180deg, rgb(12, 6, 4) 0%, rgb(6, 3, 2) 100%)') // theme bg -> bgDeep, as before
    expect(host.innerHTML).not.toContain('transparent')
    await act(async () => { release() })
    expect(await waitForBackdrop()).not.toBeNull()
    expect(waitingRoot.style.background).toBe('transparent')
    await hostMovesTo(4, 5) // goes live + slide changes: still one load
    expect(backdrop().getAttribute('data-phone-backdrop')).toBe('3')
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it.each(THEMES.filter(t => t.id !== 'haunted-october').map(t => t.id))('non-forest theme %s: no backdrop and no dynamic load, waiting or live', async (themeId) => {
    const spy = vi.spyOn(phoneBackdropLoader, 'load')
    await mountJoin({ themeId, isLive: false })
    expect(host.textContent).toContain('Waiting for Ben')
    expect(backdrop()).toBeNull()
    expect(host.innerHTML).not.toContain('transparent')
    await hostMovesTo(4, 4)
    expect(host.textContent).toContain('Q two?')
    expect(backdrop()).toBeNull()
    expect(spy).not.toHaveBeenCalled()
  })
})
