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
  const raw = { ...browserDeps(), ...overrides }
  // Reporting is guarded HERE, not trusted to the injected sinks: a broken Sentry (or a
  // test double that throws) must never break playback.
  const d = { ...raw, breadcrumb: (...a) => safe(raw.breadcrumb, ...a), event: (...a) => safe(raw.event, ...a) }
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

  // One handle per playing clip. `ctl` is the private control surface the start
  // functions use; callers only ever see the handle.
  function createHandle(clip, slideId) {
    const key = clipKey(slideId, clip)
    const t0 = d.now()
    let state = 'pending'
    let reason = null
    let watch = null
    let poll = null
    let checkFn = () => false
    let stopImpl = () => {}
    let retryImpl = () => {}
    let onEndedImpl = () => {} // runs only on a NATURAL end (not on stop()), e.g. re-warm for an instant replay
    const endedCbs = []
    const done = () => state === 'stopped' || state === 'ended'
    const stopTimers = () => {
      if (watch != null) d.clearTimer(watch)
      if (poll != null) d.clearTimer(poll)
      watch = null
      poll = null
    }

    const handle = {
      key, slideId, clip,
      get state() { return state },
      get reason() { return reason },
      onEnded(cb) { endedCbs.push(cb) },
      stop() {
        if (done()) return
        state = 'stopped'
        stopTimers()
        safe(stopImpl)
        handles.delete(key)
        emit()
      },
      // From the "Click for sound" button (a real gesture): clear the block and try again.
      retry() {
        if (done()) return
        if (state === 'blocked') {
          state = 'pending'
          reason = null
          emit()
        }
        safe(retryImpl)
      },
    }

    function reportBlockedOnce() {
      d.breadcrumb('audio blocked', { kind: clip.kind, slideId, part: clip.part, reason })
      if (reported.has(key)) return
      reported.add(key)
      d.event('warning', `audio: play blocked (${clip.kind})`, { slideId, part: clip.part, reason })
    }

    function startPoll() {
      const tick = () => {
        poll = null
        if (state !== 'blocked') return
        if (safe(checkFn)) { ctl.playing(); return }
        poll = d.setTimer(tick, BLOCKED_RECHECK_MS)
      }
      poll = d.setTimer(tick, BLOCKED_RECHECK_MS)
    }

    const ctl = {
      setStop(fn) { stopImpl = fn },
      setRetry(fn) { retryImpl = fn },
      setOnEnded(fn) { onEndedImpl = fn },
      // Start (or restart) the 2s "is it really sounding?" check. Call BEFORE anything
      // that can hang (resume(), play()).
      arm(check) {
        checkFn = check
        stopTimers()
        watch = d.setTimer(() => {
          watch = null
          if (done()) return
          if (safe(checkFn)) ctl.playing()
          else ctl.block('not-sounding')
        }, SOUND_CHECK_MS)
      },
      playing() {
        if (done() || state === 'playing') return
        const afterBlock = state === 'blocked'
        state = 'playing'
        reason = null
        stopTimers()
        d.breadcrumb('audio started', { kind: clip.kind, slideId, part: clip.part, ms: d.now() - t0, afterBlock })
        emit()
      },
      block(why) {
        if (done() || state === 'blocked') return
        state = 'blocked'
        reason = why
        if (watch != null) { d.clearTimer(watch); watch = null }
        reportBlockedOnce()
        startPoll()
        emit()
      },
      ended() {
        if (done()) return
        state = 'ended'
        stopTimers()
        safe(stopImpl)
        safe(onEndedImpl)
        endedCbs.forEach(cb => safe(cb))
        handles.delete(key)
        emit()
      },
    }
    return { handle, ctl }
  }

  // Uploaded file: an <audio> routed through a GainNode on the SHARED context, so
  // loudness normalization can boost (gain > 1) and one context serves the whole tab.
  function startFile(clip, ctl) {
    const c = ensureContext()
    const el = d.makeElement()
    el.preload = 'auto'
    el.loop = clip.loop
    el.src = clip.url
    let src = null
    if (c) {
      try {
        src = c.createMediaElementSource(el)
        const gain = c.createGain()
        gain.gain.value = dbToGain(clip.gainDb)
        src.connect(gain)
        gain.connect(c.destination)
      } catch { src = null }
    }
    // No context (or the graph failed): fall back to the element's own volume, which cannot boost.
    if (!src) el.volume = Math.min(1, dbToGain(clip.gainDb))
    if (clip.start) el.currentTime = clip.start
    el.addEventListener('ended', () => ctl.ended())

    const check = () => mediaIsSounding(el, c)
    const go = () => {
      ctl.arm(check) // FIRST: resume() and play() can each hang forever without a gesture
      if (c && c.state !== 'running') safe(() => c.resume()?.catch?.(() => {}))
      let p
      try { p = el.play() } catch { ctl.block('play-threw'); return }
      p?.then?.(
        () => { if (!c || c.state === 'running') ctl.playing() },
        err => ctl.block(err?.name === 'NotAllowedError' ? 'not-allowed' : 'play-rejected'),
      )
    }
    ctl.setRetry(() => { unlock(); go() })
    ctl.setStop(() => {
      safe(() => el.pause())
      safe(() => src?.disconnect())
      safe(() => el.removeAttribute?.('src'))
    })
    go()
  }

  function play(rawClip, { slideId = null } = {}) {
    const clip = normalizeClip(rawClip) // a malformed clip throws to the CALLER, never into the show
    if (preview) return previewHandle(clip, slideId)
    handles.get(clipKey(slideId, clip))?.stop()
    const { handle, ctl } = createHandle(clip, slideId)
    handles.set(handle.key, handle)
    d.breadcrumb('audio requested', { kind: clip.kind, slideId, part: clip.part })
    try {
      if (clip.kind === 'youtube') startYoutube(clip, ctl)
      else startFile(clip, ctl)
    } catch {
      ctl.block('start-threw')
    }
    emit()
    return handle
  }

  // YouTube: claim the pre-warmed hidden player (lib/youtubeWarmAudio.js owns the
  // iframe pool) and drive it. warm() and claim() both receive end as null-or-number
  // so they agree on the pool key videoId:start:end.
  function startYoutube(clip, ctl) {
    const h = d.youtube.claim(clip.videoId, clip.start, clip.end)
    let player = null
    let endTimer = null
    const check = () => !!player && youtubeIsSounding(player)

    h.onStateChange?.(s => {
      if (s === 0) ctl.ended() // YouTube's ENDED
      else if (s === 1 && player && youtubeIsSounding(player)) ctl.playing()
    })

    const go = () => {
      ctl.arm(check) // FIRST: the player may never become ready (API blocked) — that must still be reported
      h.whenReady(p => {
        player = p
        safe(() => {
          p.setVolume(clip.volume)
          p.unMute()
          p.seekTo(clip.start, true)
          p.playVideo()
        })
      })
      // Backstop for a clip with an end: the player's own `end` normally stops it and
      // reports ENDED; if it never does, end the handle ourselves shortly after.
      if (clip.end != null) {
        if (endTimer != null) d.clearTimer(endTimer)
        endTimer = d.setTimer(() => ctl.ended(), Math.max(0, clip.end - clip.start) * 1000 + 500)
      }
    }

    ctl.setRetry(() => { unlock(); go() })
    ctl.setStop(() => {
      if (endTimer != null) d.clearTimer(endTimer)
      endTimer = null
      safe(() => h.destroy())
    })
    // After a NATURAL end, re-warm so the next play of this clip is instant (replay restarts from the start).
    ctl.setOnEnded(() => safe(d.youtube.warm, clip.videoId, clip.start, clip.end))
    go()
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
