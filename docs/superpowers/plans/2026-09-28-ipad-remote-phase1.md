# iPad Host Remote — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ben's iPad drives Live Mode's Next / Prev / Answer / Scoreboard / Phone-scores through a tiny laptop relay, while the laptop's `/host` tab stays the only engine.

**Architecture:** `relay/server.mjs` (bare `node:http` + `ws`) listens on 127.0.0.1:8794 (host) and 127.0.0.1:8796 (remote, exposed by `tailscale serve` as wss :8795). `/host` Live Mode opens `ws://localhost:8794` **only when a localStorage switch is on**, answers commands through the existing `runHostCommandRef` → `planHostCommand`, and sends throttled state snapshots. `/remote` is a plain SPA route (iPad home-screen app) that pairs with a secret and sends commands.

**Tech Stack:** React 18 + Vite + Tailwind 3, vitest 4 (node env), Node 24, `ws` 8 (relay only).

**Spec:** `docs/superpowers/specs/2026-09-28-ipad-remote-design.md` (v4, binding).

## Global Constraints

- The laptop `/host` Live Mode is the only engine. The iPad never touches Supabase.
- Default OFF: with the laptop switch off, `/host` opens no socket and behaves exactly as before.
- `relay/` is the one place plain Node + `ws` is allowed. No Express, no Socket.io. `relay/` is never imported by `client/`; `relay/` may import pure modules from `client/src/lib/`.
- No Supabase writes, no migrations, no live-show testing. Only project `qwtbgusqfoypvehnungr` may ever be touched (none is, in phase 1).
- Keyboard KeyA/S/R stay toggles; only `via:'remote'` uses end-state `{value}`.
- Do not touch: ring-world files, `references/fact-hunt/*`, `FACT-HUNT-*`, `BiggestClimbersSlide.jsx`, `roundClimbers*`, `WinnerRevealSlide.jsx`, `podium*`, registrations in SlideRenderer/AddSlideWizard/RoundSidebar/BuildMode/Join. `Host.jsx` carries another session's uncommitted edit inside `slidePickerLabel`, so it is **not** edited: the lib copy is made and the Host.jsx swap waits.
- Never `git add -A`, stash, checkout, reset. No commit/push/deploy in this run (commit steps below are for Ben, listed with explicit paths).
- Fonts: Boogaloo + DM Sans only.
- Ports 8794 (host) / 8796 (remote listener) / 8795 (tailscale serve https). Origin allowlist `https://trivia-os.vercel.app`; `http://localhost:5173` only with `RELAY_DEV=1`, refused under launchd (`XPC_SERVICE_NAME` set and not `"0"` — Terminal shells set it to `"0"`).
- Close codes: 4001 replaced host, 4003 bad/late/missing hello. iPad inbound cap 8192 bytes. Command TTL 1500ms on laptop time. `relay-beat` every 2000ms; stale after 5000ms.

## File map

| File | Responsibility |
|---|---|
| `client/src/lib/remoteProtocol.js` (new) | constants, refusal text, iPad-message validation, iPad status strip text |
| `client/src/lib/nextPressCue.js` (modify) | `nextPressGate` → `{label, gate}`; `nextPressCue` wraps it |
| `client/src/lib/hostCommands.js` (modify) | `via:'remote'` path |
| `client/src/lib/slidePickerLabel.js` (new) | one label function for snapshot / Up Next |
| `client/src/lib/remoteSnapshot.js` (new) | `buildSnapshot`, `hostReply`, `makeSnapshotSender`, `hostChipText` |
| `client/src/hooks/useRemoteLink.js` (new) | laptop socket |
| `client/src/components/host/LiveMode.jsx` (modify) | wiring + chip card |
| `client/src/views/Remote.jsx` (new), `client/src/App.jsx` (route), `public/remote-manifest.json` (new) | iPad page |
| `relay/package.json`, `relay/server.mjs`, `relay/stub-host.mjs`, `relay/server.test.mjs`, `relay/e2e.test.mjs`, `relay/ops/com.baynes.trivia-relay.plist` (new) | relay |
| `vitest.config.js`, root `package.json` (modify) | include relay tests; `relay` / `relay:serve` scripts |
| `SKILL.md` Rule 4, `CLAUDE.md` Key Rules (modify) | scoped exception note |

---

### Task 1: Protocol module

**Files:** Create `client/src/lib/remoteProtocol.js`, Test `client/src/lib/remoteProtocol.test.js`

**Interfaces — Produces:** `HOST_PORT, REMOTE_PORT, HOST_RELAY_URL, DEFAULT_REMOTE_URL, CLOSE_REPLACED, CLOSE_BAD_SECRET, MAX_INBOUND_BYTES, COMMAND_TTL_MS, BEAT_MS, STALE_BEAT_MS, GREY_GATES, REFUSAL_TEXT, refusalText(reason)→string, parseRemoteMessage(raw)→{type:'hello',secret}|{type:'cmd',id,cmd,args,expectSlideId,sentAt}|null, remoteStatus({socket,closeCode,hostConnected,beatAge,visibility})→{tone,text,live}`

- [ ] **Step 1: failing test**

```js
import { describe, it, expect } from 'vitest'
import { parseRemoteMessage, refusalText, remoteStatus, CLOSE_BAD_SECRET, GREY_GATES } from './remoteProtocol.js'

describe('parseRemoteMessage', () => {
  it('accepts a hello with a string secret only', () => {
    expect(parseRemoteMessage('{"type":"hello","secret":"ABC"}')).toEqual({ type: 'hello', secret: 'ABC' })
    expect(parseRemoteMessage('{"type":"hello","secret":42}')).toBe(null)
  })
  it('rejects junk without throwing', () => {
    for (const raw of ['', 'nope', 'null', '[]', '42', '{"type":"cmd"}']) expect(parseRemoteMessage(raw)).toBe(null)
  })
  it('keeps only the known cmd fields', () => {
    expect(parseRemoteMessage(JSON.stringify({ type: 'cmd', id: '1', cmd: 'next', args: { expectGate: 'advance' }, expectSlideId: 's1', sentAt: 5, extra: 'x' })))
      .toEqual({ type: 'cmd', id: '1', cmd: 'next', args: { expectGate: 'advance' }, expectSlideId: 's1', sentAt: 5 })
    expect(parseRemoteMessage(JSON.stringify({ type: 'cmd', id: '1', cmd: 'next', args: [1] })))
      .toEqual({ type: 'cmd', id: '1', cmd: 'next', args: {}, expectSlideId: null, sentAt: null })
  })
  it('caps id and cmd length', () => {
    expect(parseRemoteMessage(JSON.stringify({ type: 'cmd', id: 'x'.repeat(65), cmd: 'next' }))).toBe(null)
  })
})

describe('refusalText', () => {
  it('plain English for every built reason, fallback for unknown', () => {
    for (const r of ['slide-changed', 'gate-changed', 'pending-advance', 'scoring', 'late', 'modal-open', 'paused', 'locking', 'busy', 'laptop-offline', 'unknown-command']) {
      expect(refusalText(r)).toMatch(/\w/)
    }
    expect(refusalText('pending-advance')).toBe(refusalText('gate-changed'))
    expect(refusalText('weird')).toMatch(/laptop/)
  })
})

describe('remoteStatus', () => {
  const ok = { socket: 'open', closeCode: null, hostConnected: true, beatAge: 100, visibility: 'visible' }
  it('green when everything is live', () => expect(remoteStatus(ok)).toMatchObject({ tone: 'green', live: true }))
  it('red on a pairing refusal, even with the socket closed', () =>
    expect(remoteStatus({ ...ok, socket: 'closed', closeCode: CLOSE_BAD_SECRET }).text).toMatch(/Pairing code wrong/))
  it('red when the relay is unreachable', () => expect(remoteStatus({ ...ok, socket: 'closed' })).toMatchObject({ tone: 'red', live: false }))
  it('orange stale when the host is gone', () => expect(remoteStatus({ ...ok, hostConnected: false })).toMatchObject({ tone: 'orange', live: false, text: 'Open Live Mode on the laptop' }))
  it('orange not responding past 5s or before any beat', () => {
    expect(remoteStatus({ ...ok, beatAge: 5001 }).text).toBe('Laptop not responding')
    expect(remoteStatus({ ...ok, beatAge: null }).live).toBe(false)
  })
  it('orange but still live when the laptop tab is hidden', () =>
    expect(remoteStatus({ ...ok, visibility: 'hidden' })).toMatchObject({ tone: 'orange', live: true }))
  it('greys Next on locking/scoring/saving/null', () => expect(GREY_GATES).toEqual(['locking', 'scoring', 'saving', null]))
})
```

