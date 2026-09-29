import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildSearchUrl, parseNominatimResults, createRateLimitedSearch } from './placeSearch.js'

const TC = {
  lat: '44.7631', lon: '-85.6206', name: 'Traverse City', display_name: 'Traverse City, Grand Traverse County, Michigan, United States',
  address: { city: 'Traverse City', county: 'Grand Traverse County', state: 'Michigan', country: 'United States' },
}

describe('buildSearchUrl', () => {
  it('encodes the query and pins US + limit 6', () => {
    const u = buildSearchUrl('Apple Valley MN')
    expect(u.startsWith('https://nominatim.openstreetmap.org/search?')).toBe(true)
    expect(u).toContain('q=Apple%20Valley%20MN')
    expect(u).toContain('countrycodes=us')
    expect(u).toContain('limit=6')
    expect(u).toContain('format=jsonv2')
    expect(u).toContain('addressdetails=1')
  })
})

describe('parseNominatimResults', () => {
  it('parses string coordinates and builds a short label', () => {
    expect(parseNominatimResults([TC])).toEqual([{ label: 'Traverse City, Michigan', lat: 44.7631, lon: -85.6206, valid: true }])
  })
  it('marks out-of-bounds rows invalid', () => {
    const ak = { lat: '64.8', lon: '-147.7', name: 'Fairbanks', address: { city: 'Fairbanks', state: 'Alaska' } }
    expect(parseNominatimResults([ak])[0]).toMatchObject({ label: 'Fairbanks, Alaska', valid: false })
  })
  it('falls back to display_name, then a locality from address', () => {
    expect(parseNominatimResults([{ lat: '40', lon: '-100', display_name: 'Somewhere, Nebraska, United States' }])[0].label)
      .toBe('Somewhere, Nebraska, United States')
    expect(parseNominatimResults([{ lat: '40', lon: '-100', address: { town: 'Gretna', state: 'Nebraska' } }])[0].label)
      .toBe('Gretna, Nebraska')
  })
  it('skips rows without finite coordinates and caps at 6', () => {
    const rows = [{ lat: 'x', lon: '1' }, { lon: '-90' }, null, 5, ...Array.from({ length: 9 }, () => TC)]
    expect(parseNominatimResults(rows)).toHaveLength(6)
  })
  it('returns [] for garbage', () => {
    for (const g of [null, undefined, {}, 'x', 5, []]) expect(parseNominatimResults(g)).toEqual([])
  })
})

describe('createRateLimitedSearch', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(1_000_000) })
  afterEach(() => vi.useRealTimers())
  const okFetch = () => vi.fn(async () => ({ ok: true, json: async () => [TC] }))

  it('fetches once and parses', async () => {
    const f = okFetch()
    const s = createRateLimitedSearch({ fetchImpl: f, minGapMs: 1100 })
    const rows = await s.search('Traverse City')
    expect(rows[0].label).toBe('Traverse City, Michigan')
    expect(f.mock.calls[0][0]).toContain('q=Traverse%20City')
  })
  it('spaces two calls by minGapMs', async () => {
    const f = okFetch()
    const s = createRateLimitedSearch({ fetchImpl: f, minGapMs: 1100 })
    await s.search('a')
    const p = s.search('b')
    await vi.advanceTimersByTimeAsync(1000)
    expect(f).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(100)
    await p
    expect(f).toHaveBeenCalledTimes(2)
  })
  it('abort cancels a waiting call', async () => {
    const f = okFetch()
    const s = createRateLimitedSearch({ fetchImpl: f, minGapMs: 1100 })
    await s.search('a')
    const ac = new AbortController()
    const p = s.search('b', ac.signal)
    const caught = p.catch(e => e)
    ac.abort()
    await vi.advanceTimersByTimeAsync(2000)
    expect((await caught).name).toBe('AbortError')
    expect(f).toHaveBeenCalledTimes(1)
  })
  it('throws on a non-ok response', async () => {
    const s = createRateLimitedSearch({ fetchImpl: async () => ({ ok: false, status: 429 }), minGapMs: 0 })
    await expect(s.search('a')).rejects.toThrow()
  })
})
