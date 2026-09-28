// Protocol end-to-end, no Supabase: real relay + stub host (the laptop's real
// planHostCommand / nextPressGate / snapshot code over a toy show) + a fake
// iPad (`ws` client doing what Remote.jsx does).
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import WebSocket from 'ws'
import { createRelay, PROD_ORIGIN } from './server.mjs'
import { createStubHost } from './stub-host.mjs'
import { createStubDisplay } from './stub-display.mjs'
import { createLocal } from './local.mjs'
import { fakeRunner } from './fake-runner.mjs'

const SECRET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const quiet = { log() {}, warn() {}, error() {} }
let dir, secretFile, relay, ports, stubs

const makeSlides = () => [
  { id: 'q1', type: 'question', data: { questionNumber: 1 } },
  { id: 'w', type: 'question', data: { questionNumber: 2, isShiny: true, shinyInputSchema: { type: 'wager' } } },
  { id: 'q3', type: 'question', data: { questionNumber: 3 } },
]

let runner
async function startRelay(p = { hostPort: 0, remotePort: 0 }) {
  runner = fakeRunner({ volume: 50 }) // never the real volume or speakers
  relay = createRelay({ ...p, secretFile, helloMs: 500, beatMs: 50, log: quiet, local: createLocal({ configDir: dir, runner, log: quiet }) })
  ports = await relay.start()
}
function stub(slides = makeSlides()) {
  const s = createStubHost({ url: `ws://127.0.0.1:${ports.hostPort}`, origin: PROD_ORIGIN, slides, retryMs: 30 })
  stubs.push(s)
  return s
}

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-e2e-'))
  secretFile = path.join(dir, 'secret')
  fs.writeFileSync(secretFile, SECRET)
  stubs = []
  await startRelay()
})
afterEach(async () => {
  stubs.forEach(s => s.stop())
  await relay.close()
  fs.rmSync(dir, { recursive: true, force: true })
})

async function until(fn, ms = 2000) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    const v = fn()
    if (v) return v
    await new Promise(r => setTimeout(r, 10))
  }
  throw new Error('timed out')
}

// What Remote.jsx does: hello first, keep the latest state, tap with the
// shown slide id + gate and a laptop-time sentAt.
async function ipad() {
  const ws = new WebSocket(`ws://127.0.0.1:${ports.remotePort}`, { origin: PROD_ORIGIN })
  const pad = { ws, state: null, results: {}, host: null, ids: 0, jukebox: null, local: null }
  ws.on('message', d => {
    const m = JSON.parse(String(d))
    if (m.type === 'state') pad.state = m
    if (m.type === 'jukebox') pad.jukebox = m
    if (m.type === 'local-state') pad.local = m
    if (m.type === 'host') pad.host = m.connected
    if (m.type === 'result') pad.results[m.id] = m
  })
  await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej) })
  ws.send(JSON.stringify({ type: 'hello', secret: SECRET }))
  await until(() => pad.state && pad.host)
  pad.tap = async (cmd, args = {}, over = {}) => {
    const id = String(++pad.ids)
    ws.send(JSON.stringify({ type: 'cmd', id, cmd, args, expectSlideId: pad.state.slide.id, sentAt: Date.now(), ...over }))
    return until(() => pad.results[id])
  }
  pad.next = over => pad.tap('next', { expectGate: pad.state.gate }, over)
  return pad
}

