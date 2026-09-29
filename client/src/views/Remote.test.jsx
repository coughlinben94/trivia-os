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

describe('/remote Jump and Fix drawers', () => {
  const SLIDES = [
    { index: 0, id: 's1', label: 'Welcome', type: 'title', round: null, roundTitle: null },
    { index: 1, id: 's2', label: 'Movies', type: 'round-intro', round: 'Round 1', roundTitle: 'Movies' },
    { index: 2, id: 's3', label: 'Q1', type: 'question', round: 'Round 1', roundTitle: 'Movies' },
    { index: 3, id: 's4', label: 'Q2', type: 'question', round: 'Round 1', roundTitle: 'Movies' },
    { index: 4, id: 's5', label: 'Q3', type: 'question', round: 'Round 2', roundTitle: 'Music' },
    { index: 5, id: 's6', label: 'Q4', type: 'question', round: 'Round 2', roundTitle: 'Music' },
  ]
  const FIX = { mechanic: 'matching', canUnlock: true, unlockRefusal: null, canRescore: false, rescoreRefusal: 'already-revealed', rescoreLabel: 'Rescore' }
  const FULL = { ...STATE, slides: SLIDES, fix: FIX, jumpBusy: false }
  const open = () => {
    localStorage.setItem('trivia-remote:cfg', JSON.stringify({ url: 'wss://relay.test', secret: 'ABC' }))
    mount()
    const ws = liveSocket()
    act(() => ws.msg(FULL))
    return ws
  }
  const drawer = () => host.querySelector('[role="dialog"]')
  const rowFor = label => [...drawer().querySelectorAll('button[data-slide]')].find(b => b.textContent.includes(label))

  it('lists every slide grouped by round, with the current slide marked', () => {
    open()
    click(button('Jump'))
    expect(drawer()).not.toBeNull()
    const heads = [...drawer().querySelectorAll('h3')].map(h => h.textContent)
    expect(heads).toEqual(['Start of show', 'Round 1 · Movies', 'Round 2 · Music'])
    expect(drawer().querySelectorAll('button[data-slide]')).toHaveLength(6)
    const here = rowFor('Q3')
    expect(here.getAttribute('aria-current')).toBe('true')
    expect(here.disabled).toBe(true)
    expect(here.textContent).toContain('Showing now')
  })

  it('a tap asks first, naming the target; only the second tap sends the jump', () => {
    const ws = open()
    click(button('Jump'))
    const sent = ws.sent.length
    click(rowFor('Q2'))
    expect(ws.sent.length).toBe(sent)
    expect(drawer().textContent).toContain('Jump to Round 1 Q2?')
    click([...drawer().querySelectorAll('button')].find(b => b.textContent.trim() === 'Jump there'))
    expect(ws.sent.at(-1)).toMatchObject({ cmd: 'jump', args: { slideId: 's4', index: 3 }, expectSlideId: 's5' })
  })

  it('Cancel on the confirm sends nothing and keeps the list open', () => {
    const ws = open()
    click(button('Jump'))
    click(rowFor('Welcome'))
    expect(drawer().textContent).toContain('Jump to Welcome?')
    const sent = ws.sent.length
    click([...drawer().querySelectorAll('button')].find(b => b.textContent.trim() === 'Cancel'))
    expect(ws.sent.length).toBe(sent)
    expect(drawer().textContent).not.toContain('Jump to Welcome?')
  })

  it('Jump greys out while a jump is running, with the reason on the button', () => {
    const ws = open()
    act(() => ws.msg({ ...FULL, jumpBusy: true }))
    expect(button('Jump').disabled).toBe(true)
    expect(button('Jump').textContent).toContain('Jumping')
  })

  it('Fix: Unlock sends unlock; Rescore is off and says why, in plain words', () => {
    const ws = open()
    click(button('Fix'))
    const unlock = [...drawer().querySelectorAll('button')].find(b => b.textContent.includes('Unlock'))
    const rescore = [...drawer().querySelectorAll('button')].find(b => b.textContent.includes('Rescore'))
    expect(rescore.disabled).toBe(true)
    expect(rescore.textContent).toContain('The TV already shows the result')
    expect(unlock.disabled).toBe(false)
    click(unlock)
    expect(ws.sent.at(-1)).toMatchObject({ cmd: 'unlock', expectSlideId: 's5' })
  })

  it('Fix is off on a slide with no phone question, and says so', () => {
    const ws = open()
    act(() => ws.msg({ ...FULL, fix: { mechanic: null, canUnlock: false, unlockRefusal: 'nothing-to-fix', canRescore: false, rescoreRefusal: 'nothing-to-fix', rescoreLabel: null } }))
    expect(button('Fix').disabled).toBe(true)
    expect(button('Fix').textContent).toContain('No phone question on this slide')
  })

  it('no em dash anywhere on screen, drawers included', () => {
    open()
    click(button('Jump'))
    click(rowFor('Q2'))
    expect(text()).not.toContain('—')
    click([...drawer().querySelectorAll('button')].find(b => b.textContent.trim() === 'Close'))
    click(button('Fix'))
    expect(text()).not.toContain('—')
  })
})

