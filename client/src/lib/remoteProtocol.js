// The iPad remote's wire protocol (docs/superpowers/specs/2026-09-28-ipad-
// remote-design.md §6-§8). Pure and dependency-free: relay/server.mjs,
// LiveMode's useRemoteLink and the /remote page all import this one file, so
// the three can't drift on a port, a close code or a refusal text.
export const HOST_PORT = 8794
export const REMOTE_PORT = 8796
export const HOST_RELAY_URL = `ws://localhost:${HOST_PORT}`
export const DEFAULT_REMOTE_URL = 'wss://macbook-pro.tail13050c.ts.net:8795'

export const CLOSE_REPLACED = 4001   // a newer /host tab took over
export const CLOSE_BAD_SECRET = 4003 // wrong pairing code (the iPad stops retrying)
export const CLOSE_RETRY = 4004      // no hello in time, or a message the relay choked on (the iPad retries)
export const CLOSE_TOO_FAST = 4008   // more than 10 laptop-local commands in a second

// Phase 2b (spec §17). /display joins the relay's local listener on this
// path as the third peer role; only jukebox.* reaches it.
export const DISPLAY_PATH = '/display'
export const DISPLAY_RELAY_URL = `${HOST_RELAY_URL}${DISPLAY_PATH}`
export const DISPLAY_COMMANDS = new Set(['jukebox.open', 'jukebox.exit', 'jukebox.playStop'])
// Run by the relay itself on the laptop (system volume, Duck, soundboard).
export const LOCAL_COMMANDS = new Set(['vol.up', 'vol.down', 'duck', 'sound.play', 'sound.stopAll'])
export const LOCAL_RATE_PER_SEC = 10

// The one default-off switch for the laptop's relay links (/host's chip
// toggle writes it; /display reads it). Private mode or no storage: off.
export const REMOTE_LINK_KEY = 'trivia-os:ipad-remote'
export function readRemoteLinkFlag(storage = globalThis.localStorage) {
  try { return storage?.getItem(REMOTE_LINK_KEY) === '1' } catch { return false }
}

export const MAX_INBOUND_BYTES = 8192
export const COMMAND_TTL_MS = 1500
// The Timer drawer works in 30 second steps, 30 seconds to 3 hours.
export const TIMER_STEP_SECONDS = 30
export const TIMER_MIN_SECONDS = 30
export const TIMER_MAX_SECONDS = 10800
export const TIMER_PRESETS_SECONDS = [30, 60, 120, 180, 300, 600]
// An iPad page cached from before seconds still sends { minutes } (whole, 1 to 180).
export const TIMER_LEGACY_MAX_MINUTES = 180
export const TIMER_ADD_SECONDS = [30, 60]
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
  // Phase 2a: jump, unlock, rescore. The iPad splits on " — " (head, then
  // hint), so no dash ever reaches the screen.
  'bad-target': 'That slide moved — open Jump again',
  'nothing-to-fix': 'No phone question on this slide',
  'nothing-locked': 'Nothing is locked yet',
  'not-locked': 'Answers are not locked yet — press Next to lock them',
  'already-revealed': 'The TV already shows the result — unlock first if you need to redo it',
  'answer-held': 'Bendle shows the answer after step 3 is locked',
  'laptop-only': 'Rescore a horse race on the laptop',
  error: 'Something went wrong on the laptop — check the laptop',
  // Phase 2b: jukebox (through /display), volume, Duck, soundboard.
  'display-offline': 'TV window not linked. Reload /display on the laptop.',
  'jukebox-not-open': 'The jukebox is not up yet — tap Open jukebox now',
  'not-at-break': 'Not at a grading break',
  'unknown-sound': 'That sound is not set up on the laptop',
  'sound-missing': 'That sound file is gone from the laptop',
  'local-failed': 'The laptop would not change that — use the Stream Deck',
  'local-unavailable': 'Volume and sounds are off on this relay — use the Stream Deck',
  // Phase 3: the Scores drawer. No dashes at all in these.
  'changed-underneath': 'That score just changed on the laptop. Check the new number, then try again',
  'no-team': 'That team is not on the scoreboard any more. Open Scores again',
  'bad-column': 'That round is not on the scoreboard any more. Open Scores again',
  'bad-score': 'Scores must be a whole number from -999 to 999',
  'scores-unreadable': 'The laptop could not read the scores. Check its internet, then try again',
  'score-not-saved': 'That score did not save. Check the laptop internet, then try again',
  'save-unconfirmed': 'The laptop could not confirm that save. Open Scores again and check the number',
  'modal-just-closed': 'The score table just closed. Try again in a second.',
  // Timer drawer. No dashes at all in these.
  'timer-running': 'A timer is already running. Use Restart to replace it',
  'timer-changed': 'The timer changed on the laptop. Look again',
  'no-timer': 'No timer is running',
  'bad-minutes': 'Pick a time in 30 second steps, 30 seconds to 3 hours',
  'bad-title': 'Pick Answers due, Break, or no label',
  'bad-add': 'Add 30 seconds or 1 minute',
}
// One line for a score fix, shown on the laptop and written to the relay log.
// Team names come from phones: any newline or other whitespace run becomes one
// space, so a name can't forge a log line.
const clip = (v, n) => String(v ?? '?').replace(/\s+/g, ' ').trim().slice(0, n)
export function scoreChangeText(c) {
  return `iPad set ${clip(c?.team, 60)} ${clip(c?.col, 8)}: ${clip(c?.from, 8)} to ${clip(c?.to, 8)}`
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
  if (closeCode === CLOSE_TOO_FAST && socket !== 'open') return { tone: 'orange', live: false, text: 'Too many taps. Reconnecting.' }
  if (socket !== 'open') return { tone: 'red', live: false, text: 'Can’t reach the laptop — check Tailscale' }
  if (!hostConnected) return { tone: 'orange', live: false, text: 'Open Live Mode on the laptop' }
  if (beatAge == null || beatAge > STALE_BEAT_MS) return { tone: 'orange', live: false, text: 'Laptop not responding' }
  if (visibility === 'hidden') return { tone: 'orange', live: true, text: 'Laptop screen hidden — timers slowed, bring /host to the front' }
  return { tone: 'green', live: true, text: 'Laptop connected' }
}

// Jukebox mode on the iPad (spec §17.2): only while the laptop is on a
// grading-break slide. `jukebox` is the relay's {type:'jukebox'} message.
export function jukeboxView({ snap, jukebox }) {
  if (snap?.slide?.type !== 'grading-break') return null
  if (!jukebox?.linked) return { phase: 'unlinked' }
  if (jukebox.open) return { phase: 'open', playing: !!jukebox.playing, handoffPending: !!jukebox.handoffPending }
  return { phase: jukebox.waiting ? 'waiting' : 'opening' }
}
