// The iPad remote relay (spec docs/superpowers/specs/2026-09-28-ipad-remote-design.md §3-§4).
// Laptop-local, bare node:http + ws, never deployed, never imported by client/.
// A thin pipe: iPad commands go to the one /host tab, its state/results/beats
// go to the paired iPads. No queue — with no host, a command is refused.
//
//   npm run relay -- --init [--force]   write the pairing code
//   npm run relay                       run (RELAY_DEV=1 also allows localhost:5173)
import http from 'node:http'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { WebSocketServer } from 'ws'
import {
  HOST_PORT, REMOTE_PORT, CLOSE_REPLACED, CLOSE_BAD_SECRET, MAX_INBOUND_BYTES, BEAT_MS, parseRemoteMessage,
} from '../client/src/lib/remoteProtocol.js'

export const PROD_ORIGIN = 'https://trivia-os.vercel.app'
export const DEV_ORIGIN = 'http://localhost:5173'
export const DEFAULT_SECRET_FILE = path.join(os.homedir(), '.config', 'trivia-relay', 'secret')

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
// 26 chars x 5 bits = 130 bits. `& 31` of a uniform byte is uniform (256 % 32 === 0).
export const newSecret = () => Array.from(crypto.randomBytes(26), b => B32[b & 31]).join('')

// SHA-256 both sides first so timingSafeEqual always gets equal-length
// buffers — it throws RangeError on a length mismatch.
const digest = s => crypto.createHash('sha256').update(String(s)).digest()
export const secretMatches = (given, expected) => !!expected && crypto.timingSafeEqual(digest(given), digest(expected))

export function initSecret(file = DEFAULT_SECRET_FILE, { force = false } = {}) {
  if (fs.existsSync(file) && !force) {
    throw new Error(`${file} already exists — pass --force to replace it (every paired iPad must then re-enter the new code)`)
  }
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
  const secret = newSecret()
  fs.writeFileSync(file, secret + '\n', { mode: 0o600 })
  fs.chmodSync(file, 0o600) // mode above applies only when the file is created
  return secret
}

// RELAY_DEV opens the dev origin; never under launchd. macOS Terminal shells
// set XPC_SERVICE_NAME=0, launchd sets it to the job label.
export const devRefused = env =>
  env.RELAY_DEV === '1' && !!env.XPC_SERVICE_NAME && env.XPC_SERVICE_NAME !== '0'

