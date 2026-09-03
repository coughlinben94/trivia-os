// Tracks whether the grading-break Jukebox overlay is mounted on /display.
// main.jsx's stale-chunk reload guard checks this before calling
// window.location.reload() — 2026-09-01 live, 8 deploys landed during the
// show, several within minutes of each other, each one silently reloading
// the TV and wiping the page-session Spotify Player singleton
// (useSpotifyPlayer.js's sharedSpotifyPlayer). A fresh reload has to build a
// brand-new SDK player, and rapid back-to-back rebuilds under the same
// device name reliably stop getting a 'ready'/device_id back from Spotify —
// jukebox played once, before the deploy cascade, and never again after.
// Deferring the reload until the break ends keeps the singleton alive
// through a live deploy.
let active = false
let pendingCallback = null

export function setJukeboxActive(value) {
  active = value
  if (!value && pendingCallback) {
    const cb = pendingCallback
    pendingCallback = null
    cb()
  }
}

export function isJukeboxActive() {
  return active
}

// Fires `cb` once, the next time jukebox goes inactive — or immediately if
// it already is. Only one callback can be pending at a time (a reload guard
// never needs more than one).
export function onceJukeboxInactive(cb) {
  if (!active) {
    cb()
    return
  }
  pendingCallback = cb
}
