// client/src/hooks/useUsMapData.js
import { useEffect, useState } from 'react'

// The state outlines are ~tens of KB, so they load only when a Pin It surface
// mounts. Module-level cache: one import for the whole session. A failed
// import is NOT cached, so the next mount retries (bar wifi).
let cache = null
let inflight = null

export function loadUsMapData(importer = () => import('../lib/usMapData.js')) {
  if (cache) return Promise.resolve(cache)
  inflight ??= importer()
    .then(m => { cache = m.US_STATES; return cache })
    .catch(err => { inflight = null; throw err })
  return inflight
}

export function useUsMapData() {
  const [states, setStates] = useState(cache)
  useEffect(() => {
    if (cache) return
    let cancelled = false
    loadUsMapData().then(s => { if (!cancelled) setStates(s) }, () => {}) // stays null; next mount retries
    return () => { cancelled = true }
  }, [])
  return states
}
