// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

vi.mock('../../lib/supabase.js', () => ({ supabase: {} }))
const chime = vi.hoisted(() => vi.fn(() => Promise.resolve(true)))
vi.mock('../../lib/timerChime.js', () => ({ playTimerChime: chime, unlockTimerAudio: vi.fn() }))

import { ThemeProvider } from '../shared/ThemeProvider.jsx'
import TimerOverlay from './TimerOverlay.jsx'
import { startTimer } from '../../lib/showTimer.js'
import { THEMES } from '../../themes/index.js'
import { contrastRatio } from '../../lib/contrast.js'

describe('<TimerOverlay>', () => {
  let container, root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    globalThis.FontFace = class { load() { return Promise.resolve(this) } }
    if (!document.fonts) document.fonts = { add() {}, delete() {}, ready: Promise.resolve() }
    sessionStorage.clear()
    chime.mockClear()
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })
  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.useRealTimers()
  })

  const render = show => act(() => {
    root.render(<ThemeProvider><TimerOverlay show={show} /></ThemeProvider>)
  })
  const withTimer = timer => ({ id: 's', special_event: timer ? { timer } : null })
  const phase = () => container.querySelector('[data-timer-overlay]')?.getAttribute('data-phase')

  it('renders nothing with no timer', () => {
    render(withTimer(null))
    expect(phase()).toBeUndefined()
    expect(chime).not.toHaveBeenCalled()
  })

  it('counts down, goes urgent, then done, and chimes exactly once', async () => {
    render(withTimer(startTimer(12000, Date.now())))
    expect(phase()).toBe('running')
    expect(container.textContent).toContain('0:12')
    await act(async () => { vi.advanceTimersByTime(3000) })
    expect(phase()).toBe('urgent')
    expect(container.textContent).toContain('0:09')
    await act(async () => { vi.advanceTimersByTime(9000) })
    expect(phase()).toBe('done')
    expect(container.textContent).toContain('Time’s up!')
    expect(chime).toHaveBeenCalledTimes(1)
    await act(async () => { vi.advanceTimersByTime(2000) }) // more ticks, same timer
    expect(chime).toHaveBeenCalledTimes(1)
  })

  it('stays silent when mounted long after the timer finished (a TV reload)', async () => {
    const t = startTimer(5000, Date.now() - 5000 - 4000)
    render(withTimer(t))
    await act(async () => { vi.advanceTimersByTime(500) })
    expect(chime).not.toHaveBeenCalled()
  })

  it('does not chime again for the same timer after a remount', async () => {
    const t = startTimer(3000, Date.now())
    render(withTimer(t))
    await act(async () => { vi.advanceTimersByTime(3300) })
    expect(chime).toHaveBeenCalledTimes(1)
    act(() => root.unmount())
    root = createRoot(container)
    render(withTimer(t))
    await act(async () => { vi.advanceTimersByTime(300) })
    expect(chime).toHaveBeenCalledTimes(1)
  })

  it('shows PAUSED with a frozen reading', () => {
    render(withTimer({ id: 'p', state: 'paused', totalMs: 60000, remainingMs: 42000, endsAt: 0, sentAt: Date.now() }))
    expect(phase()).toBe('paused')
    expect(container.textContent).toContain('0:42')
    expect(container.textContent).toContain('PAUSED')
  })
})

