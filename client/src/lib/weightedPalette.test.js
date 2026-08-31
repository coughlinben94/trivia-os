import { describe, it, expect } from 'vitest'
import {
  hexToHslHue, hueDelta, allocate, spread, hueLadder, lumaProxy,
  atLightness, derivePalette,
} from './weightedPalette.js'
import { rgbToOklab, hexToRgb } from '../jukebox/components/AlbumGradientMesh.jsx'
import { midnightGalaxyRing } from '../worlds/midnightGalaxy.ring.js'

const BASE = {
  colors: {
    bg: '#08001a', bgDeep: '#040010', accent: '#4a1a8f', highlight: '#c060ff',
    text: '#e8d0ff', textMuted: '#8050b0', shinyBg: '#120030', shinyAccent: '#ff40a0',
  },
}

const CURRENT_HUES = midnightGalaxyRing.stations.map(s => s.hue)
const PALETTE = ['#a855f7', '#3b82f6', '#f97316'] // purple ~271, blue ~217, orange ~25

const cyclicAdjacent = out => {
  let a = 0
  for (let i = 0; i < out.length; i++) if (out[i] === out[(i + 1) % out.length]) a++
  return a
}
const floorFor = counts =>
  Math.max(0, 2 * Math.max(...counts) - counts.reduce((a, b) => a + b, 0))

describe('hexToHslHue', () => {
  it('reads HSL hue, the space the ring engine actually consumes', () => {
    // ringPrimitives.js builds every color as hsla(hue, S%, L%, a) — so the
    // hue number must be an HSL hue, not an OKLab hue angle.
    expect(Math.round(hexToHslHue('#0000ff'))).toBe(240)
    expect(Math.round(hexToHslHue('#ff0000'))).toBe(0)
    expect(Math.round(hexToHslHue('#00ff00'))).toBe(120)
  })
})

describe('allocate', () => {
  it('apportions 13 stations by weight, largest remainder', () => {
    expect(allocate([0.60, 0.25, 0.15], 13)).toEqual([8, 3, 2])
  })
  it('always sums to the station count', () => {
    for (const w of [[0.5, 0.5], [0.34, 0.33, 0.33], [0.9, 0.05, 0.05], [0.7, 0.3]]) {
      expect(allocate(w, 13).reduce((a, b) => a + b, 0)).toBe(13)
    }
  })
  it('never starves a color to zero — a 2% slider still owns a station', () => {
    expect(allocate([0.96, 0.02, 0.02], 13).every(c => c >= 1)).toBe(true)
  })
})

describe('spread', () => {
  // The ring WRAPS — station 12 neighbours station 0. Adjacency is cyclic,
  // and the minimum achievable for a colour owning c of n slots is
  // max(0, 2c - n). Every case must hit that floor exactly.
  it('hits the arithmetic adjacency floor for every allocation shape', () => {
    for (const counts of [[5, 4, 4], [8, 3, 2], [7, 6], [11, 1, 1], [9, 4], [5, 5, 3]]) {
      const out = spread(counts)
      expect(out).toHaveLength(counts.reduce((a, b) => a + b, 0))
      expect(cyclicAdjacent(out)).toBe(floorFor(counts))
    }
  })
  it('gives each color exactly its allotted count', () => {
    const out = spread([8, 3, 2])
    expect([0, 1, 2].map(c => out.filter(v => v === c).length)).toEqual([8, 3, 2])
  })
})

describe('hueLadder', () => {
  it('spans the window symmetrically', () => {
    expect(hueLadder(7, 18)).toEqual([-18, -12, -6, 0, 6, 12, 18])
  })
  it('centres a lone station on its anchor', () => {
    expect(hueLadder(1, 18)).toEqual([0])
  })
})

describe('lumaProxy', () => {
  it('reproduces the measured reference values — a known-answer probe', () => {
    // Shipped hues, measured 2026-08-31 (plan finding 4). If these drift,
    // the proxy code is broken, not the palette.
    expect(Math.round(lumaProxy(256))).toBe(106)
    expect(Math.round(lumaProxy(170))).toBe(197)
    expect(Math.round(lumaProxy(120))).toBe(188)
    expect(Math.round(lumaProxy(300))).toBe(128)
  })
})

