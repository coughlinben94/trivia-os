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
  cue: 'Lock answers', gate: 'lock', upNext: [{ label: 'Q4', type: 'question' }, { label: 'Grading Break', type: 'grading-break' }],
  toggles: { answerReveal: false, scoreboardVisible: true, scoresRevealed: false }, busy: false, paused: false,
}

let host, root
const text = () => host.textContent
const button = label => [...host.querySelectorAll('button')].find(b => b.textContent.includes(label))
const click = el => act(() => el.dispatchEvent(new MouseEvent('click', { bubbles: true })))
const mount = () => act(() => root.render(<Remote />))
function liveSocket() {
  const ws = FakeWS.all.at(-1)
  act(() => ws.open())
  act(() => { ws.msg({ type: 'host', connected: true }); ws.msg({ type: 'beat', laptopNow: Date.now() + 500, visibility: 'visible' }); ws.msg(STATE) })
  return ws
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.useFakeTimers()
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

describe('/remote', () => {
  it('no pairing code: opens settings, no socket', () => {
    mount()
    expect(text()).toContain('Remote settings')
    expect(FakeWS.all).toHaveLength(0)
  })

  it('pairs, goes green, shows the cue, Up Next and lit toggles', () => {
    localStorage.setItem('trivia-remote:cfg', JSON.stringify({ url: 'wss://relay.test', secret: 'ABC' }))
    mount()
    const ws = FakeWS.all[0]
    expect(ws.url).toBe('wss://relay.test')
    act(() => ws.open())
    expect(ws.sent[0]).toEqual({ type: 'hello', secret: 'ABC' })
    liveSocket()
    expect(text()).toContain('Laptop connected')
    expect(text()).toContain('Lock answers')
    expect(text()).toContain('Q3 · 5 / 20')
    expect(text()).toContain('› Grading Break')
    expect(button('Scoreboard').getAttribute('aria-pressed')).toBe('true')
    expect(button('NEXT').disabled).toBe(false)
  })

  it('Next sends the shown gate + slide id with a laptop-time sentAt; a refusal shows plain English', () => {
    localStorage.setItem('trivia-remote:cfg', JSON.stringify({ url: 'wss://relay.test', secret: 'ABC' }))
    mount()
    const ws = liveSocket()
    const before = Date.now()
    click(button('NEXT'))
    const cmd = ws.sent.at(-1)
    expect(cmd).toMatchObject({ type: 'cmd', cmd: 'next', args: { expectGate: 'lock' }, expectSlideId: 's5' })
    expect(cmd.sentAt).toBeGreaterThanOrEqual(before + 499)
    act(() => ws.msg({ type: 'result', id: cmd.id, refused: 'busy' }))
    expect(text()).toContain('Laptop is busy')
    expect(text()).toContain('Wait a second')
    expect(text()).not.toContain('—')
    click(button('Scoreboard'))
    expect(ws.sent.at(-1)).toMatchObject({ cmd: 'scoreboard', args: { value: false } })
  })

  it('greys Next on locking / paused / a stale laptop beat', () => {
    localStorage.setItem('trivia-remote:cfg', JSON.stringify({ url: 'wss://relay.test', secret: 'ABC' }))
    mount()
    const ws = liveSocket()
    act(() => ws.msg({ ...STATE, gate: 'locking', cue: 'Locking…' }))
    expect(button('NEXT').disabled).toBe(true)
    act(() => ws.msg({ ...STATE, paused: true }))
    expect(button('NEXT').disabled).toBe(true)
    expect(text()).toContain('Remote paused on the laptop')
    act(() => ws.msg(STATE))
    act(() => { for (let i = 0; i < 6; i++) { ws.msg({ type: 'relay-beat' }); vi.advanceTimersByTime(1000) } })
    expect(text()).toContain('Laptop not responding')
    expect(button('NEXT').disabled).toBe(true)
  })

  it('no relay-beat for 5s: force-reconnects after 1s', () => {
    localStorage.setItem('trivia-remote:cfg', JSON.stringify({ url: 'wss://relay.test', secret: 'ABC' }))
    mount()
    liveSocket()
    act(() => vi.advanceTimersByTime(5000))
    expect(text()).toContain('Can’t reach the laptop')
    act(() => vi.advanceTimersByTime(1000))
    expect(FakeWS.all).toHaveLength(2)
  })

  it('pairing code wrong (4003): says so and stops until the code changes', () => {
    localStorage.setItem('trivia-remote:cfg', JSON.stringify({ url: 'wss://relay.test', secret: 'BAD' }))
    mount()
    act(() => FakeWS.all[0].open())
    act(() => FakeWS.all[0].drop(4003))
    expect(text()).toContain('Pairing code wrong')
    act(() => vi.advanceTimersByTime(60000))
    expect(FakeWS.all).toHaveLength(1)
    click(host.querySelector('button[aria-label="Settings"]'))
    const input = host.querySelector('input[name="secret"]')
    act(() => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, 'good code')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    act(() => host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    expect(FakeWS.all).toHaveLength(2)
    act(() => FakeWS.all[1].open())
    expect(FakeWS.all[1].sent[0]).toEqual({ type: 'hello', secret: 'GOODCODE' })
  })
})
