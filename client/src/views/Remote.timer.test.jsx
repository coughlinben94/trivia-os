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
  it('preset chips read 0:30, 1:00, 2:00, 3:00, 5:00, 10:00 and are tall enough to tap', () => {
    setup()
    const d = openDrawer()
    const want = { 30: '0:30', 60: '1:00', 120: '2:00', 180: '3:00', 300: '5:00', 600: '10:00' }
    for (const [n, label] of Object.entries(want)) {
      const chip = d.querySelector(`[data-k="preset-${n}"]`)
      expect(chip, `preset ${n}`).toBeTruthy()
      expect(chip.textContent).toBe(label)
      expect(chip.className).toMatch(/min-h-\[(7\d|8\d)px\]/)
    }
    expect(d.querySelector('[data-k="preset-240"]')).toBeNull()
  })
  it('Start is off until a time is picked; then one tap on Start sends timer.start in seconds', () => {
    setup()
    const d = openDrawer()
    expect(d.querySelector('[data-k="timer-start"]').disabled).toBe(true)
    click(d.querySelector('[data-k="preset-300"]'))
    expect(d.querySelector('[data-k="timer-start"]').textContent).toBe('Start 5:00')
    click(d.querySelector('[data-k="timer-start"]'))
    expect(lastCmd()).toMatchObject({ type: 'cmd', cmd: 'timer.start', args: { seconds: 300 } })
    expect(lastCmd().args.replace).toBeUndefined()
    expect(lastCmd().args.minutes).toBeUndefined()
    expect(cmds()).toHaveLength(1)
  })
  it('the 30 second preset sends 30', () => {
    setup()
    const d = openDrawer()
    click(d.querySelector('[data-k="preset-30"]'))
    expect(d.querySelector('[data-k="timer-start"]').textContent).toBe('Start 0:30')
    click(d.querySelector('[data-k="timer-start"]'))
    expect(lastCmd().args).toEqual({ seconds: 30 })
  })
  it('Adjust opens a stepper at 1:00 when nothing is chosen; plus and minus move 30 seconds', () => {
    setup()
    const d = openDrawer()
    const val = () => d.querySelector('[data-k="step-value"]').textContent
    expect(d.querySelector('[data-k="step-up"]')).toBeNull()
    click(d.querySelector('[data-k="preset-custom"]'))
    expect(val()).toBe('1:00')
    expect(d.querySelector('[data-k="timer-start"]').textContent).toBe('Start 1:00')
    click(d.querySelector('[data-k="step-up"]'))
    expect(val()).toBe('1:30')
    click(d.querySelector('[data-k="step-up"]'))
    expect(val()).toBe('2:00')
    click(d.querySelector('[data-k="step-down"]'))
    click(d.querySelector('[data-k="step-down"]'))
    click(d.querySelector('[data-k="step-down"]'))
    expect(val()).toBe('0:30')
    click(d.querySelector('[data-k="step-up"]'))
    click(d.querySelector('[data-k="step-up"]'))
    click(d.querySelector('[data-k="step-up"]'))
    expect(d.querySelector('[data-k="timer-start"]').textContent).toBe('Start 2:00')
    click(d.querySelector('[data-k="step-up"]'))
    click(d.querySelector('[data-k="timer-start"]'))
    expect(lastCmd().args).toEqual({ seconds: 150 })
  })
  it('the stepper starts from the chosen preset', () => {
    setup()
    const d = openDrawer()
    click(d.querySelector('[data-k="preset-120"]'))
    click(d.querySelector('[data-k="preset-custom"]'))
    expect(d.querySelector('[data-k="step-value"]').textContent).toBe('2:00')
    click(d.querySelector('[data-k="step-up"]'))
    expect(d.querySelector('[data-k="timer-start"]').textContent).toBe('Start 2:30')
  })
  it('the stepper stops at 0:30 and at 3:00:00 (the TV clock style for 180 minutes) and never sends anything out of range', () => {
    setup()
    const d = openDrawer()
    click(d.querySelector('[data-k="preset-custom"]'))
    click(d.querySelector('[data-k="step-down"]')) // 1:00 -> 0:30
    expect(d.querySelector('[data-k="step-value"]').textContent).toBe('0:30')
    expect(d.querySelector('[data-k="step-down"]').disabled).toBe(true)
    click(d.querySelector('[data-k="step-down"]'))
    expect(d.querySelector('[data-k="step-value"]').textContent).toBe('0:30')
    click(d.querySelector('[data-k="preset-600"]'))
    click(d.querySelector('[data-k="preset-custom"]'))
    for (let i = 0; i < 400; i++) { if (!d.querySelector('[data-k="step-up"]').disabled) click(d.querySelector('[data-k="step-up"]')) }
    expect(d.querySelector('[data-k="step-value"]').textContent).toBe('3:00:00')
    expect(d.querySelector('[data-k="step-up"]').disabled).toBe(true)
    click(d.querySelector('[data-k="timer-start"]'))
    expect(lastCmd().args).toEqual({ seconds: 10800 })
  })
  it('stepper buttons are at least 56px tall and have press feedback', () => {
    setup()
    const d = openDrawer()
    click(d.querySelector('[data-k="preset-custom"]'))
    for (const key of ['step-up', 'step-down']) {
      expect(d.querySelector(`[data-k="${key}"]`).className).toMatch(/min-h-\[80px\]/)
      expect(d.querySelector(`[data-k="${key}"]`).className).toContain('active:scale-[0.97]')
    }
  })
  it('a preset closes the stepper and replaces the stepped value', () => {
    setup()
    const d = openDrawer()
    click(d.querySelector('[data-k="preset-custom"]'))
    click(d.querySelector('[data-k="step-up"]'))
    click(d.querySelector('[data-k="preset-120"]'))
    expect(d.querySelector('[data-k="step-up"]')).toBeNull()
    expect(d.querySelector('[data-k="timer-start"]').textContent).toBe('Start 2:00')
  })
  it('is blocked while the laptop is not ready', () => {
    setup()
    openDrawer()
    act(() => ws.drop(1006))
    const d = host.querySelector('[role="dialog"]')
    click(d.querySelector('[data-k="preset-300"]'))
    expect(d.querySelector('[data-k="timer-start"]').disabled).toBe(true)
  })
})

