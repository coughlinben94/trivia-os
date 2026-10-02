// scripts/build-bendle-catalog.test.mjs
import { describe, it, expect, vi } from 'vitest'
import { gunzipSync, gzipSync } from 'node:zlib'
import { sparqlFor, userAgent, buildRows, catalogFile, checkCatalog, versionModule, main, ITEM_TYPES, MIN_ROWS } from './build-bendle-catalog.mjs'

const b = (qid, title, artist, l) => ({ s: { value: `http://www.wikidata.org/entity/${qid}` }, title: { value: title }, artist: { value: artist }, l: { value: String(l) } })

describe('build-bendle-catalog', () => {
  it('one item type per query, performer and 3+ sitelinks, English labels', () => {
    const q = sparqlFor('Q7366')
    expect(q).toContain('wdt:P31 wd:Q7366')
    expect(q).toContain('wdt:P175 ?p')
    expect(q).toContain('FILTER(?l >= 3)')
    expect(q).toContain('LANG(?title) = "en"')
    expect(ITEM_TYPES).toEqual(['Q7366', 'Q134556', 'Q105543609', 'Q55850593'])
  })
  it('refuses to run without contact info for the User-Agent', () => {
    expect(() => userAgent('')).toThrow(/BENDLE_CATALOG_CONTACT/)
    expect(userAgent('me@example.com')).toBe('TriviaOS-BendleCatalog/1.0 (me@example.com)')
  })
  it('joins performers per item, dedupes on normalized title+artist keeping the higher rank, sorts by rank', () => {
    const rows = buildRows([
      b('Q1', 'Under Pressure', 'Queen', 30), b('Q1', 'Under Pressure', 'David Bowie', 30),
      b('Q2', 'Africa', 'Toto', 50), b('Q3', 'Africa', 'Toto', 12), // duplicate song, lower rank
      b('Q4', 'Africa', 'Weezer', 8), b('Q5', '(Remix)', 'Nobody', 99), b('Q6', '', 'Nobody', 99),
    ])
    expect(rows).toEqual([['Africa', 'Toto', 50], ['Under Pressure', 'David Bowie & Queen', 30], ['Africa', 'Weezer', 8]])
  })
  it('names the file by a content hash and measures the gzip size', () => {
    const file = catalogFile([['Africa', 'Toto', 50]], '2026-10-02')
    expect(file.name).toMatch(/^bendle-catalog\.[0-9a-f]{10}\.json$/)
    expect(JSON.parse(file.json)).toEqual({ version: file.version, source: 'Wikidata (CC0)', built: '2026-10-02', rows: [['Africa', 'Toto', 50]] })
    expect(gunzipSync(gzipSync(file.json)).toString()).toBe(file.json)
    expect(file.gzipBytes).toBeGreaterThan(0)
    expect(catalogFile([['Africa', 'Toto', 50]], '2026-11-01').version).toBe(file.version) // date does not change the hash
  })
  it('size and row-count checks', () => {
    expect(checkCatalog({ rows: new Array(MIN_ROWS).fill(0), gzipBytes: 600_000 })).toEqual([])
    expect(checkCatalog({ rows: [], gzipBytes: 2_000_000 })).toHaveLength(2)
  })
  it('version module points at the file', () => {
    expect(versionModule('bendle-catalog.abc.json')).toContain("export const BENDLE_CATALOG_URL = '/bendle-catalog.abc.json'")
  })
  it('--dry-run queries each type one at a time and writes nothing', async () => {
    let inFlight = 0, maxInFlight = 0
    const many = Array.from({ length: MIN_ROWS }, (_, i) => b(`Q${i + 10}`, `Song ${i}`, `Artist ${i}`, 3 + (i % 50)))
    const fetcher = vi.fn(async (url, init) => {
      inFlight++; maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise(r => setTimeout(r, 1)); inFlight--
      expect(init.headers['User-Agent']).toBe('TriviaOS-BendleCatalog/1.0 (me@example.com)')
      const type = new URLSearchParams(init.body).get('query').match(/wd:(Q\d+)/)[1]
      return { ok: true, json: async () => ({ results: { bindings: type === 'Q7366' ? many : [] } }) }
    })
    const file = await main({ argv: ['--dry-run'], env: { BENDLE_CATALOG_CONTACT: 'me@example.com' }, fetcher })
    expect(fetcher).toHaveBeenCalledTimes(4)
    expect(maxInFlight).toBe(1)
    expect(JSON.parse(file.json).rows).toHaveLength(MIN_ROWS)
  })
})
