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
export const WARM_FILES_CAP = 4
export const NOT_READY_EXTRA_MS = 4000 // extra wait when the YouTube player has not even loaded yet

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
  const listeners = new Set()
  const handles = new Map() // clipKey -> live handle
  const reported = new Set() // clipKeys already sent to Sentry
  const warmedFiles = new Map() // file url -> preloaded <audio> waiting for its play()
  const parked = new Map() // youtube pool key -> claimed player kept warm after stop/end (instant replay)
  let snapshot = { status: 'locked', blocked: [] }

  function status() {
    if (ctx) return ctx.state === 'running' ? 'unlocked' : 'locked'
    return gestureSeen || d.hasUserActivation() ? 'unlocked' : 'locked'
  }

  const sameList = (a, b) => a.length === b.length && a.every((x, i) => Object.keys(x).every(k => x[k] === b[i][k]))

  function emit() {
    const blocked = [...handles.values()]
      .filter(h => h.state === 'blocked')
      .map(h => ({ key: h.key, slideId: h.slideId, kind: h.clip.kind, part: h.clip.part, reason: h.reason }))
    const next = { status: status(), blocked }
    if (next.status === snapshot.status && sameList(next.blocked, snapshot.blocked)) return
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

  // Pre-fetch before the press (the old slides mounted <audio preload> with the slide; without
  // this every upload would be fetched over bar wifi at the Next press).
  function warm(rawClip) {
    const clip = safe(() => normalizeClip(rawClip))
    if (clip?.kind === 'youtube') safe(d.youtube.warm, clip.videoId, clip.start, clip.end)
    else if (clip?.kind === 'file' && !warmedFiles.has(clip.url)) {
      while (warmedFiles.size >= WARM_FILES_CAP) {
        const [oldUrl, oldEl] = warmedFiles.entries().next().value
        warmedFiles.delete(oldUrl)
        safe(() => oldEl.remove?.())
      }
      const el = safe(() => prepareElement(clip))
      if (el) warmedFiles.set(clip.url, el)
    }
  }

  function prepareElement(clip) {
    const el = d.makeElement()
    el.preload = 'auto'
    // A cross-origin file (Supabase storage) routed through Web Audio plays SILENT unless
    // the element is CORS-enabled; storage sends access-control-allow-origin: *. Set it
    // BEFORE src, and only when cross-origin (a same-origin file needs nothing).
    if (isCrossOrigin(clip.url)) el.crossOrigin = 'anonymous'
    el.src = clip.url
    return el
  }

  // One handle per playing clip. `ctl` is the private control surface the start
  // functions use; callers only ever see the handle.
  function createHandle(clip, slideId, initialLevel = 1) {
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
    let releaseImpl = () => {} // destroys what stop() only parks (a YouTube player)
    const endedCbs = []
    const failedCbs = []
    let heard = false // true once sound really started
    let level = initialLevel // animated 0..1 multiplier (fades, ducks)
    let levelImpl = () => {}
    let gainImpl = () => {}
    const blockedCbs = []
    const label = clip.kind === 'file' ? 'upload' : clip.kind // 'upload' keeps the name the old slide code gave the Sentry issue
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
      onFailed(cb) { failedCbs.push(cb) },
      onBlocked(cb) { blockedCbs.push(cb) },
      // Fades and ducks: ramp the 0..1 level over rampMs (instant when 0). Independent of the
      // static loudness correction, so a late setGainDb never jumps a fade in progress.
      setLevel(x, rampMs = 0) {
        if (done()) return
        level = x
        safe(levelImpl, x, rampMs)
      },
      // Static loudness correction (dB), applied after the fact (e.g. once an analysis resolves).
      setGainDb(db) {
        if (done()) return
        safe(gainImpl, db)
      },
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
      // From the "Click for sound" button (a real gesture): clear the block and try again.
      retry() {
        if (done() || state === 'failed') return
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
      d.event('warning', `audio: play blocked (${label})`, { slideId, part: clip.part, reason })
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
      level: () => level,
      setLevel(x, ms) { level = x; safe(levelImpl, x, ms) }, // the director's own fades (walkout out-points)
      setLevelImpl(fn) { levelImpl = fn },
      setGainImpl(fn) { gainImpl = fn },
      setOnPlaying(fn) { onPlayingImpl = fn },
      setRelease(fn) { releaseImpl = fn },
      // Start (or restart) the 2s "is it really sounding?" check. Call BEFORE anything
      // that can hang (resume(), play()).
      arm(check, whyNot = () => 'not-sounding') {
        checkFn = check
        stopTimers()
        let extended = false
        const tick = () => {
          watch = null
          if (done()) return
          if (safe(checkFn)) { ctl.playing(); return }
          const why = whyNot()
          // A player still loading (cold build, 1.5s pool rebuild, next series part) is slow,
          // not blocked: give it one longer window before a cue + Sentry event.
          if (why === 'not-ready' && !extended) { extended = true; watch = d.setTimer(tick, NOT_READY_EXTRA_MS); return }
          ctl.block(why)
        }
        watch = d.setTimer(tick, SOUND_CHECK_MS)
      },
      playing() {
        if (done() || state === 'playing') return
        const afterBlock = state === 'blocked'
        state = 'playing'
        heard = true
        reason = null
        stopTimers()
        d.breadcrumb('audio started', { kind: clip.kind, slideId, part: clip.part, ms: d.now() - t0, afterBlock })
        safe(onPlayingImpl)
        emit()
      },
      block(why) {
        // A late rejection (say an AbortError) must not undo a clip that is already sounding.
        if (done() || state === 'blocked' || state === 'playing' || state === 'failed') return
        state = 'blocked'
        reason = why
        if (watch != null) { d.clearTimer(watch); watch = null }
        reportBlockedOnce()
        startPoll()
        emit()
        blockedCbs.forEach(cb => safe(cb))
      },
      // The clip can never play (dead file, load error): a Sentry event of its own and NO cue,
      // since clicking would fail the same way forever.
      fail(why) {
        if (done() || state === 'failed' || state === 'playing') return
        state = 'failed'
        reason = why
        stopTimers()
        d.breadcrumb('audio failed', { kind: clip.kind, slideId, part: clip.part, reason: why })
        const fkey = `fail|${key}`
        if (!reported.has(fkey)) {
          reported.add(fkey)
          d.event('warning', `audio: clip failed (${label})`, { slideId, part: clip.part, reason: why })
        }
        failedCbs.forEach(cb => safe(cb))
        emit()
      },
      ended() {
        if (done()) return
        if (!heard) {
          d.breadcrumb('audio ended unheard', { kind: clip.kind, slideId, part: clip.part })
          const ukey = `unheard|${key}`
          if (!reported.has(ukey)) {
            reported.add(ukey)
            d.event('warning', `audio: clip ended unheard (${label})`, { slideId, part: clip.part })
          }
        }
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
    const el = warmedFiles.get(clip.url) ?? prepareElement(clip)
    warmedFiles.delete(clip.url)
    el.loop = clip.loop
    let src = null
    let staticGain = null
    let levelNode = null
    let gainLin = dbToGain(clip.gainDb)
    if (c) {
      try {
        src = c.createMediaElementSource(el)
        staticGain = c.createGain()
        staticGain.gain.value = gainLin
        levelNode = c.createGain()
        levelNode.gain.value = ctl.level()
        src.connect(staticGain)
        staticGain.connect(levelNode)
        levelNode.connect(c.destination)
      } catch { src = null }
    }
    // No context (or the graph failed): fall back to the element's own volume, which cannot boost.
    const applyVolume = () => { el.volume = Math.max(0, Math.min(1, Math.min(1, gainLin) * ctl.level())) }
    if (!src) applyVolume()
    ctl.setGainImpl(db => {
      gainLin = dbToGain(db)
      if (staticGain) staticGain.gain.value = gainLin
      else applyVolume()
    })
    ctl.setLevelImpl((x, ms) => {
      if (!levelNode) { applyVolume(); return }
      const prm = levelNode.gain
      const now = c.currentTime
      prm.cancelScheduledValues?.(now)
      if (ms > 0) { prm.setValueAtTime?.(prm.value, now); prm.linearRampToValueAtTime(x, now + ms / 1000) }
      else prm.value = x
    })
    if (clip.start) el.currentTime = clip.start
    el.addEventListener('ended', () => {
      if (clip.loopTo == null) { ctl.ended(); return }
      el.currentTime = clip.loopTo // loop from a mid-track start, not from 0:00
      safe(() => el.play()?.catch?.(() => {}))
    })
    el.addEventListener('error', () => ctl.fail('media-error')) // 404, bad file, dropped network

    const check = () => mediaIsSounding(el, c)
    const go = () => {
      ctl.arm(check, () => (el.readyState < 3 ? 'not-ready' : 'not-sounding')) // FIRST: resume() and play() can each hang forever without a gesture
      if (c && c.state !== 'running') safe(() => c.resume()?.catch?.(() => {}))
      let p
      try { p = el.play() } catch { ctl.block('play-threw'); return }
      p?.then?.(
        () => { if (!c || c.state === 'running') ctl.playing() },
        // Only an autoplay refusal gets the "Click for sound" cue; a dead file would fail the same way on every click.
        err => (err?.name === 'NotAllowedError' ? ctl.block('not-allowed') : ctl.fail(`play-rejected:${err?.name ?? 'error'}`)),
      )
    }
    ctl.setRetry(() => { unlock(); go() })
    ctl.setStop(() => {
      safe(() => el.pause())
      safe(() => src?.disconnect())
      safe(() => el.removeAttribute?.('src'))
      safe(() => el.remove?.())
    })
    go()
  }

  function play(rawClip, { slideId = null, level = 1 } = {}) {
    const clip = normalizeClip(rawClip) // a malformed clip throws to the CALLER, never into the show
    handles.get(clipKey(slideId, clip))?.stop()
    const { handle, ctl } = createHandle(clip, slideId, level)
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
    let live = false // false once stopped: a player that becomes ready LATER must not start
    let endTimer = null
    let rampTimer = null
    let shown = ctl.level() // the level the player currently has
    const volFor = x => Math.round(clip.volume * x)
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
      live = true
      h.whenReady(p => {
        if (!live) return
        player = p
        safe(() => {
          p.setVolume(volFor(ctl.level()))
          shown = ctl.level()
          p.unMute()
          p.seekTo(clip.start, true)
          p.playVideo()
        })
      })
    }

    // Walkout out-points, polled every 250ms ONLY while sound is really playing (a blocked
    // clip must not loop or fade silently). Without an outPoint the loaded duration is used;
    // while duration is still 0 (not loaded, or embedding disabled) nothing happens, which is
    // what stops an untrimmed clip from looping every tick.
    let outTimer = null
    const stopOutPoll = () => { if (outTimer != null) d.clearTimer(outTimer); outTimer = null }
    const outTick = () => {
      outTimer = null
      if (!player) return
      const t = safe(() => player.getCurrentTime?.()) ?? 0
      const dur = safe(() => player.getDuration?.()) ?? 0
      const out = clip.outPoint ?? (dur > 0 ? dur : Infinity)
      if (out !== Infinity) {
        if (clip.onOut === 'loop' && t >= out) safe(() => player.seekTo(clip.start, true))
        else if (clip.onOut === 'fade' && t >= out - clip.fadeMs / 1000) {
          // one-shot: the poll is not re-armed after this (the end timer below replaces it)
          ctl.setLevel(0, clip.fadeMs)
          outTimer = d.setTimer(() => ctl.ended(), clip.fadeMs + 100) // ended() parks (pauses) the player
          return
        }
      }
      outTimer = d.setTimer(outTick, 250)
    }
    const startOutPoll = () => {
      if (clip.onOut === 'end' || outTimer != null) return
      outTimer = d.setTimer(outTick, 250)
    }
    ctl.setOnPlaying(() => { armBackstop(); startOutPoll() })
    ctl.setLevelImpl((x, ms) => {
      if (rampTimer != null) d.clearTimer(rampTimer)
      rampTimer = null
      if (!(ms > 0)) { shown = x; safe(() => player?.setVolume(volFor(x))); return }
      const from = shown
      const steps = Math.max(1, Math.ceil(ms / 50))
      let i = 0
      const tick = () => {
        i += 1
        shown = from + (x - from) * (i / steps)
        safe(() => player?.setVolume(volFor(shown)))
        rampTimer = i < steps ? d.setTimer(tick, 50) : null
      }
      rampTimer = d.setTimer(tick, 50)
    })
    ctl.setRetry(() => { unlock(); go() })
    // Stop and natural end both PARK the player at the clip start (replay is instant and
    // takes no pool slot); release() is what destroys it.
    ctl.setStop(() => {
      live = false
      stopOutPoll()
      if (rampTimer != null) d.clearTimer(rampTimer)
      rampTimer = null
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

  // For synth sounds (bell, chime, beeps): the shared context, but ONLY if it is running. A
  // suspended context's clock is paused, so anything scheduled on it would ring late, at the
  // next click. Waits up to waitMs for resume() (it can hang forever without a gesture); when
  // the context will not run, reports once per label and resolves null so the caller skips.
  async function audioContext({ waitMs = 400, label = 'synth' } = {}) {
    const c = ensureContext()
    if (c && c.state !== 'running') {
      const resumed = safe(() => c.resume())
      await Promise.race([
        Promise.resolve(resumed).catch(() => {}),
        new Promise(resolve => d.setTimer(resolve, waitMs)),
      ])
    }
    if (c && c.state === 'running') return c
    const key = `synth|${label}`
    d.breadcrumb('audio blocked', { kind: 'synth', label, reason: c ? 'context-suspended' : 'no-audio-context' })
    if (!reported.has(key)) {
      reported.add(key)
      d.event('warning', `audio: play blocked (${label})`, { reason: c ? 'context-suspended' : 'no-audio-context' })
    }
    return null
  }

  function stopAll() {
    for (const h of [...handles.values()]) h.release()
    for (const [k, h] of [...parked]) { parked.delete(k); safe(() => h.destroy()) } // players parked by clips that already ended
  }

  // Test seam: the app uses one singleton, so slide tests need a clean slate between cases.
  function reset() {
    stopAll()
    handles.clear()
    reported.clear()
    parked.clear()
    ctx = null
    gestureSeen = false
    for (const el of warmedFiles.values()) safe(() => el.remove?.())
    warmedFiles.clear()
    snapshot = { status: status(), blocked: [] }
  }

  function retryBlocked() {
    unlock()
    // pending too: the first gesture on a cold tab usually lands inside the 2s window before a refused clip is flagged blocked
    for (const h of [...handles.values()]) if (h.state === 'blocked' || h.state === 'pending') h.retry()
  }

  snapshot = { status: status(), blocked: [] }

  return {
    status, unlock, installGestureUnlock, subscribe, getSnapshot: () => snapshot,
    warm, play, retryBlocked, getContext, audioContext, stopAll,
    _internals: { reset, handles }, // test seams only
  }
}

export const director = createDirector()
