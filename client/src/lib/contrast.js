// WCAG contrast ratio + a lightness-only safety floor for a single foreground
// color against one or more backgrounds. Used to guarantee textMuted stays
// legible on a TV at distance without hand-editing every theme's palette —
// see references/themes.md's "textMuted contrast" audit finding.

function hexToRgb(hex) {
  const h = hex.replace('#', '')
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  }
}

function relativeLuminance({ r, g, b }) {
  const [rs, gs, bs] = [r, g, b].map(v => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs
}

export function contrastRatio(hex1, hex2) {
  const l1 = relativeLuminance(hexToRgb(hex1))
  const l2 = relativeLuminance(hexToRgb(hex2))
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1]
  return (hi + 0.05) / (lo + 0.05)
}

function rgbToHsl({ r, g, b }) {
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
      default: h = (r - g) / d + 4; break
    }
    h /= 6
  }
  return { h: h * 360, s: s * 100, l: l * 100 }
}

function hslToRgb({ h, s, l }) {
  h /= 360; s /= 100; l /= 100
  let r, g, b
  if (s === 0) {
    r = g = b = l
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1
      if (t > 1) t -= 1
      if (t < 1 / 6) return p + (q - p) * 6 * t
      if (t < 1 / 2) return q
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
      return p
    }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    r = hue2rgb(p, q, h + 1 / 3)
    g = hue2rgb(p, q, h)
    b = hue2rgb(p, q, h - 1 / 3)
  }
  const to255 = v => Math.max(0, Math.min(255, Math.round(v * 255)))
  return { r: to255(r), g: to255(g), b: to255(b) }
}

function rgbToHex({ r, g, b }) {
  const toHex = v => v.toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

// Nudges fgHex's LIGHTNESS ONLY (hue/saturation untouched) until its contrast
// ratio against every color in bgHexes clears minRatio. Returns fgHex
// byte-identical if it already clears the floor against all of them — this
// is a safety net for the failing cases, not a recolor of compliant themes.
//
// Direction assumption: every theme in this app is a dark background with
// light-ish text, so under-contrast text is fixed by getting LIGHTER, never
// darker. If a future light theme is added, this will need a direction check
// (compare against the background's own luminance) rather than always
// increasing L.
export function floorContrast(fgHex, bgHexes, minRatio = 3.0) {
  const worstRatio = hex => Math.min(...bgHexes.map(bg => contrastRatio(hex, bg)))
  if (worstRatio(fgHex) >= minRatio) return fgHex

  const hsl = rgbToHsl(hexToRgb(fgHex))
  let l = hsl.l
  for (let i = 0; i < 100; i++) {
    l = Math.min(100, l + 1)
    const candidate = rgbToHex(hslToRgb({ ...hsl, l }))
    if (worstRatio(candidate) >= minRatio || l >= 100) return candidate
  }
  return rgbToHex(hslToRgb({ ...hsl, l }))
}
