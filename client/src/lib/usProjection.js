// Albers equal-area conic on the unit sphere, standard parallels 29.5/45.5,
// origin (-96, 37.5). Hand-rolled (no map library at runtime). The build
// script projects state outlines with THIS function and the runtime inverts
// taps with the same constants, so outlines and taps can never disagree.
const RAD = Math.PI / 180
const PHI1 = 29.5 * RAD
const PHI2 = 45.5 * RAD
const PHI0 = 37.5 * RAD
const LAM0 = -96 * RAD
const N = (Math.sin(PHI1) + Math.sin(PHI2)) / 2
const C = Math.cos(PHI1) ** 2 + 2 * N * Math.sin(PHI1)
const RHO0 = Math.sqrt(C - 2 * N * Math.sin(PHI0)) / N

export const EARTH_MILES = 3958.8

// y is positive NORTH here; the map frame flips it for SVG (see usMapGeo.js).
export function project(lon, lat) {
  const rho = Math.sqrt(C - 2 * N * Math.sin(lat * RAD)) / N
  const theta = N * (lon * RAD - LAM0)
  return [rho * Math.sin(theta), RHO0 - rho * Math.cos(theta)]
}

export function invert(x, y) {
  const dy = RHO0 - y
  const rho = Math.hypot(x, dy)
  const theta = Math.atan2(x, dy)
  const s = (C - rho * rho * N * N) / (2 * N)
  return [(LAM0 + theta / N) / RAD, Math.asin(Math.max(-1, Math.min(1, s))) / RAD]
}

export function haversineMiles(a, b) {
  const dLat = (b.lat - a.lat) * RAD
  const dLon = (b.lon - a.lon) * RAD
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_MILES * Math.asin(Math.min(1, Math.sqrt(h)))
}
