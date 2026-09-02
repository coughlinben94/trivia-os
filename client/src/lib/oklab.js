// Pure OKLab / color math, extracted 2026-09-02 from
// AlbumGradientMesh.jsx byte-for-byte (that file still re-exports every
// name, so StationRingLayer.jsx's import path keeps working). The move
// exists so weightedPalette.js — and scripts/ring-recolor.mjs behind it —
// can import this math under plain `node`, with no JSX in the chain.

export function hexToRgb(hex) {
  if (!hex || hex.length < 7) return [8, 8, 8]
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ]
}

function lerp(a, b, t) { return a + (b - a) * t }

// Signed shortest angular delta h1->h2, in (-pi, pi].
export function shortestDelta(h1, h2) {
  let d = (h2 - h1) % (2 * Math.PI)
  if (d > Math.PI) d -= 2 * Math.PI
  if (d < -Math.PI) d += 2 * Math.PI
  return d
}

// Polar OKLab lerp — rewritten 2026-08-07 (Opus review) after the version
// that shipped 2026-08-04..08-06 was proven to be a NO-OP, bit for bit
// identical to a plain Cartesian lerp of the a/b channels (algebra + a
// 300k-random-pair numeric check, max deviation 3.9e-16, float noise only).
// Full history, for the next person who touches this:
//
//   1. (2026-08-04) Original bug: two near-complementary hues (e.g.
//      orange/blue) point roughly opposite directions in the a/b plane, so
//      their vector SUM cancels toward the origin at the midpoint -- chroma
//      collapses near 0 (gray) even though L and each endpoint's own chroma
//      are both fine. Fixed by blending unit hue VECTORS (not raw atan2 hues
//      + a shortest-path branch, which flips discretely as live-drifting
//      anchors sweep their hue gap past +-180deg, producing a full-width
//      single-frame color jump mid-crossfade).
//
//   2. (2026-08-06) That vector blend's magnitude (`ulen`) naturally shrinks
//      toward 0 near exact antipodality (180deg apart) -- atan2 near the
//      origin is ill-defined, so the resolved hue swung between two
//      arbitrary values a hair's-width apart in t while chroma held its
//      full lerped value, committing to a wrong saturated hue right at the
//      unstable point ("swimming ring" bug, live-verified on Out Tonight /
//      Penelope Road, #115867/#e45a34, ~180deg apart). Fixed by scaling
//      output chroma by `ulen`.
//
//   Fix #2 is the bug. `ulen` is EXACTLY the ratio between the unit-vector
//   blend's magnitude and the Cartesian lerp's magnitude -- multiplying it
//   back in after computing hue/magnitude from the unit vectors algebraically
//   reconstructs the plain Cartesian lerp of (a,b), i.e. fix #1, undone.
//   Every comment that used to be here describing "chroma can't cancel, it's
//   a scalar magnitude" was describing intent, not the code beneath it.
//
// The actual fix for both bugs at once: don't re-derive hue direction PER
// PIXEL at all. The unit-vector trick existed only to make direction
// continuous as the CALLER's two input hues drift frame to frame (draw()
// calls this once per pixel per frame with the SAME pair of live-moving
// anchors) -- but if the caller instead fixes the traversal arc ONCE per
// frame (see hueArcRef in draw()), every pixel that frame uses the same
// monotone hue path, so there's no per-pixel instability left to guard
// against, and chroma can lerp as a true scalar magnitude with nothing
// scaling it down. The `dh` param carries that caller-fixed arc; frame-to-
// frame stability (the actual antipodality hazard, now once-per-frame
// instead of once-per-pixel) is an unwrap in draw(), not anything in here —
// see hueArcRef there for why it's an unwrap and not a threshold/hysteresis.
//
// L lerps linearly. Chroma lerps as a scalar magnitude — two positive
// numbers can't average to something smaller than both, so this is where
// bug #1 actually stays fixed. Hue lerps along `dh` (or the shortest path
// between a/b's own hues, if the caller has no per-frame drift to worry
// about — see the crossfade call in currentOklab(), whose endpoints are
// fixed for the life of one blend), with the blend fraction itself
// chroma-weighted (unchanged from the original design): a near-achromatic
// endpoint has an arbitrary atan2 hue and should barely vote on the result.
export function lerpOklabPolar(a, b, t, dh) {
  const [L1, a1, b1] = a
  const [L2, a2, b2] = b
  const C1 = Math.hypot(a1, b1)
  const C2 = Math.hypot(a2, b2)
  const L = lerp(L1, L2, t)
  const C = lerp(C1, C2, t)

  const denom = C1 * (1 - t) + C2 * t
  const th = denom > 1e-4 ? (C2 * t) / denom : t

  const h1 = Math.atan2(b1, a1)
  const arc = dh ?? shortestDelta(h1, Math.atan2(b2, a2))
  const h = h1 + arc * th

  return [L, C * Math.cos(h), C * Math.sin(h)]
}

// ── OKLab conversion — standard Bjorn Ottosson formulas.

function srgbToLinear(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4) }
function linearToSrgb(c) { c = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(Math.max(c, 0), 1 / 2.4) - 0.055; return Math.max(0, Math.min(255, c * 255)) }
function cbrt(x) { return Math.sign(x) * Math.pow(Math.abs(x), 1 / 3) }

export function rgbToOklab([r, g, b]) {
  r = srgbToLinear(r); g = srgbToLinear(g); b = srgbToLinear(b)
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
  const l_ = cbrt(l), m_ = cbrt(m), s_ = cbrt(s)
  return [
    0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
  ]
}

export function oklabToRgb([L, a, b]) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b
  const l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_
  const r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
  const bb = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
  return [linearToSrgb(r), linearToSrgb(g), linearToSrgb(bb)]
}
