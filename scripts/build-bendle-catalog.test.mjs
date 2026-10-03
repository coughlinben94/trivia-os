// scripts/build-bendle-catalog.test.mjs
import { describe, it, expect, vi } from 'vitest'
import * as realFs from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { gunzipSync, gzipSync } from 'node:zlib'
import { sparqlFor, userAgent, buildRows, catalogFile, checkCatalog, versionModule, runQuery, main, ITEM_TYPES, SITELINK_BANDS, MIN_ROWS } from './build-bendle-catalog.mjs'

const ok = body => ({ ok: true, text: async () => JSON.stringify(body) })
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
  it('a band limits sitelinks to [lo, hi) so each query stays small enough for Wikidata\'s timeout', () => {
    const q = sparqlFor('Q134556', [4, 5])
    expect(q).toContain('FILTER(?l >= 4)')
    expect(q).toContain('FILTER(?l < 5)')
    const top = sparqlFor('Q134556', [10, null])
    expect(top).toContain('FILTER(?l >= 10)')
    expect(top).not.toContain('?l <')
  })
  it('bands start at MIN_SITELINKS, touch end to end and leave the top open', () => {
    expect(SITELINK_BANDS[0][0]).toBe(3)
    for (let i = 1; i < SITELINK_BANDS.length; i++) expect(SITELINK_BANDS[i][0]).toBe(SITELINK_BANDS[i - 1][1])
    expect(SITELINK_BANDS.at(-1)[1]).toBe(null)
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
      const q = new URLSearchParams(init.body).get('query')
      const type = q.match(/wd:(Q\d+)/)[1]
      const lo = Number(q.match(/\?l >= (\d+)/)[1])
      // Q7366's rows are split across bands; main must merge them all.
      return ok({ results: { bindings: type === 'Q7366' ? many.filter((_, i) => i % SITELINK_BANDS.length === SITELINK_BANDS.findIndex(([l]) => l === lo)) : [] } })
    })
    const file = await main({ argv: ['--dry-run'], env: { BENDLE_CATALOG_CONTACT: 'me@example.com' }, fetcher })
    expect(fetcher).toHaveBeenCalledTimes(ITEM_TYPES.length * SITELINK_BANDS.length)
    expect(maxInFlight).toBe(1)
    expect(JSON.parse(file.json).rows).toHaveLength(MIN_ROWS)
  })

  describe('write path (temp dir, never the real public/)', () => {
    const env = { BENDLE_CATALOG_CONTACT: 'me@example.com' }
    const many = Array.from({ length: MIN_ROWS }, (_, i) => b(`Q${i + 10}`, `Song ${i}`, `Artist ${i}`, 3 + (i % 50)))
    const okFetcher = async () => ok({ results: { bindings: many } })
    const setup = () => {
      const root = realFs.mkdtempSync(join(tmpdir(), 'bendle-'))
      const publicDir = pathToFileURL(join(root, 'public') + '/')
      realFs.mkdirSync(new URL(publicDir))
      const versionFile = pathToFileURL(join(root, 'ver.js'))
      realFs.writeFileSync(new URL('bendle-catalog.old0000000.json', publicDir), '{}')
      realFs.writeFileSync(versionFile, versionModule('bendle-catalog.old0000000.json'))
      return { root, publicDir, versionFile }
    }
    const names = d => realFs.readdirSync(new URL(d)).sort()

    it('writes catalog + version file and removes the old catalog', async () => {
      const { publicDir, versionFile } = setup()
      const file = await main({ argv: [], env, fetcher: okFetcher, publicDir, versionFile })
      expect(names(publicDir)).toEqual([file.name])
      expect(realFs.readFileSync(versionFile, 'utf8')).toBe(versionModule(file.name))
    })
    it('creates public/ if missing', async () => {
      const { root, versionFile } = setup()
      const publicDir = pathToFileURL(join(root, 'fresh') + '/')
      const file = await main({ argv: [], env, fetcher: okFetcher, publicDir, versionFile })
      expect(names(publicDir)).toEqual([file.name])
    })
    it('a failure between steps leaves the old catalog and version module, no .tmp files', async () => {
      const { publicDir, versionFile } = setup()
      const fs = { ...realFs, renameSync: vi.fn(realFs.renameSync) }
      fs.renameSync.mockImplementationOnce(realFs.renameSync).mockImplementationOnce(() => { throw new Error('disk') })
      await expect(main({ argv: [], env, fetcher: okFetcher, publicDir, versionFile, fs })).rejects.toThrow('disk')
      expect(names(publicDir)).toEqual(['bendle-catalog.old0000000.json'])
      expect(realFs.readFileSync(versionFile, 'utf8')).toBe(versionModule('bendle-catalog.old0000000.json'))
      expect(realFs.readdirSync(new URL('.', versionFile)).filter(f => f.endsWith('.tmp'))).toEqual([])
    })
    it('re-running with the same data is idempotent', async () => {
      const { publicDir, versionFile } = setup()
      const a = await main({ argv: [], env, fetcher: okFetcher, publicDir, versionFile })
      const ver = realFs.readFileSync(versionFile, 'utf8')
      const c = await main({ argv: [], env, fetcher: okFetcher, publicDir, versionFile })
      expect(c.name).toBe(a.name)
      expect(names(publicDir)).toEqual([a.name])
      expect(realFs.readFileSync(versionFile, 'utf8')).toBe(ver)
    })
    it('--dry-run touches no files', async () => {
      const { publicDir, versionFile } = setup()
      const fs = Object.fromEntries(['mkdirSync', 'writeFileSync', 'renameSync', 'unlinkSync', 'rmSync'].map(k => [k, vi.fn()]))
      await main({ argv: ['--dry-run'], env, fetcher: okFetcher, publicDir, versionFile, fs: { ...realFs, ...fs } })
      for (const k in fs) expect(fs[k]).not.toHaveBeenCalled()
      expect(names(publicDir)).toEqual(['bendle-catalog.old0000000.json'])
    })
    it('clear error when a 200 response has no results.bindings', async () => {
      const { publicDir, versionFile } = setup()
      const fetcher = async () => ok({})
      await expect(main({ argv: ['--dry-run'], env, fetcher, publicDir, versionFile })).rejects.toThrow(/no results\.bindings/)
    })
    it('retries when a 200 body arrives corrupted (seen live: Wikidata big responses fail JSON.parse at random)', async () => {
      let calls = 0
      const fetcher = async () => ({ ok: true, text: async () => ++calls < 3 ? '{"results":{"bindings":[{"x":' : '{"results":{"bindings":[{"x":1}]}}' })
      expect(await runQuery('Q7366', [3, 4], 'ua', fetcher, 0)).toEqual([{ x: 1 }])
      expect(calls).toBe(3)
    })
    it('retries when Wikidata splices its timeout error into a 200 body, even if the JSON part looks whole', async () => {
      let calls = 0
      const spliced = '{"results":{"bindings":[]}}\nSPARQL-QUERY: queryStr=SELECT ?s ?title\njava.util.concurrent.TimeoutException'
      const fetcher = async () => ({ ok: true, text: async () => ++calls < 4 ? spliced : '{"results":{"bindings":[{"x":1}]}}' })
      expect(await runQuery('Q134556', [3, 4], 'ua', fetcher, 0)).toEqual([{ x: 1 }])
      expect(calls).toBe(4)
    })
    it('gives up with a clear error after four corrupted bodies', async () => {
      let calls = 0
      const fetcher = async () => ({ ok: true, text: async () => { calls++; return 'SPARQL-QUERY: queryStr=SELECT' } })
      await expect(runQuery('Q7366', [3, 4], 'ua', fetcher, 0)).rejects.toThrow(/Q7366.*\[3, 4\).*unreadable/)
      expect(calls).toBe(4)
    })
  })
})
