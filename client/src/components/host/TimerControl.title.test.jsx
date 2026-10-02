// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import TimerControl from './TimerControl.jsx'
import { startTimer } from '../../lib/showTimer.js'

describe('<TimerControl> label chips', () => {
  let container, root, actions
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    vi.useFakeTimers(); vi.setSystemTime(5_000_000)
    actions = { setShowTimer: vi.fn() }
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container)
  })
  afterEach(() => { act(() => root.unmount()); container.remove(); vi.useRealTimers() })
  const render = timer => act(() => { root.render(<TimerControl show={{ special_event: timer ? { timer } : null }} actions={actions} />) })
  const chip = n => container.querySelector(`[data-timer-title-chip="${n}"]`)
  const click = el => act(() => el.dispatchEvent(new MouseEvent('click', { bubbles: true })))
  const type = value => act(() => {
    const input = container.querySelector('input')
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  const start = () => click([...container.querySelectorAll('button')].find(b => /^(Start|Restart)$/.test(b.textContent.trim())))

  it('defaults to Answers due and sends it with Start', () => {
    render(null)
    expect(chip('Answers due').getAttribute('aria-pressed')).toBe('true')
    expect(chip('Break').getAttribute('aria-pressed')).toBe('false')
    type('1:30'); start()
    expect(actions.setShowTimer.mock.calls[0][0].title).toBe('Answers due')
  })
  it('Break and None are sent, and the choice sticks across Starts', () => {
    render(null)
    click(chip('Break')); type('1:00'); start()
    expect(actions.setShowTimer.mock.calls[0][0].title).toBe('Break')
    type('2:00'); start()
    expect(actions.setShowTimer.mock.calls[1][0].title).toBe('Break')
    click(chip('none')); type('2:00'); start()
    expect('title' in actions.setShowTimer.mock.calls[2][0]).toBe(false)
  })
  it('shows the running timer title next to the readout', () => {
    render(startTimer(90000, Date.now(), 'Break'))
    expect(container.querySelector('[data-timer-readout-title]').textContent).toBe('Break')
    expect(container.querySelector('[data-timer-readout]').textContent).toContain('1:30')
  })
})