describe('stub host + relay + iPad', () => {
  it('Next with the shown gate advances; the new state arrives', async () => {
    stub()
    const p = await ipad()
    expect(p.state).toMatchObject({ slide: { id: 'q1', index: 0, total: 3 }, gate: 'advance', cue: 'Show question 2' })
    expect(await p.next()).toEqual({ type: 'result', id: '1', received: true })
    await until(() => p.state.slide.id === 'w')
    expect(p.state).toMatchObject({ gate: 'lock', cue: 'Lock wagers', upNext: [{ label: 'Q3' }] })
  })

  it('duplicate tap during the lock countdown is refused as busy', async () => {
    const s = stub()
    const p = await ipad()
    await p.next()
    await until(() => p.state.slide.id === 'w')
    const shownGate = p.state.gate
    expect(await p.tap('next', { expectGate: shownGate })).toMatchObject({ received: true })
    // Second tap from the same stale view, before or after the new state lands.
    expect(await p.tap('next', { expectGate: shownGate })).toMatchObject({ refused: 'busy' })
    await until(() => p.state.gate === 'locking')
    expect(p.state.busy).toBe(true)
    expect(s.ran.filter(r => r === 'start-lock-countdown')).toHaveLength(1)
  })

  it('a stale gate is refused as gate-changed', async () => {
    stub()
    const p = await ipad()
    expect(await p.tap('next', { expectGate: 'audio' })).toMatchObject({ refused: 'gate-changed' })
  })

  it('a command older than 1500ms of laptop time is dropped as late', async () => {
    const s = stub()
    const p = await ipad()
    expect(await p.next({ sentAt: Date.now() - 5000 })).toMatchObject({ refused: 'late' })
    expect(s.ran).toEqual([])
  })

  it('a stale slide id is refused as slide-changed', async () => {
    stub()
    const p = await ipad()
    expect(await p.next({ expectSlideId: 'w' })).toMatchObject({ refused: 'slide-changed' })
  })

  it('Pause refuses everything and the snapshot says so', async () => {
    const s = stub()
    const p = await ipad()
    s.setPaused(true)
    await until(() => p.state.paused)
    expect(await p.next()).toMatchObject({ refused: 'paused' })
    expect(await p.tap('scoreboard', { value: true })).toMatchObject({ refused: 'paused' })
  })

  it('toggles are end-state and the lit state comes back in the snapshot', async () => {
    stub()
    const p = await ipad()
    await p.tap('scoreboard', { value: true })
    await until(() => p.state.toggles.scoreboardVisible)
    await p.tap('scoreboard', { value: true }) // already on: no-op, still received
    expect(p.state.toggles.scoreboardVisible).toBe(true)
  })

  it('relay restart: the host resends its unchanged snapshot and a fresh iPad gets it', async () => {
    const s = stub()
    const p1 = await ipad()
    await p1.next()
    await until(() => p1.state.slide.id === 'w')
    p1.ws.close()
    const same = { hostPort: ports.hostPort, remotePort: ports.remotePort }
    await relay.close()
    await until(() => s.status === 'down')
    await startRelay(same)
    await until(() => s.status === 'open')
    const p2 = await ipad()
    expect(p2.state.slide.id).toBe('w') // the snapshot never changed — only reset() on open sent it
  })

  it('a second host kicks the first; the first stops, commands reach the second', async () => {
    const first = stub()
    await until(() => first.status === 'open')
    const second = stub()
    await until(() => first.status === 'replaced')
    const p = await ipad()
    await p.next()
    expect(second.ran).toEqual(['next'])
    expect(first.ran).toEqual([])
    await new Promise(r => setTimeout(r, 100))
    expect(first.status).toBe('replaced') // never reconnected
  })

  it('jump by slide id lands there; the snapshot carries the jump list', async () => {
    const s = stub()
    const p = await ipad()
    expect(p.state.slides.map(x => x.label)).toEqual(['Q1', '✨ Shiny', 'Q3'])
    expect(await p.tap('jump', { slideId: 'q3', index: 2 })).toMatchObject({ received: true })
    await until(() => p.state.slide.id === 'q3')
    expect(s.ran).toEqual(['jump'])
  })

  it('jump from a stale view is refused as slide-changed; to a missing slide as bad-target', async () => {
    const s = stub()
    const p = await ipad()
    expect(await p.tap('jump', { slideId: 'q3' }, { expectSlideId: 'w' })).toMatchObject({ refused: 'slide-changed' })
    expect(await p.tap('jump', { slideId: 'gone' })).toMatchObject({ refused: 'bad-target' })
    expect(s.ran).toEqual([])
  })

  it('unlock and rescore follow the fix state in the snapshot', async () => {
    const slides = [
      { id: 'm', type: 'question', data: { questionNumber: 1, isShiny: true, shinyInputSchema: { type: 'matching' }, matchingLocked: true } },
      { id: 'h', type: 'horse-race', data: { raceLocked: true } },
    ]
    const s = stub(slides)
    const p = await ipad()
    expect(p.state.fix).toMatchObject({ mechanic: 'matching', canUnlock: true, canRescore: true, rescoreLabel: 'Rescore' })
    expect(await p.tap('rescore')).toMatchObject({ received: true })
    expect(await p.tap('unlock')).toMatchObject({ received: true })
    await until(() => p.state.fix.canUnlock === false)
    expect(p.state.fix).toMatchObject({ unlockRefusal: 'nothing-locked', rescoreRefusal: 'not-locked' })
    expect(await p.tap('unlock')).toMatchObject({ refused: 'nothing-locked' })
    expect(await p.tap('rescore')).toMatchObject({ refused: 'not-locked' })
    // Horse race: unlock yes, rescore stays on the laptop.
    await p.tap('jump', { slideId: 'h' })
    await until(() => p.state.slide.id === 'h')
    expect(await p.tap('rescore')).toMatchObject({ refused: 'laptop-only' })
    expect(await p.tap('unlock')).toMatchObject({ received: true })
    await until(() => p.state.fix.canUnlock === false)
    expect(s.ran).toEqual(['rescore', 'unlock', 'jump', 'unlock'])
  })

  it('no host: laptop-offline, and the iPad is told the host is gone', async () => {
    const s = stub()
    const p = await ipad()
    s.stop()
    await until(() => p.host === false)
    expect(await p.next()).toMatchObject({ refused: 'laptop-offline' })
  })
})

