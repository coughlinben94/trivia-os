// client/src/hooks/useUsMapData.js
import { useEffect, useState } from 'react'

// The state outlines are ~tens of KB, so they load only when a Pin It surface
// mounts (or is preloaded, see preloadUsMapData). Module-level cache: one
// import for the whole session. A failed import is NOT cached, so the next
// mount retries (bar wifi).
let cache = null
let inflight = null
const listeners = new Set()

export function loadUsMapData(importer = () => import('../lib/usMapData.js')) {
  if (cache) return Promise.resolve(cache)
  inflight ??= importer()
    .then(m => { cache = m.US_STATES; listeners.forEach(f => f(cache)); return cache })
    .catch(err => { inflight = null; throw err })
  return inflight
}

// Fire-and-forget warm-up so the chunk is fetched before the map mounts.
// Rejection is swallowed: the mounting map retries on its own.
export function preloadUsMapData(importer) {
  return loadUsMapData(importer).then(() => {}, () => {})
}

// "Tap to retry": drop any stuck/failed request and ask again. Mounted hooks
// hear about the result through `listeners`.
export function retryUsMapData(importer) {
  inflight = null
  return preloadUsMapData(importer)
}

export function useUsMapData() {
  const [states, setStates] = useState(cache)
  useEffect(() => {
    if (cache) return
    let cancelled = false
    const set = s => { if (!cancelled) setStates(s) }
    listeners.add(set)
    loadUsMapData().then(set, () => {}) // stays null; the retry overlay or next mount retries
    return () => { cancelled = true; listeners.delete(set) }
  }, [])
  return states
}
