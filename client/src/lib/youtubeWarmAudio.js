// Warm pool for hidden, audio-only YouTube players (2026-08-24, Ben: "why
// can't we just make the walkout song happen immediately when I click next"
// → "on that slide and any slide with audio").
//
// The problem: building a YT.Player from scratch at the moment audio should
// START means iframe-API load + iframe boot + stream buffering + seek to the
// trim point all sit between the trigger and the first audible sample —
// 2-4s of silent dead time on the walkout song, and the "first shiny-audio
// play of the night stalls" effect on question slides.
//
// The fix: build the player EARLY — muted, buffered at the trim point,
// parked paused — so the trigger has only unmute + play left to do.
// Muted scripted playback is exempt from every browser autoplay policy, so
// the warm phase can never be blocked the way an unmuted cold-tab play can.
//
// Two-phase API:
//   warmYoutubeAudio(videoId, start, end)  — idempotent; start buffering a
//     clip ahead of need. Display.jsx calls this for the current/next
//     slide's walkout song; slides call it for their own clip at mount.
//   claimYoutubeAudio(videoId, start, end) — take ownership of the warm
//     player (or build a fresh one if nothing was warmed — the pre-fix
//     latency, never worse). The claimer drives volume/seek/play itself via
//     whenReady(), and MUST call destroy() when done.
//
// The iframe lives in a 1x1 container appended to document.body, NOT inside
// any React tree — an iframe reloads (dropping its buffer) if it is ever
// reparented in the DOM, so the player must stay where it was born even as
// ownership moves from the pool to a slide component. Visually hidden but
// not display:none: some browsers pause iframes hidden that way (same
// lesson PreShowSlide's old inline container encoded).
//
// Pool is capped at 2 unclaimed players (current + next slide is the only
// prediction anyone makes); a claim removes the entry from the pool, so a
// long show never accumulates iframes.

import { loadYoutubeIframeApi } from '../components/host/YoutubeClipEditor.jsx'

const POOL_CAP = 2
const pool = new Map() // key -> entry (unclaimed, warming/warm)
const claimedKeys = new Set() // keys currently owned by a slide — never re-warm these

// Council review, 2026-08-24: claimYoutubeAudio() falls back to a cold build
// only when nothing was warmed yet — it never checks whether a warm entry
// actually MADE it to ready. If loadYoutubeIframeApi() rejected (swallowed
// below) or onReady simply never fires (network stall, API hiccup),
// entry._player stays null forever and whenReady(cb) queues a callback that
// never runs — silent, permanent "no walkout song at all" instead of the 2-4s
// gap this module exists to close. This is the timeout that catches it.
const CLAIM_READY_TIMEOUT_MS = 1500

const keyOf = (videoId, start, end) => `${videoId}:${start ?? 0}:${end ?? ''}`

function createEntry(videoId, start, end) {
  const container = document.createElement('div')
  container.style.cssText =
    'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden;'
  document.body.appendChild(container)

  const entry = {
    key: keyOf(videoId, start, end),
    claimed: false,
    destroyed: false,
    _player: null, // set once onReady has fired — the only time it's safe to drive
    _readyCbs: [],
    _stateCb: null,
    _readyTimer: null,

    // cb(player) — now if ready, else queued for onReady.
    whenReady(cb) {
      if (this.destroyed) return
      if (this._player) cb(this._player)
      else this._readyCbs.push(cb)
    },
    // Post-claim player-state callback (YT.PlayerState numbers). Warm-phase
    // states are internal and never forwarded.
    onStateChange(cb) {
      this._stateCb = cb
    },
    // Called only once claimed (see claimYoutubeAudio) — an unclaimed warm
    // entry that never becomes ready just sits idle and gets evicted
    // naturally by the pool cap, no rush. A CLAIMED one has a slide's
    // whenReady() callback genuinely waiting on it, so a stall here is the
    // silent "no walkout song at all" failure — rebuild once, cold, in place
    // (same entry object, so the slide's already-registered callback still
    // fires) rather than leaving it hung.
    _armReadyTimeout() {
      this._readyTimer = setTimeout(() => {
        if (this.destroyed || this._player) return
        try { this._player?.destroy() } catch { /* never got that far */ }
        if (container.parentNode) container.parentNode.removeChild(container)
        buildPlayer(this, videoId, start, end, freshContainer())
      }, CLAIM_READY_TIMEOUT_MS)
    },
    destroy() {
      if (this.destroyed) return
      this.destroyed = true
      clearTimeout(this._readyTimer)
      claimedKeys.delete(this.key)
      pool.delete(this.key)
      try { this._player?.pauseVideo() } catch { /* already gone */ }
      try { this._player?.destroy() } catch { /* already gone */ }
      this._player = null
      this._readyCbs = []
      if (container.parentNode) container.parentNode.removeChild(container)
    },
  }

  buildPlayer(entry, videoId, start, end, container)
  return entry
}

