// Derives a "retinted" color by applying the same HSL relationship a
// hand-tuned color had to a theme's anchor color, but relative to the
// anchor's CURRENT (possibly host-overridden) value instead. When the
// current anchor equals the theme's base anchor, this returns the
// original color unchanged — so every theme renders pixel-identical to
// its hardcoded design until a host actually overrides a color.

function clamp01(n) {
  return Math.min(1, Math.max(0, n))
}

// Shared by every ambient theme's own prefixed `xxRgba` helper (see
// ambient-design-law.md's "Port pattern" — each theme keeps its own locally
// named wrapper for self-containment, but they all delegate the actual
// hex-to-rgba math here instead of re-implementing it 6+ times).
export function hexToRgba(hex, a) {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}

function parseColor(str) {
  if (!str) return null
  const hex = str.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (hex) {
    let h = hex[1]
    if (h.length === 3) h = h.split('').map(c => c + c).join('')
    const r = parseInt(h.slice(0, 2), 16)
    const g = parseInt(h.slice(2, 4), 16)
    const b = parseInt(h.slice(4, 6), 16)
    return { r, g, b, a: 1, format: 'hex' }
  }
  const rgb = str.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i)
  if (rgb) {
    return {
      r: parseFloat(rgb[1]),
      g: parseFloat(rgb[2]),
      b: parseFloat(rgb[3]),
      a: rgb[4] !== undefined ? parseFloat(rgb[4]) : 1,
      format: rgb[4] !== undefined ? 'rgba' : 'rgb',
    }
  }
  return null
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h, s
  const l = (max + min) / 2
  if (max === min) {
    h = s = 0
  } else {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break
      case g: h = (b - r) / d + 2; break
      default: h = (r - g) / d + 4
    }
    h *= 60
  }
  return [h, s, l]
}

function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360
  if (s === 0) {
    const v = Math.round(l * 255)
    return { r: v, g: v, b: v }
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  const hk = h / 360
  const r = hue2rgb(p, q, hk + 1 / 3)
  const g = hue2rgb(p, q, hk)
  const b = hue2rgb(p, q, hk - 1 / 3)
  return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) }
}

function formatColor({ r, g, b, a }, format) {
  r = Math.round(r); g = Math.round(g); b = Math.round(b)
  if (format === 'hex') {
    const toHex = n => n.toString(16).padStart(2, '0')
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`
  }
  if (format === 'rgba') return `rgba(${r},${g},${b},${a})`
  return `rgb(${r},${g},${b})`
}

/**
 * Retint `originalColorStr` (the theme's hand-tuned hex/rgb/rgba value) by the
 * same hue/saturation/lightness relationship it has to `baseAnchorHex`
 * (the theme's own default accent/highlight), applied relative to
 * `currentAnchorHex` (the live, possibly host-overridden accent/highlight).
 */
export function deriveTint(baseAnchorHex, currentAnchorHex, originalColorStr) {
  if (!currentAnchorHex || currentAnchorHex === baseAnchorHex) return originalColorStr

  const base = parseColor(baseAnchorHex)
  const current = parseColor(currentAnchorHex)
  const original = parseColor(originalColorStr)
  if (!base || !current || !original) return originalColorStr

  const [bh, bs, bl] = rgbToHsl(base.r, base.g, base.b)
  const [ch, cs, cl] = rgbToHsl(current.r, current.g, current.b)
  const [oh, os, ol] = rgbToHsl(original.r, original.g, original.b)

  const hueDelta = ch - bh
  const satScale = bs === 0 ? 1 : cs / bs
  const lightScale = bl === 0 ? 1 : cl / bl

  const newHue = oh + hueDelta
  const newSat = clamp01(os * satScale)
  const newLight = clamp01(ol * lightScale)

  const { r, g, b } = hslToRgb(newHue, newSat, newLight)
  return formatColor({ r, g, b, a: original.a }, original.format)
}
