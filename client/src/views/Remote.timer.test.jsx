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

let host, root, ws
const text = () => host.textContent
const k = key => host.querySelector(`[data-k="${key}"]`)
const click = el => act(() => el.dispatchEvent(new MouseEvent('click', { bubbles: true })))
const lastCmd = () => ws.sent.filter(m => m.type === 'cmd').at(-1)
const cmds = () => ws.sent.filter(m => m.type === 'cmd')
const T0 = 1_700_000_000_000
const running = (over = {}) => ({ id: 't1', state: 'running', totalMs: 300000, endsAt: T0 + 192000, remainingMs: 300000, sentAt: T0, ...over })
const push = (state = {}, { skew = 0 } = {}) => act(() => {
  ws.msg({ type: 'beat', laptopNow: Date.now() + skew, visibility: 'visible' })
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

describe('/remote timer tile', () => {
  it('idle: a Timer button that opens the drawer, 56px+ tall', () => {
    setup()
    expect(k('timer-open').textContent).toContain('Timer')
    expect(k('timer-open').className).toMatch(/min-h-\[72px\]/)
    expect(openDrawer().textContent).toContain('Timer')
  })
  it('running: the tile shows the remaining time and ticks', () => {
    setup({ timer: running() })
    expect(k('timer-open').textContent).toContain('3:12')
    act(() => vi.advanceTimersByTime(2000))
    expect(k('timer-open').textContent).toContain('3:10')
  })
  it('paused shows frozen time and the word paused; finished says Time is up', () => {
    setup({ timer: running({ state: 'paused', remainingMs: 95000 }) })
    expect(k('timer-open').textContent).toContain('1:35')
    expect(k('timer-open').textContent.toLowerCase()).toContain('paused')
    act(() => vi.advanceTimersByTime(3000))
    expect(k('timer-open').textContent).toContain('1:35')
    push({ timer: running({ endsAt: T0 + 5000 - 1000 }) })
    expect(k('timer-open').textContent).toContain('Time')
  })
  it('uses the laptop clock: an iPad running 30s ahead still shows the laptop time', () => {
    setup()
    push({ timer: running({ endsAt: T0 + 100000 + 30000 }) }, { skew: 30000 }) // laptop clock = iPad + 30s
    expect(k('timer-open').textContent).toContain('1:40')
  })
  it('is greyed out, with a reason, when the laptop is not ready or paused', () => {
    setup({ paused: true })
    expect(k('timer-open').disabled).toBe(true)
    expect(k('timer-open').textContent).toContain('Paused on the laptop')
  })
  it('does not exist in the snapshot sense: no timer field leaves Next, Prev and the rest alone', () => {
    setup()
    const labels = [...host.querySelectorAll('button')].map(b => b.textContent)
    for (const l of ['NEXT', 'Prev', 'Answer', 'Scoreboard', 'Phone scores', 'Jump', 'Fix', 'Scores']) expect(labels.some(t => t.includes(l)), l).toBe(true)
  })
})

describe('/remote timer drawer: idle', () => {
  it('preset chips are 1, 2, 3, 5, 10 and every control is at least 56px tall', () => {
    setup()
    const d = openDrawer()
    for (const m of [1, 2, 3, 5, 10]) {
      const chip = d.querySelector(`[data-k="preset-${m}"]`)
      expect(chip, `preset ${m}`).toBeTruthy()
      expect(chip.className).toMatch(/min-h-\[(7\d|8\d)px\]|h-(16|20)/)
    }
    expect(d.querySelector('[data-k="preset-4"]')).toBeNull()
  })
  it('Start is off until minutes are picked; then one tap on Start sends timer.start', () => {
    setup()
    const d = openDrawer()
    expect(d.querySelector('[data-k="timer-start"]').disabled).toBe(true)
    click(d.querySelector('[data-k="preset-5"]'))
    expect(d.querySelector('[data-k="timer-start"]').textContent).toContain('Start 5 min')
    click(d.querySelector('[data-k="timer-start"]'))
    expect(lastCmd()).toMatchObject({ type: 'cmd', cmd: 'timer.start', args: { minutes: 5 } })
    expect(lastCmd().args.replace).toBeUndefined()
    expect(cmds()).toHaveLength(1)
  })
  it('the number pad builds a custom number, caps at 180, and backspace works', () => {
    setup()
    const d = openDrawer()
    click(d.querySelector('[data-k="preset-custom"]'))
    const press = n => click(d.querySelector(`[data-k="pad-${n}"]`))
    press(4); press(5)
    expect(d.querySelector('[data-k="timer-start"]').textContent).toContain('Start 45 min')
    click(d.querySelector('[data-k="pad-back"]'))
    expect(d.querySelector('[data-k="timer-start"]').textContent).toContain('Start 4 min')
    press(0); press(0) // 400 is over 180: the last 0 is ignored
    expect(d.querySelector('[data-k="timer-start"]').textContent).toContain('Start 40 min')
    press(0)
    expect(d.querySelector('[data-k="timer-start"]').textContent).toContain('Start 40 min')
    press(9)
    expect(d.querySelector('[data-k="timer-start"]').textContent).toContain('Start 40 min')
    click(d.querySelector('[data-k="timer-start"]'))
    expect(lastCmd().args).toEqual({ minutes: 40 })
  })
  it('a leading zero or an empty pad never sends 0', () => {
    setup()
    const d = openDrawer()
    click(d.querySelector('[data-k="preset-custom"]'))
    click(d.querySelector('[data-k="pad-0"]'))
    expect(d.querySelector('[data-k="timer-start"]').disabled).toBe(true)
    click(d.querySelector('[data-k="timer-start"]'))
    expect(cmds()).toHaveLength(0)
  })
  it('a preset replaces a typed number; tapping a preset then Other starts fresh', () => {
    setup()
    const d = openDrawer()
    click(d.querySelector('[data-k="preset-custom"]'))
    click(d.querySelector('[data-k="pad-7"]'))
    click(d.querySelector('[data-k="preset-2"]'))
    expect(d.querySelector('[data-k="timer-start"]').textContent).toContain('Start 2 min')
  })
  it('is blocked while the laptop is not ready', () => {
    setup()
    openDrawer()
    act(() => ws.drop(1006))
    const d = host.querySelector('[role="dialog"]')
    click(d.querySelector('[data-k="preset-5"]'))
    expect(d.querySelector('[data-k="timer-start"]').disabled).toBe(true)
  })
})

describe('/remote timer drawer: a timer exists', () => {
  it('running: shows the clock, Pause, +1 min, Cancel, Restart; no plain Start', () => {
    setup({ timer: running() })
    const d = openDrawer()
    expect(d.textContent).toContain('3:12')
    expect(d.querySelector('[data-k="timer-start"]')).toBeNull()
    expect(d.querySelector('[data-k="timer-pause"]').textContent).toContain('Pause')
    expect(d.querySelector('[data-k="timer-add"]')).toBeTruthy()
    expect(d.querySelector('[data-k="timer-cancel"]')).toBeTruthy()
    expect(d.querySelector('[data-k="timer-restart"]').disabled).toBe(true)
  })
  it('Pause sends timer.pause with the timer id; paused shows Resume which sends timer.resume', () => {
    setup({ timer: running() })
    let d = openDrawer()
    click(d.querySelector('[data-k="timer-pause"]'))
    expect(lastCmd()).toMatchObject({ cmd: 'timer.pause', args: { timerId: 't1' } })
    push({ timer: running({ state: 'paused', remainingMs: 90000 }) })
    d = host.querySelector('[role="dialog"]')
    expect(d.querySelector('[data-k="timer-pause"]').textContent).toContain('Resume')
    expect(d.textContent.toLowerCase()).toContain('paused')
    click(d.querySelector('[data-k="timer-pause"]'))
    expect(lastCmd()).toMatchObject({ cmd: 'timer.resume', args: { timerId: 't1' } })
  })
  it('+1 min sends timer.add with the id', () => {
    setup({ timer: running() })
    const d = openDrawer()
    click(d.querySelector('[data-k="timer-add"]'))
    expect(lastCmd()).toMatchObject({ cmd: 'timer.add', args: { timerId: 't1' } })
  })
  it('Restart needs minutes, is labelled Restart, and sends replace:true', () => {
    setup({ timer: running() })
    const d = openDrawer()
    click(d.querySelector('[data-k="preset-3"]'))
    const r = d.querySelector('[data-k="timer-restart"]')
    expect(r.textContent).toContain('Restart 3 min')
    click(r)
    expect(lastCmd()).toMatchObject({ cmd: 'timer.start', args: { minutes: 3, replace: true } })
  })
  it('Cancel takes two taps: the first arms, the second sends, and it disarms itself after 3s', () => {
    setup({ timer: running() })
    const d = openDrawer()
    const c = () => d.querySelector('[data-k="timer-cancel"]')
    click(c())
    expect(cmds()).toHaveLength(0)
    expect(c().textContent).toContain('Tap again to cancel')
    act(() => vi.advanceTimersByTime(3100))
    expect(c().textContent).not.toContain('Tap again')
    click(c())
    click(c())
    expect(cmds()).toHaveLength(1)
    expect(lastCmd()).toMatchObject({ cmd: 'timer.cancel', args: { timerId: 't1' } })
  })
  it('finished: Clear takes one tap and +1 min starts a fresh minute; a new Start needs no Restart', () => {
    setup({ timer: running({ endsAt: T0 - 1000 }) })
    const d = openDrawer()
    expect(d.textContent).toContain('Time')
    expect(d.querySelector('[data-k="timer-pause"]')).toBeNull()
    click(d.querySelector('[data-k="preset-1"]'))
    expect(d.querySelector('[data-k="timer-start"]').textContent).toContain('Start 1 min')
    click(d.querySelector('[data-k="timer-cancel"]'))
    expect(lastCmd()).toMatchObject({ cmd: 'timer.cancel' })
    expect(d.querySelector('[data-k="timer-cancel"]').textContent).toContain('Clear')
  })
  it('timer controls are disabled while the laptop is paused', () => {
    setup({ timer: running() })
    const d = openDrawer()
    push({ paused: true, timer: running() })
    for (const key of ['timer-pause', 'timer-add', 'timer-cancel']) expect(d.querySelector(`[data-k="${key}"]`).disabled, key).toBe(true)
  })
})

describe('/remote timer refusals and look', () => {
  it('a refusal shows plain English in the amber bar', () => {
    setup({ timer: running() })
    const d = openDrawer()
    click(d.querySelector('[data-k="timer-add"]'))
    const id = lastCmd().id
    act(() => ws.msg({ type: 'result', id, refused: 'timer-changed' }))
    expect(text()).toContain('The timer changed on the laptop')
  })
  it('no em dash anywhere with the drawer open, and no new fonts', () => {
    setup({ timer: running() })
    const d = openDrawer()
    expect(d.textContent).not.toMatch(/[—–]/)
    expect(k('timer-open').textContent).not.toMatch(/[—–]/)
    const fams = [...host.innerHTML.matchAll(/font-family:\s*([^;"]+)/g)].map(m => m[1])
    expect(fams.length).toBeGreaterThan(0)
    for (const f of fams) expect(f).toMatch(/^var\(--rl-(display|body)\)$/)
  })
})
