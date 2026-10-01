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
let relayLines = []
async function startRelay(p = { hostPort: 0, remotePort: 0 }) {
  runner = fakeRunner({ volume: 50 }) // never the real volume or speakers
  relayLines = []
  relay = createRelay({ ...p, secretFile, helloMs: 500, beatMs: 50, log: { ...quiet, log: s => relayLines.push(s) }, local: createLocal({ configDir: dir, runner, log: quiet }) })
  ports = await relay.start()
}
function stub(slides = makeSlides(), extra = {}) {
  const s = createStubHost({ url: `ws://127.0.0.1:${ports.hostPort}`, origin: PROD_ORIGIN, slides, retryMs: 30, ...extra })
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
  const pad = { ws, state: null, results: {}, all: {}, host: null, ids: 0, jukebox: null, local: null }
  ws.on('message', d => {
    const m = JSON.parse(String(d))
    if (m.type === 'state') pad.state = m
    if (m.type === 'jukebox') pad.jukebox = m
    if (m.type === 'local-state') pad.local = m
    if (m.type === 'host') pad.host = m.connected
    if (m.type === 'result') { pad.results[m.id] ??= m; (pad.all[m.id] ??= []).push(m) }
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

  it('timer: start, pause, resume, add, cancel go iPad -> relay -> host handler and come back in the snapshot', async () => {
    const s = stub()
    const p = await ipad()
    expect('timer' in p.state).toBe(false)
    expect(await p.tap('timer.start', { seconds: 90 })).toMatchObject({ received: true })
    await until(() => p.state.timer?.state === 'running')
    const id = p.state.timer.id
    expect(p.state.timer.totalMs).toBe(90000)
    // A second Start is refused unless it is an explicit replace.
    expect(await p.tap('timer.start', { seconds: 120 })).toMatchObject({ refused: 'timer-running' })
    expect(await p.tap('timer.pause', { timerId: 'stale' })).toMatchObject({ refused: 'timer-changed' })
    expect(await p.tap('timer.pause', { timerId: id })).toMatchObject({ received: true })
    await until(() => p.state.timer?.state === 'paused')
    expect(await p.tap('timer.resume', { timerId: id })).toMatchObject({ received: true })
    await until(() => p.state.timer?.state === 'running')
    expect(await p.tap('timer.add', { timerId: id, seconds: 30 })).toMatchObject({ received: true })
    await until(() => p.state.timer?.totalMs === 120000)
    expect(await p.tap('timer.add', { timerId: id, seconds: 45 })).toMatchObject({ refused: 'bad-add' })
    expect(await p.tap('timer.add', { timerId: id })).toMatchObject({ received: true }) // old page: no seconds means 1 min
    await until(() => p.state.timer?.totalMs === 180000)
    // An iPad page cached from before seconds still sends whole minutes.
    expect(await p.tap('timer.start', { minutes: 2, replace: true })).toMatchObject({ received: true })
    await until(() => p.state.timer?.totalMs === 120000 && p.state.timer.id !== id)
    expect(await p.tap('timer.start', { seconds: 45 })).toMatchObject({ refused: 'bad-minutes' })
    expect(await p.tap('timer.start', { minutes: 0.5 })).toMatchObject({ refused: 'bad-minutes' })
    expect(await p.tap('timer.cancel', { timerId: p.state.timer.id })).toMatchObject({ received: true })
    await until(() => !('timer' in p.state))
    expect(s.ran.filter(r => r.startsWith('timer-'))).toEqual(['timer-start', 'timer-pause', 'timer-resume', 'timer-add', 'timer-add', 'timer-start', 'timer-cancel'])
  })

  it('timer commands obey Pause on the laptop', async () => {
    const s = stub()
    const p = await ipad()
    s.setPaused(true)
    await until(() => p.state.paused)
    expect(await p.tap('timer.start', { seconds: 300 })).toMatchObject({ refused: 'paused' })
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

  it('a stale volume/Duck/sound tap is dropped as late by the relay and never runs', async () => {
    stub(breakSlides())
    const p = await ipad()
    await until(() => p.local?.volume === 50)
    for (const c of ['duck', 'vol.up', 'sound.stopAll']) {
      expect(await p.tap(c, {}, { sentAt: Date.now() - 5000 })).toMatchObject({ refused: 'late' })
    }
    expect(runner.volume).toBe(50)
    expect(p.local.ducked).toBe(false)
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

// Phase 3 (reduced): the Scores drawer over the real relay. The stub host's
// scoreboard is in memory (the real score chain over a fake table): no Supabase.
describe('iPad clock skew with Live Mode closed', () => {
  it('an iPad 3s behind the laptop, no host: it times taps from relay-beat laptopNow and vol.up is accepted', async () => {
    const SKEW = -3000
    const ws = new WebSocket(`ws://127.0.0.1:${ports.remotePort}`, { origin: PROD_ORIGIN })
    const inbox = []
    ws.on('message', d => inbox.push(JSON.parse(String(d))))
    await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej) })
    ws.send(JSON.stringify({ type: 'hello', secret: SECRET }))
    const beat = await until(() => inbox.find(m => m.type === 'relay-beat'))
    const ipadNow = () => Date.now() + SKEW
    // Without the offset the tap reads 3s old and is refused late.
    ws.send(JSON.stringify({ type: 'cmd', id: 'raw', cmd: 'vol.up', args: {}, sentAt: ipadNow() }))
    expect(await until(() => inbox.find(m => m.type === 'result' && m.id === 'raw'))).toMatchObject({ refused: 'late' })
    const offset = beat.laptopNow - ipadNow()
    ws.send(JSON.stringify({ type: 'cmd', id: 'fixed', cmd: 'vol.up', args: {}, sentAt: ipadNow() + offset }))
    expect(await until(() => inbox.find(m => m.type === 'result' && m.id === 'fixed'))).toMatchObject({ received: true })
    ws.close()
  })
})

describe('Scores drawer: scores.get / score.set / scores.hide', () => {
  const ROUNDS = [{ id: 'ra', number: 1 }, { id: 'rb', number: 2 }]
  const TEAMS = () => [
    { id: 't1', show_id: 'stub-show', name: 'Quizzly Bears', sort_order: 0, scores: { r_ra: 5, r_rb: { written: 4, phone: { w: 3 } } } },
    { id: 't2', show_id: 'stub-show', name: 'Trivia Newton John', sort_order: 1, scores: { r_ra: 9 } },
  ]
  // The first result is "received" (or a refusal); a score command's outcome follows under the same id.
  const outcome = (p, id) => until(() => { const ms = p.all[id] ?? []; return ms[0]?.refused ? ms[0] : ms[1] })
  const setCell = (p, args) => p.tap('score.set', args)

  it('scores.get attaches the fresh scoreboard to the snapshot, sorted by place', async () => {
    stub(makeSlides(), { rounds: ROUNDS, teams: TEAMS() })
    const p = await ipad()
    expect(p.state.scores).toBe(null)
    expect(await p.tap('scores.get')).toMatchObject({ received: true })
    await until(() => p.state.scores)
    expect(p.state.scores.cols.map(c => c.label)).toEqual(['R1', 'R2', '?'])
    expect(p.state.scores.teams.map(t => [t.name, t.total, t.place])).toEqual([['Quizzly Bears', 12, 1], ['Trivia Newton John', 9, 2]])
    expect(p.state.scores.teams[0].cells[1]).toEqual({ key: 'r_rb', label: 'R2', value: 7, phone: 3 })
  })

  it('score.set: received, then done with the value read back; snapshot refreshed; phone bucket kept; relay logs it', async () => {
    const s = stub(makeSlides(), { rounds: ROUNDS, teams: TEAMS() })
    const p = await ipad()
    await p.tap('scores.get')
    await until(() => p.state.scores)
    const r = await setCell(p, { teamId: 't1', colKey: 'r_rb', value: 10, expectOld: 7 })
    expect(r).toMatchObject({ received: true })
    const done = await outcome(p, r.id)
    expect(done).toEqual({ type: 'result', id: r.id, done: true, scoreSet: { team: 'Quizzly Bears', col: 'R2', from: 7, to: 10, teamId: 't1', colKey: 'r_rb' } })
    await until(() => p.state.scores.teams[0].total === 15)
    expect(s.db.rows[0].scores.r_rb).toEqual({ written: 7, phone: { w: 3 } })
    expect(s.db.rows[1]).toEqual(TEAMS()[1])
    expect(relayLines.some(l => l.includes('iPad set Quizzly Bears R2: 7 to 10'))).toBe(true)
    expect(s.notices).toEqual(['iPad set Quizzly Bears R2: 7 to 10'])
  })

  it('a stale old value is refused changed-underneath and never written', async () => {
    const s = stub(makeSlides(), { rounds: ROUNDS, teams: TEAMS() })
    const p = await ipad()
    await p.tap('scores.get')
    const r = await setCell(p, { teamId: 't1', colKey: 'r_rb', value: 10, expectOld: 6 })
    expect(await outcome(p, r.id)).toMatchObject({ refused: 'changed-underneath' })
    expect(s.db.rows).toEqual(TEAMS())
  })

  it('a second score.set while one is on the chain is refused busy (as LiveMode does), not stacked', async () => {
    const s = stub(makeSlides(), { rounds: ROUNDS, teams: TEAMS() })
    const p = await ipad()
    await p.tap('scores.get')
    await until(() => p.state.scores)
    let open
    s.db.gate = new Promise(res => { open = res })
    const a = await setCell(p, { teamId: 't1', colKey: 'r_ra', value: 6, expectOld: 5 })
    expect(a).toMatchObject({ received: true })
    const b = await setCell(p, { teamId: 't2', colKey: 'r_ra', value: 1, expectOld: 9 })
    expect(b).toMatchObject({ refused: 'busy' })
    await until(() => p.state.busy === true)
    s.db.gate = null
    open()
    expect(await outcome(p, a.id)).toMatchObject({ done: true })
    expect(s.db.rows[1].scores.r_ra).toBe(9)
  })

  it('bad values and unknown columns are refused by the laptop before any read', async () => {
    const s = stub(makeSlides(), { rounds: ROUNDS, teams: TEAMS() })
    const p = await ipad()
    for (const value of [1.5, '7', null, 5000]) {
      expect(await setCell(p, { teamId: 't1', colKey: 'r_ra', value, expectOld: 5 })).toMatchObject({ refused: 'bad-score' })
    }
    expect(await setCell(p, { teamId: 't1', colKey: 'r_zz', value: 1, expectOld: 5 })).toMatchObject({ refused: 'bad-column' })
    expect(s.db.log).toEqual([])
  })

  it('an unknown team is refused after the fresh read', async () => {
    stub(makeSlides(), { rounds: ROUNDS, teams: TEAMS() })
    const p = await ipad()
    const r = await setCell(p, { teamId: 'nope', colKey: 'r_ra', value: 1, expectOld: 0 })
    expect(await outcome(p, r.id)).toMatchObject({ refused: 'no-team' })
  })

  it('paused or the laptop scoreboard open: refused, nothing read', async () => {
    const s = stub(makeSlides(), { rounds: ROUNDS, teams: TEAMS() })
    const p = await ipad()
    s.setModalOpen(true)
    expect(await p.tap('scores.get')).toMatchObject({ refused: 'modal-open' })
    s.setModalOpen(false)
    s.setPaused(true)
    await until(() => p.state.paused)
    expect(await setCell(p, { teamId: 't1', colKey: 'r_ra', value: 6, expectOld: 5 })).toMatchObject({ refused: 'paused' })
    expect(s.db.log).toEqual([])
  })

  it('a row deleted before the write is not brought back; the iPad hears it did not save', async () => {
    const s = stub(makeSlides(), { rounds: ROUNDS, teams: TEAMS() })
    const p = await ipad()
    s.db.afterRead = () => { s.db.rows = s.db.rows.filter(r => r.id !== 't1'); s.db.afterRead = null }
    const r = await setCell(p, { teamId: 't1', colKey: 'r_ra', value: 6, expectOld: 5 })
    expect(await outcome(p, r.id)).toMatchObject({ refused: 'score-not-saved' })
    expect(s.db.rows.map(x => x.id)).toEqual(['t2'])
  })

  it('the laptop reloads mid-drawer (a fresh host with the drawer closed): the iPad asks again and the teams come back', async () => {
    const a = stub(makeSlides(), { rounds: ROUNDS, teams: TEAMS() })
    const p = await ipad()
    await p.tap('scores.get')
    await until(() => p.state.scores)
    a.stop()
    await until(() => p.host === false)
    stub(makeSlides(), { rounds: ROUNDS, teams: TEAMS() })
    await until(() => p.host === true && p.state.scores === null)
    // Remote.jsx's rule: drawer open, live, no scores, nothing in flight: ask again.
    expect(await p.tap('scores.get')).toMatchObject({ received: true })
    await until(() => p.state.scores?.teams.length === 2)
  })

  it('scores.hide stops attaching the scoreboard', async () => {
    stub(makeSlides(), { rounds: ROUNDS, teams: TEAMS() })
    const p = await ipad()
    await p.tap('scores.get')
    await until(() => p.state.scores)
    await p.tap('scores.hide')
    await until(() => p.state.scores === null)
  })
})