- [ ] **Step 2:** `npx vitest run client/src/lib/remoteProtocol.test.js` — expect FAIL (module missing).
- [ ] **Step 3: implement**

```js
// The iPad remote's wire protocol (spec §6-§8). Pure and dependency-free:
// relay/server.mjs, LiveMode's useRemoteLink and the /remote page all import
// this one file, so the three can't drift on a port, a close code or a text.
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
  busy: 'Laptop is busy — wait a second',
  'laptop-offline': 'Open Live Mode on the laptop',
  'unknown-command': 'Update the remote app',
}
export const refusalText = reason => REFUSAL_TEXT[reason] ?? 'The laptop said no — check the laptop'

// iPad -> relay. Returns a clean copy with only known fields, or null.
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

// The iPad status strip (spec §7). `live` = buttons may send.
export function remoteStatus({ socket, closeCode, hostConnected, beatAge, visibility }) {
  if (closeCode === CLOSE_BAD_SECRET) return { tone: 'red', live: false, text: 'Pairing code wrong — re-enter it in ⚙' }
  if (socket !== 'open') return { tone: 'red', live: false, text: 'Can’t reach the laptop — check Tailscale' }
  if (!hostConnected) return { tone: 'orange', live: false, text: 'Open Live Mode on the laptop' }
  if (beatAge == null || beatAge > STALE_BEAT_MS) return { tone: 'orange', live: false, text: 'Laptop not responding' }
  if (visibility === 'hidden') return { tone: 'orange', live: true, text: 'Laptop screen hidden — timers slowed, bring /host to the front' }
  return { tone: 'green', live: true, text: 'Laptop connected' }
}
```

- [ ] **Step 4:** re-run — PASS.
- [ ] **Step 5 (Ben):** `git add client/src/lib/remoteProtocol.js client/src/lib/remoteProtocol.test.js && git commit -m "feat(remote): shared wire protocol"`

---

### Task 2: `nextPressGate` — label + machine gate from one call

**Files:** Modify `client/src/lib/nextPressCue.js`, `client/src/lib/nextPressCue.test.js`

**Interfaces — Produces:** `nextPressGate({slide,nextSlide,audioPending,scoringBusy,saving})→{label:string|null, gate:'lock'|'locking'|'scoring'|'saving'|'audio'|'walkout'|'reveal-part'|'reveal-owed'|'advance'|null}`; `nextPressCue(p)` = `nextPressGate(p).label`.

- [ ] **Step 1: failing tests** — change the existing wager expectation to `'Lock wagers'` (spec §8 fix) and add:

```js
describe('nextPressGate', () => {
  const wager = (data = {}) => s('question', { isShiny: true, shinyInputSchema: { type: 'wager' }, ...data })
  const g = p => nextPressGate({ nextSlide: s('question'), ...p })
  it('one gate per cue branch', () => {
    expect(g({ slide: wager(), scoringBusy: true })).toEqual({ label: 'Scoring…', gate: 'scoring' })
    expect(g({ slide: s('question'), saving: true })).toEqual({ label: 'Saving scores…', gate: 'saving' })
    expect(g({ slide: wager() })).toEqual({ label: 'Lock wagers', gate: 'lock' })
    expect(g({ slide: wager({ wagerTiersLocked: true }) })).toEqual({ label: 'Lock answers', gate: 'lock' })
    expect(g({ slide: wager({ lockCountdownStartedAt: 1 }) })).toEqual({ label: 'Locking…', gate: 'locking' })
    expect(g({ slide: wager({ wagerTiersLocked: true, wagerGuessesLocked: true }) })).toEqual({ label: 'Press Answer to reveal', gate: 'reveal-owed' })
    expect(g({ slide: s('question'), audioPending: true })).toEqual({ label: 'Play clip', gate: 'audio' })
    expect(g({ slide: s('pre-show', { walkoutSong: { trigger: 'invoke', videoId: 'v' } }) })).toEqual({ label: 'Play walkout song', gate: 'walkout' })
    expect(g({ slide: s('question', { parts: [{}, {}] }) })).toEqual({ label: 'Reveal 2 of 2', gate: 'reveal-part' })
    expect(g({ slide: s('question') })).toEqual({ label: 'Show question', gate: 'advance' })
    expect(nextPressGate({ slide: s('winner-reveal'), nextSlide: null })).toEqual({ label: null, gate: null })
  })
  it('a revealed phone question just advances', () => {
    expect(g({ slide: wager({ wagerTiersLocked: true, wagerGuessesLocked: true, wagerRevealed: true }) }).gate).toBe('advance')
  })
  it('an already-invoked walkout song advances', () => {
    expect(g({ slide: s('pre-show', { walkoutSong: { trigger: 'invoke', videoId: 'v', invoked: true } }) }).gate).toBe('advance')
  })
})
```

(import line becomes `import { nextPressCue, nextPressGate } from './nextPressCue.js'`)

- [ ] **Step 2:** `npx vitest run client/src/lib/nextPressCue.test.js` — FAIL (`nextPressGate` not exported, wager label).
- [ ] **Step 3: implement** (replace the exported function):

```js
import { pendingLockPhase, pendingReveal, revealStepCount } from './slideStepping.js'
// ...landingLabel unchanged...
export function nextPressGate({ slide, nextSlide, audioPending = false, scoringBusy = false, saving = false }) {
  if (scoringBusy) return { label: 'Scoring…', gate: 'scoring' }
  if (saving) return { label: 'Saving scores…', gate: 'saving' }
  const d = slide?.data
  const phase = slide ? pendingLockPhase(slide) : null
  if (phase) {
    if (d?.lockCountdownStartedAt) return { label: 'Locking…', gate: 'locking' }
    return { label: phase === 'wager-tiers' ? 'Lock wagers' : 'Lock answers', gate: 'lock' }
  }
  if (pendingReveal(slide)) return { label: 'Press Answer to reveal', gate: 'reveal-owed' }
  if (audioPending) return { label: 'Play clip', gate: 'audio' }
  const w = d?.walkoutSong
  if (w?.trigger === 'invoke' && w.videoId && !w.invoked) return { label: 'Play walkout song', gate: 'walkout' }
  const steps = revealStepCount(d)
  if (Array.isArray(d?.parts) && steps > 1) {
    const cur = d.currentPart ?? 0
    if (cur < steps - 1) return { label: `Reveal ${cur + 2} of ${steps}`, gate: 'reveal-part' }
  }
  const label = landingLabel(nextSlide)
  return label ? { label, gate: 'advance' } : { label: null, gate: null }
}
export function nextPressCue(p) { return nextPressGate(p).label }
```

