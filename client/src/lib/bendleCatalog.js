// The Bendle song list on the phone: one static file built from Wikidata
// (CC0) by scripts/build-bendle-catalog.mjs, loaded once per page and
// searched locally. No music service is called at show time.
import { normalizeText } from './bendleGuessScoring.js'
import { BENDLE_CATALOG_URL } from './bendleCatalogVersion.js'

const cache = new Map() // url -> Promise<CatalogIndexRow[]>

export function buildCatalogIndex(rows) {
  return (rows ?? [])
    .filter(r => Array.isArray(r) && typeof r[0] === 'string')
    .map(([title, artist, rank]) => ({
      title,
      artist: typeof artist === 'string' && artist ? artist : null,
      rank: Number(rank) || 0,
      words: `${normalizeText(title)} ${normalizeText(artist)}`.split(' ').filter(Boolean),
    }))
    .sort((a, b) => b.rank - a.rank)
}

export function loadBendleCatalog(url = BENDLE_CATALOG_URL, fetcher = globalThis.fetch) {
  if (!url) return Promise.reject(new Error('no song list built yet'))
  if (!cache.has(url)) {
    const p = Promise.resolve()
      .then(() => fetcher(url))
      .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json() })
      .then(body => buildCatalogIndex(body?.rows))
    p.catch(() => cache.delete(url))
    cache.set(url, p)
  }
  return cache.get(url)
}

// ponytail: linear scan of ~55k rows per keystroke (a few ms on a phone,
// behind a 100 ms debounce); add a first-letter bucket if it ever lags.
export function searchCatalog(index, query, limit = 8) {
  const terms = normalizeText(query).split(' ').filter(Boolean)
  if (terms.length === 0) return []
  const out = []
  for (const row of index ?? []) {
    if (terms.every(t => row.words.some(w => w.startsWith(t)))) {
      out.push({ title: row.title, artist: row.artist })
      if (out.length >= limit) break
    }
  }
  return out
}