describe('/remote timer drawer: a timer exists', () => {
  it('running: shows the clock, Pause, +30 s, +1 min, Replace, Cancel; no plain Start', () => {
    setup({ timer: running() })
    const d = openDrawer()
    expect(d.textContent).toContain('3:12')
    expect(d.querySelector('[data-k="timer-start"]')).toBeNull()
    expect(d.querySelector('[data-k="timer-pause"]').textContent).toContain('Pause')
    expect(d.querySelector('[data-k="timer-add30"]').textContent).toBe('+30 s')
    expect(d.querySelector('[data-k="timer-add"]').textContent).toBe('+1 min')
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
  it('+30 s and +1 min send timer.add with the id and the seconds', () => {
    setup({ timer: running() })
    const d = openDrawer()
    click(d.querySelector('[data-k="timer-add30"]'))
    expect(lastCmd()).toMatchObject({ cmd: 'timer.add', args: { timerId: 't1', seconds: 30 } })
    act(() => vi.advanceTimersByTime(400)) // the tap guard drops a repeat of the same command inside 300 ms
    click(d.querySelector('[data-k="timer-add"]'))
    expect(lastCmd()).toMatchObject({ cmd: 'timer.add', args: { timerId: 't1', seconds: 60 } })
  })
  it('Replace needs a time, says it replaces the running timer, and sends replace:true', () => {
    setup({ timer: running() })
    const d = openDrawer()
    click(d.querySelector('[data-k="preset-custom"]'))
    click(d.querySelector('[data-k="step-up"]'))
    click(d.querySelector('[data-k="step-up"]'))
    const r = d.querySelector('[data-k="timer-restart"]')
    expect(r.textContent).toBe('Replace with 2:00')
    click(d.querySelector('[data-k="step-up"]'))
    expect(r.textContent).toBe('Replace with 2:30')
    click(r)
    expect(lastCmd()).toMatchObject({ cmd: 'timer.start', args: { seconds: 150, replace: true } })
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
  it('finished: Clear takes one tap; +30 s and +1 min are there; a new Start needs no Restart', () => {
    setup({ timer: running({ endsAt: T0 - 1000 }) })
    const d = openDrawer()
    expect(d.textContent).toContain('Time')
    expect(d.querySelector('[data-k="timer-pause"]')).toBeNull()
    click(d.querySelector('[data-k="preset-60"]'))
    expect(d.querySelector('[data-k="timer-start"]').textContent).toBe('Start 1:00')
    expect(d.querySelector('[data-k="timer-add30"]')).toBeTruthy()
    expect(d.querySelector('[data-k="timer-add"]')).toBeTruthy()
    click(d.querySelector('[data-k="timer-cancel"]'))
    expect(lastCmd()).toMatchObject({ cmd: 'timer.cancel' })
    expect(d.querySelector('[data-k="timer-cancel"]').textContent).toContain('Clear')
  })
  it('timer controls are disabled while the laptop is paused', () => {
    setup({ timer: running() })
    const d = openDrawer()
    push({ paused: true, timer: running() })
    for (const key of ['timer-pause', 'timer-add30', 'timer-add', 'timer-cancel']) expect(d.querySelector(`[data-k="${key}"]`).disabled, key).toBe(true)
  })
})

describe('/remote timer refusals and look', () => {
  it('a refusal shows plain English in the amber bar', () => {
    setup({ timer: running() })
    const d = openDrawer()
    click(d.querySelector('[data-k="timer-add30"]'))
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

  it('Cancel sits on its own row, apart from Replace, so a thumb aimed at one cannot hit the other', () => {
    setup({ timer: running() })
    const d = openDrawer()
    const replace = d.querySelector('[data-k="timer-restart"]')
    const cancel = d.querySelector('[data-k="timer-cancel"]')
    expect(replace.parentElement).not.toBe(cancel.parentElement)
  })
})