describe('/remote Stream Deck parity (jukebox mode, volume, Duck, sounds)', () => {
  const BREAK = { ...STATE, slide: { index: 5, total: 20, id: 'gb', label: 'Grading Break', type: 'grading-break' }, cue: 'Show question 4', gate: 'advance' }
  const LOCAL = {
    type: 'local-state', available: true, volume: 60, ducked: false,
    sounds: [
      { id: 'turtles', label: 'I Like Turtles', missing: false },
      { id: 'jackass', label: 'Ya Jackass', missing: false },
      { id: 'gone', label: 'Weather Boy', missing: true },
    ],
  }
  const key = k => host.querySelector(`[data-k="${k}"]`)
  const drawer = () => host.querySelector('[role="dialog"]')
  const setup = (state = BREAK, jukebox = { type: 'jukebox', linked: true, open: true, playing: false, handoffPending: false }) => {
    localStorage.setItem('trivia-remote:cfg', JSON.stringify({ url: 'wss://relay.test', secret: 'ABC' }))
    mount()
    const ws = liveSocket()
    act(() => { ws.msg(state); ws.msg(LOCAL); ws.msg(jukebox) })
    return ws
  }
  const last = ws => ws.sent.at(-1)

  it('jukebox open: Back to Trivia in one tap, Play/Stop lit when playing, no plain Next', () => {
    const ws = setup()
    expect(button('NEXT')).toBeUndefined()
    click(key('jukebox-exit'))
    expect(last(ws)).toMatchObject({ type: 'cmd', cmd: 'jukebox.exit', args: {} })
    expect(key('jukebox-play').getAttribute('aria-pressed')).toBe('false')
    act(() => ws.msg({ type: 'jukebox', linked: true, open: true, playing: true, handoffPending: false }))
    expect(key('jukebox-play').getAttribute('aria-pressed')).toBe('true')
    click(key('jukebox-play'))
    expect(last(ws)).toMatchObject({ cmd: 'jukebox.playStop' })
  })

  it('skipping the break with plain Next needs a second, confirming tap', () => {
    const ws = setup()
    const n = ws.sent.length
    click(key('skip-break'))
    expect(ws.sent.length).toBe(n)
    expect(key('skip-break').textContent).toMatch(/again/i)
    click(key('skip-break'))
    expect(last(ws)).toMatchObject({ cmd: 'next', args: { expectGate: 'advance' }, expectSlideId: 'gb' })
  })

  it('the handoff in flight greys Play/Stop but leaves Back to Trivia (the b key works then too)', () => {
    setup(BREAK, { type: 'jukebox', linked: true, open: true, playing: false, handoffPending: true })
    expect(key('jukebox-play').disabled).toBe(true)
    expect(key('jukebox-exit').disabled).toBe(false)
  })

  it('before the jukebox is up: Open jukebox now sends jukebox.open', () => {
    const ws = setup(BREAK, { type: 'jukebox', linked: true, waiting: true, open: false })
    expect(key('jukebox-exit')).toBeNull()
    click(key('jukebox-open'))
    expect(last(ws)).toMatchObject({ cmd: 'jukebox.open' })
  })

  it('no TV window linked: jukebox buttons off and says so; skip still offered', () => {
    setup(BREAK, { type: 'jukebox', linked: false })
    expect(text()).toContain('TV window not linked')
    expect(key('jukebox-open')).toBeNull()
    expect(key('skip-break').disabled).toBe(false)
  })

  it('leaves jukebox mode when the laptop moves off the break', () => {
    const ws = setup()
    act(() => ws.msg(STATE))
    expect(button('NEXT')).toBeTruthy()
    expect(key('jukebox-exit')).toBeNull()
  })

  it('volume and Duck on the main screen: shows the level, sends vol.up/vol.down/duck, Duck lit when ducked', () => {
    const ws = setup(STATE)
    expect(key('vol-level').textContent).toContain('60')
    click(key('vol-up'))
    expect(last(ws)).toMatchObject({ cmd: 'vol.up' })
    click(key('vol-down'))
    expect(last(ws)).toMatchObject({ cmd: 'vol.down' })
    expect(key('duck').getAttribute('aria-pressed')).toBe('false')
    click(key('duck'))
    expect(last(ws)).toMatchObject({ cmd: 'duck' })
    act(() => ws.msg({ ...LOCAL, ducked: true, volume: 12 }))
    expect(key('duck').getAttribute('aria-pressed')).toBe('true')
    expect(key('duck').textContent).toMatch(/restore/i)
  })

  it('volume, Duck and sounds need only the relay, not Live Mode', () => {
    localStorage.setItem('trivia-remote:cfg', JSON.stringify({ url: 'wss://relay.test', secret: 'ABC' }))
    mount()
    const ws = FakeWS.all.at(-1)
    act(() => { ws.open(); ws.msg({ type: 'host', connected: false }); ws.msg(LOCAL) })
    expect(key('vol-up').disabled).toBe(false)
    click(key('vol-up'))
    expect(last(ws)).toMatchObject({ cmd: 'vol.up' })
  })

  it('Pause on the laptop greys volume, Duck and sounds', () => {
    const ws = setup(STATE)
    act(() => ws.msg({ ...STATE, paused: true }))
    expect(key('vol-up').disabled).toBe(true)
    expect(key('duck').disabled).toBe(true)
    expect(key('sounds').disabled).toBe(true)
  })

  it('relay without local commands: controls off with a plain reason', () => {
    const ws = setup(STATE)
    act(() => ws.msg({ type: 'local-state', available: false, volume: null, ducked: false, sounds: [] }))
    expect(key('vol-up').disabled).toBe(true)
    expect(text()).toContain('Volume and sounds are off on this relay')
  })

  it('Sounds drawer: a labelled grid, taps send only the id, a missing file is off, Stop all', () => {
    const ws = setup(STATE)
    click(key('sounds'))
    const labels = [...drawer().querySelectorAll('[data-sound]')].map(b => b.textContent)
    expect(labels.map(l => l.replace(/File missing.*/, ''))).toEqual(['I Like Turtles', 'Ya Jackass', 'Weather Boy'])
    click(drawer().querySelector('[data-sound="turtles"]'))
    expect(last(ws)).toMatchObject({ cmd: 'sound.play', args: { id: 'turtles' } })
    expect(Object.keys(last(ws).args)).toEqual(['id'])
    expect(drawer().querySelector('[data-sound="gone"]').disabled).toBe(true)
    click(drawer().querySelector('[data-k="stop-all"]'))
    expect(last(ws)).toMatchObject({ cmd: 'sound.stopAll' })
    expect(drawer()).not.toBeNull() // stays open for the next one
  })

  it('refusals from the new commands show in the amber bar, no em dash', () => {
    const ws = setup()
    act(() => ws.msg({ type: 'result', id: '1', refused: 'display-offline' }))
    expect(text()).toContain('TV window not linked')
    expect(text()).not.toContain('—')
    act(() => ws.msg({ type: 'result', id: '2', refused: 'local-failed' }))
    expect(text()).toContain('The laptop would not change that')
  })

  it('fast repeat taps are dropped: Duck within 300ms, volume/sounds/Stop all within 150ms', () => {
    const ws = setup(STATE)
    const count = c => ws.sent.filter(m => m.cmd === c).length
    click(key('duck')); click(key('duck'))
    expect(count('duck')).toBe(1)
    act(() => vi.advanceTimersByTime(299))
    click(key('duck'))
    expect(count('duck')).toBe(1)
    act(() => vi.advanceTimersByTime(301))
    click(key('duck'))
    expect(count('duck')).toBe(2)
    click(key('vol-up')); click(key('vol-up'))
    expect(count('vol.up')).toBe(1)
    act(() => vi.advanceTimersByTime(150))
    click(key('vol-up'))
    expect(count('vol.up')).toBe(2)
    click(key('sounds'))
    click(drawer().querySelector('[data-sound="turtles"]')); click(drawer().querySelector('[data-sound="jackass"]'))
    expect(count('sound.play')).toBe(1)
    click(drawer().querySelector('[data-k="stop-all"]')); click(drawer().querySelector('[data-k="stop-all"]'))
    expect(count('sound.stopAll')).toBe(1)
  })

  it('Back to Trivia fading out the music reads Fading, not Starting', () => {
    setup(BREAK, { type: 'jukebox', linked: true, open: true, playing: true, handoffPending: true })
    expect(key('jukebox-play').textContent).toContain('Fading…')
    expect(key('jukebox-play').textContent).not.toContain('Starting')
  })

  it('no em dash anywhere in jukebox mode or the sounds drawer', () => {
    setup()
    expect(text()).not.toContain('—')
    click(key('sounds'))
    expect(text()).not.toContain('—')
  })
})