describe('<TimerOverlay> design details', () => {
  let container, root
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    globalThis.FontFace = class { load() { return Promise.resolve(this) } }
    if (!document.fonts) document.fonts = { add() {}, delete() {}, ready: Promise.resolve() }
    sessionStorage.clear()
    vi.useFakeTimers(); vi.setSystemTime(1_000_000)
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container)
  })
  afterEach(() => { act(() => root.unmount()); container.remove(); vi.useRealTimers() })
  const render = timer => act(() => { root.render(<ThemeProvider><TimerOverlay show={{ id: 's', special_event: { timer } }} /></ThemeProvider>) })
  const panel = () => container.querySelector('[data-timer-overlay]')

  it('the urgent pulse is a CSS animation (runs off the main thread), and only in the last 10 seconds', () => {
    render(startTimer(60000, Date.now()))
    expect(container.querySelector('.timer-pulse-urgent')).toBeNull()
    act(() => root.unmount()); root = createRoot(container)
    render(startTimer(8000, Date.now()))
    expect(container.querySelector('.timer-pulse-urgent')).not.toBeNull()
  })

  it('the finished state pulses with a CSS animation too', async () => {
    render(startTimer(2000, Date.now()))
    await act(async () => { vi.advanceTimersByTime(2500) })
    expect(container.querySelector('.timer-pulse-done')).not.toBeNull()
  })

  it('every character sits in a fixed-width cell, so the panel never jitters as digits change', () => {
    const widths = label => {
      const cells = [...container.querySelectorAll('[data-timer-cell]')]
      return { text: cells.map(c => c.textContent).join(''), w: cells.map(c => c.style.width) }
    }
    render({ id: 'a', state: 'paused', totalMs: 600000, remainingMs: 71000, endsAt: 0, sentAt: 1 }) // 1:11
    const a = widths()
    expect(a.text).toBe('1:11')
    act(() => root.unmount()); root = createRoot(container)
    render({ id: 'b', state: 'paused', totalMs: 600000, remainingMs: 9000, endsAt: 0, sentAt: 1 })  // 0:09
    const b = widths()
    expect(b.text).toBe('0:09')
    expect(a.w).toEqual(b.w) // a 1 and a 0, an 11 and a 09: same cell widths, so same panel width
  })

  it('sits clear of the shiny sparkle in the top-left corner', () => {
    render(startTimer(60000, Date.now()))
    expect(parseFloat(panel().style.left)).toBeGreaterThanOrEqual(6)
  })

  it('PAUSED is big enough to read from across the room', () => {
    render({ id: 'p', state: 'paused', totalMs: 60000, remainingMs: 42000, endsAt: 0, sentAt: 1 })
    const paused = [...container.querySelectorAll('div')].find(d => d.textContent === 'PAUSED')
    expect(parseFloat(paused.style.fontSize)).toBeGreaterThanOrEqual(4)
  })
})

describe('<TimerOverlay> clock offset', () => {
  let container, root
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    globalThis.FontFace = class { load() { return Promise.resolve(this) } }
    if (!document.fonts) document.fonts = { add() {}, delete() {}, ready: Promise.resolve() }
    sessionStorage.clear()
    vi.useFakeTimers(); vi.setSystemTime(10_000_000)
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container)
  })
  afterEach(() => { act(() => root.unmount()); container.remove(); vi.useRealTimers() })
  const render = timer => act(() => { root.render(<ThemeProvider><TimerOverlay show={{ id: 's', special_event: timer ? { timer } : null }} /></ThemeProvider>) })
  const label = () => container.querySelector('[data-timer-overlay]')?.textContent ?? ''

  const tick = () => act(async () => { vi.advanceTimersByTime(300) })

  it('a stale write delivered late (a reconnect refetch) does not poison the clock offset', async () => {
    // This TV runs 7s ahead of the host. Host clock = TV clock - 7000.
    const hostNow = () => Date.now() - 7000
    render(null)
    render(startTimer(600000, hostNow())) // a live write: the TV learns offset ~7000
    await tick()
    // The TV's wifi blipped; meanwhile the host pressed Restart 20s ago. The refetch hands over that old write.
    render(startTimer(300000, hostNow() - 20000))
    await tick()
    // Truth: started 20s ago with 300s on it -> 4:40 left in HOST time. A poisoned offset (27s) would show 5:00.
    expect(label()).toContain('4:40')
  })

  it('the first live write sets the offset even when the clocks are far apart', async () => {
    render(null)
    render(startTimer(300000, Date.now() - 7000)) // host clock 7s behind this TV, started just now
    await tick()
    expect(label()).toContain('5:00')
  })
})

describe('timer colours on every theme', () => {
  it('digits and urgent highlight read against the panel background', () => {
    for (const t of THEMES) {
      const c = t.colors
      expect(contrastRatio(c.text, c.bgDeep), `${t.id} text`).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(c.highlight, c.bgDeep), `${t.id} highlight`).toBeGreaterThanOrEqual(3)
    }
  })
})
