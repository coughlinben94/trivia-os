import { describe, it, expect } from 'vitest'
import { clampView, zoomAbout, screenToMap, fitView, MAX_K, pinMarkerSize } from './pinView.js'
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

describe('clampView NaN', () => {
  it('never leaks NaN', () => {
    const v = clampView({ k: NaN, tx: NaN, ty: NaN })
    expect(Number.isFinite(v.k) && Number.isFinite(v.tx) && Number.isFinite(v.ty)).toBe(true)
    expect(v.k).toBe(1)
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
  it('holds the coverage invariant and the fixed point from a clamped, non-home start', () => {
    const start = { k: 3, tx: -1500, ty: -600 }
    const before = screenToMap(start, 900, 500)
    const v = zoomAbout(start, 900, 500, 2)
    expect(v.tx).toBeGreaterThanOrEqual(MAP_W * (1 - v.k)); expect(v.tx).toBeLessThanOrEqual(0)
    expect(v.ty).toBeGreaterThanOrEqual(MAP_H * (1 - v.k)); expect(v.ty).toBeLessThanOrEqual(0)
    const after = screenToMap(v, 900, 500)
    if (v.tx > MAP_W * (1 - v.k) && v.tx < 0 && v.ty > MAP_H * (1 - v.k) && v.ty < 0) {
      expect(after[0]).toBeCloseTo(before[0], 6); expect(after[1]).toBeCloseTo(before[1], 6)
    }
  })
  it('ignores NaN input and handles extreme factors', () => {
    const v = { k: 2, tx: -100, ty: -50 }
    expect(zoomAbout(v, 100, 100, NaN)).toEqual(v)
    expect(zoomAbout(v, NaN, 100, 2)).toEqual(v)
    expect(zoomAbout(v, 100, NaN, 2)).toEqual(v)
    expect(zoomAbout(HOME, 100, 100, Infinity).k).toBe(MAX_K)
    expect(zoomAbout(HOME, 100, 100, -3)).toEqual(HOME)
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
    // spans are floored at minSpan (90) then padded 35% each side: k = MAP_W / (90 * 1.7)
    expect(v.k).toBeCloseTo(MAP_W / (90 * 1.7), 6)
    const [mx, my] = screenToMap(v, MAP_W / 2, MAP_H / 2)
    expect(mx).toBeGreaterThan(395); expect(mx).toBeLessThan(425)
    expect(my).toBeGreaterThan(295); expect(my).toBeLessThan(315)
  })
  it('a far-apart pair (Texas + Maine) falls back to the whole map', () => {
    const v = fitView([[200, 500], [950, 100]])
    expect(v).toEqual(HOME)
  })
  it('a single point is centered, not divided by zero', () => {
    const c = [MAP_W / 2, MAP_H / 2]
    const v = fitView([c])
    expect(Number.isFinite(v.k)).toBe(true)
    const [mx, my] = screenToMap(v, MAP_W / 2, MAP_H / 2)
    expect(mx).toBeCloseTo(c[0], 6); expect(my).toBeCloseTo(c[1], 6)
  })
})

describe('pinMarkerSize', () => {
  it('targets ~52px on screen', () => {
    expect(pinMarkerSize(335)).toBeCloseTo(5.54, 1)
    expect(pinMarkerSize(350)).toBeCloseTo(5.3, 1)
    expect(pinMarkerSize(560)).toBeCloseTo(3.32, 1)
  })
  it('clamps to [1, 8]', () => {
    expect(pinMarkerSize(5000)).toBe(1)
    expect(pinMarkerSize(50)).toBe(8)
  })
  it('zero/NaN width uses the 335 fallback', () => {
    expect(pinMarkerSize(0)).toBe(pinMarkerSize(335))
    expect(pinMarkerSize(NaN)).toBe(pinMarkerSize(335))
    expect(pinMarkerSize(undefined)).toBe(pinMarkerSize(335))
  })
})

describe('zoom ceiling', () => {
  it('players can zoom in to 20x, far past the old 8x', () => {
    expect(MAX_K).toBe(20)
    expect(zoomAbout({ k: 1, tx: 0, ty: 0 }, 100, 100, 1000).k).toBe(20)
  })
  it('TV framing of near-identical pins still stops at 8x (the player ceiling does not leak into the reveal camera)', () => {
    const v = fitView([[400, 250], [401, 250]])
    expect(v.k).toBeLessThanOrEqual(8)
  })
})
