// The audio director (Plan 1 of 3; spec: docs/superpowers/specs/2026-09-29-audio-pipeline-design.md).
//
// ONE module owns playback on /display. Slides describe a clip and never touch
// AudioContext, Audio, or YT.Player themselves. Every step is reported (Sentry
// breadcrumbs; one Sentry event per blocked clip) because the 2026-09-29 "Next did
// not start sound" night left no signal at all.
//
// Everything external is injected (see `Deps`) so the whole thing is tested with
// fakes. The director NEVER throws into the show: external calls are guarded and a
// failure becomes a report, not an exception.
//
// Hard-won facts baked in (found in real Chromium, 2026-10-01):
//  - With no user gesture AudioContext.resume() NEVER SETTLES (no rejection), and
//    play() can hang before it throws. So the "is it really sounding?" check starts
//    AT THE REQUEST, never after play() resolves.
//  - A blocked clip is re-checked every second; a slow start that finally sounds
//    clears itself.
import * as Sentry from '@sentry/react'
import { normalizeClip, dbToGain, clipKey } from './clips.js'
import { youtubeIsSounding, mediaIsSounding } from '../lib/audioBlocked.js'
import { warmYoutubeAudio, claimYoutubeAudio } from '../lib/youtubeWarmAudio.js'

export const SOUND_CHECK_MS = 2000 // a clip asked to play must be sounding by now
export const BLOCKED_RECHECK_MS = 1000 // while blocked, keep looking

function browserDeps() {
  return {
    makeContext: () => {
      const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext
      return Ctor ? new Ctor() : null
    },
    makeElement: () => new Audio(),
    youtube: { warm: warmYoutubeAudio, claim: claimYoutubeAudio },
    hasUserActivation: () => !!globalThis.navigator?.userActivation?.hasBeenActive,
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: id => clearTimeout(id),
    now: () => Date.now(),
    breadcrumb: (message, data) => {
      try { Sentry.addBreadcrumb({ category: 'audio', message, data, level: 'info' }) } catch { /* never break the show */ }
    },
    event: (level, message, extra) => {
      try { Sentry.captureMessage(message, { level, tags: { area: 'audio' }, extra }) } catch { /* never break the show */ }
    },
  }
}

const safe = (fn, ...args) => {
  try { return fn(...args) } catch { return undefined }
}

export function createDirector(overrides = {}) {
  const d = { ...browserDeps(), ...overrides }
  let ctx = null
  let gestureSeen = false
  let preview = false
  const listeners = new Set()
  const handles = new Map() // clipKey -> live handle
  const reported = new Set() // clipKeys already sent to Sentry
  let snapshot = { status: 'locked', blocked: [] }

  function status() {
    if (ctx) return ctx.state === 'running' ? 'unlocked' : 'locked'
    return gestureSeen || d.hasUserActivation() ? 'unlocked' : 'locked'
  }

  const sameBlocked = (a, b) => a.length === b.length && a.every((x, i) => x.key === b[i].key && x.reason === b[i].reason)

  function emit() {
    const blocked = [...handles.values()]
      .filter(h => h.state === 'blocked')
      .map(h => ({ key: h.key, slideId: h.slideId, kind: h.clip.kind, part: h.clip.part, reason: h.reason }))
    const next = { status: status(), blocked }
    if (next.status === snapshot.status && sameBlocked(next.blocked, snapshot.blocked)) return
    snapshot = next
    listeners.forEach(l => safe(l))
  }

  function ensureContext() {
    if (!ctx) {
      ctx = safe(d.makeContext) ?? null
      if (ctx) safe(() => ctx.addEventListener?.('statechange', emit))
    }
    return ctx
  }

  // Call from a real user gesture. Never awaits: without a gesture resume() hangs
  // forever, and the statechange event (or the then below) is what reports success.
  function unlock() {
    gestureSeen = true
    const c = ensureContext()
    if (c) {
      const p = safe(() => c.resume())
      p?.then?.(emit, emit)
    }
    emit()
  }

  function installGestureUnlock(target = globalThis.window) {
    if (!target?.addEventListener) return () => {}
    const events = ['pointerdown', 'keydown', 'click']
    const handler = () => unlock()
    events.forEach(e => target.addEventListener(e, handler, true))
    return () => events.forEach(e => target.removeEventListener(e, handler, true))
  }

  function subscribe(cb) {
    listeners.add(cb)
    return () => listeners.delete(cb)
  }

  function setPreview(on) {
    preview = !!on
  }

  function warm(rawClip) {
    if (preview) return
    const clip = safe(() => normalizeClip(rawClip))
    if (clip?.kind === 'youtube') safe(d.youtube.warm, clip.videoId, clip.start, clip.end)
  }

  function previewHandle(clip, slideId) {
    return { key: clipKey(slideId, clip), slideId, clip, state: 'preview', reason: null, onEnded() {}, stop() {}, retry() {} }
  }

  // Task 3 stub: validates and honors preview; real playback arrives in Task 4.
  function play(rawClip, { slideId = null } = {}) {
    const clip = normalizeClip(rawClip)
    if (preview) return previewHandle(clip, slideId)
    throw new Error('director.play is implemented in Plan 1, Task 4')
  }

  function retryBlocked() {
    unlock()
    for (const h of [...handles.values()]) if (h.state === 'blocked') h.retry()
  }

  snapshot = { status: status(), blocked: [] }

  return {
    status, unlock, installGestureUnlock, subscribe, getSnapshot: () => snapshot,
    setPreview, warm, play, retryBlocked,
    // internals shared with later tasks in this file
    _internals: { d, handles, reported, emit, ensureContext, previewHandle, isPreview: () => preview, dbToGain, mediaIsSounding, youtubeIsSounding },
  }
}

export const director = createDirector()
