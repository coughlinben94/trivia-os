import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { makeRoute } from './forestRoute.js'

const kinds = r => r.map(s => s.kind)
const BEND = k => k === 'bendL' || k === 'bendR'

describe('makeRoute', () => {
  it('is deterministic', () => {
    for (const s of [0, 1, 1031, 99999, 2 ** 32 - 1]) expect(makeRoute(s, 13)).toEqual(makeRoute(s, 13))
  })

  it('obeys the route rules over 500 seeds', () => {
    for (let s = 0; s < 500; s++) {
      const k = kinds(makeRoute(s, 13)), n = k.length, cnt = x => k.filter(v => v === x).length
      expect(n).toBe(13)
      expect(k[0]).toBe('straight')
      expect(k[10]).toBe('straight')
      const INNER = x => x === 'barn' || x === 'house'
      expect(INNER(k[12])).toBe(false)
      expect(cnt('barn') + cnt('house')).toBeGreaterThanOrEqual(1)
      expect(cnt('barn') + cnt('house')).toBeLessThanOrEqual(3)
      for (const x of ['barn', 'house']) expect(cnt(x)).toBeLessThanOrEqual(2)
      for (const x of ['bendL', 'bendR']) expect(cnt(x)).toBeLessThanOrEqual(3)
      expect(cnt('bendL')).toBe(cnt('bendR'))
      for (let i = 0; i < n; i++) {
        const p = k[(i + n - 1) % n], pp = k[(i + n - 2) % n]
        if (INNER(p)) expect(k[i]).toBe('straight') // no two interiors in a row; exit is straight
        expect(BEND(k[i]) && BEND(p) && BEND(pp)).toBe(false)
      }
    }
  })

  it('uses both interior kinds and all three layouts across seeds', () => {
    const seen = new Set(), both = []
    for (let s = 0; s < 200; s++) {
      const r = makeRoute(s, 13)
      for (const x of r) if (x.kind === 'barn' || x.kind === 'house') seen.add(x.kind + x.variant)
      if (r.some(x => x.kind === 'barn') && r.some(x => x.kind === 'house')) both.push(s)
    }
    for (const k of ['barn', 'house']) for (const v of [0, 1, 2]) expect(seen.has(k + v)).toBe(true)
    expect(both.length).toBeGreaterThan(20)
  })

  it('never repeats an interior layout within a route, and layouts vary by seed', () => {
    const layouts = new Set()
    for (let s = 0; s < 500; s++) {
      const inner = makeRoute(s, 13).filter(x => x.kind === 'barn' || x.kind === 'house').map(x => x.kind + x.variant)
      expect(new Set(inner).size).toBe(inner.length)
      if (s < 60) layouts.add(inner.join(','))
    }
    expect(layouts.size).toBeGreaterThan(30)
  })

  it('gives different seeds different routes', () => {
    const seen = new Set()
    for (let s = 0; s < 100; s++) seen.add(kinds(makeRoute(s, 13)).join(','))
    expect(seen.size).toBeGreaterThan(80)
  })

  it('matches the copy inlined in the v4 prototype page', () => {
    const html = readFileSync(new URL('../../../../concepts/haunted-forest-route-v4.html', import.meta.url), 'utf8')
    const m = /\/\*ROUTE\*\/([\s\S]*?)\/\*\/ROUTE\*\//.exec(html)
    expect(m).toBeTruthy()
    const src = readFileSync(new URL('./forestRoute.js', import.meta.url), 'utf8')
    const fn = /export (function makeRoute[\s\S]*?\n})/.exec(src)[1]
    expect(m[1].trim()).toBe(fn) // source text, not toString(): the test runner transforms the module
  })
})
