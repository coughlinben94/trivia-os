import * as Sentry from '@sentry/react'
// "Failure is loud" for a clip that was asked to play but never made sound
// (audio pipeline spec, 2026-10-01). The 2026-09-29 runner-up cause: Chrome
// blocks UNMUTED playback on a tab that has had no click or key press since it
// loaded (a reloaded /display), silently, and nothing ever checked that the
// clip really started. These are the two "is it really sounding?" checks; the audio
// director (audio/director.js) runs them and owns the cue and the report.

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
  // play() flips paused at once, before any sound: a file still buffering is not sounding yet.
  if (audioEl.readyState !== undefined && audioEl.readyState < 3) return false
  return !audioCtx || audioCtx.state !== 'suspended'
}

// TEMPORARY (Plan 3 task 6): only the host timer chime (TimerOverlay) still reports through
// here. Delete with the chime's move onto the audio director.
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
