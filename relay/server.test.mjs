// Real ws servers on ephemeral ports, a temp secret file, `ws` clients as the
// host tab and the iPads. No Supabase, no browser.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import WebSocket from 'ws'
import { createRelay, initSecret, devRefused, PROD_ORIGIN, DEV_ORIGIN } from './server.mjs'
import { CLOSE_BAD_SECRET, CLOSE_REPLACED } from '../client/src/lib/remoteProtocol.js'

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

function open(port, origin = PROD_ORIGIN) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`, { origin })
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