function freshContainer() {
  const container = document.createElement('div')
  container.style.cssText =
    'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden;'
  document.body.appendChild(container)
  return container
}

// Builds (or rebuilds) the actual YT.Player into `container`, wiring it to
// `entry`. Split out of createEntry so a stalled claim can retry cold into a
// fresh iframe without losing the entry object identity the caller is
// already holding a reference to (and already may have called whenReady on).
function buildPlayer(entry, videoId, start, end, container) {
  const inner = document.createElement('div')
  container.appendChild(inner)
  loadYoutubeIframeApi().then(YT => {
    if (entry.destroyed) return
    new YT.Player(inner, {
      videoId,
      width: '1',
      height: '1',
      playerVars: {
        autoplay: 0, controls: 0, playsinline: 1,
        start: Math.floor(start ?? 0),
        ...(end ? { end: Math.ceil(end) } : {}),
      },
      events: {
        onReady: e => {
          if (entry.destroyed) return
          clearTimeout(entry._readyTimer)
          // Muted play from the trim point forces the stream to actually
          // buffer there (a cued player hasn't fetched any media yet);
          // the onStateChange below parks it the moment it's rolling.
          e.target.mute()
          e.target.seekTo(start ?? 0, true)
          e.target.playVideo()
          entry._player = e.target
          const cbs = entry._readyCbs
          entry._readyCbs = []
          cbs.forEach(cb => { try { cb(e.target) } catch { /* slide's problem */ } })
        },
        onStateChange: e => {
          if (entry.destroyed) return
          if (!entry.claimed) {
            // Warm phase: buffered and rolling (muted) — park it back at
            // the trim point, paused, ready for an instant audible start.
            // seekTo on a paused player stays paused (documented behavior).
            if (e.data === 1 /* PLAYING */) {
              e.target.pauseVideo()
              e.target.seekTo(start ?? 0, true)
            }
            return
          }
          entry._stateCb?.(e.data)
        },
      },
    })
  }).catch(() => {
    // API load failed — the ready-timeout (armed only once claimed) is what
    // actually recovers this; an unclaimed warm attempt just stays stuck
    // until evicted, which is fine, nothing is waiting on it.
  })
}

// Start warming a clip ahead of need. Safe to call repeatedly — a clip
// already warming, or currently claimed by a slide, is left alone.
export function warmYoutubeAudio(videoId, start, end) {
  if (!videoId || typeof document === 'undefined') return
  const key = keyOf(videoId, start, end)
  if (pool.has(key) || claimedKeys.has(key)) return
  // Evict oldest unclaimed entries past the cap — Map preserves insertion order.
  while (pool.size >= POOL_CAP) {
    const oldestKey = pool.keys().next().value
    pool.get(oldestKey).destroy() // destroy() also deletes it from the pool
  }
  pool.set(key, createEntry(videoId, start, end))
}

// Take ownership of the warm player for this clip — or build one fresh if
// nothing was warmed (identical to the old build-at-trigger path). The
// returned handle is the caller's to destroy().
export function claimYoutubeAudio(videoId, start, end) {
  const key = keyOf(videoId, start, end)
  let entry = pool.get(key)
  if (entry) pool.delete(key)
  else entry = createEntry(videoId, start, end)
  entry.claimed = true
  claimedKeys.add(key)
  if (!entry._player) entry._armReadyTimeout()
  return entry
}
