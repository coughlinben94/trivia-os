// client/src/lib/usMapGeo.test.js
import { describe, it, expect } from 'vitest'
import { lonLatToMap, mapToLonLat, MAP_W, MAP_H } from './usMapGeo.js'
import { US_STATES } from './usMapData.js'
import { US_CITIES } from './usCities.js'

describe('usMapGeo', () => {
  it('round-trips a tap through the frame', () => {
    for (const [lon, lat] of [[-87.63, 41.88], [-80.19, 25.76], [-122.33, 47.61], [-68.78, 44.8]]) {
      const [mx, my] = lonLatToMap(lon, lat)
      const [lon2, lat2] = mapToLonLat(mx, my)
      expect(lon2).toBeCloseTo(lon, 6)
      expect(lat2).toBeCloseTo(lat, 6)
    }
  })
  it('puts every city inside the frame with north up', () => {
    for (const c of US_CITIES) {
      const [mx, my] = lonLatToMap(c.lon, c.lat)
      expect(mx).toBeGreaterThanOrEqual(0); expect(mx).toBeLessThanOrEqual(MAP_W)
      expect(my).toBeGreaterThanOrEqual(0); expect(my).toBeLessThanOrEqual(MAP_H)
    }
    expect(lonLatToMap(-96, 47)[1]).toBeLessThan(lonLatToMap(-96, 30)[1])
  })
  it('ships 49 state outlines', () => {
    expect(US_STATES).toHaveLength(49)
    expect(US_STATES.every(s => s.d.startsWith('M') && s.name)).toBe(true)
  })
})
