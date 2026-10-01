import { MAP_W, MAP_H } from './usMapGeo.js'

// How far a player can zoom in to place a pin. 8 was too shallow to pick a town
// (2026-10-01); at 20 a 358px-wide phone map is ~7000px across, about 0.4 mi/px.
export const MAX_K = 20
// The TV reveal camera frames pins at most this close, however far players may zoom.
const FIT_MAX_K = 8

// NaN -> lo (never leaks NaN into a view); +/-Infinity clamps normally.
const clampNum = (n, lo, hi) => (Number.isNaN(n) ? lo : Math.max(lo, Math.min(hi, n)))

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
  if (Number.isNaN(factor) || !Number.isFinite(px) || !Number.isFinite(py)) return v
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
export function fitView(points, { padFrac = 0.35, minSpan = 90, maxK = FIT_MAX_K } = {}) {
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

// Pin size (multiplier on a ~28-unit-tall pin) that renders ~targetPx tall on screen
// for a map surface containerPx wide. Zero/NaN width -> 335 (phone-ish) fallback.
export function pinMarkerSize(containerPx, { targetPx = 52, unitsTall = 28, mapW = MAP_W } = {}) {
  const w = containerPx > 0 ? containerPx : 335
  return clampNum(targetPx * (mapW / w) / unitsTall, 1, 8)
}
