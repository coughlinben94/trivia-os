import { describe, it, expect, vi } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { buildCatalogIndex, loadBendleCatalog, searchCatalog } from './bendleCatalog.js'
import { BENDLE_CATALOG_URL } from './bendleCatalogVersion.js'

const ROWS = [
  ['Mr. Brightside', 'The Killers', 60], ['Mr. Blue Sky', 'Electric Light Orchestra', 40], ['Mr. Blue', 'Catherine Feeny', 3],
  ['Bohemian Rhapsody', 'Queen', 90], ["Don't Stop Believin'", 'Journey', 55], ['Africa', 'Toto', 50], ['Africa', 'Weezer', 8],
  ['Hey Jude', 'The Beatles', 80], ['Hey Ya!', 'Outkast', 70], ["Sweet Child o' Mine", "Guns N' Roses", 65],
  ['Sweet Dreams (Are Made of This)', 'Eurythmics', 75], ['Billie Jean', 'Michael Jackson', 85], ["Livin' on a Prayer", 'Bon Jovi', 50],
  ['Wonderwall', 'Oasis', 60], ['Hotel California', 'Eagles', 70], ['Smells Like Teen Spirit', 'Nirvana', 80],
  ['Rolling in the Deep', 'Adele', 75], ['Sweet Caroline', 'Neil Diamond', 40], ['Shake It Off', 'Taylor Swift', 60],
  ['I Wanna Dance with Somebody (Who Loves Me)', 'Whitney Houston', 55], ['Dancing Queen', 'ABBA', 88], ['Halo', 'Beyoncé', 45],
]
const index = buildCatalogIndex(ROWS)

describe('searchCatalog: the 15 typed queries from the spec', () => {
  it.each([
    ['mr bright', 'Mr. Brightside'], ['bohemian rhaps', 'Bohemian Rhapsody'], ['dont stop believ', "Don't Stop Believin'"],
    ['africa toto', 'Africa|Toto'], ['mr blue sky', 'Mr. Blue Sky'], ['hey jude', 'Hey Jude'], ['sweet child', "Sweet Child o' Mine"],
    ['billie jean', 'Billie Jean'], ['livin on a prayer', "Livin' on a Prayer"], ['wonderwall', 'Wonderwall'],
    ['hotel california', 'Hotel California'], ['smells like teen', 'Smells Like Teen Spirit'], ['rolling in the deep', 'Rolling in the Deep'],
    ['sweet caroline', 'Sweet Caroline'], ['shake it off', 'Shake It Off'],
  ])('%s', (query, want) => {
    const [title, artist] = want.split('|')
    const [first] = searchCatalog(index, query)
    expect(first.title).toBe(title)
    if (artist) expect(first.artist).toBe(artist)
  })
  it('also finds accented and bracketed titles', () => {
    expect(searchCatalog(index, 'beyonce')[0].title).toBe('Halo')
    expect(searchCatalog(index, 'i wanna dance with')[0].title).toBe('I Wanna Dance with Somebody (Who Loves Me)')
  })
})

describe('ranking and limits', () => {
  it('orders matches by article count', () => {
    expect(searchCatalog(index, 'sweet').map(r => r.title)).toEqual(['Sweet Dreams (Are Made of This)', "Sweet Child o' Mine", 'Sweet Caroline'])
    expect(searchCatalog(index, 'africa').map(r => r.artist)).toEqual(['Toto', 'Weezer'])
    expect(searchCatalog(index, 'queen').map(r => r.title)).toEqual(['Bohemian Rhapsody', 'Dancing Queen'])
  })
  it('caps at the limit (8 by default) and ignores empty queries', () => {
    // 's' matches exactly 8 fixture rows (sky, stop, sweet x3, spirit, swift, somebody)
    expect(searchCatalog(index, 's')).toHaveLength(8)
    expect(searchCatalog(index, 's', 3)).toHaveLength(3)
    expect(searchCatalog(index, '   ')).toEqual([])
    expect(searchCatalog(index, '!!!')).toEqual([])
  })
  it('returns only title and artist', () => {
    expect(searchCatalog(index, 'wonderwall')[0]).toEqual({ title: 'Wonderwall', artist: 'Oasis' })
  })
})

describe('loadBendleCatalog', () => {
  it('fetches once per url and builds the index', async () => {
    const fetcher = vi.fn(async () => ({ ok: true, json: async () => ({ version: 'v1', rows: ROWS }) }))
    const a = await loadBendleCatalog('/bendle-catalog.test1.json', fetcher)
    const b = await loadBendleCatalog('/bendle-catalog.test1.json', fetcher)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(a).toBe(b)
    expect(a[0].title).toBe('Bohemian Rhapsody')
  })
  it('does not cache a failure', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ rows: ROWS }) })
    await expect(loadBendleCatalog('/bendle-catalog.test2.json', fetcher)).rejects.toThrow('HTTP 500')
    await expect(loadBendleCatalog('/bendle-catalog.test2.json', fetcher)).resolves.toHaveLength(ROWS.length)
  })
  it('rejects when no catalog has been built yet', async () => {
    await expect(loadBendleCatalog(null)).rejects.toThrow(/no song list/)
  })
})

// Runs only once the owner has built and committed the real file (Task 7).
const realPath = BENDLE_CATALOG_URL ? new URL(`../../../public${BENDLE_CATALOG_URL}`, import.meta.url) : null
describe.skipIf(!realPath || !existsSync(realPath))('real catalog', () => {
  it('finds the spec queries in the top 8', () => {
    const real = buildCatalogIndex(JSON.parse(readFileSync(realPath, 'utf8')).rows)
    for (const [q, title] of [['mr bright', 'Mr. Brightside'], ['bohemian rhaps', 'Bohemian Rhapsody'], ['africa toto', 'Africa'], ['mr blue sky', 'Mr. Blue Sky'], ['hey jude', 'Hey Jude']]) {
      expect(searchCatalog(real, q).map(r => r.title), q).toContain(title)
    }
  })
})
