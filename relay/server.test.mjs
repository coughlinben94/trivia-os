// Real ws servers on ephemeral ports, a temp secret file, `ws` clients as the
// host tab and the iPads. No Supabase, no browser.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import WebSocket from 'ws'
import { createRelay, initSecret, devRefused, PROD_ORIGIN, DEV_ORIGIN } from './server.mjs'
import { CLOSE_BAD_SECRET, CLOSE_REPLACED, CLOSE_TOO_FAST } from '../client/src/lib/remoteProtocol.js'
import { createLocal } from './local.mjs'
import { fakeRunner } from './fake-runner.mjs'

const SECRET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const quiet = { log() {}, warn() {}, error() {} }
let dir, secretFile, relay, ports

async function startRelay(opts = {}) {
  relay = createRelay({ hostPort: 0, remotePort: 0, secretFile, helloMs: 200, beatMs: 50, log: quiet, ...opts })
  ports = await relay.start()
}

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-test-'))
  secretFile = path.join(dir, 'secret')
  fs.writeFileSync(secretFile, SECRET + '\n')
  await startRelay()
})
afterEach(async () => {
  await relay.close()
  fs.rmSync(dir, { recursive: true, force: true })
})

function open(port, origin = PROD_ORIGIN, pathname = '') {
  const ws = new WebSocket(`ws://127.0.0.1:${port}${pathname}`, { origin })
  ws.inbox = []
  ws.on('message', d => ws.inbox.push(JSON.parse(String(d))))
  ws.closed = new Promise(r => ws.once('close', code => r(code)))
  return new Promise((resolve, reject) => {
    ws.once('open', () => resolve(ws))
    ws.once('unexpected-response', (req, res) => { req.destroy(); reject(new Error(`HTTP ${res.statusCode}`)) })
    ws.once('error', reject)
  })
}
async function until(fn, ms = 1500) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    const v = fn()
    if (v) return v
    await new Promise(r => setTimeout(r, 10))
  }
  throw new Error('timed out')
}
const find = (ws, pred) => until(() => ws.inbox.find(pred))
const openHost = () => open(ports.hostPort)
async function pairedIpad(secret = SECRET) {
  const ws = await open(ports.remotePort)
  ws.send(JSON.stringify({ type: 'hello', secret }))
  await find(ws, m => m.type === 'host')
  return ws
}
const hello = (ws, secret) => ws.send(JSON.stringify({ type: 'hello', secret }))
const cmd = (id, extra = {}) => JSON.stringify({ type: 'cmd', id, cmd: 'next', args: { expectGate: 'advance' }, expectSlideId: 's1', sentAt: Date.now(), ...extra })

describe('pairing', () => {
  it('pairs with the right secret and says whether a host is there', async () => {
    const ipad = await pairedIpad()
    expect(ipad.inbox[0]).toEqual({ type: 'host', connected: false })
  })
  it('wrong secret closes 4003', async () => {
    const ipad = await open(ports.remotePort)
    hello(ipad, 'ZZZZZZZZZZZZZZZZZZZZZZZZZZ')
    expect(await ipad.closed).toBe(CLOSE_BAD_SECRET)
  })
  it('wrong-length secrets close 4003 and the relay keeps working', async () => {
    for (const s of ['x', '', 'x'.repeat(5000)]) {
      const ipad = await open(ports.remotePort)
      hello(ipad, s)
      expect(await ipad.closed).toBe(CLOSE_BAD_SECRET)
    }
    await pairedIpad()
  })
  it('junk first messages close 4003 without crashing', async () => {
    for (const raw of ['not json', '{"type":"hello","secret":42}', '{"type":"cmd","id":"1","cmd":"next"}']) {
      const ipad = await open(ports.remotePort)
      ipad.send(raw)
      expect(await ipad.closed).toBe(CLOSE_BAD_SECRET)
    }
    await pairedIpad()
  })
  it('no hello in time closes 4003', async () => {
    const ipad = await open(ports.remotePort)
    expect(await ipad.closed).toBe(CLOSE_BAD_SECRET)
  })
  it('reads the secret file on every hello (rotation without restart)', async () => {
    await pairedIpad()
    fs.writeFileSync(secretFile, 'NEWNEWNEWNEWNEWNEWNEWNEWNE\n')
    const old = await open(ports.remotePort)
    hello(old, SECRET)
    expect(await old.closed).toBe(CLOSE_BAD_SECRET)
    await pairedIpad('NEWNEWNEWNEWNEWNEWNEWNEWNE')
  })
  it('a missing secret file refuses everyone', async () => {
    fs.rmSync(secretFile)
    const ipad = await open(ports.remotePort)
    hello(ipad, SECRET)
    expect(await ipad.closed).toBe(CLOSE_BAD_SECRET)
  })
})

