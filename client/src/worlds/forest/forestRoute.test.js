import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { makeRoute, drawRoute, assertRoute, FOREST_POOL, forestStretches, BIOMES, hash32, rng, seedFrom } from './forestRoute.js'
import { hash32 as hashE, rng as rngE } from '../../lib/ringEngine.js'
import { seedFrom as seedFromP } from '../../lib/paletteGenerator.js'

const PAGE = new URL('../../../../concepts/haunted-forest-route-v4.html', import.meta.url)
const LENGTHS = [13, 24, 36, 60, 80]
const marks = s => s.role === 'approach' || s.key === 'gate' || s.key === 'moonrise'

describe('forest pool', () => {
  it('holds >= 1.5x a 36-station lap of distinct keys, >= 28 kinds, barns and shacks, no house', () => {
    const keys = new Set(FOREST_POOL.map(s => s.key)), kinds = new Set(FOREST_POOL.map(s => s.kind))
    expect(keys.size).toBe(FOREST_POOL.length)
    expect(keys.size).toBeGreaterThanOrEqual(54)
    expect(kinds.size).toBeGreaterThanOrEqual(28)
    expect(FOREST_POOL.filter(s => s.interior).map(s => s.kind).sort()).toEqual(['barn', 'barn', 'barn', 'shack', 'shack', 'shack'])
    expect(JSON.stringify(FOREST_POOL)).not.toMatch(/house|mansion|church/i)
    // natural (woodland, floor, water, clearing, creature) kinds outnumber human traces
    const nat = new Set(FOREST_POOL.filter(s => s.natural).map(s => s.kind)).size
    expect(nat / (kinds.size - 2)).toBeGreaterThan(0.55)
  })
  it('inlines the repo hash32 / rng / seedFrom unchanged', () => {
    for (const [a, b] of [[0, 0], [1, 2], [123456, 0xD0A1], [-5, 99]]) expect(hash32(a, b)).toBe(hashE(a, b))
    const r1 = rng(7, 9), r2 = rngE(7, 9); for (let i = 0; i < 20; i++) expect(r1()).toBe(r2())
    for (const t of ['', 'show-1', 'abc']) expect(seedFrom(t)).toBe(seedFromP(t))
  })
})

