// Relative luminance + contrast ratio (WCAG 2 formulas), plus a helper that
// auto-lightens a color toward white (hue preserved) until it clears a
// legibility floor. Exists because a real bug shipped: midnightGalaxy.ring.js
// sourced question text color from theme.colors.accent (a UI-surface color,
// never tuned for text) and landed at ~1.4:1 contrast for Midnight Galaxy.
// See ART-DIRECTION-SPEC.md §9.

function srgbToLinear(c) {
  c /= 255
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

export function relativeLuminance(hex) {
  const { r, g, b } = hexToRgb(hex)
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b)
}

export function contrastRatio(hexA, hexB) {
  const la = relativeLuminance(hexA), lb = relativeLuminance(hexB)
  const lighter = Math.max(la, lb), darker = Math.min(la, lb)
  return (lighter + 0.05) / (darker + 0.05)
}

function rgbToHex(r, g, b) {
  const c = v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

// Lightens toward white in RGB space, preserving hue direction, until the
// color clears BOTH the luminance floor and the contrast-against-bg floor.
export function ensureLegibleTextColor(hex, bgHex, { minLuminance = 0.45, minContrast = 7 } = {}) {
  if (relativeLuminance(hex) >= minLuminance && contrastRatio(hex, bgHex) >= minContrast) return hex
  const { r, g, b } = hexToRgb(hex)
  for (let t = 0.05; t <= 1; t += 0.05) {
    const lr = r + (255 - r) * t, lg = g + (255 - g) * t, lb = b + (255 - b) * t
    const candidate = rgbToHex(lr, lg, lb)
    if (relativeLuminance(candidate) >= minLuminance && contrastRatio(candidate, bgHex) >= minContrast) {
      return candidate
    }
  }
  return '#ffffff'
}