describe('stub display + relay + iPad (Stream Deck parity)', () => {
  const breakSlides = () => [
    { id: 'q1', type: 'question', data: { questionNumber: 1 } },
    { id: 'gb', type: 'grading-break', data: {} },
    { id: 'q2', type: 'question', data: { questionNumber: 2 } },
  ]
  function display(opts = {}) {
    const d = createStubDisplay({ url: `ws://127.0.0.1:${ports.hostPort}`, origin: PROD_ORIGIN, retryMs: 30, ...opts })
    stubs.push(d)
    return d
  }
  const tapJ = (p, cmd) => p.tap(cmd, {}, { expectSlideId: null })

  it('a full break from the iPad: open now, play, stop, back to trivia (once)', async () => {
    stub(breakSlides())
    const d = display()
    const p = await ipad()
    await until(() => p.jukebox?.linked && p.jukebox.waiting)
    expect(await tapJ(p, 'jukebox.exit')).toMatchObject({ refused: 'jukebox-not-open' })
    expect(await tapJ(p, 'jukebox.open')).toMatchObject({ received: true })
    await until(() => p.jukebox.open)
    expect(await tapJ(p, 'jukebox.playStop')).toMatchObject({ received: true })
    await until(() => p.jukebox.playing)
    expect(await tapJ(p, 'jukebox.playStop')).toMatchObject({ received: true })
    await until(() => p.jukebox.playing === false)
    expect(await tapJ(p, 'jukebox.exit')).toMatchObject({ received: true })
    await until(() => p.jukebox.handoffPending)
    expect(await tapJ(p, 'jukebox.exit')).toMatchObject({ received: true }) // second press: guard, nothing runs
    expect(d.ran).toEqual(['open', 'shuffle', 'stop', 'exit'])
  })

  it('the host never sees jukebox commands; the display never sees host commands', async () => {
    const h = stub(breakSlides())
    const d = display()
    const p = await ipad()
    await until(() => p.jukebox?.linked)
    await tapJ(p, 'jukebox.open')
    await p.next()
    expect(h.ran).toEqual(['next'])
    expect(d.ran).toEqual(['open'])
  })

  it('no display window: jukebox commands are display-offline, host commands still work', async () => {
    stub(breakSlides())
    const p = await ipad()
    expect(p.jukebox).toEqual({ type: 'jukebox', linked: false })
    expect(await tapJ(p, 'jukebox.open')).toMatchObject({ refused: 'display-offline' })
    expect(await p.next()).toMatchObject({ received: true })
  })

  it('a stale jukebox tap is dropped as late by the display', async () => {
    stub(breakSlides())
    const d = display()
    const p = await ipad()
    await until(() => p.jukebox?.linked)
    expect(await p.tap('jukebox.open', {}, { sentAt: Date.now() - 5000 })).toMatchObject({ refused: 'late' })
    expect(d.ran).toEqual([])
  })

  it('Duck from the iPad drops to 20% and restores; volume keys; Pause blocks them', async () => {
    const h = stub(breakSlides())
    const p = await ipad()
    await until(() => p.local?.volume === 50)
    expect(await p.tap('duck')).toMatchObject({ received: true })
    await until(() => p.local.ducked && p.local.volume === 10)
    expect(await p.tap('duck')).toMatchObject({ received: true })
    await until(() => !p.local.ducked && p.local.volume === 50)
    await p.tap('vol.up')
    await until(() => p.local.volume === 60)
    h.setPaused(true)
    await until(() => p.state.paused)
    expect(await p.tap('vol.up')).toMatchObject({ refused: 'paused' })
    expect(runner.volume).toBe(60)
  })
})
