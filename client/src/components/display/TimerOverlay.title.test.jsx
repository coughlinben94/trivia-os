// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

vi.mock('../../lib/supabase.js', () => ({ supabase: {} }))
vi.mock('../../lib/timerChime.js', () => ({ playTimerChime: vi.fn(() => Promise.resolve(true)), unlockTimerAudio: vi.fn(), warmTimerChime: vi.fn(() => Promise.resolve()) }))

import { ThemeProvider } from '../shared/ThemeProvider.jsx'
import TimerOverlay from './TimerOverlay.jsx'
import { startTimer, pauseTimer } from '../../lib/showTimer.js'

describe('<TimerOverlay> title', () => {
  let container, root
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    globalThis.FontFace = class { load() { return Promise.resolve(this) } }
    if (!document.fonts) document.fonts = { add() {}, delete() {}, ready: Promise.resolve() }
    sessionStorage.clear()
    vi.useFakeTimers(); vi.setSystemTime(20_000_000)
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container)
  })
  afterEach(() => { act(() => root.unmount()); container.remove(); vi.useRealTimers() })
  const render = timer => act(() => { root.render(<ThemeProvider><TimerOverlay show={{ id: 's', special_event: { timer } }} /></ThemeProvider>) })
  const titleEl = () => container.querySelector('[data-timer-title]')
  const panel = () => container.querySelector('[data-timer-overlay]')

  it('shows the title on its own line above the clock', () => {
    render(startTimer(90000, Date.now(), 'Answers due'))
    expect(titleEl().textContent).toBe('Answers due')
    expect(titleEl().style.textTransform).toBe('uppercase')
    expect(titleEl().compareDocumentPosition(container.querySelector('[data-timer-cell]')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(panel().getAttribute('aria-label')).toBe('Answers due. Timer 1:30')
    expect(container.textContent).not.toContain('PAUSED')
  })
  it('paused: PAUSED joins the title line, with no separate PAUSED line', () => {
    render(pauseTimer(startTimer(90000, Date.now(), 'Break'), Date.now()))
    expect(titleEl().textContent).toBe('Break · PAUSED')
    expect(container.textContent.match(/PAUSED/g)).toHaveLength(1)
  })
  it('no title keeps the old look: no label, standalone PAUSED line', () => {
    render(startTimer(90000, Date.now()))
    expect(titleEl()).toBeNull()
    expect(panel().getAttribute('aria-label')).toBe('Timer 1:30')
    render(pauseTimer(startTimer(90000, Date.now()), Date.now()))
    expect(titleEl()).toBeNull()
    expect(container.textContent).toContain('PAUSED')
  })
  it('a hand-edited garbage title renders no label and does not crash', () => {
    for (const title of ['Hacked', 7, { a: 1 }, null]) {
      render({ ...startTimer(90000, Date.now()), title })
      expect(titleEl(), String(title)).toBeNull()
      expect(container.textContent).toContain('1:30')
    }
  })
  it('done state keeps the title above Time’s up', async () => {
    render(startTimer(5000, Date.now(), 'Answers due'))
    await act(async () => { vi.advanceTimersByTime(6000) })
    expect(panel().getAttribute('data-phase')).toBe('done')
    expect(titleEl().textContent).toBe('Answers due')
    expect(container.textContent).toContain('Time’s up!')
  })
})
