// "Failure is loud" for a clip that was asked to play but never made sound
// (audio pipeline spec, 2026-10-01). The 2026-09-29 runner-up cause: Chrome
// blocks UNMUTED playback on a tab that has had no click or key press since it
// loaded (a reloaded /display), silently, and nothing ever checked that the
// clip really started. These helpers are the check; the slide components own
// the cue ("Tap for sound") and call them.
import * as Sentry from '@sentry/react'

// YouTube PlayerState: -1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering,
// 5 cued. Buffering counts as fine — that is a slow network, not the autoplay
// policy. Anything else, or still muted, means no sound came out.
export function youtubeIsSounding(player) {
  try {
    const state = player.getPlayerState()
    return (state === 1 || state === 3) && !player.isMuted()
  } catch {
    return false
  }
}

// Uploaded-file path: an <audio> element routed through a gain graph. A blocked
// play() leaves it paused; a context Chrome refused to resume stays suspended.
export function mediaIsSounding(audioEl, audioCtx) {
  if (!audioEl) return false
  if (audioEl.ended) return true // a clip shorter than the check delay still played
  if (audioEl.paused) return false
  return !audioCtx || audioCtx.state !== 'suspended'
}

// Run `check` once, `delayMs` after a play was requested; call onBlocked if it
// still fails. Returns cancel() (clip paused, part changed, unmount). Nothing
// in here may throw into the live TV.
export function watchPlayStart(check, onBlocked, delayMs = 2000) {
  const t = setTimeout(() => {
    try {
      if (!check()) onBlocked()
    } catch { /* telemetry/cue must never break the show */ }
  }, delayMs)
  return () => clearTimeout(t)
}

// One Sentry warning per distinct clip per page load (the console logs every
// time). `extra` should carry slideId and part so repeats of one clip dedupe.
const reported = new Set()
export function reportBlocked(kind, extra = {}) {
  console.warn(`[audio] play blocked (${kind})`, extra)
  const key = `${kind}|${extra.slideId ?? ''}|${extra.part ?? 0}`
  if (reported.has(key)) return
  reported.add(key)
  try {
    Sentry.captureMessage(`audio: play blocked (${kind})`, { level: 'warning', tags: { area: 'audio' }, extra })
  } catch { /* never let telemetry break the show */ }
}
