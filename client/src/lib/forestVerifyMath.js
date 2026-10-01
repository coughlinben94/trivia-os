// Pure helpers for scripts/forest-verify.mjs (Halloween forest spec §3, gates 2-7). No DOM, no Node APIs:
// every function takes RGBA byte arrays (PNG-decoded, 4 bytes per pixel) and plain numbers.

// Luma: Rec.709 weights applied to the gamma-encoded sRGB bytes (0-255), NOT linearized. Same formula as
// concepts/tools/assert-safe-zone-luminance.mjs, and the scale the spec's 34 / 62 / 68 caps are written in.
export const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b

// Spec §2.5 text box as fractions of the frame.
export const SAFE_BOX = { left: 0.2, top: 0.28, width: 0.6, height: 0.44 }

export function boxPx(box, W, H) {
  const x0 = Math.round(box.left * W), y0 = Math.round(box.top * H)
  return { x0, y0, x1: x0 + Math.round(box.width * W), y1: y0 + Math.round(box.height * H) }
}

// mean and p99.5 luma over the crop. An empty crop throws: a sampler that saw nothing must never pass.
export function lumaStats(rgba, W, H, box, pct = 0.995) {
  const { x0, y0, x1, y1 } = boxPx(box, W, H)
  const cx0 = Math.max(0, x0), cy0 = Math.max(0, y0), cx1 = Math.min(W, x1), cy1 = Math.min(H, y1)
  const n = Math.max(0, cx1 - cx0) * Math.max(0, cy1 - cy0)
  if (!n) throw new Error('empty crop (0 px)')
  if (rgba.length < W * H * 4) throw new Error(`frame too short (${rgba.length} bytes for ${W}x${H})`)
  const hist = new Uint32Array(25501) // luma to 0.01
  let sum = 0
  for (let y = cy0; y < cy1; y++) {
    for (let x = cx0; x < cx1; x++) {
      const i = (y * W + x) * 4, l = luma(rgba[i], rgba[i + 1], rgba[i + 2])
      sum += l; hist[Math.round(l * 100)]++
    }
  }
  const rank = Math.ceil(pct * n)
  let acc = 0, p = 0
  for (let k = 0; k < hist.length; k++) { acc += hist[k]; if (acc >= rank) { p = k / 100; break } }
  return { mean: sum / n, p995: p, n }
}

// WCAG 2 relative luminance of a #rrggbb colour, and of a grey whose sRGB byte is v (0-255).
const lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
export function relLumHex(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex); if (!m) throw new Error(`bad colour ${hex}`)
  const n = parseInt(m[1], 16)
  return 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255)
}
export const relLumGrey = v => lin(Math.max(0, Math.min(255, v)))
export function contrastRatio(textHex, bgLumaByte) {
  const a = relLumHex(textHex), b = relLumGrey(bgLumaByte)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

// CSS cubic-bezier(x1,y1,x2,y2) as a function of progress 0..1 (bisection on x; exact enough for 8-bit).
export function cubicBezier(x1, y1, x2, y2) {
  const bz = (t, a, b) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3
  return p => {
    if (p <= 0) return 0
    if (p >= 1) return 1
    let lo = 0, hi = 1, t = p
    for (let i = 0; i < 60; i++) { t = (lo + hi) / 2; if (bz(t, x1, x2) < p) lo = t; else hi = t }
    return bz(t, y1, y2)
  }
}
export const easeInOut = cubicBezier(0.42, 0, 0.58, 1) // CSS 'ease-in-out' (the .rmx transition)

// Expected covered-cut frame: source S drawn at opacity a over destination D (straight alpha, 8-bit).
export function composite(S, D, a) {
  const out = new Uint8Array(S.length)
  for (let i = 0; i < S.length; i += 4) {
    out[i] = Math.round(S[i] * a + D[i] * (1 - a))
    out[i + 1] = Math.round(S[i + 1] * a + D[i + 1] * (1 - a))
    out[i + 2] = Math.round(S[i + 2] * a + D[i + 2] * (1 - a))
    out[i + 3] = 255
  }
  return out
}

// Pixel diff: count of pixels whose largest RGB channel difference is non-zero, the largest such
// difference, and the mean absolute channel difference (0-255) over all pixels and channels.
export function diffStats(A, B) {
  if (A.length !== B.length) throw new Error(`size mismatch ${A.length} vs ${B.length}`)
  let differing = 0, max = 0, sum = 0
  for (let i = 0; i < A.length; i += 4) {
    const d0 = Math.abs(A[i] - B[i]), d1 = Math.abs(A[i + 1] - B[i + 1]), d2 = Math.abs(A[i + 2] - B[i + 2])
    const d = Math.max(d0, d1, d2)
    sum += d0 + d1 + d2
    if (d) { differing++; if (d > max) max = d }
  }
  return { differing, max, mae: sum / (A.length / 4 * 3) }
}

// p-quantile of a numeric list (nearest rank); median = quantile(xs, 0.5)
export function quantile(xs, p) {
  if (!xs.length) return NaN
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1))]
}
