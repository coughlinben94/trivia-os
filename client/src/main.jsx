import React from 'react'
import ReactDOM from 'react-dom/client'
import * as Sentry from '@sentry/react'
import App from './App.jsx'
import './index.css'
import './jukebox/jukebox.css'
import { onceJukeboxInactive } from './lib/jukeboxActive.js'

// main.jsx executing means THIS module loaded, but a lazy route chunk can still
// 404 seconds later, well after this line — so clearing the guard here, before
// that's had a chance to happen, doesn't prove the reload actually fixed
// anything. A genuinely broken deploy (not just deploy-time skew) would 404 the
// same chunk again, and an immediate clear would let it loop forever: reload,
// clear, 404, reload, clear, 404... Wait a few seconds of the app staying up
// before clearing, so a second failure in that window finds the guard still
// set and throws for real instead of reloading again.
setTimeout(() => sessionStorage.removeItem('chunk-reload'), 5000)

// Set the moment we decide to reload for a stale chunk. Everything that throws
// between that decision and the navigation is fallout from the dead chunk, not
// a real bug, so Sentry drops it — see the handler below.
let reloadingForStaleChunk = false

if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    beforeSend: (event) => (reloadingForStaleChunk ? null : event),
  })
}

// Stale tab + new deploy = old hashed chunk 404s on lazy import. Reload once to pick up the new build.
//
// preventDefault() stops Vite rethrowing, which means its preload helper
// RESOLVES the dynamic import with undefined rather than rejecting (see the
// `if(!i.defaultPrevented) throw u` in Vite's helper). React.lazy then reads
// `.default` off undefined and throws during render — synchronously, before
// this reload navigates. The reload still heals it, but without the flag every
// deploy-time chunk miss files a spurious "Cannot read properties of undefined
// (reading 'default')" in Sentry (TRIVIA-OS-5/6, 0 users impacted, all of it
// during a deploy). Real errors are unaffected: the flag is only ever set here.
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault()
  if (sessionStorage.getItem('chunk-reload')) return
  // Don't reload mid-jukebox-break: a live deploy landing during a grading
  // break used to nuke the /display tab's Spotify Player singleton, killing
  // jukebox playback for the rest of the show (2026-09-01 live — see
  // jukeboxActive.js). Deferred reloads still coalesce through the
  // sessionStorage guard once they actually fire.
  onceJukeboxInactive(() => {
    sessionStorage.setItem('chunk-reload', '1')
    reloadingForStaleChunk = true
    window.location.reload()
  })
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