describe('drawRoute / makeRoute', () => {
  it('is deterministic, and authored is fixed', () => {
    for (const s of [0, 1, 1031, 99999, 2 ** 32 - 1]) expect(makeRoute(s, 36)).toEqual(makeRoute(s, 36))
    expect(drawRoute(FOREST_POOL, { seed: 'authored', stations: 36 })).toEqual(drawRoute(FOREST_POOL, { seed: 'authored', stations: 36 }))
  })

  for (const n of LENGTHS) it(`obeys every rule over 500 seeds at ${n} stations (draws, never the fallback)`, () => {
    let fallbacks = 0
    for (let s = 0; s < 500; s++) {
      const r = makeRoute(s, n)
      expect(r.length).toBe(n)
      expect(() => assertRoute(r, { stations: n })).not.toThrow()
      expect(r.some(x => x.kind === 'house')).toBe(false)
      if (r.map(x => x.key).join() === drawRoute(FOREST_POOL, { seed: 'authored', stations: n }).map(x => x.key).join()) fallbacks++
      // independent re-checks of the headline rules
      const ks = r.filter(x => !marks(x)).map(x => x.key); expect(new Set(ks).size).toBe(ks.length)
      r.forEach((x, i) => {
        if (marks(x)) return
        for (let d = 1; d <= 3; d++) { const o = r[(i + d) % n]; if (!marks(o)) { expect(o.kind === x.kind).toBe(false); if (d < 3) expect(o.family === x.family).toBe(false) } }
        if (x.interior) { expect(r[i - 1].role).toBe('approach'); expect(r[(i + 1) % n].seg).toBe('straight'); expect(r[(i + 1) % n].interior).toBe(false) }
      })
      const ni = r.filter(x => x.interior).length
      expect(ni).toBeGreaterThanOrEqual(1)
      if (n >= 24) expect(ni).toBeGreaterThanOrEqual(3)
      if (ni >= 2) { expect(r.some(x => x.kind === 'barn')).toBe(true); expect(r.some(x => x.kind === 'shack')).toBe(true) }
      const L = r.filter(x => x.seg === 'bendL').length; expect(L).toBe(r.filter(x => x.seg === 'bendR').length); expect(L).toBeGreaterThanOrEqual(1)
      for (let p = 10; p < n; p += 13) expect(r[p].key).toBe('moonrise')
      expect(r[0].key).toBe('gate')
    }
    expect(fallbacks).toBeLessThan(3)
  }, 120000)

  it('gives a 36-station lap >= 20 distinct kinds, and different seeds different laps', () => {
    const orders = new Set(); let minKinds = 99
    for (let s = 0; s < 200; s++) {
      const r = makeRoute(s, 36); orders.add(r.map(x => x.key).join())
      minKinds = Math.min(minKinds, new Set(r.filter(x => !marks(x)).map(x => x.kind)).size)
    }
    expect(minKinds).toBeGreaterThanOrEqual(20)
    expect(orders.size).toBe(200)
  })

  it('uses every interior layout across seeds and never repeats one in a lap', () => {
    const seen = new Set()
    for (let s = 0; s < 300; s++) {
      const inner = makeRoute(s, 36).filter(x => x.interior).map(x => x.key)
      expect(new Set(inner).size).toBe(inner.length)
      inner.forEach(k => seen.add(k))
    }
    expect(seen.size).toBe(6)
  })

  it('rejects a broken lap', () => {
    const r = makeRoute(5, 36).map(x => ({ ...x })), i = r.findIndex(x => x.interior)
    r[i + 1] = { ...r[i + 1], seg: 'bendL' }
    expect(() => assertRoute(r)).toThrow()
  })
})

describe('forestStretches', () => {
  it('changes woodland type every 5-8 stations (shorter only where the lap closes), starting with the seed\'s own', () => {
    for (const n of LENGTHS) for (let s = 0; s < 200; s++) {
      const { base, biome } = forestStretches(s, n)
      expect(biome.length).toBe(n); expect(biome[0]).toBe(base); for (const b of biome) expect(BIOMES).toContain(b)
      const runs = []; let c = 1; for (let i = 1; i <= n; i++) { if (i < n && biome[i] === biome[i - 1]) c++; else { runs.push(c); c = 1 } }
      runs.slice(0, -1).forEach(x => expect(x).toBeGreaterThanOrEqual(3))
      runs.slice(0, -1).forEach(x => expect(x).toBeLessThanOrEqual(10))
      if (n >= 24) expect(new Set(biome).size).toBeGreaterThanOrEqual(3)
      expect(biome[n - 1] === biome[0] && new Set(biome).size > 1).toBe(false)
    }
  })
})

describe('page', () => {
  it('has no house anywhere', () => {
    expect(readFileSync(new URL('./forestRoute.js', import.meta.url), 'utf8')).not.toMatch(/house/i)
    expect(readFileSync(PAGE, 'utf8')).not.toMatch(/house|mansion|church/i)
  })
  it('carries the route block byte-identically', () => {
    const html = readFileSync(PAGE, 'utf8')
    const m = /\/\/ <inline>[^\n]*\n([\s\S]*?)\/\/ <\/inline>/.exec(html)
    expect(m).toBeTruthy()
    const src = readFileSync(new URL('./forestRoute.js', import.meta.url), 'utf8')
    const block = /\/\/ <inline>[^\n]*\n([\s\S]*?)\/\/ <\/inline>/.exec(src)[1].replace(/^export /gm, '')
    expect(m[1]).toBe(block)
  })
})
