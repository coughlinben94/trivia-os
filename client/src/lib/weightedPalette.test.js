import { describe, it, expect } from 'vitest'
import {
  hexToHslHue, hueDelta, allocate, spread, hueLadder, lumaProxy,
  atLightness, derivePalette, rotateOklabHue, projectLadderOffset, driftPlan,
} from './weightedPalette.js'
import { rgbToOklab, oklabToRgb, hexToRgb } from './oklab.js'

const BASE = {
  colors: {
    bg: '#08001a', bgDeep: '#040010', accent: '#4a1a8f', highlight: '#c060ff',
    text: '#e8d0ff', textMuted: '#8050b0', shinyBg: '#120030', shinyAccent: '#ff40a0',
  },
}

// Frozen fixture, deliberately NOT read from midnightGalaxy.ring.js. The
// algorithm assertions below describe THIS set of 13 hues; a recolor of the
// live world (scripts/ring-recolor.mjs) must not break the engine's own
// tests. These were the shipped values on 2026-09-02.
const CURRENT_HUES = [256, 170, 268, 28, 140, 120, 330, 208, 214, 160, 300, 196, 36]
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

describe('the weight bar swept across every reachable divider position', () => {
  // WorldPaletteEditor's WeightBar clamps a dragged cut to
  // [MIN_WEIGHT, 1 - MIN_WEIGHT] and snaps it to SNAP, so a two-colour bar
  // has exactly 19 positions a host can actually land on. At EVERY one of
  // them the ring must sit ON the arithmetic adjacency floor, not near it.
  //
  // This is the invariant an assignment that chases hue distance quietly
  // trades away: it buys a better hue match by accepting one extra
  // same-colour block, then has no way to tell the host that the block was
  // a choice rather than arithmetic. A floor-respecting assignment can
  // always say "unavoidable" honestly, because it only ever reports the
  // adjacencies that are.
  const SNAP = 0.05
  const MIN_WEIGHT = 0.05
  const DEFAULT_COLORS = ['#a855f7', '#3b82f6'] // the editor's opening palette
  const positions = Array.from(
    { length: Math.round((1 - 2 * MIN_WEIGHT) / SNAP) + 1 },
    (_, i) => +(MIN_WEIGHT + i * SNAP).toFixed(2),
  )

  it('has 19 reachable positions, end to end', () => {
    expect(positions).toHaveLength(19)
    expect(positions[0]).toBe(MIN_WEIGHT)
    expect(positions.at(-1)).toBe(+(1 - MIN_WEIGHT).toFixed(2))
  })

  it.each(positions)('hits the adjacency floor at a %s split', cut => {
    const weights = [cut, +(1 - cut).toFixed(2)]
    const out = derivePalette({
      colors: DEFAULT_COLORS, weights, stationCount: 13,
      baseTheme: BASE, currentHues: CURRENT_HUES,
    })
    expect(cyclicAdjacent(out.assignment)).toBe(floorFor(out.counts))
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

describe('projectLadderOffset', () => {
  it('keeps yellow inside gold — never reaches chartreuse (68)', () => {
    // The bug this phase fixes: the old fixed +/-18 HSL ladder put station 3
    // at HSL 68 (chartreuse). Measured here, not assumed (rule zero) — the
    // OKLCH projection is asymmetric around yellow (its OKLab hue sits closer
    // to orange than to green), so the fix bounds the GREEN-ward (+) side,
    // where the bug actually was; the orange-ward (-) side moves further but
    // toward orange, never toward green.
    expect(projectLadderOffset('#ffd400', 18)).toBeLessThanOrEqual(13)
  })

  // Frozen copy of WorldPaletteEditor.jsx's PRESETS, 2026-09-02 — every rung
  // of every preset must land inside spec section 4's +/-25 window.
  const PRESET_HEXES = [
    '#a855f7', '#3b82f6', '#8b5cf6', '#ec4899', '#3b82f6', '#14b8a6',
    '#f59e0b', '#f43f5e', '#10b981', '#6366f1', '#dc2626', '#eab308',
  ]
  it.each(PRESET_HEXES)('stays inside +/-25 for every preset anchor: %s', hex => {
    for (const off of [-18, -12, -6, 0, 6, 12, 18]) {
      expect(Math.abs(projectLadderOffset(hex, off))).toBeLessThanOrEqual(25)
    }
  })

  it('is the identity at offset 0 for any anchor', () => {
    for (const hex of ['#ffd400', '#ff2200', '#3b82f6', '#a855f7', '#111111']) {
      expect(projectLadderOffset(hex, 0)).toBe(0)
    }
  })

  it('does not collapse the projection to a single step (blue spans a real range)', () => {
    const hi = projectLadderOffset('#3b82f6', 18)
    const lo = projectLadderOffset('#3b82f6', -18)
    expect(hi - lo).toBeGreaterThanOrEqual(25)
  })
})

describe('rotateOklabHue', () => {
  it('leaves a neutral untouched — no hue to rotate', () => {
    expect(rotateOklabHue('#ffffff', 90)).toBe('#ffffff')
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
  // The properties atLightness actually promises, measured in the space it
  // works in. HSL hue is NOT preserved by a constant-OKLab-hue lightness
  // change and never was — the two spaces disagree about what "the same
  // blue, lighter" means, so an HSL-degree bound is the wrong instrument
  // (it passes a clipped color that drifted 18 HSL degrees for the right
  // reason and would pass a mud-clipped one for the wrong reason).
  const oklabHue    = hex => { const [, a, b] = rgbToOklab(hexToRgb(hex)); return Math.atan2(b, a) }
  const oklabChroma = hex => { const [, a, b] = rgbToOklab(hexToRgb(hex)); return Math.hypot(a, b) }
  const angleGap    = (p, q) => Math.abs(Math.atan2(Math.sin(p - q), Math.cos(p - q)))
  // The control: what a naive implementation does — teleport L, hold chroma
  // fixed, let oklabToRgb's own clamp deal with the overflow. Clipping one
  // channel of three IS a hue shift. Asserting only "the mapped color held
  // its hue" proves nothing unless the naive baseline demonstrably doesn't.
  const naiveClip = (hex, targetHex) => {
    const [, a, b] = rgbToOklab(hexToRgb(hex))
    const [L] = rgbToOklab(hexToRgb(targetHex))
    return '#' + oklabToRgb([L, a, b])
      .map(v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0'))
      .join('')
  }

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
    // Hue held in OKLab — and the naive clip demonstrably does NOT hold it,
    // so this pair of assertions is a real discriminator rather than a bound
    // both implementations would satisfy.
    expect(angleGap(oklabHue(out), oklabHue('#0000d0'))).toBeLessThan(0.02)
    expect(angleGap(oklabHue(naiveClip('#0000d0', BASE.colors.highlight)), oklabHue('#0000d0')))
      .toBeGreaterThan(0.03)
    // Still saturated: gamut-mapping gives up chroma, not all of it.
    expect(oklabChroma(out)).toBeGreaterThan(0.5 * oklabChroma('#0000d0'))
  })

  it('leaves an already-in-gamut color alone instead of quietly desaturating it', () => {
    const out = atLightness('#a855f7', BASE.colors.highlight)
    expect(oklabChroma(out)).toBeGreaterThan(0.9 * oklabChroma('#a855f7'))
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

describe('drift', () => {
  it('driftPlan sends red toward magenta (270), not toward orange (19), because magenta has more room', () => {
    const p = driftPlan(8, 60) // red anchor at HSL 8
    expect(p.dir).toBe(-1)
    expect(p.arc).toBe(60)
  })

  it('driftPlan clips to the per-colour cap when the requested arc exceeds it', () => {
    const p = driftPlan(271, 200) // purple anchor — cap is 173: down room (191) - LADDER_HALF (18)
    expect(p.arc).toBe(173)
  })

  it('drift: {arc: 0} is byte-identical to no drift at all, for the frozen fixture', () => {
    const withZero = derivePalette({
      colors: PALETTE, weights: [0.60, 0.25, 0.15], stationCount: 13,
      baseTheme: BASE, currentHues: CURRENT_HUES, drift: { arc: 0 },
    })
    const withoutField = derivePalette({
      colors: PALETTE, weights: [0.60, 0.25, 0.15], stationCount: 13,
      baseTheme: BASE, currentHues: CURRENT_HUES,
    })
    expect(withZero.hues).toEqual(withoutField.hues)
  })

  it('every station stays inside its own ROTATED anchor window at arc 60', () => {
    const out = derivePalette({
      colors: ['#a855f7', '#3b82f6'], weights: [0.65, 0.35], stationCount: 13,
      baseTheme: BASE, currentHues: CURRENT_HUES, drift: { arc: 60 },
    })
    out.hues.forEach((h, i) => {
      const anchor = out.hueAnchorsAt[i][out.assignment[i]]
      expect(hueDelta(h, anchor.deg)).toBeLessThanOrEqual(anchor.window)
    })
  })

  it('station 0 and station 12 (adjacent across the wrap) have anchors within one bump-step of each other, for every colour', () => {
    const out = derivePalette({
      colors: ['#a855f7', '#3b82f6'], weights: [0.5, 0.5], stationCount: 13,
      baseTheme: BASE, currentHues: CURRENT_HUES, drift: { arc: 60 },
    })
    const step = 0.24 * 60 // steepest per-station step at arc 60, per the plan's own derivation
    out.hueAnchorsAt[0].forEach((a0, c) => {
      const a12 = out.hueAnchorsAt[12][c]
      expect(hueDelta(a0.deg, a12.deg)).toBeLessThanOrEqual(step + 1) // +1 float slack
    })
  })

  it('no station lands in the dead band under drift, for a palette that could otherwise drift into it', () => {
    const out = derivePalette({
      colors: ['#ff2200', '#a855f7'], weights: [0.5, 0.5], stationCount: 13,
      baseTheme: BASE, currentHues: CURRENT_HUES, drift: { arc: 60 },
    })
    out.hues.forEach(h => {
      const inBand = h >= 45 && h < 80
      expect(inBand).toBe(false)
    })
  })

  it('adjacent same-colour rungs are handed out in RING ORDER under drift, not outside-in', () => {
    // At drift 0 the ladder still alternates outside-in (unchanged behaviour).
    // At any drift > 0, consecutive same-colour stations must get adjacent
    // ladder rungs (6 degrees apart), because drift + outside-in fights itself.
    const out = derivePalette({
      colors: ['#a855f7', '#3b82f6'], weights: [0.60, 0.40], stationCount: 13,
      baseTheme: BASE, currentHues: CURRENT_HUES, drift: { arc: 60 },
    })
    // Find two adjacent stations assigned the same colour (guaranteed to exist
    // at this weight split — one colour owns 8 of 13).
    let found = false
    for (let i = 0; i < 13; i++) {
      const j = (i + 1) % 13
      if (out.assignment[i] === out.assignment[j]) {
        found = true
        // Their ladder-only contribution (hue minus the rotated anchor at
        // each station) must be ~6 apart, not up to 36 apart. OKLCH→HSL
        // projection is nonlinear per anchor; 10° tolerance accounts for that.
        const c = out.assignment[i]
        const rungI = hueDelta(out.hues[i], out.hueAnchorsAt[i][c].deg)
        const rungJ = hueDelta(out.hues[j], out.hueAnchorsAt[j][c].deg)
        expect(Math.abs(rungI - rungJ)).toBeLessThanOrEqual(10)
      }
    }
    expect(found).toBe(true)
  })
})
