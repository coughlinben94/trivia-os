// Host countdown timer: pure math, no React. Stored in shows.special_event as
// { timer }, a small jsonb that was always null before this (so it never hits the
// RT-1 TOAST omission, and nothing else reads it).
//
// CLOCK SKEW. The host laptop and each TV have their own Date.now(), which can
// differ by seconds. So the wire never carries "seconds left" ticking, and a
// display never trusts the host's absolute clock directly:
//  - a running timer carries endsAt and sentAt, both on the HOST clock;
//  - when a display receives a timer change live, it works out
//    offset = its own clock - sentAt (this folds in delivery delay, which is
//    well under a second) and judges the timer by (its clock - offset) vs endsAt;
//  - the offset is kept in sessionStorage, so a reload mid-timer is still right.
//    A TV opened for the first time mid-timer has no offset and assumes 0.
// The host itself always uses offset 0.

export const MIN_MS = 3000
export const MAX_MS = 180 * 60 * 1000 // 3 hours
export const URGENT_MS = 10000 // last 10 seconds
export const DONE_VISIBLE_MS = 8000 // "Time's up" stays this long, then clears
export const CHIME_WINDOW_MS = 3000 // a TV that loads later than this after zero stays silent

// "1.5" / "2" / ".5" / "1,5" minutes -> whole-second ms, or null if not usable.
export function parseMinutes(text) {
  const s = String(text ?? '').trim().replace(',', '.')
  if (!/^(\d+\.?\d*|\.\d+)$/.test(s)) return null
  const ms = Math.round(parseFloat(s) * 60) * 1000
  if (!Number.isFinite(ms) || ms < MIN_MS || ms > MAX_MS) return null
  return ms
}

const newId = now => `t${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`

export function startTimer(durationMs, now) {
  return { id: newId(now), state: 'running', totalMs: durationMs, endsAt: now + durationMs, remainingMs: durationMs, sentAt: now }
}

export function remainingAt(t, now) {
  return t.state === 'paused' ? t.remainingMs : t.endsAt - now
}

export function pauseTimer(t, now) {
  if (t.state !== 'running') return t
  const remainingMs = Math.max(0, t.endsAt - now)
  return { ...t, state: 'paused', remainingMs, sentAt: now }
}

export function resumeTimer(t, now) {
  if (t.state !== 'paused') return t
  return { ...t, state: 'running', endsAt: now + t.remainingMs, sentAt: now }
}

// +1 minute. On a timer that already hit zero it starts a fresh minute (new id,
// so the chime can play again).
export function addTime(t, ms, now) {
  const left = remainingAt(t, now)
  if (left <= 0) return startTimer(ms, now)
  const totalMs = Math.min(t.totalMs + ms, MAX_MS)
  return t.state === 'paused'
    ? { ...t, totalMs, remainingMs: t.remainingMs + ms, sentAt: now }
    : { ...t, totalMs, endsAt: t.endsAt + ms, remainingMs: left + ms, sentAt: now }
}

export function clockLabel(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const sec = String(total % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

// phase: idle | running | urgent | paused | done. `now` is the viewer's own
// Date.now(); `offset` is its clock minus the host clock.
export function timerView(t, now, offset = 0) {
  if (!t || typeof t !== 'object' || !t.id) return { phase: 'idle', remainingMs: 0, label: '', sinceEndMs: 0 }
  const remainingMs = remainingAt(t, now - offset)
  if (t.state === 'paused') return { id: t.id, phase: 'paused', remainingMs, label: clockLabel(remainingMs), sinceEndMs: 0 }
  if (remainingMs > 0) {
    return { id: t.id, phase: remainingMs <= URGENT_MS ? 'urgent' : 'running', remainingMs, label: clockLabel(remainingMs), sinceEndMs: 0 }
  }
  const sinceEndMs = -remainingMs
  if (sinceEndMs >= DONE_VISIBLE_MS) return { phase: 'idle', remainingMs: 0, label: '', sinceEndMs }
  return { id: t.id, phase: 'done', remainingMs: 0, label: clockLabel(0), sinceEndMs }
}

// Play the chime for this timer id only once, and not for a TV that loaded long after zero.
export function shouldChime(view, playedId) {
  return view.phase === 'done' && view.sinceEndMs < CHIME_WINDOW_MS && view.id !== playedId
}

export function calibrateOffset(localNow, t) {
  return typeof t?.sentAt === 'number' ? localNow - t.sentAt : 0
}
