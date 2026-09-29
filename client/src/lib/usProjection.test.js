import { describe, it, expect } from 'vitest'
import { project, invert, haversineMiles } from './usProjection.js'

const CITIES = {
  chicago: [-87.6298, 41.8781],
  miami: [-80.1918, 25.7617],
  seattle: [-122.3321, 47.6062],
  bangor: [-68.7778, 44.8012],
  sanDiego: [-117.1611, 32.7157],
}

describe('project/invert', () => {
  it('projects the origin (-96, 37.5) to (0, 0)', () => {
    const [x, y] = project(-96, 37.5)
    expect(Math.abs(x)).toBeLessThan(1e-12)
    expect(Math.abs(y)).toBeLessThan(1e-12)
  })
  it('round-trips real cities to 1e-9 degrees', () => {
    for (const [lon, lat] of Object.values(CITIES)) {
      const [x, y] = project(lon, lat)
      const [lon2, lat2] = invert(x, y)
      expect(lon2).toBeCloseTo(lon, 9)
      expect(lat2).toBeCloseTo(lat, 9)
    }
  })
  it('puts north up (higher latitude -> larger y) and east right (larger lon -> larger x)', () => {
    expect(project(-96, 45)[1]).toBeGreaterThan(project(-96, 35)[1])
    expect(project(-80, 38)[0]).toBeGreaterThan(project(-110, 38)[0])
  })
})

describe('haversineMiles', () => {
  it('is 0 for the same point', () => {
    expect(haversineMiles({ lat: 41, lon: -87 }, { lat: 41, lon: -87 })).toBe(0)
  })
  it('matches known great-circle distances within 1%', () => {
    // Chicago -> Miami ~ 1,190 mi; Seattle -> San Diego ~ 1,050 mi
    const chiMia = haversineMiles({ lat: 41.8781, lon: -87.6298 }, { lat: 25.7617, lon: -80.1918 })
    const seaSd = haversineMiles({ lat: 47.6062, lon: -122.3321 }, { lat: 32.7157, lon: -117.1611 })
    expect(chiMia).toBeGreaterThan(1190 * 0.99)
    expect(chiMia).toBeLessThan(1190 * 1.01)
    expect(seaSd).toBeGreaterThan(1050 * 0.99)
    expect(seaSd).toBeLessThan(1050 * 1.01)
  })
})
