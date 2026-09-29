import { MAP_W, MAP_H } from './usMapGeo.js'

export const MAX_K = 8

const clampNum = (n, lo, hi) => Math.max(lo, Math.min(hi, n))

// Map covers the viewport at every zoom: t in [size*(1-k), 0].
export function clampView({ k, tx, ty }) {
  const kk = clampNum(k, 1, MAX_K)
  return {
    k: kk,
    tx: clampNum(tx, MAP_W * (1 - kk), 0),
    ty: clampNum(ty, MAP_H * (1 - kk), 0),
  }
}

// px,py: a point in the viewport, in MAP UNITS. The map point under it stays put.
export function zoomAbout(v, px, py, factor) {
  const k = clampNum(v.k * factor, 1, MAX_K)
  const mx = (px - v.tx) / v.k
  const my = (py - v.ty) / v.k
  return clampView({ k, tx: px - k * mx, ty: py - k * my })
}

export function screenToMap(v, px, py) {
  return [(px - v.tx) / v.k, (py - v.ty) / v.k]
}

// Frame a set of map points with padding. Falls back to the whole map when the
// points span most of it. `minSpan` stops two near-identical pins from asking
// for absurd zoom.
export function fitView(points, { padFrac = 0.35, minSpan = 90, maxK = MAX_K } = {}) {
  if (!points.length) return { k: 1, tx: 0, ty: 0 }
  const xs = points.map(p => p[0]); const ys = points.map(p => p[1])
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minY = Math.min(...ys), maxY = Math.max(...ys)
  const spanX = Math.max(maxX - minX, minSpan) * (1 + padFrac * 2)
  const spanY = Math.max(maxY - minY, minSpan * (MAP_H / MAP_W)) * (1 + padFrac * 2)
  const k = clampNum(Math.min(MAP_W / spanX, MAP_H / spanY), 1, maxK)
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  return clampView({ k, tx: MAP_W / 2 - k * cx, ty: MAP_H / 2 - k * cy })
}
