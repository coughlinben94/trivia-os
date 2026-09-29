// client/src/hooks/useUsMapData.js
import { useEffect, useState } from 'react'

// The state outlines are ~tens of KB, so they load only when a Pin It surface
// mounts. Module-level cache: one import for the whole session.
let cache = null
let inflight = null

export function useUsMapData() {
  const [states, setStates] = useState(cache)
  useEffect(() => {
    if (cache) return
    let cancelled = false
    inflight ??= import('../lib/usMapData.js').then(m => { cache = m.US_STATES; return cache })
    inflight.then(s => { if (!cancelled) setStates(s) })
    return () => { cancelled = true }
  }, [])
  return states
}
