import { oklabToRgb, rgbToOklab, rgbToHex } from './oklab.js'

export const HUES_CUES_COLS = 16 // A-P
export const HUES_CUES_ROWS = 15 // 1-15
export const HUES_CUES_CODE_RE = /^([A-P])(1[0-5]|[1-9])$/

const COL_LETTERS = Array.from({ length: HUES_CUES_COLS }, (_, i) => String.fromCharCode(65 + i)) // A..P

export function codeToColRow(code) {
  const m = HUES_CUES_CODE_RE.exec(code ?? '')
  if (!m) return null
  return { col: m[1], row: Number(m[2]) }
}

export function colRowToCode({ col, row }) {
  return `${col}${row}`
}

function colIndex(col) {
  return col.charCodeAt(0) - 65
}

export function chebyshevDistance(a, b) {
  return Math.max(Math.abs(colIndex(a.col) - colIndex(b.col)), Math.abs(a.row - b.row))
}

// Reduce chroma in fixed steps until the color round-trips through
// oklabToRgb's internal sRGB clamp within tolerance — i.e. it's actually
// in-gamut, not silently clipped to a nearby color. oklab.js exposes no
// pre-clamp gamut test, so this reconstructs one from its public functions
// rather than duplicating oklab.js's internal linearToSrgb math.
const CHROMA_START = 0.18
const CHROMA_STEP = 0.01
const ROUNDTRIP_TOLERANCE = 0.01

function inGamutHex(L, hueRadians) {
  let chroma = CHROMA_START
  while (chroma > 0) {
    const lab = [L, chroma * Math.cos(hueRadians), chroma * Math.sin(hueRadians)]
    const rgb = oklabToRgb(lab)
    const roundTrip = rgbToOklab(rgb)
    const dist = Math.hypot(lab[0] - roundTrip[0], lab[1] - roundTrip[1], lab[2] - roundTrip[2])
    if (dist <= ROUNDTRIP_TOLERANCE) return rgbToHex(rgb)
    chroma -= CHROMA_STEP
  }
  // Chroma 0 (pure gray) is always in-gamut. Never actually reached for a
  // full 0-360deg sweep, but keeps the loop provably terminating.
  return rgbToHex(oklabToRgb([L, 0, 0]))
}

let _cache = null

export function getHuesCuesGrid() {
  if (_cache) return _cache
  const grid = []
  for (let r = 0; r < HUES_CUES_ROWS; r++) {
    const row = r + 1
    // L range 0.35-0.9 so no row collapses to near-black or near-white.
    const L = 0.35 + (0.55 * r) / (HUES_CUES_ROWS - 1)
    for (let c = 0; c < HUES_CUES_COLS; c++) {
      const col = COL_LETTERS[c]
      const hueRadians = (c / HUES_CUES_COLS) * 2 * Math.PI
      grid.push({ code: colRowToCode({ col, row }), col, row, hex: inGamutHex(L, hueRadians) })
    }
  }
  _cache = grid
  return grid
}

export function getHuesCuesCell(code) {
  return getHuesCuesGrid().find(cell => cell.code === code) ?? null
}
