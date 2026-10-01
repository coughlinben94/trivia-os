// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import TimerControl from './TimerControl.jsx'
import { startTimer } from '../../lib/showTimer.js'

describe('<TimerControl>', () => {
  let container, root, actions

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    vi.useFakeTimers()
    vi.setSystemTime(5_000_000)
    actions = { setShowTimer: vi.fn() }
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })
  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.useRealTimers()
  })

  const render = timer => act(() => {
    root.render(<TimerControl show={{ special_event: timer ? { timer } : null }} actions={actions} />)
  })
  const input = () => container.querySelector('input')
  const button = label => [...container.querySelectorAll('button')].find(b => b.textContent.trim() === label)
  const type = value => act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    setter.call(input(), value)
    input().dispatchEvent(new Event('input', { bubbles: true }))
  })

  it('Start stays disabled until the input is a valid positive number', () => {
    render(null)
    expect(button('Start').disabled).toBe(true)
    for (const bad of ['abc', '0', '-1', '1e3']) {
      type(bad)
      expect(button('Start').disabled).toBe(true)
    }
    type('1.5')
    expect(button('Start').disabled).toBe(false)
  })

  it('Start writes a running timer of the typed length, and Enter does the same', () => {
    render(null)
    type('1.5')
    act(() => button('Start').click())
    const t = actions.setShowTimer.mock.calls[0][0]
    expect(t).toMatchObject({ state: 'running', totalMs: 90000, endsAt: 5_000_000 + 90000 })
    type('2')
    act(() => { input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })) })
    expect(actions.setShowTimer.mock.calls[1][0].totalMs).toBe(120000)
  })

  it('does nothing when Enter is pressed on an invalid value', () => {
    render(null)
    type('zero')
    act(() => { input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })) })
    expect(actions.setShowTimer).not.toHaveBeenCalled()
  })

  it('running timer: shows the reading, offers Restart, Pause, +30 s, +1 min, Cancel', () => {
    render(startTimer(90000, Date.now()))
    expect(container.querySelector('[data-timer-readout]').textContent).toContain('1:30')
    expect(button('Restart')).toBeTruthy()
    act(() => button('Pause').click())
    expect(actions.setShowTimer.mock.calls[0][0]).toMatchObject({ state: 'paused', remainingMs: 90000 })
    act(() => button('+1 min').click())
    expect(actions.setShowTimer.mock.calls[1][0].endsAt).toBe(5_000_000 + 150000)
    act(() => button('+30 s').click())
    expect(actions.setShowTimer.mock.calls[2][0].endsAt).toBe(5_000_000 + 120000)
    act(() => button('Cancel').click())
    act(() => button('Tap again to cancel').click())
    expect(actions.setShowTimer.mock.calls[3][0]).toBeNull()
  })

  it.each([['1:30'], ['90s'], ['1.5'], ['90 seconds']])('typing %s starts a 90 second timer', t => {
    render(null)
    type(t)
    act(() => button('Start').click())
    expect(actions.setShowTimer.mock.calls[0][0]).toMatchObject({ state: 'running', totalMs: 90000 })
  })

  it('bad seconds like 1:75 keep Start off and show the hint with the new forms', () => {
    render(null)
    type('1:75')
    expect(button('Start').disabled).toBe(true)
    expect(container.textContent).toContain('1:30')
    expect(container.textContent).toContain('90s')
    expect(input().placeholder).toContain('1:30')
  })

  it('+30 s on a finished timer starts a fresh 30 seconds', async () => {
    render(startTimer(3000, Date.now()))
    await act(async () => { vi.advanceTimersByTime(3500) })
    act(() => button('+30 s').click())
    expect(actions.setShowTimer.mock.calls[0][0]).toMatchObject({ state: 'running', totalMs: 30000 })
  })

  it('paused timer: Resume restarts the clock from what was left', () => {
    render({ id: 'p', state: 'paused', totalMs: 60000, remainingMs: 25000, endsAt: 0, sentAt: 1 })
    act(() => button('Resume').click())
    expect(actions.setShowTimer.mock.calls[0][0]).toMatchObject({ state: 'running', endsAt: 5_000_000 + 25000 })
  })

  it('a finished timer shows the finished label and a Clear button', async () => {
    render(startTimer(3000, Date.now()))
    await act(async () => { vi.advanceTimersByTime(3500) })
    expect(container.textContent).toContain('Time’s up!')
    act(() => button('Clear').click())
    expect(actions.setShowTimer).toHaveBeenLastCalledWith(null)
  })

  it('blurs the input after Start so the arrow keys keep stepping the show', () => {
    render(null)
    input().focus()
    type('1')
    act(() => button('Start').click())
    expect(document.activeElement).not.toBe(input())
  })

  it('Cancel takes two taps while a timer is running, so a stray click cannot kill a live countdown', () => {
    render(startTimer(90000, Date.now()))
    act(() => button('Cancel').click())
    expect(actions.setShowTimer).not.toHaveBeenCalled()
    expect(button('Tap again to cancel')).toBeTruthy()
    act(() => button('Tap again to cancel').click())
    expect(actions.setShowTimer).toHaveBeenCalledTimes(1)
    expect(actions.setShowTimer).toHaveBeenLastCalledWith(null)
  })

  it('the Cancel arm drops back by itself after a few seconds', async () => {
    render(startTimer(90000, Date.now()))
    act(() => button('Cancel').click())
    expect(button('Tap again to cancel')).toBeTruthy()
    await act(async () => { vi.advanceTimersByTime(3500) })
    expect(button('Cancel')).toBeTruthy()
    expect(actions.setShowTimer).not.toHaveBeenCalled()
  })

  it('every button gives instant press feedback', () => {
    render(startTimer(90000, Date.now()))
    for (const b of container.querySelectorAll('button')) expect(b.className).toContain('active:scale-[0.97]')
  })
})