describe('origin', () => {
  it('rejects a foreign origin on both listeners', async () => {
    await expect(open(ports.remotePort, 'https://evil.example')).rejects.toThrow('HTTP 403')
    await expect(open(ports.hostPort, 'https://evil.example')).rejects.toThrow('HTTP 403')
  })
  it('refuses the dev origin without the dev flag, accepts it with', async () => {
    await expect(open(ports.hostPort, DEV_ORIGIN)).rejects.toThrow('HTTP 403')
    await relay.close()
    await startRelay({ dev: true })
    const host = await open(ports.hostPort, DEV_ORIGIN)
    expect(host.readyState).toBe(WebSocket.OPEN)
  })
})

describe('commands', () => {
  it('caps iPad messages at 8KB (close 1009)', async () => {
    const ipad = await pairedIpad()
    ipad.send(cmd('1', { args: { pad: 'x'.repeat(9000) } }))
    expect(await ipad.closed).toBe(1009)
  })
  it('replies laptop-offline straight away when no host is connected (no queue)', async () => {
    const ipad = await pairedIpad()
    ipad.send(cmd('1'))
    expect(await find(ipad, m => m.type === 'result')).toEqual({ type: 'result', id: '1', refused: 'laptop-offline' })
  })
  it('forwards a cleaned command to the host and the host result back', async () => {
    const host = await openHost()
    const ipad = await pairedIpad()
    ipad.send(cmd('9', { junk: 'dropped' }))
    const got = await find(host, m => m.type === 'cmd')
    expect(got).toMatchObject({ type: 'cmd', id: '9', cmd: 'next', args: { expectGate: 'advance' }, expectSlideId: 's1' })
    expect(got.junk).toBeUndefined()
    host.send(JSON.stringify({ type: 'result', id: '9', received: true }))
    expect(await find(ipad, m => m.type === 'result')).toEqual({ type: 'result', id: '9', received: true })
  })
  it('a second host kicks the first with 4001; commands reach only the new one', async () => {
    const first = await openHost()
    const second = await openHost()
    expect(await first.closed).toBe(CLOSE_REPLACED)
    const ipad = await pairedIpad()
    ipad.send(cmd('2'))
    await find(second, m => m.type === 'cmd')
    expect(first.inbox.some(m => m.type === 'cmd')).toBe(false)
  })
})