describe('atLightness', () => {
  it('moves a color to the target OKLab lightness', () => {
    const out = atLightness('#a855f7', BASE.colors.highlight)
    const [L] = rgbToOklab(hexToRgb(out))
    const [targetL] = rgbToOklab(hexToRgb(BASE.colors.highlight))
    expect(Math.abs(L - targetL)).toBeLessThan(0.02)
  })
  it('gamut-maps a saturated pick instead of clipping it to mud or a shifted hue', () => {
    // #0000d0 at high chroma cannot hold that chroma at the highlight's
    // lightness — naive clipping hue-shifts or washes it out (the exact
    // failure AlbumGradientMesh.jsx's header documents a week escaping).
    // Gamut mapping must hold L and hue, shrinking chroma only as far as
    // the gamut requires.
    const out = atLightness('#0000d0', BASE.colors.highlight)
    expect(out).toMatch(/^#[0-9a-f]{6}$/)
    const [L] = rgbToOklab(hexToRgb(out))
    const [targetL] = rgbToOklab(hexToRgb(BASE.colors.highlight))
    expect(Math.abs(L - targetL)).toBeLessThan(0.02)          // lightness held
    expect(hueDelta(hexToHslHue(out), 240)).toBeLessThan(30)  // still blue
    const [r, g, b] = hexToRgb(out)
    expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeGreaterThan(50) // not gray
  })
})

describe('derivePalette', () => {
  const out = derivePalette({
    colors: PALETTE,
    weights: [0.60, 0.25, 0.15],
    stationCount: 13,
    baseTheme: BASE,
    currentHues: CURRENT_HUES,
  })

  it('emits one hue per station, all integers in 0-359', () => {
    expect(out.hues).toHaveLength(13)
    for (const h of out.hues) {
      expect(Number.isInteger(h)).toBe(true)
      expect(h).toBeGreaterThanOrEqual(0)
      expect(h).toBeLessThan(360)
    }
  })

  it('keeps every station inside its own anchor window — spec section 4', () => {
    // Nothing in ring-verify.mjs checks this (plan finding 5), so it has to
    // be guaranteed here or it is guaranteed nowhere.
    out.hues.forEach((h, i) => {
      const anchor = out.hueAnchors[out.assignment[i]]
      expect(hueDelta(h, anchor.deg)).toBeLessThanOrEqual(anchor.window)
    })
  })

  it('emits one anchor per palette color, within the spec 1-3 limit', () => {
    expect(out.hueAnchors).toHaveLength(3)
    expect(out.hueAnchors.every(a => a.window <= 25)).toBe(true)
  })

  it('assigns each color to the stations nearest its anchor, not by blind ring order', () => {
    // amber planet (28°) and supernova (36°) are the world's two warm
    // stations; the orange swatch (~25°) owns exactly 2 of 13 at these
    // weights, and they must be those two — never "amber planet turns
    // purple because of where it happens to sit on the ring".
    const orange = 2
    expect(out.assignment[3]).toBe(orange)  // amber planet
    expect(out.assignment[12]).toBe(orange) // supernova
  })

  it('holds allocation counts and the cyclic adjacency floor at once', () => {
    expect([0, 1, 2].map(c => out.assignment.filter(v => v === c).length)).toEqual([8, 3, 2])
    expect(cyclicAdjacent(out.assignment)).toBe(floorFor([8, 3, 2]))
  })

  it('matches identity exactly when the palette mirrors the current hues', () => {
    const two = derivePalette({
      colors: ['#8833ff', '#ff7711'], // purple ~280, orange ~28
      weights: [0.5, 0.5],
      stationCount: 4,
      baseTheme: BASE,
      currentHues: [270, 25, 270, 25],
    })
    expect(two.assignment).toEqual([0, 1, 0, 1])
  })

  it('keeps the background near-black — it is the whole screen behind every slide', () => {
    const lumaOfHex = hex => {
      const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    expect(lumaOfHex(out.themeColors.bg)).toBeLessThan(24)
    expect(lumaOfHex(out.themeColors.bgDeep)).toBeLessThan(lumaOfHex(out.themeColors.bg))
  })

  it('leans the accent toward the heaviest color, not toward an average', () => {
    // The anti-mud invariant: a 60/25/15 palette's accent must read as the
    // 60% colour.
    expect(hueDelta(hexToHslHue(out.themeColors.accent), hexToHslHue(PALETTE[0]))).toBeLessThan(12)
  })

  it('tracks the heaviest color when the weights move, not swatch #1 forever', () => {
    // Dragging the weight bar must move the accent — the whole point of a
    // WEIGHTED palette. Same colors, orange now heaviest.
    const flipped = derivePalette({
      colors: PALETTE, weights: [0.15, 0.25, 0.60],
      stationCount: 13, baseTheme: BASE, currentHues: CURRENT_HUES,
    })
    expect(hueDelta(hexToHslHue(flipped.themeColors.accent), hexToHslHue(PALETTE[2]))).toBeLessThan(12)
    expect(hueDelta(hexToHslHue(flipped.themeColors.highlight), hexToHslHue(PALETTE[2]))).toBeLessThan(12)
  })

  it('works with 2 colors as well as 3', () => {
    const two = derivePalette({
      colors: ['#a855f7', '#f97316'], weights: [0.7, 0.3],
      stationCount: 13, baseTheme: BASE, currentHues: CURRENT_HUES,
    })
    expect(two.hues).toHaveLength(13)
    expect(two.hueAnchors).toHaveLength(2)
  })

  it('warns when two picked colors are close enough to read as one family', () => {
    const close = derivePalette({
      colors: ['#a855f7', '#c084fc'], weights: [0.6, 0.4],
      stationCount: 13, baseTheme: BASE, currentHues: CURRENT_HUES,
    })
    expect(close.warnings.some(w => w.includes('one family'))).toBe(true)
  })

  it('advises per station without claiming a verdict', () => {
    expect(out.advisory).toHaveLength(13)
    expect(out.advisory[0]).toHaveProperty('fromLuma')
    expect(out.advisory[0]).toHaveProperty('toLuma')
    expect(out.advisory[0]).toHaveProperty('delta')
  })
})
