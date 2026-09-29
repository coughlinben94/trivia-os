import { describe, it, expect } from 'vitest'
import { clampView, zoomAbout, screenToMap, fitView, MAX_K } from './pinView.js'
import { MAP_W, MAP_H } from './usMapGeo.js'

const HOME = { k: 1, tx: 0, ty: 0 }

describe('clampView', () => {
  it('keeps k within [1, MAX_K] and the map covering the viewport', () => {
    expect(clampView({ k: 0.2, tx: 50, ty: 50 })).toEqual(HOME)
    const v = clampView({ k: 99, tx: 500, ty: 500 })
    expect(v.k).toBe(MAX_K)
    expect(v.tx).toBe(0); expect(v.ty).toBe(0)
    const w = clampView({ k: 2, tx: -99999, ty: -99999 })
    expect(w.tx).toBe(MAP_W * (1 - 2)); expect(w.ty).toBe(MAP_H * (1 - 2))
  })
})

describe('zoomAbout', () => {
  it('keeps the map point under the cursor fixed', () => {
    const px = 700, py = 300
    const before = screenToMap(HOME, px, py)
    const v = zoomAbout(HOME, px, py, 2.5)
    const after = screenToMap(v, px, py)
    expect(after[0]).toBeCloseTo(before[0], 6)
    expect(after[1]).toBeCloseTo(before[1], 6)
    expect(v.k).toBe(2.5)
  })
  it('cannot zoom out past home or in past MAX_K', () => {
    expect(zoomAbout(HOME, 100, 100, 0.1).k).toBe(1)
    expect(zoomAbout(HOME, 100, 100, 1000).k).toBe(MAX_K)
  })
})

describe('fitView', () => {
  it('frames all points with padding, never past MAX_K, never below home', () => {
    const v = fitView([[400, 300], [420, 310]]) // ~20 units apart -> would want huge k
    expect(v.k).toBeLessThanOrEqual(MAX_K)
    const [mx, my] = screenToMap(v, MAP_W / 2, MAP_H / 2)
    expect(mx).toBeGreaterThan(395); expect(mx).toBeLessThan(425)
    expect(my).toBeGreaterThan(295); expect(my).toBeLessThan(315)
  })
  it('a far-apart pair (Texas + Maine) falls back to the whole map', () => {
    const v = fitView([[200, 500], [950, 100]])
    expect(v).toEqual(HOME)
  })
  it('a single point is centered, not divided by zero', () => {
    const v = fitView([[500, 300]])
    expect(Number.isFinite(v.k)).toBe(true)
  })
})