describe('state', () => {
  it('passes state through and replays the cached state on every hello', async () => {
    const host = await openHost()
    const early = await pairedIpad()
    host.send(JSON.stringify({ type: 'state', cue: 'Lock answers' }))
    await find(early, m => m.type === 'state')
    const late = await pairedIpad()
    expect(late.inbox[0]).toEqual({ type: 'host', connected: true })
    expect(await find(late, m => m.type === 'state')).toEqual({ type: 'state', cue: 'Lock answers' })
  })
  it('host close tells iPads, and a new iPad gets the stale state marked host:false', async () => {
    const host = await openHost()
    const ipad = await pairedIpad()
    host.send(JSON.stringify({ type: 'state', cue: 'x' }))
    await find(ipad, m => m.type === 'state')
    host.close()
    await find(ipad, m => m.type === 'host' && m.connected === false)
    const late = await pairedIpad()
    expect(late.inbox[0]).toEqual({ type: 'host', connected: false })
    await find(late, m => m.type === 'state')
  })
  it('sends relay-beat to both sides and forwards the host beat to iPads', async () => {
    const host = await openHost()
    const ipad = await pairedIpad()
    await find(host, m => m.type === 'relay-beat')
    await find(ipad, m => m.type === 'relay-beat')
    host.send(JSON.stringify({ type: 'beat', laptopNow: 123, visibility: 'hidden' }))
    expect(await find(ipad, m => m.type === 'beat')).toEqual({ type: 'beat', laptopNow: 123, visibility: 'hidden' })
  })
  it('relay-beat carries the laptop clock (laptopNow), so an iPad can time its taps with Live Mode closed', async () => {
    const ipad = await pairedIpad()
    const t0 = Date.now()
    const b = await find(ipad, m => m.type === 'relay-beat')
    expect(b.laptopNow).toBeGreaterThanOrEqual(t0)
    expect(b.laptopNow).toBeLessThanOrEqual(Date.now())
  })
  it('logs an iPad score fix as one JSON-quoted line; a newline in a team name cannot forge a second', async () => {
    const lines = []
    await relay.close()
    await startRelay({ log: { ...quiet, log: s => lines.push(s) } })
    const host = await openHost()
    await pairedIpad()
    host.send(JSON.stringify({ type: 'result', id: '1', done: true, scoreSet: { team: 'Bears\n[relay] fake\r\nline', col: 'R1', from: 1, to: 2 } }))
    await until(() => lines.length)
    expect(lines).toHaveLength(1)
    expect(lines[0]).not.toMatch(/[\n\r]/)
    expect(lines[0]).toMatch(/^\[relay\] \S+ "iPad set Bears \[relay\] fake line R1: 1 to 2"$/)
  })
  it('scores.hide from one iPad is not passed on while another iPad still has Scores open', async () => {
    const host = await openHost()
    const a = await pairedIpad()
    const b = await pairedIpad()
    const got = () => host.inbox.filter(m => m.type === 'cmd').map(m => m.cmd)
    a.send(cmd('a1', { cmd: 'scores.get' }))
    b.send(cmd('b1', { cmd: 'scores.get' }))
    await until(() => got().length === 2)
    a.send(cmd('a2', { cmd: 'scores.hide' }))
    expect(await find(a, m => m.type === 'result' && m.id === 'a2')).toEqual({ type: 'result', id: 'a2', received: true })
    expect(got()).toEqual(['scores.get', 'scores.get'])
    b.send(cmd('b2', { cmd: 'scores.hide' }))
    await until(() => got().length === 3)
    expect(got()[2]).toBe('scores.hide')
  })
  it('an iPad that closes with Scores open stops counting as an opener', async () => {
    const host = await openHost()
    const a = await pairedIpad()
    const b = await pairedIpad()
    a.send(cmd('a1', { cmd: 'scores.get' }))
    b.send(cmd('b1', { cmd: 'scores.get' }))
    await until(() => host.inbox.filter(m => m.type === 'cmd').length === 2)
    a.close()
    await until(() => host.inbox.filter(m => m.type === 'remotes').at(-1)?.count === 1)
    b.send(cmd('b2', { cmd: 'scores.hide' }))
    await until(() => host.inbox.some(m => m.type === 'cmd' && m.cmd === 'scores.hide'))
  })
  it('tells the host how many iPads are paired', async () => {
    const host = await openHost()
    await find(host, m => m.type === 'remotes' && m.count === 0)
    const ipad = await pairedIpad()
    await find(host, m => m.type === 'remotes' && m.count === 1)
    ipad.close()
    await until(() => host.inbox.filter(m => m.type === 'remotes').at(-1)?.count === 0)
  })
})

describe('initSecret', () => {
  it('writes 26 base32 chars with mode 0600 and refuses to overwrite without force', () => {
    const file = path.join(dir, 'nested', 'secret')
    const secret = initSecret(file)
    expect(secret).toMatch(/^[A-Z2-7]{26}$/)
    expect(fs.readFileSync(file, 'utf8').trim()).toBe(secret)
    expect(fs.statSync(file).mode & 0o777).toBe(0o600)
    expect(() => initSecret(file)).toThrow(/--force/)
    expect(fs.readFileSync(file, 'utf8').trim()).toBe(secret)
    const next = initSecret(file, { force: true })
    expect(next).not.toBe(secret)
    expect(fs.readFileSync(file, 'utf8').trim()).toBe(next)
  })
})

describe('RELAY_DEV guard', () => {
  it('refuses RELAY_DEV under launchd, allows it from a Terminal shell (XPC_SERVICE_NAME=0)', () => {
    expect(devRefused({ RELAY_DEV: '1', XPC_SERVICE_NAME: 'com.baynes.trivia-relay' })).toBe(true)
    expect(devRefused({ RELAY_DEV: '1', XPC_SERVICE_NAME: '0' })).toBe(false)
    expect(devRefused({ RELAY_DEV: '1' })).toBe(false)
    expect(devRefused({ XPC_SERVICE_NAME: 'com.baynes.trivia-relay' })).toBe(false)
  })
})

