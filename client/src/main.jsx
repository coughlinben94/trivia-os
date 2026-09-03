import React from 'react'
import ReactDOM from 'react-dom/client'
import * as Sentry from '@sentry/react'
import App from './App.jsx'
import './index.css'
import './jukebox/jukebox.css'

// main.jsx executing at all means this load succeeded — clear the reload guard so a future chunk error can retry.
sessionStorage.removeItem('chunk-reload')

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