- [ ] **Step 4:** re-run — PASS.
- [ ] **Step 5 (Ben):** `git add client/src/lib/nextPressCue.js client/src/lib/nextPressCue.test.js && git commit -m "feat(remote): nextPressGate — one call gives the cue and the gate"`

---

### Task 3: `planHostCommand` remote path

**Files:** Modify `client/src/lib/hostCommands.js`, `client/src/lib/hostCommands.test.js`

**Interfaces — Consumes:** `COMMAND_TTL_MS` (Task 1). **Produces:** `planHostCommand({cmd, via, args, expectSlideId, sentAt}, ctx)` where remote ctx adds `now, paused, remoteBusy, slideId, gate, phoneRevealed`; new run step `'noop'`; new refusals `late, paused, busy, slide-changed, gate-changed`.

Check order for `via:'remote'` (spec §5): late → paused → busy (next/prev) → modal-open → slide-changed (next/prev/answer) → per command (next: pending-advance → gate-changed → keyboard order; answer: scoring → end-state) → unknown-command.

- [ ] **Step 1: failing tests** (append to `hostCommands.test.js`):

```js
describe('via remote', () => {
  const NOW = 10_000
  const live = { ...idle, now: NOW, paused: false, remoteBusy: false, slideId: 's1', gate: 'advance', phoneRevealed: false }
  const r = (cmd, args = {}, ctx = {}, env = {}) =>
    planHostCommand({ cmd, via: 'remote', args, expectSlideId: 's1', sentAt: NOW - 10, ...env }, { ...live, ...ctx })

  it('drops a command older than 1500ms on laptop time, or with no sentAt', () => {
    expect(r('next', { expectGate: 'advance' }, {}, { sentAt: NOW - 1501 })).toEqual({ refuse: 'late' })
    expect(r('next', { expectGate: 'advance' }, {}, { sentAt: null })).toEqual({ refuse: 'late' })
    expect(r('next', { expectGate: 'advance' }, {}, { sentAt: NOW - 1500 })).toEqual({ run: 'next' })
  })
  it('late beats paused beats busy beats modal', () => {
    expect(r('next', {}, { paused: true, remoteBusy: true, modalOpen: true }, { sentAt: 0 })).toEqual({ refuse: 'late' })
    expect(r('next', {}, { paused: true, remoteBusy: true, modalOpen: true })).toEqual({ refuse: 'paused' })
    expect(r('next', {}, { remoteBusy: true, modalOpen: true })).toEqual({ refuse: 'busy' })
    expect(r('next', {}, { modalOpen: true })).toEqual({ refuse: 'modal-open' })
  })
  it('paused refuses every command, toggles too', () => {
    expect(r('scoreboard', { value: true }, { paused: true })).toEqual({ refuse: 'paused' })
  })
  it('busy is checked BEFORE the lock phase (handleLockWagers phantom countdown)', () => {
    // tiers just written optimistically: pendingLockPhase says wager-guesses,
    // wagerBusy is still true. The keyboard would start a countdown here.
    const ctx = { remoteBusy: true, lockPhase: 'wager-guesses', gate: 'scoring' }
    expect(r('next', { expectGate: 'lock' }, ctx)).toEqual({ refuse: 'busy' })
    expect(planHostCommand({ cmd: 'next' }, { ...idle, lockPhase: 'wager-guesses', scoringBlocked: true }))
      .toEqual({ run: 'start-lock-countdown', phase: 'wager-guesses' }) // keyboard: pre-existing, left alone
  })
  it('duplicate tap during the countdown is refused as busy, not a second countdown', () => {
    expect(r('next', { expectGate: 'lock' }, { remoteBusy: true, lockPhase: 'order', lockCountdownRunning: true, gate: 'locking' }))
      .toEqual({ refuse: 'busy' })
  })
  it('busy does not gate toggles', () => {
    expect(r('scoreboard', { value: true }, { remoteBusy: true })).toEqual({ run: 'set-scoreboard-visible', value: true })
  })
  it('slide-changed for next, prev and answer', () => {
    for (const cmd of ['next', 'prev', 'answer']) {
      expect(r(cmd, { expectGate: 'advance', value: true }, {}, { expectSlideId: 'old' })).toEqual({ refuse: 'slide-changed' })
    }
    expect(r('scoreboard', { value: true }, {}, { expectSlideId: 'old' })).toEqual({ run: 'set-scoreboard-visible', value: true })
  })
  it('gate-changed when the gate moved, on reveal-owed and on null', () => {
    expect(r('next', { expectGate: 'audio' }, { gate: 'advance' })).toEqual({ refuse: 'gate-changed' })
    expect(r('next', { expectGate: 'reveal-owed' }, { gate: 'reveal-owed' })).toEqual({ refuse: 'gate-changed' })
    expect(r('next', { expectGate: null }, { gate: null })).toEqual({ refuse: 'gate-changed' })
  })
  it('pending-advance comes before the gate check', () => {
    expect(r('next', { expectGate: 'x' }, { pendingAdvance: true })).toEqual({ refuse: 'pending-advance' })
  })
  it('matching gate runs the keyboard path (incl. answer-hide dance)', () => {
    expect(r('next', { expectGate: 'lock' }, { gate: 'lock', lockPhase: 'order' })).toEqual({ run: 'start-lock-countdown', phase: 'order' })
    expect(r('next', { expectGate: 'audio' }, { gate: 'audio', audioPending: true })).toEqual({ run: 'play-audio' })
    expect(r('next', { expectGate: 'advance' }, { answerReveal: true })).toEqual({ run: 'hide-answer-then-next' })
  })
  it('prev cancels a pending advance like ArrowLeft', () => {
    expect(r('prev')).toEqual({ run: 'prev', cancelPending: true })
  })
  it('answer is end-state: reveal first, then no-op if already revealed, then set', () => {
    expect(r('answer', { value: true }, { revealPending: true })).toEqual({ run: 'reveal-slide' })
    expect(r('answer', { value: true }, { phoneRevealed: true })).toEqual({ run: 'noop' })
    expect(r('answer', { value: true })).toEqual({ run: 'set-answer-reveal', value: true })
    expect(r('answer', { value: true }, { answerReveal: true })).toEqual({ run: 'noop' })
    expect(r('answer', { value: false }, { answerReveal: true })).toEqual({ run: 'set-answer-reveal', value: false })
    expect(r('answer', { value: true }, { scoringBusy: true })).toEqual({ refuse: 'scoring' })
  })
  it('scoreboard / scores-reveal are end-state no-ops when they already match', () => {
    expect(r('scoreboard', { value: true }, { scoreboardVisible: true })).toEqual({ run: 'noop' })
    expect(r('scores-reveal', { value: true })).toEqual({ run: 'set-scores-revealed', value: true })
    expect(r('scores-reveal', { value: false })).toEqual({ run: 'noop' })
  })
  it('keyboard A/S/R stay toggles', () => {
    expect(plan({ cmd: 'scoreboard' }, { scoreboardVisible: true })).toEqual({ run: 'set-scoreboard-visible', value: false })
  })
  it('unknown commands (jump is phase 2)', () => {
    expect(r('jump', { index: 3 })).toEqual({ refuse: 'unknown-command' })
  })
})
```

