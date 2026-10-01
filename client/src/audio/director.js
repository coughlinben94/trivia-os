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
    makeElement: () => {
      const el = new Audio()
      // In the DOM (hidden) so devtools and the e2e specs can see the element; startFile removes it on stop.
      try { el.style.display = 'none'; globalThis.document?.body?.appendChild(el) } catch { /* detached is fine */ }
      return el
    },
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

function isCrossOrigin(url) {
  try {
    const here = globalThis.location?.href
    return new URL(url, here).origin !== new URL(here).origin
  } catch { return false }
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
  const parked = new Map() // youtube pool key -> claimed player kept warm after stop/end (instant replay)
  let snapshot = { status: 'locked', blocked: [], playing: [] }

  function status() {
    if (ctx) return ctx.state === 'running' ? 'unlocked' : 'locked'
    return gestureSeen || d.hasUserActivation() ? 'unlocked' : 'locked'
  }

  const sameList = (a, b) => a.length === b.length && a.every((x, i) => Object.keys(x).every(k => x[k] === b[i][k]))

  function emit() {
    const blocked = [...handles.values()]
      .filter(h => h.state === 'blocked')
      .map(h => ({ key: h.key, slideId: h.slideId, kind: h.clip.kind, part: h.clip.part, reason: h.reason }))
    const playing = [...handles.values()]
      .filter(h => h.state === 'playing' || h.state === 'paused')
      .map(h => ({ key: h.key, slideId: h.slideId, part: h.clip.part, paused: h.state === 'paused' }))
    const next = { status: status(), blocked, playing }
    if (next.status === snapshot.status && sameList(next.blocked, snapshot.blocked) && sameList(next.playing, snapshot.playing)) return
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
    // A gesture unlocks AND replays whatever was blocked. Escape is the host leaving
    // fullscreen, not a deliberate "play my sound" press.
    const handler = e => { if (e?.type === 'keydown' && e.key === 'Escape') return; retryBlocked() }
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
    return { key: clipKey(slideId, clip), slideId, clip, state: 'preview', reason: null, onEnded() {}, stop() {}, release() {}, retry() {}, pause() {}, resume() {} }
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
    let onPlayingImpl = () => {} // runs each time sound actually starts (e.g. arm the YouTube end backstop)
    let pauseImpl = () => {}
    let resumeImpl = () => {}
    let releaseImpl = () => {} // destroys what stop() only parks (a YouTube player)
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
        handles.delete(key) // stop() is a no-op once done, so this key is always still ours
        emit()
      },
      // Stop AND give the player back for good (leaving the slide). stop() alone parks it.
      release() {
        handle.stop()
        safe(releaseImpl)
      },
      // Park the clip (player stays warm) and bring it back. Only a sounding clip pauses.
      pause() {
        if (state !== 'playing') return
        state = 'paused'
        safe(pauseImpl)
        emit()
      },
      resume() {
        if (state !== 'paused') return
        state = 'playing'
        safe(resumeImpl)
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
      // 'upload' (not 'file') so the issue keeps the name the old slide code gave it in Sentry.
      d.event('warning', `audio: play blocked (${clip.kind === 'file' ? 'upload' : clip.kind})`, { slideId, part: clip.part, reason })
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
      setOnPlaying(fn) { onPlayingImpl = fn },
      setPause(fn) { pauseImpl = fn },
      setRelease(fn) { releaseImpl = fn },
      setResume(fn) { resumeImpl = fn },
      // Start (or restart) the 2s "is it really sounding?" check. Call BEFORE anything
      // that can hang (resume(), play()).
      arm(check, whyNot = () => 'not-sounding') {
        checkFn = check
        stopTimers()
        watch = d.setTimer(() => {
          watch = null
          if (done()) return
          if (safe(checkFn)) ctl.playing()
          else ctl.block(whyNot())
        }, SOUND_CHECK_MS)
      },
      playing() {
        if (done() || state === 'playing' || state === 'paused') return
        const afterBlock = state === 'blocked'
        state = 'playing'
        reason = null
        stopTimers()
        d.breadcrumb('audio started', { kind: clip.kind, slideId, part: clip.part, ms: d.now() - t0, afterBlock })
        safe(onPlayingImpl)
        emit()
      },
      block(why) {
        // A late rejection (say an AbortError) must not undo a clip that is already sounding.
        if (done() || state === 'blocked' || state === 'playing' || state === 'paused') return
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
        // Free the key BEFORE the callbacks: one of them may replay this very clip, and its
        // new handle must not be deleted along with this one.
        if (handles.get(key) === handle) handles.delete(key)
        safe(onEndedImpl)
        endedCbs.forEach(cb => safe(cb))
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
    // A cross-origin file (Supabase storage) routed through Web Audio plays SILENT unless
    // the element is CORS-enabled; storage sends access-control-allow-origin: *. Set it
    // BEFORE src, and only when cross-origin (a same-origin file needs nothing).
    if (isCrossOrigin(clip.url)) el.crossOrigin = 'anonymous'
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
    ctl.setPause(() => safe(() => el.pause()))
    ctl.setResume(() => safe(() => el.play()?.catch?.(() => {})))
    ctl.setStop(() => {
      safe(() => el.pause())
      safe(() => src?.disconnect())
      safe(() => el.removeAttribute?.('src'))
      safe(() => el.remove?.())
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
    const ykey = `${clip.videoId}:${clip.start}:${clip.end}`
    // Reuse the player a previous stop/end parked (instant replay), else claim the warm one.
    const h = parked.get(ykey) ?? d.youtube.claim(clip.videoId, clip.start, clip.end)
    parked.delete(ykey)
    const owner = {}
    h.__owner = owner // a stale handle's release() must not destroy a player a newer handle owns
    let player = null
    let endTimer = null
    const check = () => !!player && youtubeIsSounding(player)
    // Backstop for a clip with an end: the player's own `end` normally stops it and
    // reports ENDED; if it never does, end the handle ourselves shortly after. Armed when
    // sound STARTS (not at the request), so a slow or blocked start never eats the clip,
    // and an end at/before the start means "no end".
    const armBackstop = () => {
      if (clip.end == null || clip.end <= clip.start) return
      if (endTimer != null) d.clearTimer(endTimer)
      endTimer = d.setTimer(() => ctl.ended(), (clip.end - clip.start) * 1000 + 500)
    }

    h.onStateChange?.(s => {
      if (s === 0) ctl.ended() // YouTube's ENDED
      else if (s === 1 && player && youtubeIsSounding(player)) ctl.playing()
    })

    const go = () => {
      ctl.arm(check, () => (player ? 'not-sounding' : 'not-ready')) // FIRST: the player may never become ready — that must still be reported
      h.whenReady(p => {
        player = p
        safe(() => {
          p.setVolume(clip.volume)
          p.unMute()
          p.seekTo(clip.start, true)
          p.playVideo()
        })
      })
    }

    ctl.setOnPlaying(armBackstop)
    // Parked, not destroyed: resume is instant. The player's own ENDED covers the end.
    ctl.setPause(() => {
      if (endTimer != null) d.clearTimer(endTimer)
      endTimer = null
      safe(() => player?.pauseVideo())
    })
    ctl.setResume(() => safe(() => { player?.unMute(); player?.playVideo() }))
    ctl.setRetry(() => { unlock(); go() })
    // Stop and natural end both PARK the player at the clip start (replay is instant and
    // takes no pool slot); release() is what destroys it.
    ctl.setStop(() => {
      if (endTimer != null) d.clearTimer(endTimer)
      endTimer = null
      safe(() => { player?.pauseVideo(); player?.seekTo(clip.start, true) })
      if (h.__owner === owner) parked.set(ykey, h)
    })
    ctl.setRelease(() => {
      if (h.__owner !== owner) return
      parked.delete(ykey)
      safe(() => h.destroy())
    })
    go()
  }

  function getContext() {
    return ensureContext()
  }

  function stopSlide(slideId) {
    for (const h of [...handles.values()]) if (h.slideId === slideId) h.release()
  }

  function stopAll() {
    for (const h of [...handles.values()]) h.release()
    for (const [k, h] of [...parked]) { parked.delete(k); safe(() => h.destroy()) } // players parked by clips that already ended
  }

  function retryBlocked() {
    unlock()
    for (const h of [...handles.values()]) if (h.state === 'blocked') h.retry()
  }

  snapshot = { status: status(), blocked: [], playing: [] }

  return {
    status, unlock, installGestureUnlock, subscribe, getSnapshot: () => snapshot,
    setPreview, warm, play, retryBlocked, getContext, stopSlide, stopAll,
    // internals shared with later tasks in this file
    _internals: { d, handles, reported, emit, ensureContext, previewHandle, isPreview: () => preview, dbToGain, mediaIsSounding, youtubeIsSounding },
  }
}

export const director = createDirector()
