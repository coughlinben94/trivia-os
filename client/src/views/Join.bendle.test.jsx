// @vitest-environment jsdom
// client/src/views/Join.bendle.test.jsx — Join's Bendle wiring: board mount,
// group-aware pinning, the stepped-away lockout exemption, song list prefetch.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

const boardProps = { bendle: null }
vi.mock('../lib/supabase.js', () => ({ supabase: { from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }) } }))
vi.mock('../hooks/useUsMapData.js', () => ({ preloadUsMapData: () => {} }))
vi.mock('../components/join/PinBoard.jsx', () => ({ default: () => <div>pin board</div> }))
vi.mock('../components/join/BendleBoard.jsx', () => ({ default: props => { boardProps.bendle = props; return <div>bendle board</div> } }))
const loadBendleCatalog = vi.fn(() => Promise.reject(new Error('offline')))
vi.mock('../lib/bendleCatalog.js', () => ({ loadBendleCatalog: (...a) => loadBendleCatalog(...a) }))
vi.mock('../lib/bendleCatalogVersion.js', () => ({ BENDLE_CATALOG_URL: '/bendle-catalog.test.json' }))
const { LiveView } = await import('./Join.jsx')

globalThis.IS_REACT_ACT_ENVIRONMENT = true
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } // ShrinkToFit
const theme = { colors: { text: '#fff', highlight: '#f5c842', accent: '#1a6b4a' } }
const team = { id: 't1', name: 'Team', showId: 'show1' }
const plain = { id: 'q0', order: 0, type: 'question', data: { text: 'Warm up' } }
const step = (i, extra = {}) => ({ id: `b${i + 1}`, order: i + 1, type: 'question',
  data: { isShiny: true, shinyInputSchema: { type: 'bendle' }, shinyGroupId: 'g1', bendleStepIndex: i, text: 'Name that song', ...extra } })
const pin = { id: 'p1', order: 1, type: 'question', data: { isShiny: true, shinyInputSchema: { type: 'pin' }, text: 'Where?' } }

let root, host
function setHidden(hidden) {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
  document.dispatchEvent(new Event('visibilitychange'))
}
async function render(slides, liveId) {
  const show = { id: 'show1', slides, current_slide_id: liveId, current_slide_index: slides.findIndex(s => s.id === liveId) }
  host ??= document.body.appendChild(document.createElement('div'))
  root ??= createRoot(host)
  await act(async () => root.render(<LiveView show={show} team={team} theme={theme} powerupUsed onInvokePowerup={() => {}} onOpenScores={() => {}} />))
}
const backButton = () => [...host.querySelectorAll('button')].find(b => b.textContent.includes('Back'))
const steppedAway = () => host.textContent.includes('You stepped away')

beforeEach(() => {
  boardProps.bendle = null
  loadBendleCatalog.mockClear()
  localStorage.setItem('trivia-os:followMode', 'manual')
})
afterEach(() => {
  act(() => root?.unmount()); host?.remove(); root = host = null
  setHidden(false); vi.useRealTimers(); localStorage.clear()
})

describe('Join LiveView — Bendle', () => {
  it('mounts BendleBoard with the live slide list and the answered callback', async () => {
    const slides = [plain, step(0), step(1), step(2)]
    await render(slides, 'b1')
    expect(host.textContent).toContain('bendle board')
    expect(boardProps.bendle.slide.id).toBe('b1')
    expect(boardProps.bendle.slides).toBe(slides)
    expect(typeof boardProps.bendle.onAnswered).toBe('function')
    expect(boardProps.bendle.team).toBe(team)
  })

  it('pins the phone on step 2 while the group is open, releases it once step 3 locks', async () => {
    await render([plain, step(0), step(1), step(2)], 'b2')
    expect(backButton()).toBeUndefined()
    await render([plain, step(0), step(1), step(2, { bendleLocked: true })], 'b2')
    expect(backButton()).toBeDefined()
  })

  it('keeps BendleBoard mounted on step 3 after the reveal', async () => {
    await render([plain, step(0), step(1), step(2, { bendleLocked: true, bendleRevealed: true, bendleResults: [] })], 'b3')
    expect(host.textContent).toContain('bendle board')
    expect(boardProps.bendle.slide.id).toBe('b3')
  })

  it('does not lock out a team whose phone sleeps through a Bendle step', async () => {
    vi.useFakeTimers()
    await render([plain, step(0), step(1), step(2)], 'b1')
    act(() => setHidden(true))
    act(() => vi.advanceTimersByTime(31000))
    act(() => setHidden(false))
    expect(steppedAway()).toBe(false)
  })

  it('still locks out a team that leaves for 30 s on another phone mechanic', async () => {
    vi.useFakeTimers()
    await render([plain, pin], 'p1')
    act(() => setHidden(true))
    act(() => vi.advanceTimersByTime(31000))
    act(() => setHidden(false))
    expect(steppedAway()).toBe(true)
  })

  it('prefetches the song list when the show has a Bendle, and swallows a failure', async () => {
    await render([plain, step(0), step(1), step(2)], 'q0')
    expect(loadBendleCatalog).toHaveBeenCalledTimes(1)
  })

  it('does not prefetch for a show without Bendle', async () => {
    await render([plain, pin], 'q0')
    expect(loadBendleCatalog).not.toHaveBeenCalled()
  })
})
