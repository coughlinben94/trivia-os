import { describe, it, expect } from 'vitest'
import {
  HUES_CUES_COLS, HUES_CUES_ROWS, HUES_CUES_CODE_RE,
  codeToColRow, colRowToCode, chebyshevDistance,
  getHuesCuesGrid, getHuesCuesCell,
} from './huesCuesGrid.js'
import { hexToRgb, rgbToOklab } from './oklab.js'

describe('huesCuesGrid dimensions', () => {
  it('is 16 columns by 30 rows = 480 squares', () => {
    expect(HUES_CUES_COLS).toBe(16)
    expect(HUES_CUES_ROWS).toBe(30)
    expect(getHuesCuesGrid()).toHaveLength(480)
  })
})

describe('code parsing', () => {
  it('accepts every real code', () => {
    for (const cell of getHuesCuesGrid()) {
      expect(HUES_CUES_CODE_RE.test(cell.code)).toBe(true)
      expect(codeToColRow(cell.code)).toEqual({ col: cell.col, row: cell.row })
    }
  })
  it('rejects out-of-range and malformed codes', () => {
    expect(codeToColRow('Q1')).toBeNull()   // column past P
    expect(codeToColRow('A31')).toBeNull()  // row past 30
    expect(codeToColRow('A0')).toBeNull()   // row 0 doesn't exist
    expect(codeToColRow('8A')).toBeNull()   // swapped order
    expect(codeToColRow('')).toBeNull()
    expect(codeToColRow(null)).toBeNull()
  })
  it('round-trips colRowToCode', () => {
    expect(colRowToCode({ col: 'H', row: 8 })).toBe('H8')
  })
})

describe('chebyshevDistance', () => {
  it('is 0 for the same square', () => {
    expect(chebyshevDistance({ col: 'H', row: 8 }, { col: 'H', row: 8 })).toBe(0)
  })
  it('is 1 for each of the 8 surrounding squares', () => {
    const center = { col: 'H', row: 8 }
    const neighbors = [
      { col: 'G', row: 7 }, { col: 'H', row: 7 }, { col: 'I', row: 7 },
      { col: 'G', row: 8 },                        { col: 'I', row: 8 },
      { col: 'G', row: 9 }, { col: 'H', row: 9 }, { col: 'I', row: 9 },
    ]
    for (const n of neighbors) {
      expect(chebyshevDistance(center, n)).toBe(1)
    }
  })
  it('is 2+ for squares further out (not adjacent)', () => {
    expect(chebyshevDistance({ col: 'H', row: 8 }, { col: 'J', row: 8 })).toBe(2)
    expect(chebyshevDistance({ col: 'H', row: 8 }, { col: 'H', row: 10 })).toBe(2)
  })
  it('a corner square still scores correctly with fewer real neighbors', () => {
    // A1 has only 3 real neighbors on the grid (B1, A2, B2), all distance 1 —
    // no special-casing needed, the math just naturally has fewer distance-1
    // squares to land on.
    expect(chebyshevDistance({ col: 'A', row: 1 }, { col: 'B', row: 1 })).toBe(1)
    expect(chebyshevDistance({ col: 'A', row: 1 }, { col: 'B', row: 2 })).toBe(1)
    expect(chebyshevDistance({ col: 'A', row: 1 }, { col: 'P', row: 30 })).toBeGreaterThan(1)
  })
})

