import React from 'react'
import ReactDOM from 'react-dom/client'
import * as Sentry from '@sentry/react'
import App from './App.jsx'
import './index.css'
import './jukebox/jukebox.css'

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
    // TRIVIA-OS-D: @supabase/realtime-js's Serializer.decode JSON.parses
    // incoming WebSocket frames with no try/catch — a frame truncated by a
    // flaky mobile connection throws inside their onmessage handler, no app
    // frames in the stack. Their bug, not reachable from our code.
    ignoreErrors: ["JSON Parse error: Unterminated string"],
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
// Diagnostic only — records how /display booted (fresh navigation vs a
// reload vs back/forward, plus what referred it) so a real prod reload, if
// it ever fires again mid-show, leaves evidence instead of just a jarring
// music blip and no way to confirm a cause (2026-09-14: investigated Ben's
// "team intro music clips then loops" report, reproduced a reload locally
// under `vite dev`, but traced that one to the DEV-SERVER HMR client, which
// doesn't exist in the prod build — the real prod trigger is still
// unconfirmed; this is what closes that gap next time it happens live).
if (import.meta.env.VITE_SENTRY_DSN && window.location.pathname === '/display') {
  const nav = performance.getEntriesByType('navigation')[0]
  Sentry.captureMessage('display boot', {
    level: 'info',
    extra: { navigationType: nav?.type, referrer: document.referrer },
  })
}

window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault()
  if (!sessionStorage.getItem('chunk-reload')) {
    sessionStorage.setItem('chunk-reload', '1')
    reloadingForStaleChunk = true
    window.location.reload()
  }
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
