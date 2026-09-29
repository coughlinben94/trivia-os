// client/src/lib/usMapGeo.js
import { project, invert } from './usProjection.js'
import { US_MAP_FRAME as F } from './usMapFrame.js'

export const MAP_W = F.width
export const MAP_H = F.height

export function lonLatToMap(lon, lat) {
  const [x, y] = project(lon, lat)
  return [x * F.scale + F.tx, -y * F.scale + F.ty]
}

export function mapToLonLat(mx, my) {
  return invert((mx - F.tx) / F.scale, -((my - F.ty) / F.scale))
}