describe('getHuesCuesGrid generation', () => {
  it('is deterministic across calls', () => {
    const a = getHuesCuesGrid()
    const b = getHuesCuesGrid()
    expect(a).toEqual(b)
  })
  it('every cell has a valid 6-digit hex color', () => {
    for (const cell of getHuesCuesGrid()) {
      expect(cell.hex).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })
  it('every cell hex round-trips through OKLab with correct L and non-zero chroma', () => {
    const L_TOLERANCE = 0.02
    const MIN_CHROMA = 0.02
    for (const cell of getHuesCuesGrid()) {
      // Round-trip the hex color back through RGB and OKLab
      const rgb = hexToRgb(cell.hex)
      const [L, a, b] = rgbToOklab(rgb)
      const chroma = Math.hypot(a, b)

      // Expected L for this row: 0.35 + (0.55 * (row-1)) / 14
      const expectedL = 0.35 + (0.55 * (cell.row - 1)) / (HUES_CUES_ROWS - 1)

      // L should be close to the intended lightness (within tolerance for in-gamut rounding)
      expect(Math.abs(L - expectedL)).toBeLessThanOrEqual(L_TOLERANCE)

      // Chroma must be meaningfully above 0 (not collapsed to gray)
      expect(chroma).toBeGreaterThan(MIN_CHROMA)
    }
  })
  it('no two horizontally adjacent cells are near-identical colors', () => {
    // Perceptual distinctness floor: adjacent hues at the same row must not
    // collapse to the same visible color. Uses a plain hex-string check
    // (cheap, no re-import of oklab math) — real color-math distinctness is
    // covered by the in-gamut round-trip in Task 1 Step 3 itself, and by the
    // full-grid OKLab pairwise-distance floor below.
    const grid = getHuesCuesGrid()
    for (let r = 0; r < HUES_CUES_ROWS; r++) {
      const rowCells = grid.filter(c => c.row === r + 1)
      for (let c = 0; c < rowCells.length - 1; c++) {
        expect(rowCells[c].hex).not.toBe(rowCells[c + 1].hex)
      }
    }
  })

  it('every pair of the 480 cells stays above a real OKLab perceptual-distance floor', () => {
    // The horizontal-neighbor check above only compares adjacent hex strings
    // (cheap, but not real color math, and it only ever checks same-row
    // neighbors). This converts all 480 cells to OKLab (same rgbToOklab/
    // hexToRgb pair the in-gamut round-trip test above already imports) and
    // checks the MINIMUM pairwise Euclidean distance across every one of the
    // 480*479/2 = 114,960 pairs — not just horizontal neighbors — against a
    // real floor. Widening the L range to compensate was tried and measured
    // WORSE (0.25-0.95 dropped the minimum to 0.0082, 0.18-0.97 to 0.0045):
    // near-white/near-black rows lose hue signal as chroma collapses toward
    // the sRGB gamut edge, so pushing range outward hurts more than the
    // tighter per-row lightness step from doubling ROWS helps. The original
    // 0.35-0.9 range is the best of what was tried for a 30-row board. Real
    // measured minimum at 480 squares is ~0.0118 (closest pair: adjacent
    // rows, same column, near the top of the lightness range) — the floor
    // below sits with real margin under that, matching the original design's
    // margin ratio (floor was ~69% of the measured 240-square minimum).
    const MIN_OKLAB_DISTANCE = 0.008
    const grid = getHuesCuesGrid()
    const labs = grid.map(cell => rgbToOklab(hexToRgb(cell.hex)))

    let minDist = Infinity
    let closestPair = null
    for (let i = 0; i < labs.length; i++) {
      for (let j = i + 1; j < labs.length; j++) {
        const [L1, a1, b1] = labs[i]
        const [L2, a2, b2] = labs[j]
        const dist = Math.hypot(L1 - L2, a1 - a2, b1 - b2)
        if (dist < minDist) {
          minDist = dist
          closestPair = [grid[i].code, grid[j].code]
        }
      }
    }

    expect(minDist, `closest pair: ${closestPair?.join(' vs ')}, distance ${minDist}`).toBeGreaterThan(MIN_OKLAB_DISTANCE)
  })
})

describe('getHuesCuesCell', () => {
  it('finds a real cell by code', () => {
    const cell = getHuesCuesCell('H8')
    expect(cell).not.toBeNull()
    expect(cell.col).toBe('H')
    expect(cell.row).toBe(8)
  })
  it('returns null for an invalid code', () => {
    expect(getHuesCuesCell('Z99')).toBeNull()
  })
})
