// The iPad remote's wire protocol (docs/superpowers/specs/2026-09-28-ipad-
// remote-design.md §6-§8). Pure and dependency-free: relay/server.mjs,
// LiveMode's useRemoteLink and the /remote page all import this one file, so
// the three can't drift on a port, a close code or a refusal text.
export const HOST_PORT = 8794
export const REMOTE_PORT = 8796
export const HOST_RELAY_URL = `ws://localhost:${HOST_PORT}`
export const DEFAULT_REMOTE_URL = 'wss://macbook-pro.tail13050c.ts.net:8795'

export const CLOSE_REPLACED = 4001   // a newer /host tab took over
export const CLOSE_BAD_SECRET = 4003 // wrong, missing or late pairing hello

export const MAX_INBOUND_BYTES = 8192
export const COMMAND_TTL_MS = 1500
export const BEAT_MS = 2000
export const STALE_BEAT_MS = 5000

// The iPad greys Next on these gates (spec §8).
export const GREY_GATES = ['locking', 'scoring', 'saving', null]

export const REFUSAL_TEXT = {
  'slide-changed': 'Slide changed — check the screen',
  'gate-changed': 'That button changed — look again',
  'pending-advance': 'That button changed — look again',
  scoring: 'Scoring in progress',
  'saving-scores': 'Saving scores…',
  late: 'Got there late — press again',
  'modal-open': 'Close the panel on the laptop',
  paused: 'Remote paused on the laptop',
  locking: 'Countdown running',
  'lock-blocked': 'This slide can\'t lock yet — check the laptop',
  busy: 'Laptop is busy — wait a second',
  'laptop-offline': 'Open Live Mode on the laptop',
  'unknown-command': 'Update the remote app',
}
export const refusalText = reason => REFUSAL_TEXT[reason] ?? 'The laptop said no — check the laptop'

// iPad -> relay. Returns a clean copy with only the known fields, or null.
export function parseRemoteMessage(raw) {
  let m
  try { m = JSON.parse(String(raw)) } catch { return null }
  if (!m || typeof m !== 'object') return null
  if (m.type === 'hello') return typeof m.secret === 'string' ? { type: 'hello', secret: m.secret } : null
  if (m.type !== 'cmd' || typeof m.id !== 'string' || typeof m.cmd !== 'string') return null
  if (m.id.length > 64 || m.cmd.length > 32) return null
  return {
    type: 'cmd', id: m.id, cmd: m.cmd,
    args: m.args && typeof m.args === 'object' && !Array.isArray(m.args) ? m.args : {},
    expectSlideId: typeof m.expectSlideId === 'string' ? m.expectSlideId : null,
    sentAt: typeof m.sentAt === 'number' ? m.sentAt : null,
  }
}

// The iPad status strip (spec §7). `live` = the buttons may send.
export function remoteStatus({ socket, closeCode, hostConnected, beatAge, visibility }) {
  if (closeCode === CLOSE_BAD_SECRET) return { tone: 'red', live: false, text: 'Pairing code wrong — re-enter it in ⚙' }
  if (socket !== 'open') return { tone: 'red', live: false, text: 'Can’t reach the laptop — check Tailscale' }
  if (!hostConnected) return { tone: 'orange', live: false, text: 'Open Live Mode on the laptop' }
  if (beatAge == null || beatAge > STALE_BEAT_MS) return { tone: 'orange', live: false, text: 'Laptop not responding' }
  if (visibility === 'hidden') return { tone: 'orange', live: true, text: 'Laptop screen hidden — timers slowed, bring /host to the front' }
  return { tone: 'green', live: true, text: 'Laptop connected' }
}
