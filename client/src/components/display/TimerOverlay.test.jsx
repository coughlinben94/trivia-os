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
    expect(container.textContent).toContain('Time’s up')
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

describe('timer colours on every theme', () => {
  it('digits and urgent highlight read against the panel background', () => {
    for (const t of THEMES) {
      const c = t.colors
      expect(contrastRatio(c.text, c.bgDeep), `${t.id} text`).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(c.highlight, c.bgDeep), `${t.id} highlight`).toBeGreaterThanOrEqual(3)
    }
  })
})
