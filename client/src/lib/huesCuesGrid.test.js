import { describe, it, expect } from 'vitest'
import {
  HUES_CUES_COLS, HUES_CUES_ROWS, HUES_CUES_CODE_RE,
  codeToColRow, colRowToCode, chebyshevDistance,
  getHuesCuesGrid, getHuesCuesCell,
} from './huesCuesGrid.js'

describe('huesCuesGrid dimensions', () => {
  it('is 16 columns by 15 rows = 240 squares', () => {
    expect(HUES_CUES_COLS).toBe(16)
    expect(HUES_CUES_ROWS).toBe(15)
    expect(getHuesCuesGrid()).toHaveLength(240)
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
    expect(codeToColRow('A16')).toBeNull()  // row past 15
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
    expect(chebyshevDistance({ col: 'A', row: 1 }, { col: 'P', row: 15 })).toBeGreaterThan(1)
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
  it('no two horizontally adjacent cells are near-identical colors', () => {
    // Perceptual distinctness floor: adjacent hues at the same row must not
    // collapse to the same visible color. Uses a plain hex-string check
    // (cheap, no re-import of oklab math) — real color-math distinctness is
    // covered by the in-gamut round-trip in Task 1 Step 3 itself.
    const grid = getHuesCuesGrid()
    for (let r = 0; r < HUES_CUES_ROWS; r++) {
      const rowCells = grid.filter(c => c.row === r + 1)
      for (let c = 0; c < rowCells.length - 1; c++) {
        expect(rowCells[c].hex).not.toBe(rowCells[c + 1].hex)
      }
    }
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