// ── Phase 2b: Stream Deck parity (spec §17) ─────────────────────────────────
// A FAKE local runner everywhere: nothing here moves the real volume or plays audio.
describe('local commands and the display peer', () => {
  let cfgDir, runner
  beforeEach(async () => {
    cfgDir = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-cfg-'))
    const snd = path.join(cfgDir, 'turtles.mp3')
    fs.writeFileSync(snd, '')
    fs.writeFileSync(path.join(cfgDir, 'sounds.json'), JSON.stringify([{ id: 'turtles', label: 'I Like Turtles', path: snd }]))
    runner = fakeRunner({ volume: 60 })
    await relay.close()
    await startRelay({ local: createLocal({ configDir: cfgDir, runner, log: quiet }) })
  })
  afterEach(() => fs.rmSync(cfgDir, { recursive: true, force: true }))

  const openDisplay = () => open(ports.hostPort, PROD_ORIGIN, '/display')
  const local = (id, c, args = {}) => JSON.stringify({ type: 'cmd', id, cmd: c, args, expectSlideId: null, sentAt: Date.now() })

  it('a paired iPad gets local-state (volume, ducked, sounds) on hello', async () => {
    const ipad = await pairedIpad()
    const st = await find(ipad, m => m.type === 'local-state' && m.volume === 60)
    expect(st).toMatchObject({ ducked: false, available: true, sounds: [{ id: 'turtles', label: 'I Like Turtles', missing: false }] })
    expect(await find(ipad, m => m.type === 'jukebox')).toEqual({ type: 'jukebox', linked: false })
  })
  it('vol.up runs locally (never reaches the host), replies received and pushes the new local-state', async () => {
    const host = await openHost()
    const ipad = await pairedIpad()
    ipad.send(local('v1', 'vol.up'))
    expect(await find(ipad, m => m.type === 'result' && m.id === 'v1')).toEqual({ type: 'result', id: 'v1', received: true })
    await find(ipad, m => m.type === 'local-state' && m.volume === 70)
    expect(runner.volume).toBe(70)
    expect(host.inbox.some(m => m.type === 'cmd')).toBe(false)
  })
  it('works with no host connected (laptop-local, not laptop-offline)', async () => {
    const ipad = await pairedIpad()
    ipad.send(local('d1', 'duck'))
    expect(await find(ipad, m => m.id === 'd1')).toMatchObject({ received: true })
    expect(runner.volume).toBe(12)
  })
  it('sound.play takes only an id; an unknown id is refused', async () => {
    const ipad = await pairedIpad()
    ipad.send(local('s1', 'sound.play', { id: 'turtles', path: '/etc/passwd' }))
    await find(ipad, m => m.id === 's1' && m.received)
    expect(runner.calls.at(-1)).toEqual(['/usr/bin/afplay', [path.join(cfgDir, 'turtles.mp3')]])
    ipad.send(local('s2', 'sound.play', { id: 'nope' }))
    expect(await find(ipad, m => m.id === 's2')).toMatchObject({ refused: 'unknown-sound' })
  })
  it('unpaired sockets cannot run a local command (secret required)', async () => {
    const ipad = await open(ports.remotePort)
    ipad.send(local('x', 'vol.up'))
    expect(await ipad.closed).toBe(CLOSE_BAD_SECRET)
    expect(runner.calls).toEqual([])
  })
  it('the host and display sockets can never send vol/duck/sound or jukebox commands', async () => {
    const host = await openHost()
    const display = await openDisplay()
    const ipad = await pairedIpad()
    for (const ws of [host, display]) {
      for (const c of ['vol.up', 'duck', 'sound.play', 'sound.stopAll', 'jukebox.exit']) ws.send(local('h', c, { id: 'turtles' }))
    }
    await new Promise(r => setTimeout(r, 100))
    expect(runner.calls.filter(([f]) => f === '/usr/bin/afplay' || f === '/usr/bin/osascript').length).toBe(1) // only the hello's volume read
    expect(display.inbox.some(m => m.type === 'cmd')).toBe(false)
    expect(ipad.inbox.some(m => m.type === 'result' && m.id === 'h')).toBe(false)
  })
  it('Pause on the laptop blocks local and jukebox commands', async () => {
    const host = await openHost()
    const display = await openDisplay()
    const ipad = await pairedIpad()
    host.send(JSON.stringify({ type: 'state', paused: true }))
    await find(ipad, m => m.type === 'state')
    ipad.send(local('p1', 'vol.up'))
    ipad.send(local('p2', 'jukebox.playStop'))
    expect(await find(ipad, m => m.id === 'p1')).toMatchObject({ refused: 'paused' })
    expect(await find(ipad, m => m.id === 'p2')).toMatchObject({ refused: 'paused' })
    expect(runner.volume).toBe(60)
    expect(display.inbox.some(m => m.type === 'cmd')).toBe(false)
  })
  it('more than 10 local commands in a second closes the iPad with 4008', async () => {
    const ipad = await pairedIpad()
    for (let i = 0; i < 12; i++) ipad.send(local(`r${i}`, 'sound.stopAll'))
    expect(await ipad.closed).toBe(CLOSE_TOO_FAST)
  })
  it('a local command older than 1500ms, or with no sentAt, is refused late and never runs', async () => {
    const ipad = await pairedIpad()
    await find(ipad, m => m.type === 'local-state' && m.volume === 60)
    ipad.send(JSON.stringify({ type: 'cmd', id: 'o1', cmd: 'vol.up', args: {}, sentAt: Date.now() - 2000 }))
    ipad.send(JSON.stringify({ type: 'cmd', id: 'o2', cmd: 'duck', args: {} }))
    expect(await find(ipad, m => m.id === 'o1')).toEqual({ type: 'result', id: 'o1', refused: 'late' })
    expect(await find(ipad, m => m.id === 'o2')).toEqual({ type: 'result', id: 'o2', refused: 'late' })
    expect(runner.volume).toBe(60)
  })
  it('logs a newline in the id as JSON, never a raw line break', async () => {
    const lines = []
    await relay.close()
    await startRelay({ local: createLocal({ configDir: cfgDir, runner, log: quiet }), log: { ...quiet, log: s => lines.push(s) } })
    const ipad = await pairedIpad()
    ipad.send(local('a\nFAKE', 'sound.stopAll'))
    await find(ipad, m => m.id === 'a\nFAKE')
    const line = lines.find(l => l.includes('sound.stopAll'))
    expect(line).not.toContain('\n')
    expect(line).toContain('"a\\nFAKE"')
  })
  it('logs the command name and id only', async () => {
    const lines = []
    await relay.close()
    await startRelay({ local: createLocal({ configDir: cfgDir, runner, log: quiet }), log: { ...quiet, log: s => lines.push(s) } })
    const ipad = await pairedIpad()
    ipad.send(local('L1', 'sound.play', { id: 'turtles', path: '/secret/place' }))
    await find(ipad, m => m.id === 'L1')
    expect(lines.some(l => /sound\.play/.test(l) && /turtles/.test(l))).toBe(true)
    expect(lines.join('\n')).not.toMatch(/secret\/place|ABCDEFGHIJ/)
  })
  it('jukebox.* goes only to the display peer; with none it is display-offline', async () => {
    const host = await openHost()
    const ipad = await pairedIpad()
    ipad.send(local('j1', 'jukebox.exit'))
    expect(await find(ipad, m => m.id === 'j1')).toMatchObject({ refused: 'display-offline' })
    const display = await openDisplay()
    await find(ipad, m => m.type === 'jukebox' && m.linked === true)
    ipad.send(local('j2', 'jukebox.playStop'))
    expect(await find(display, m => m.type === 'cmd')).toMatchObject({ id: 'j2', cmd: 'jukebox.playStop' })
    expect(host.inbox.some(m => m.type === 'cmd')).toBe(false)
    display.send(JSON.stringify({ type: 'result', id: 'j2', received: true }))
    expect(await find(ipad, m => m.id === 'j2')).toEqual({ type: 'result', id: 'j2', received: true })
  })
  it('display-state reaches the iPad as jukebox state, replayed on hello; display close unlinks', async () => {
    const display = await openDisplay()
    display.send(JSON.stringify({ type: 'display-state', breakWaiting: false, jukeboxOpen: true, playing: true, handoffPending: false, junk: 1 }))
    const ipad = await pairedIpad()
    expect(await find(ipad, m => m.type === 'jukebox' && m.open)).toEqual({ type: 'jukebox', linked: true, waiting: false, open: true, playing: true, handoffPending: false })
    display.close()
    await find(ipad, m => m.type === 'jukebox' && m.linked === false)
  })
  it('a display socket never takes the host slot, and a second display replaces the first (4001)', async () => {
    const host = await openHost()
    const d1 = await openDisplay()
    const d2 = await openDisplay()
    expect(await d1.closed).toBe(CLOSE_REPLACED)
    const ipad = await pairedIpad()
    ipad.send(cmd('n1'))
    await find(host, m => m.type === 'cmd' && m.id === 'n1')
    expect(d2.inbox.some(m => m.type === 'cmd')).toBe(false)
  })
  it('the display gets relay-beats', async () => {
    const display = await openDisplay()
    await find(display, m => m.type === 'relay-beat')
  })
  it('the remote port has no display role', async () => {
    const ws = await open(ports.remotePort, PROD_ORIGIN, '/display')
    ws.send(JSON.stringify({ type: 'display-state', jukeboxOpen: true }))
    expect(await ws.closed).toBe(CLOSE_BAD_SECRET)
  })
})