- [ ] **Step 2:** `npx vitest run client/src/lib/hostCommands.test.js` — FAIL.
- [ ] **Step 3: implement** (`hostCommands.js` in full):

```js
import { COMMAND_TTL_MS } from './remoteProtocol.js'

// Commands whose meaning depends on which slide the sender was looking at.
const SLIDE_BOUND = new Set(['next', 'prev', 'answer'])
const setTo = (run, value, current) => (value === current ? { run: 'noop' } : { run, value })

export function planHostCommand({ cmd, via, args = {}, expectSlideId = null, sentAt = null }, ctx) {
  const button = via === 'button'
  const remote = via === 'remote'
  if (remote) {
    if (typeof sentAt !== 'number' || ctx.now - sentAt > COMMAND_TTL_MS) return { refuse: 'late' }
    if (ctx.paused) return { refuse: 'paused' }
    // Before the lock-phase check on purpose (spec §5 step 3).
    if ((cmd === 'next' || cmd === 'prev') && ctx.remoteBusy) return { refuse: 'busy' }
  }
  if (!button && ctx.modalOpen) return { refuse: 'modal-open' }
  if (remote && SLIDE_BOUND.has(cmd) && expectSlideId !== ctx.slideId) return { refuse: 'slide-changed' }
  switch (cmd) {
    case 'next':
      if (ctx.pendingAdvance) return { refuse: 'pending-advance' }
      if (remote && (ctx.gate == null || ctx.gate === 'reveal-owed' || args.expectGate !== ctx.gate)) {
        return { refuse: 'gate-changed' }
      }
      if (ctx.lockPhase) {
        return ctx.lockCountdownRunning
          ? { refuse: 'locking' }
          : { run: 'start-lock-countdown', phase: ctx.lockPhase }
      }
      if (ctx.scoringBlocked) return { refuse: 'scoring' }
      if (ctx.audioPending) return { run: 'play-audio' }
      if (!button && ctx.answerReveal) return { run: 'hide-answer-then-next' }
      return { run: 'next' }
    case 'prev':
      return { run: 'prev', cancelPending: !button }
    case 'answer': {
      if (ctx.scoringBusy) return { refuse: 'scoring' }
      if (!remote) {
        if (ctx.revealPending) return { run: 'reveal-slide' }
        return { run: 'set-answer-reveal', value: !ctx.answerReveal }
      }
      const value = args.value === true
      if (value && ctx.revealPending) return { run: 'reveal-slide' }
      if (value && ctx.phoneRevealed) return { run: 'noop' }
      return setTo('set-answer-reveal', value, ctx.answerReveal)
    }
    case 'scoreboard':
      return remote
        ? setTo('set-scoreboard-visible', args.value === true, ctx.scoreboardVisible)
        : { run: 'set-scoreboard-visible', value: !ctx.scoreboardVisible }
    case 'scores-reveal':
      return remote
        ? setTo('set-scores-revealed', args.value === true, ctx.scoresRevealed)
        : { run: 'set-scores-revealed', value: !ctx.scoresRevealed }
    default:
      return { refuse: 'unknown-command' }
  }
}
```

- [ ] **Step 4:** re-run — PASS (old keyboard/button tests unchanged and green).
- [ ] **Step 5 (Ben):** `git add client/src/lib/hostCommands.js client/src/lib/hostCommands.test.js && git commit -m "feat(remote): planHostCommand via:'remote'"`

---

### Task 4: Snapshot, host reply, throttled sender, chip text

**Files:** Create `client/src/lib/slidePickerLabel.js`, `client/src/lib/remoteSnapshot.js`, Test `client/src/lib/remoteSnapshot.test.js`

**Interfaces — Consumes:** `nextPressGate` result shape (Task 2). **Produces:** `slidePickerLabel(slide)→string`; `buildSnapshot({slides,index,showState,cue,busy,paused})→state msg`; `hostReply(msg,{run,now,visibility})→reply|null`; `makeSnapshotSender(transmit,{gapMs,now,later})→{offer(body),reset()}`; `hostChipText({enabled,status,remotes,paused})→string`.

- [ ] **Step 1: failing test**

```js
import { describe, it, expect, vi } from 'vitest'
import { buildSnapshot, hostReply, makeSnapshotSender, hostChipText } from './remoteSnapshot.js'

const slides = [
  { id: 'a', type: 'round-intro', data: { roundTitle: 'Movies' } },
  { id: 'b', type: 'question', data: { questionNumber: 1 } },
  { id: 'c', type: 'question', data: { questionLabel: 'Q2' } },
  { id: 'd', type: 'grading-break', data: {} },
]

describe('buildSnapshot', () => {
  it('slide, cue/gate from one object, 2-slide Up Next, toggles, busy, paused', () => {
    const snap = buildSnapshot({ slides, index: 0, showState: { answerReveal: true }, cue: { label: 'Show question 1', gate: 'advance' }, busy: false, paused: true })
    expect(snap).toEqual({
      type: 'state',
      slide: { index: 0, total: 4, id: 'a', label: 'Movies', type: 'round-intro' },
      cue: 'Show question 1', gate: 'advance',
      upNext: [{ label: 'Q1', type: 'question' }, { label: 'Q2', type: 'question' }],
      toggles: { answerReveal: true, scoreboardVisible: false, scoresRevealed: false },
      busy: false, paused: true,
    })
  })
  it('Up Next shrinks at the end, slide null past the end', () => {
    expect(buildSnapshot({ slides, index: 3, showState: {}, cue: { label: null, gate: null } }).upNext).toEqual([])
    expect(buildSnapshot({ slides: [], index: 0, showState: {}, cue: { label: null, gate: null } }).slide).toBe(null)
  })
})

describe('hostReply', () => {
  it('answers relay-beat with laptop time and visibility', () => {
    expect(hostReply({ type: 'relay-beat' }, { run: vi.fn(), now: 42, visibility: 'hidden' }))
      .toEqual({ type: 'beat', laptopNow: 42, visibility: 'hidden' })
  })
  it('runs a cmd as via:remote and reports received or refused', () => {
    const run = vi.fn(() => ({ ok: true }))
    const msg = { type: 'cmd', id: '7', cmd: 'next', args: { expectGate: 'advance' }, expectSlideId: 's', sentAt: 1 }
    expect(hostReply(msg, { run, now: 2, visibility: 'visible' })).toEqual({ type: 'result', id: '7', received: true })
    expect(run).toHaveBeenCalledWith({ cmd: 'next', via: 'remote', args: { expectGate: 'advance' }, expectSlideId: 's', sentAt: 1 })
    expect(hostReply(msg, { run: () => ({ refuse: 'busy' }) })).toEqual({ type: 'result', id: '7', refused: 'busy' })
  })
  it('a throwing command is refused, never crashes the socket handler', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(hostReply({ type: 'cmd', id: '1', cmd: 'next' }, { run: () => { throw new Error('x') } }))
      .toEqual({ type: 'result', id: '1', refused: 'error' })
    spy.mockRestore()
  })
  it('ignores anything else', () => expect(hostReply({ type: 'weird' }, { run: vi.fn() })).toBe(null))
})

describe('makeSnapshotSender', () => {
  it('sends only when changed, at most once per gap, latest body wins', () => {
    vi.useFakeTimers()
    const sent = []
    const s = makeSnapshotSender(b => sent.push(b), { gapMs: 150, now: () => Date.now(), later: setTimeout })
    s.offer('A'); s.offer('A')
    expect(sent).toEqual(['A'])
    s.offer('B'); s.offer('C')
    expect(sent).toEqual(['A'])
    vi.advanceTimersByTime(150)
    expect(sent).toEqual(['A', 'C'])
    vi.useRealTimers()
  })
  it('reset() makes the same body go out again (socket re-open, relay restart)', () => {
    const sent = []
    const s = makeSnapshotSender(b => sent.push(b), { gapMs: 0 })
    s.offer('A'); s.offer('A'); s.reset(); s.offer('A')
    expect(sent).toEqual(['A', 'A'])
  })
})

describe('hostChipText', () => {
  it('plain-English states', () => {
    expect(hostChipText({ enabled: false })).toBe('iPad remote: off')
    expect(hostChipText({ enabled: true, status: 'connecting' })).toBe('iPad remote: connecting…')
    expect(hostChipText({ enabled: true, status: 'down' })).toMatch(/relay not running, or Chrome blocked local network access/)
    expect(hostChipText({ enabled: true, status: 'replaced' })).toBe('Another /host tab took over the iPad remote')
    expect(hostChipText({ enabled: true, status: 'open', remotes: 0 })).toBe('iPad remote: no iPad')
    expect(hostChipText({ enabled: true, status: 'open', remotes: 1 })).toBe('iPad remote: connected')
    expect(hostChipText({ enabled: true, status: 'open', remotes: 1, paused: true })).toBe('iPad remote: paused')
  })
})
```