export function createRelay({
  hostPort = HOST_PORT, remotePort = REMOTE_PORT, secretFile = DEFAULT_SECRET_FILE,
  dev = false, helloMs = 3000, beatMs = BEAT_MS, pingMs = 10000, log = console,
} = {}) {
  const origins = new Set([PROD_ORIGIN, ...(dev ? [DEV_ORIGIN] : [])])
  const hostWss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 })
  const remoteWss = new WebSocketServer({ noServer: true, maxPayload: MAX_INBOUND_BYTES })
  const paired = new Set()
  let host = null
  let lastState = null // raw text of the host's last `state`, replayed on every hello

  const send = (ws, msg) => { if (ws?.readyState === 1) ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg)) }
  const toRemotes = msg => {
    const text = typeof msg === 'string' ? msg : JSON.stringify(msg)
    for (const r of paired) send(r, text)
  }
  const tellHostCount = () => send(host, { type: 'remotes', count: paired.size })
  // Read per hello, so `--init --force` takes effect without a restart.
  const readSecret = () => {
    try { return fs.readFileSync(secretFile, 'utf8').trim() } catch {
      log.error(`[relay] no pairing code at ${secretFile} — run: npm run relay -- --init`)
      return ''
    }
  }
  const watch = ws => {
    ws.isAlive = true
    ws.on('pong', () => { ws.isAlive = true })
    ws.on('error', e => log.error('[relay] socket error', e.message))
  }

  hostWss.on('connection', ws => {
    watch(ws)
    if (host) host.close(CLOSE_REPLACED, 'replaced') // newest /host tab wins
    host = ws
    toRemotes({ type: 'host', connected: true })
    tellHostCount()
    ws.on('message', data => {
      if (ws !== host) return
      const text = String(data)
      let m
      try { m = JSON.parse(text) } catch { return }
      if (m?.type === 'state') { lastState = text; toRemotes(text) }
      else if (m?.type === 'result' || m?.type === 'beat') toRemotes(text)
    })
    ws.on('close', () => {
      if (host !== ws) return
      host = null
      toRemotes({ type: 'host', connected: false }) // cached state is now stale
    })
  })

  remoteWss.on('connection', ws => {
    watch(ws)
    const helloTimer = setTimeout(() => { if (!paired.has(ws)) ws.close(CLOSE_BAD_SECRET, 'no hello') }, helloMs)
    ws.on('message', data => {
      try {
        const m = parseRemoteMessage(data)
        if (!paired.has(ws)) {
          if (m?.type !== 'hello' || !secretMatches(m.secret, readSecret())) {
            ws.close(CLOSE_BAD_SECRET, 'pairing code wrong')
            return
          }
          clearTimeout(helloTimer)
          paired.add(ws)
          send(ws, { type: 'host', connected: !!host })
          if (lastState) send(ws, lastState)
          tellHostCount()
          return
        }
        if (m?.type !== 'cmd') return
        if (!host) { send(ws, { type: 'result', id: m.id, refused: 'laptop-offline' }); return }
        send(host, m)
      } catch (e) {
        log.error('[relay] bad message', e)
        ws.close(CLOSE_BAD_SECRET, 'bad message')
      }
    })
    ws.on('close', () => {
      clearTimeout(helloTimer)
      if (paired.delete(ws)) tellHostCount()
    })
  })

  const onUpgrade = wss => (req, socket, head) => {
    socket.on('error', () => {})
    if (!origins.has(req.headers.origin)) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n')
      socket.destroy()
      return
    }
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req))
  }
  const makeServer = wss => {
    const server = http.createServer((_req, res) => { res.writeHead(426); res.end() })
    server.on('upgrade', onUpgrade(wss))
    return server
  }
  const hostServer = makeServer(hostWss)
  const remoteServer = makeServer(remoteWss)
  const timers = []

  return {
    async start() {
      // Both on loopback only; tailscale serve proxies just the remote port.
      const listen = (server, port) => new Promise((resolve, reject) => {
        server.once('error', reject)
        server.listen(port, '127.0.0.1', () => resolve(server.address().port))
      })
      const ports = { hostPort: await listen(hostServer, hostPort), remotePort: await listen(remoteServer, remotePort) }
      timers.push(setInterval(() => {
        send(host, { type: 'relay-beat' })
        toRemotes({ type: 'relay-beat' })
      }, beatMs))
      timers.push(setInterval(() => {
        for (const ws of [...hostWss.clients, ...remoteWss.clients]) {
          if (!ws.isAlive) { ws.terminate(); continue }
          ws.isAlive = false
          ws.ping()
        }
      }, pingMs))
      return ports
    },
    close() {
      timers.forEach(clearInterval)
      for (const ws of [...hostWss.clients, ...remoteWss.clients]) ws.terminate()
      return Promise.all([hostServer, remoteServer].map(s => new Promise(r => s.close(() => r()))))
    },
  }
}

function main() {
  const args = process.argv.slice(2)
  if (args.includes('--init')) {
    try {
      const secret = initSecret(DEFAULT_SECRET_FILE, { force: args.includes('--force') })
      console.log(`Pairing code (type it into the iPad's ⚙ once):\n\n  ${secret}\n\nSaved to ${DEFAULT_SECRET_FILE}`)
    } catch (e) {
      console.error(e.message)
      process.exit(1)
    }
    return
  }
  const dev = process.env.RELAY_DEV === '1'
  if (devRefused(process.env)) {
    console.error('[relay] RELAY_DEV refused under launchd')
    process.exit(1)
  }
  if (dev) console.warn(`\n[relay] WARNING: RELAY_DEV=1 — also accepting ${DEV_ORIGIN}. Never leave this on for a show.\n`)
  createRelay({ dev }).start().then(
    p => console.log(`[relay] host ws://127.0.0.1:${p.hostPort}  remote ws://127.0.0.1:${p.remotePort}`),
    e => { console.error('[relay] could not start:', e.message); process.exit(1) },
  )
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
