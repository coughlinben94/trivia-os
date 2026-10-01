// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import Remote from './Remote.jsx'

class FakeWS {
  static OPEN = 1
  static all = []
  constructor(url) { this.url = url; this.readyState = 0; this.sent = []; FakeWS.all.push(this) }
  send(s) { this.sent.push(JSON.parse(s)) }
  close() { this.drop(1005) }
  open() { this.readyState = 1; this.onopen?.() }
  msg(m) { this.onmessage?.({ data: JSON.stringify(m) }) }
  drop(code) { if (this.readyState === 3) return; this.readyState = 3; this.onclose?.({ code }) }
}

const STATE = {
  type: 'state', slide: { index: 4, total: 20, id: 's5', label: 'Q3', type: 'question' },
  cue: 'Lock answers', gate: 'lock', upNext: [{ label: 'Q4', type: 'question' }],
  toggles: { answerReveal: false, scoreboardVisible: false, scoresRevealed: false }, busy: false, paused: false,
}
const T0 = 1_700_000_000_000
const running = (over = {}) => ({ id: 't1', state: 'running', totalMs: 300000, endsAt: T0 + 192000, remainingMs: 300000, sentAt: T0, ...over })

let host, root, ws
const k = key => host.querySelector(`[data-k="${key}"]`)
const click = el => act(() => el.dispatchEvent(new MouseEvent('click', { bubbles: true })))
const lastCmd = () => ws.sent.filter(m => m.type === 'cmd').at(-1)
const push = (state = {}) => act(() => {
  ws.msg({ type: 'beat', laptopNow: Date.now(), visibility: 'visible' })
  ws.msg({ ...STATE, ...state })
})
function setup(state = {}) {
  localStorage.setItem('trivia-remote:cfg', JSON.stringify({ url: 'wss://relay.test', secret: 'ABC' }))
  act(() => root.render(<Remote />))
  ws = FakeWS.all.at(-1)
  act(() => ws.open())
  act(() => ws.msg({ type: 'host', connected: true }))
  push(state)
}
const openDrawer = () => { click(k('timer-open')); return host.querySelector('[role="dialog"]') }

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.useFakeTimers()
  vi.setSystemTime(T0)
  FakeWS.all = []
  vi.stubGlobal('WebSocket', FakeWS)
  localStorage.clear()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('/remote timer drawer: label chips', () => {
  const chip = n => k(`title-${n}`)
  const start = (d, preset = 60) => { click(d.querySelector(`[data-k="preset-${preset}"]`)); click(d.querySelector('[data-k="timer-start"]')) }
  it('three chips, 56px or taller, Answers due pressed by default', () => {
    setup()
    const d = openDrawer()
    for (const n of ['answers-due', 'break', 'none']) expect(d.querySelector(`[data-k="title-${n}"]`).className).toMatch(/min-h-\[(7\d|8\d)px\]/)
    expect(chip('answers-due').getAttribute('aria-pressed')).toBe('true')
    expect(chip('break').getAttribute('aria-pressed')).toBe('false')
    start(d)
    expect(lastCmd().args).toEqual({ seconds: 60, title: 'Answers due' })
  })
  it('Break and None are sent; the choice sticks', () => {
    setup()
    const d = openDrawer()
    click(chip('break')); start(d)
    expect(lastCmd().args.title).toBe('Break')
    expect(chip('break').getAttribute('aria-pressed')).toBe('true')
    act(() => { vi.advanceTimersByTime(500) }); click(chip('none')); start(d, 120)
    expect(lastCmd().args).toEqual({ seconds: 120, title: null })
  })
  it('Replace sends the selected title too, and the readout shows the running title', () => {
    setup({ timer: running({ title: 'Break' }) })
    const d = openDrawer()
    expect(d.querySelector('[data-k="timer-title"]').textContent).toBe('Break')
    click(chip('none')); click(d.querySelector('[data-k="preset-60"]')); click(d.querySelector('[data-k="timer-restart"]'))
    expect(lastCmd()).toMatchObject({ cmd: 'timer.start', args: { seconds: 60, replace: true, title: null } })
  })
})
