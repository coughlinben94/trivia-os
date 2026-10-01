import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { makeForest } from './forestGen.js'

// FNV-1a 32, same function evaluated inside the v3 page to capture the goldens below.
const h = s => { let x = 0x811c9dc5; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619) } return (x >>> 0).toString(16).padStart(8, '0') }
const layersHash = (f, c) => h(f.collect(c, false).slice(0, 50).map(([z, it]) => it.geom(z, 'x').layers.join('|')).join('\n'))
const fingerprint = f => ({
  items: f.items.length,
  gitems: f.gitems.length,
  ground: h([...Array(13)].map((_, c) => f.groundSvg(c)).join('\n')),
  geoms: h(f.items.map(it => it.geom(10, 'x').layers.join('|')).join('\n')),
})

// GOLDENS: captured 2026-10-01 from concepts/haunted-forest-walk-v3.html loaded via file:// in Playwright's
// bundled Chromium. Counts = window.__forest.items / .gitems. Hashes came from a temporary copy of v3
// (scratchpad, original untouched) whose __forest also exposed collect and groundSvg, evaluated in-page with h().
const V3 = {
  items: 143,
  gitems: 273,
  layers: { 0: '53d267c1', 4: '7f48e1f0', 10: 'bb0fd630' }, // first 50 of collect(c,false), geom(z,'x').layers
  ground: { 0: '118ef90a', 4: '080a549d', 10: 'a989f87e' }, // groundSvg(c)
  collectN: { 0: 80, 4: 78, 10: 77 },
}

describe('forestGen', () => {
  it('(a) same seed twice is deterministic', () => {
    expect(fingerprint(makeForest({ seed: 7 }))).toEqual(fingerprint(makeForest({ seed: 7 })))
    expect(fingerprint(makeForest())).toEqual(fingerprint(makeForest()))
  })

  it('(b) seed+1 changes the world', () => {
    const a = fingerprint(makeForest({ seed: 0 })), b = fingerprint(makeForest({ seed: 1 }))
    expect(b.ground).not.toBe(a.ground)
    expect(b.geoms).not.toBe(a.geoms)
  })

  it('(c) item/gitem counts at parity match v3', () => {
    const f = makeForest({ walk: { durMs: 4000, stepM: 6 } })
    expect(f.items.length).toBe(V3.items)
    expect(f.gitems.length).toBe(V3.gitems)
  })

  it('(d) golden fidelity vs v3 at stations 0, 4, 10', () => {
    const f = makeForest()
    for (const c of [0, 4, 10]) {
      expect(f.collect(c, false).length, `collect n @${c}`).toBe(V3.collectN[c])
      expect(layersHash(f, c), `layers @${c}`).toBe(V3.layers[c])
      expect(h(f.groundSvg(c)), `ground @${c}`).toBe(V3.ground[c])
    }
  })

  it('(e) no DOM / global / unseeded-random use in the module source', () => {
    const src = readFileSync(new URL('./forestGen.js', import.meta.url), 'utf8')
    for (const bad of ['document', 'Math.random', 'requestAnimationFrame']) expect(src).not.toContain(bad)
    // 'window' appears in v3 data ('cabin with a lit window') and comments; forbid it as an identifier only
    const code = src.replace(/\/\/.*$/gm, '')
    expect(code).not.toMatch(/\bwindow\s*[.[]|\bglobalThis\b/)
  })

  it('(f) walk parameterization', () => {
    const f = makeForest({ walk: { durMs: 7000, stepM: 10 } })
    expect(f.constants.D).toBe(10)
    expect(f.constants.L).toBe(130)
    expect(f.constants.DUR).toBe(7000)
    expect(f.items.length).toBeGreaterThan(0)
    expect(() => f.groundSvg(3) + f.groundKF('g1')).not.toThrow()
  })
})
