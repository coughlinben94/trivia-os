import { isValidPin } from './pinScoring.js'

// Host-side place search over OpenStreetMap Nominatim (public API, no key).
// Usage policy: max 1 request/second, no autocomplete-as-you-type. The UI
// searches on a button press only; createRateLimitedSearch enforces the gap.
const MAX_RESULTS = 6
const LOCALITY_KEYS = ['city', 'town', 'village', 'hamlet', 'municipality', 'county']

export function buildSearchUrl(query) {
  return 'https://nominatim.openstreetmap.org/search?format=jsonv2'
    + `&q=${encodeURIComponent(String(query ?? '').trim())}`
    + `&countrycodes=us&limit=${MAX_RESULTS}&addressdetails=1&accept-language=en`
}

function shortLabel(row) {
  const a = row.address && typeof row.address === 'object' ? row.address : {}
  const place = (typeof row.name === 'string' && row.name.trim())
    || LOCALITY_KEYS.map(k => a[k]).find(v => typeof v === 'string' && v.trim())
  const state = typeof a.state === 'string' ? a.state.trim() : ''
  if (place) return state && state !== place ? `${place}, ${state}` : place
  return typeof row.display_name === 'string' ? row.display_name : ''
}

export function parseNominatimResults(json) {
  if (!Array.isArray(json)) return []
  const out = []
  for (const row of json) {
    if (!row || typeof row !== 'object') continue
    const lat = parseFloat(row.lat)
    const lon = parseFloat(row.lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
    out.push({ label: shortLabel(row) || `${lat}, ${lon}`, lat, lon, valid: isValidPin({ lat, lon }) })
    if (out.length === MAX_RESULTS) break
  }
  return out
}

function abortError() {
  return Object.assign(new Error('Aborted'), { name: 'AbortError' })
}

// search(query, signal) starts each request at least minGapMs after the
// previous one started. Aborting while waiting rejects with AbortError.
export function createRateLimitedSearch({ fetchImpl = (...a) => fetch(...a), minGapMs = 1100, now = () => Date.now() } = {}) {
  let nextStart = 0
  return {
    async search(query, signal) {
      const start = Math.max(now(), nextStart)
      nextStart = start + minGapMs
      const wait = start - now()
      if (wait > 0) {
        await new Promise((resolve, reject) => {
          if (signal?.aborted) return reject(abortError())
          const t = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve() }, wait)
          function onAbort() { clearTimeout(t); reject(abortError()) }
          signal?.addEventListener('abort', onAbort, { once: true })
        })
      }
      if (signal?.aborted) throw abortError()
      const res = await fetchImpl(buildSearchUrl(query), { signal, headers: { Accept: 'application/json' } })
      if (!res.ok) throw new Error(`Search failed (${res.status})`)
      return parseNominatimResults(await res.json())
    },
  }
}