- [ ] **Step 2:** `npx vitest run client/src/lib/remoteSnapshot.test.js` — FAIL.
- [ ] **Step 3: implement**

`client/src/lib/slidePickerLabel.js` — a verbatim copy of `slidePickerLabel` from `client/src/views/Host.jsx:350-369`, exported. (Host.jsx switches to the import once the other session's uncommitted edit there is committed.)

`client/src/lib/remoteSnapshot.js`:

```js
import { slidePickerLabel } from './slidePickerLabel.js'

export function buildSnapshot({ slides, index, showState, cue, busy = false, paused = false }) {
  const slide = slides[index] ?? null
  return {
    type: 'state',
    slide: slide ? { index, total: slides.length, id: slide.id, label: slidePickerLabel(slide), type: slide.type } : null,
    cue: cue.label, gate: cue.gate,
    upNext: slides.slice(index + 1, index + 3).map(s => ({ label: slidePickerLabel(s), type: s.type })),
    toggles: {
      answerReveal: !!showState.answerReveal,
      scoreboardVisible: !!showState.scoreboardVisible,
      scoresRevealed: !!showState.scoresRevealed,
    },
    busy, paused,
  }
}

export function hostReply(msg, { run, now, visibility }) {
  if (msg?.type === 'relay-beat') return { type: 'beat', laptopNow: now, visibility }
  if (msg?.type !== 'cmd') return null
  let res
  try {
    res = run({ cmd: msg.cmd, via: 'remote', args: msg.args ?? {}, expectSlideId: msg.expectSlideId ?? null, sentAt: msg.sentAt ?? null })
  } catch (e) {
    console.error('[remote] command threw', e)
    res = { refuse: 'error' }
  }
  return res?.refuse ? { type: 'result', id: msg.id, refused: res.refuse } : { type: 'result', id: msg.id, received: true }
}

export function makeSnapshotSender(transmit, { gapMs = 150, now = Date.now, later = setTimeout } = {}) {
  let last = null
  let lastAt = -Infinity
  let timer = null
  let pending = null
  function offer(body) {
    pending = body
    if (timer) return
    const wait = lastAt + gapMs - now()
    if (wait > 0) {
      timer = later(() => { timer = null; offer(pending) }, wait)
      return
    }
    if (body === last) return
    // transmit returns false when it couldn't send (socket not open yet):
    // not counted, so the snapshot goes out the moment the socket opens.
    if (transmit(body) === false) return
    last = body
    lastAt = now()
  }
  return { offer, reset() { last = null } }
}

export function hostChipText({ enabled, status, remotes = 0, paused = false }) {
  if (!enabled) return 'iPad remote: off'
  if (status === 'replaced') return 'Another /host tab took over the iPad remote'
  if (status === 'connecting') return 'iPad remote: connecting…'
  if (status !== 'open') return 'iPad remote: relay not running, or Chrome blocked local network access for this site (Site settings)'
  if (paused) return 'iPad remote: paused'
  return remotes > 0 ? 'iPad remote: connected' : 'iPad remote: no iPad'
}
```

- [ ] **Step 4:** re-run — PASS.
- [ ] **Step 5 (Ben):** `git add client/src/lib/slidePickerLabel.js client/src/lib/remoteSnapshot.js client/src/lib/remoteSnapshot.test.js && git commit -m "feat(remote): snapshot + host reply + throttled sender"`

---

### Task 5: Relay

**Files:** Create `relay/package.json` (`{ "type":"module", "dependencies": { "ws": "^8.18.0" }, "scripts": { "start": "node server.mjs" } }`), `relay/server.mjs`, `relay/server.test.mjs`; Modify `vitest.config.js` (`include` adds `'relay/**/*.test.mjs'`), root `package.json` scripts (`"relay": "npm --prefix relay start --"`, `"relay:serve": "tailscale serve --bg --https=8795 http://127.0.0.1:8796"`).

**Interfaces — Consumes:** Task 1 constants + `parseRemoteMessage`. **Produces:** `createRelay({hostPort,remotePort,secretFile,dev,helloMs,beatMs,pingMs,log})→{start()→Promise<{hostPort,remotePort}>, close()→Promise}`; `initSecret(file,{force})→secret`; `newSecret()`; `secretMatches(a,b)`; `PROD_ORIGIN`, `DEV_ORIGIN`, `DEFAULT_SECRET_FILE`.

- [ ] **Step 0:** `npm --prefix relay install`; add the vitest include.
- [ ] **Step 1: failing tests** — `relay/server.test.mjs` (real `ws` server on ephemeral ports, a temp secret file). Cases: pairs + replays host status; wrong secret 4003; wrong-length secret 4003 then a good pairing still works; non-JSON and non-string secret 4003; silent socket 4003 after `helloMs`; secret file re-read per hello (rotation); foreign origin 403 on both listeners, dev origin only with `dev:true`; >8KB inbound closes 1009; `laptop-offline` with no host; cmd forwarded to host and result back; second host kicks the first with 4001 and only the new one receives cmds; host close pushes `{host,connected:false}` and the cached state replays on the next hello; `relay-beat` to host and iPads, host `beat` forwarded; host gets `{type:'remotes', count}`; `initSecret` writes 26 base32 chars mode 0600, refuses to overwrite without `force`. (Full code: see the file — it is the test this task runs.)
- [ ] **Step 2:** `npx vitest run relay/server.test.mjs` — FAIL (module missing).
- [ ] **Step 3: implement `relay/server.mjs`**

```js
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
export const newSecret = () => Array.from(crypto.randomBytes(26), b => B32[b & 31]).join('')

const digest = s => crypto.createHash('sha256').update(String(s)).digest()
export const secretMatches = (given, expected) => !!expected && crypto.timingSafeEqual(digest(given), digest(expected))

export function initSecret(file = DEFAULT_SECRET_FILE, { force = false } = {}) {
  if (fs.existsSync(file) && !force) throw new Error(`${file} already exists — pass --force to replace it (every paired iPad must re-enter the new code)`)
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
  const secret = newSecret()
  fs.writeFileSync(file, secret + '\n', { mode: 0o600 })
  fs.chmodSync(file, 0o600)
  return secret
}

export function createRelay({
  hostPort = HOST_PORT, remotePort = REMOTE_PORT, secretFile = DEFAULT_SECRET_FILE,
  dev = false, helloMs = 3000, beatMs = BEAT_MS, pingMs = 10000, log = console,
} = {}) {
  const origins = new Set([PROD_ORIGIN, ...(dev ? [DEV_ORIGIN] : [])])
  const hostWss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 })
  const remoteWss = new WebSocketServer({ noServer: true, maxPayload: MAX_INBOUND_BYTES })
  const paired = new Set()
  let host = null
  let lastState = null

  const send = (ws, msg) => { if (ws?.readyState === 1) ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg)) }
  const toRemotes = msg => { const s = typeof msg === 'string' ? msg : JSON.stringify(msg); for (const r of paired) send(r, s) }
  const tellHostCount = () => send(host, { type: 'remotes', count: paired.size })
  const readSecret = () => {
    try { return fs.readFileSync(secretFile, 'utf8').trim() } catch { log.error(`[relay] no secret at ${secretFile} — run: npm run relay -- --init`); return '' }
  }
  const watch = ws => { ws.isAlive = true; ws.on('pong', () => { ws.isAlive = true }); ws.on('error', e => log.error('[relay] socket error', e.message)) }

  hostWss.on('connection', ws => {
    watch(ws)
    if (host) host.close(CLOSE_REPLACED, 'replaced')
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
    ws.on('close', () => { if (host === ws) { host = null; toRemotes({ type: 'host', connected: false }) } })
  })

  remoteWss.on('connection', ws => {
    watch(ws)
    const helloTimer = setTimeout(() => { if (!paired.has(ws)) ws.close(CLOSE_BAD_SECRET, 'no hello') }, helloMs)
    ws.on('message', data => {
      try {
        const m = parseRemoteMessage(data)
        if (!paired.has(ws)) {
          if (m?.type !== 'hello' || !secretMatches(m.secret, readSecret())) { ws.close(CLOSE_BAD_SECRET, 'pairing code wrong'); return }
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
    ws.on('close', () => { clearTimeout(helloTimer); if (paired.delete(ws)) tellHostCount() })
  })

  const upgrade = wss => (req, socket, head) => {
    socket.on('error', () => {})
    if (!origins.has(req.headers.origin)) { socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); socket.destroy(); return }
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req))
  }
  const makeServer = wss => {
    const server = http.createServer((_req, res) => { res.writeHead(426); res.end() })
    server.on('upgrade', upgrade(wss))
    return server
  }
  const hostServer = makeServer(hostWss)
  const remoteServer = makeServer(remoteWss)
  const timers = []

  return {
    async start() {
      const listen = (server, port) => new Promise((resolve, reject) => {
        server.once('error', reject)
        server.listen(port, '127.0.0.1', () => resolve(server.address().port))
      })
      const ports = { hostPort: await listen(hostServer, hostPort), remotePort: await listen(remoteServer, remotePort) }
      timers.push(setInterval(() => { send(host, { type: 'relay-beat' }); toRemotes({ type: 'relay-beat' }) }, beatMs))
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
    } catch (e) { console.error(e.message); process.exit(1) }
    return
  }
  const dev = process.env.RELAY_DEV === '1'
  // Terminal shells on macOS set XPC_SERVICE_NAME=0; launchd sets the job label.
  const underLaunchd = !!process.env.XPC_SERVICE_NAME && process.env.XPC_SERVICE_NAME !== '0'
  if (dev && underLaunchd) { console.error('[relay] RELAY_DEV refused under launchd'); process.exit(1) }
  if (dev) console.warn(`\n[relay] ⚠️  RELAY_DEV=1 — also accepting ${DEV_ORIGIN}. Never leave this on for a show.\n`)
  createRelay({ dev }).start().then(p => console.log(`[relay] host ws://127.0.0.1:${p.hostPort}  remote ws://127.0.0.1:${p.remotePort}`))
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
```

- [ ] **Step 4:** re-run — PASS. Then `npx vitest run` — all green.
- [ ] **Step 5 (Ben):** `git add relay/package.json relay/package-lock.json relay/server.mjs relay/server.test.mjs vitest.config.js package.json && git commit -m "feat(remote): laptop relay"`

---

### Task 6: Stub host + protocol end-to-end (no Supabase)

**Files:** Create `relay/stub-host.mjs`, `relay/e2e.test.mjs`

**Interfaces — Consumes:** `planHostCommand`, `nextPressGate`, `pendingLockPhase`, `pendingReveal`, `buildSnapshot`, `hostReply`, `makeSnapshotSender`, `createRelay`. **Produces:** `createStubHost({url, origin, slides, retryMs})→{status, paused, ran, remotes, setPaused(bool), stop()}`.

- [ ] **Step 1: failing tests** — `relay/e2e.test.mjs`: relay + stub host + fake iPad (`ws` client). Traces: tap Next with the shown gate advances and the new state arrives; duplicate tap during the lock countdown refused `busy` (state gate `locking`, `busy:true`); stale `expectGate` refused `gate-changed`; `sentAt` 5s old refused `late`; wrong `expectSlideId` refused `slide-changed`; Pause refuses `paused` and the snapshot says `paused:true`; relay restart — the stub reconnects, resends its unchanged snapshot (the `reset()` on open) and a fresh iPad hello gets it; a second stub kicks the first (status `replaced`, never reconnects) and commands reach only the new one.
- [ ] **Step 2:** `npx vitest run relay/e2e.test.mjs` — FAIL (stub missing).
- [ ] **Step 3: implement `relay/stub-host.mjs`**

```js
// A fake /host Live Mode peer for protocol tests. It decides with the REAL
// planHostCommand / nextPressGate / buildSnapshot / hostReply / snapshot
// sender over an in-memory show — no React, no Supabase. What it performs is
// a toy (index ±1, a countdown flag); what it decides is the laptop's code.
import WebSocket from 'ws'
import { planHostCommand } from '../client/src/lib/hostCommands.js'
import { nextPressGate } from '../client/src/lib/nextPressCue.js'
import { pendingLockPhase, pendingReveal } from '../client/src/lib/slideStepping.js'
import { buildSnapshot, hostReply, makeSnapshotSender } from '../client/src/lib/remoteSnapshot.js'
import { CLOSE_REPLACED } from '../client/src/lib/remoteProtocol.js'

export function createStubHost({ url, origin, slides, retryMs = 50 }) {
  const show = { index: 0, showState: { answerReveal: false, scoreboardVisible: false, scoresRevealed: false } }
  const stub = { status: 'connecting', paused: false, ran: [], remotes: 0 }
  let ws = null
  let stopped = false
  let retry = null
  const sender = makeSnapshotSender(body => { if (ws?.readyState === WebSocket.OPEN) ws.send(body) }, { gapMs: 0 })
  const slide = () => slides[show.index]
  const cue = () => nextPressGate({ slide: slide(), nextSlide: slides[show.index + 1] ?? null })
  const busy = () => !!slide()?.data?.lockCountdownStartedAt
  const push = () => sender.offer(JSON.stringify(buildSnapshot({
    slides, index: show.index, showState: show.showState, cue: cue(), busy: busy(), paused: stub.paused,
  })))

  function run(cmd) {
    const s = slide()
    const plan = planHostCommand(cmd, {
      modalOpen: false, pendingAdvance: false,
      lockPhase: pendingLockPhase(s), lockCountdownRunning: busy(),
      scoringBlocked: false, audioPending: false, scoringBusy: false,
      answerReveal: show.showState.answerReveal, revealPending: !!pendingReveal(s), phoneRevealed: false,
      scoreboardVisible: show.showState.scoreboardVisible, scoresRevealed: show.showState.scoresRevealed,
      paused: stub.paused, remoteBusy: busy(), slideId: s?.id ?? null, gate: cue().gate, now: Date.now(),
    })
    if (plan.refuse) return plan
    stub.ran.push(plan.run)
    if (plan.run === 'next' || plan.run === 'hide-answer-then-next') show.index = Math.min(show.index + 1, slides.length - 1)
    if (plan.run === 'prev') show.index = Math.max(show.index - 1, 0)
    if (plan.run === 'start-lock-countdown') s.data = { ...s.data, lockCountdownPhase: plan.phase, lockCountdownStartedAt: Date.now() }
    if (plan.run === 'set-answer-reveal') show.showState.answerReveal = plan.value
    if (plan.run === 'set-scoreboard-visible') show.showState.scoreboardVisible = plan.value
    if (plan.run === 'set-scores-revealed') show.showState.scoresRevealed = plan.value
    push()
    return { ok: true }
  }

  function connect() {
    ws = new WebSocket(url, { origin })
    ws.on('open', () => { stub.status = 'open'; sender.reset(); push() })
    ws.on('message', data => {
      let m
      try { m = JSON.parse(String(data)) } catch { return }
      if (m.type === 'remotes') { stub.remotes = m.count; return }
      const reply = hostReply(m, { run, now: Date.now(), visibility: 'visible' })
      if (reply) ws.send(JSON.stringify(reply))
    })
    ws.on('error', () => {})
    ws.on('close', code => {
      if (stopped) return
      if (code === CLOSE_REPLACED) { stub.status = 'replaced'; return }
      stub.status = 'down'
      retry = setTimeout(connect, retryMs)
    })
  }
  connect()
  stub.setPaused = p => { stub.paused = p; push() }
  stub.stop = () => { stopped = true; clearTimeout(retry); ws?.close() }
  return stub
}
```

- [ ] **Step 4:** re-run — PASS.
- [ ] **Step 5 (Ben):** `git add relay/stub-host.mjs relay/e2e.test.mjs && git commit -m "test(remote): stub-host protocol e2e"`

---

### Task 7: Laptop link — `useRemoteLink` + LiveMode wiring + chip

**Files:** Create `client/src/hooks/useRemoteLink.js`; Modify `client/src/components/host/LiveMode.jsx`

**Interfaces — Consumes:** Tasks 1-4. **Produces:** `useRemoteLink({enabled, snapshot, runCommandRef, url})→{status:'off'|'connecting'|'open'|'down'|'replaced', remotes:number}`.

Test: `client/src/hooks/useRemoteLink.test.jsx` (jsdom, fake `WebSocket`, house `createRoot` + `act` pattern): off never constructs a socket; on connects to `ws://localhost:8794`, sends the snapshot on open, answers `relay-beat` and `cmd`; re-open resends the unchanged snapshot; backoff 1-2-4-8-10-10s; 4001 stops for good; switching off closes and stops. Writing it found a bug: the sender counted a send dropped while the socket was still connecting, delaying the first snapshot 150ms — fixed by `transmit` returning `false` (Task 4 code above, with its own test). The transmit functions in the hook and the stub return `false` when the socket isn't open.

- [ ] **Step 1: `useRemoteLink.js`**

```js
import { useEffect, useRef, useState } from 'react'
import { HOST_RELAY_URL, CLOSE_REPLACED } from '../lib/remoteProtocol.js'
import { hostReply, makeSnapshotSender } from '../lib/remoteSnapshot.js'

// /host's side of the iPad remote (spec §5-§8). OFF unless `enabled`: no
// socket is ever constructed, so Chrome's local-network prompt never shows.
export function useRemoteLink({ enabled, snapshot, runCommandRef, url = HOST_RELAY_URL }) {
  const [status, setStatus] = useState('off')
  const [remotes, setRemotes] = useState(0)
  const wsRef = useRef(null)
  const snapRef = useRef(snapshot)
  snapRef.current = snapshot
  const senderRef = useRef(null)
  if (!senderRef.current) {
    senderRef.current = makeSnapshotSender(body => {
      const ws = wsRef.current
      if (ws?.readyState === WebSocket.OPEN) ws.send(body)
    })
  }
  const body = () => JSON.stringify({ ...snapRef.current, visibility: document.visibilityState })

  useEffect(() => { if (enabled) senderRef.current.offer(body()) })

  useEffect(() => {
    if (!enabled) { setStatus('off'); return }
    const sender = senderRef.current
    let ws = null
    let retry = null
    let delay = 1000
    let stopped = false
    const connect = () => {
      setStatus('connecting')
      ws = new WebSocket(url)
      wsRef.current = ws
      ws.onopen = () => {
        delay = 1000
        setStatus('open')
        sender.reset() // B1: a relay that restarted has no cached state
        sender.offer(body())
      }
      ws.onmessage = e => {
        let msg
        try { msg = JSON.parse(e.data) } catch { return }
        if (msg.type === 'remotes') { setRemotes(msg.count); return }
        // Answered here, not from a setInterval: hidden tabs throttle timers.
        const reply = hostReply(msg, { run: c => runCommandRef.current(c), now: Date.now(), visibility: document.visibilityState })
        if (reply && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(reply))
      }
      ws.onclose = e => {
        if (wsRef.current === ws) wsRef.current = null
        setRemotes(0)
        if (stopped) return
        if (e.code === CLOSE_REPLACED) { setStatus('replaced'); return }
        setStatus('down')
        retry = setTimeout(connect, delay)
        delay = Math.min(delay * 2, 10000)
      }
    }
    connect()
    const onVisibility = () => sender.offer(body())
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stopped = true
      clearTimeout(retry)
      document.removeEventListener('visibilitychange', onVisibility)
      ws?.close()
      wsRef.current = null
    }
  }, [enabled, url])

  return { status, remotes }
}
```

- [ ] **Step 2: LiveMode edits** (each an exact small edit):
  1. imports: `nextPressCue` → `nextPressGate`; add `import { useRemoteLink } from '../../hooks/useRemoteLink.js'` and `import { buildSnapshot, hostChipText } from '../../lib/remoteSnapshot.js'`.
  2. After `scoringSinceRef`'s effect: `raceSinceRef` + effect (remote-only, own 12s cap, NOT folded into `scoringBusy`); `remoteLinkOn` state read from `localStorage['trivia-os:ipad-remote'] === '1'` in try/catch; `remotePaused` state.
  3. `nextCue` becomes `const nextGate = nextPressGate({ ..., scoringBusy: scoringBlocksNext() }); const nextCue = nextGate.label`.
  4. `runHostCommand` ctx gains `now: Date.now(), paused: remotePaused, remoteBusy: remoteBusyNow(), slideId: currentSlide?.id ?? null, gate: nextGate.gate, phoneRevealed: !!phoneMechanic && !!currentSlide?.data?.[REVEAL_FIELD[phoneMechanic]]`.
  5. After `runHostCommandRef`: `remoteBusyNow()` = `scoringBlocksNext() || (raceBusy && Date.now() - raceSinceRef.current < 12000) || pylPickerBusy || !!currentSlide?.data?.lockCountdownStartedAt`; `const remoteLink = useRemoteLink({ enabled: remoteLinkOn, runCommandRef: runHostCommandRef, snapshot: buildSnapshot({ slides, index: currentIndex, showState: show.showState, cue: nextGate, busy: remoteBusyNow(), paused: remotePaused }) })`; `toggleRemoteLink()` writes the flag.
  6. Right column, above Shortcuts: "iPad remote" card — an On/Off `<button role="switch">`, `hostChipText(...)` line, and a "Pause iPad remote" `<button role="switch">` (buttons, not checkboxes: `handleKeyDown` ignores keys while an `<input>` has focus, which would swallow the Stream Deck's arrows after a click).
- [ ] **Step 3:** `npx vitest run` + `npx vite build` — green.
- [ ] **Step 4 (Ben):** `git add client/src/hooks/useRemoteLink.js client/src/components/host/LiveMode.jsx && git commit -m "feat(remote): /host link, off by default"` — **LiveMode.jsx also holds the earlier uncommitted cue + step-1 work; review the whole diff before committing.**

---

### Task 8: `/remote` iPad page

**Files:** Create `client/src/views/Remote.jsx`, `public/remote-manifest.json`; Modify `client/src/App.jsx` (lazy import + `<Route path="/remote" element={<Remote />} />`).

**Interfaces — Consumes:** Task 1 (`DEFAULT_REMOTE_URL`, `CLOSE_BAD_SECRET`, `GREY_GATES`, `refusalText`, `remoteStatus`).

UI contract: status strip (dot + `remoteStatus` text) with slide label + "slide n / total" and ⚙; paused banner; giant Next (≥200px tall, Boogaloo, cue under it, greyed on `GREY_GATES`, `paused`, `busy`, or `!live`); Prev + Answer + Scoreboard + Phone scores (≥88px, lit from `toggles`, send `{value: !current}`; Answer glows on `gate==='reveal-owed'`); Up Next (2); refusal line in plain English; ⚙ drawer (relay URL, pairing code, Save). Grid: `landscape:grid-cols-[2fr_1fr]`, stacked in portrait. `touch-manipulation`, no hover styles. Wake lock on first tap and on `visibilitychange` → visible. Head tags as `Join.jsx:1876-1892` (manifest `/remote-manifest.json`, `apple-touch-icon` `/join-icon-180.png`, `apple-mobile-web-app-capable`, status-bar style, title "Remote"). Socket: hello first; 5s without `relay-beat` → force close; backoff 1s→10s; on 4003 stop until the ⚙ code changes (the effect depends on `[url, secret]`); offset from each laptop `beat`, `sentAt = Date.now() + offset`.

Manifest:

```json
{
  "name": "Trivia Remote",
  "short_name": "Remote",
  "description": "Baynes Trivia — host remote for Live Mode",
  "start_url": "/remote",
  "scope": "/remote",
  "display": "standalone",
  "orientation": "any",
  "background_color": "#030712",
  "theme_color": "#030712",
  "icons": [
    { "src": "/join-icon.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any" },
    { "src": "/join-icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/join-icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" }
  ]
}
```

(Full `Remote.jsx`: see the file. Test `client/src/views/Remote.test.jsx` (jsdom, fake `WebSocket`): no code opens settings and no socket; pairs with hello-first, goes green, shows cue / Up Next / lit toggles; Next sends shown gate + slide id + laptop-time `sentAt`; refusal text; greys Next on `locking` / paused / stale beat; 5s without `relay-beat` force-reconnects after 1s; 4003 stops until the code changes.)

- [ ] **Step 1:** write the files; **Step 2:** `npx vite build` green; **Step 3 (Ben):** `git add client/src/views/Remote.jsx client/src/App.jsx public/remote-manifest.json && git commit -m "feat(remote): /remote iPad page"`

---

### Task 9: Ops + docs

**Files:** Create `relay/ops/com.baynes.trivia-relay.plist` (KeepAlive + RunAtLoad, `/usr/local/bin/node` + absolute `relay/server.mjs`, logs to `~/Library/Logs/trivia-relay.log`, never sets `RELAY_DEV`). Modify `SKILL.md` Critical Rule 4 and `CLAUDE.md` Key Rules with one clause each: "One scoped exception: `relay/` (bare Node + `ws`, laptop-local, plus its pairing-secret file) carries iPad remote commands to the /host tab and never carries show state to /display or /join." Update the spec's §10/§12 to say relay tests run under vitest (`relay/**/*.test.mjs`), not `node --test`, and that the protocol module is `client/src/lib/remoteProtocol.js`.

- [ ] **Step 1:** write; **Step 2:** `plutil -lint relay/ops/com.baynes.trivia-relay.plist`; **Step 3 (Ben):** commit with explicit paths.

---

### Task 10: Verify

- [ ] `cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os && npx vitest run` — all green (includes relay tests).
- [ ] `npx vite build` — succeeds.
- [ ] Not verifiable here (Ben/hardware): real iPad + wake lock + home-screen install, `tailscale serve` wss, the Chrome LNA prompt, real Live Mode with the link on (rehearsal route 12b).

## Self-review

- Spec §13 phase 1 items: relay ✓ (T5), plist ✓ (T9), pairing ✓ (T5), `useRemoteLink` beat reply + Pause ✓ (T7), `/remote` Next cue/gate, Prev, three toggles, Up Next, strip, wake lock, manifest ✓ (T8), chip ✓ (T7), `nextPressCue` fixes ✓ (T2).
- Not in phase 1 (deliberately): jumpTo/unlock/rescore, score drawer, room status, tailnet ACL, Supabase queue, Playwright `/remote` e2e (the stub e2e covers the protocol; the UI is covered only by build + Ben's rehearsal).
- Names used across tasks: `nextPressGate`, `planHostCommand`, `buildSnapshot`, `hostReply`, `makeSnapshotSender`, `hostChipText`, `remoteStatus`, `createRelay`, `createStubHost` — consistent.
