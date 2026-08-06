// Pure math for the ring ambient model — no DOM. Ported from
// concepts/world-07-ring.html, which remains the source of truth for the
// DOM-building half (see RingAmbient.jsx). Any change here should be
// re-verified against concepts/tools/ring-verify.mjs on the reference build.

export function hash32(x, seed) {
  let h = (x | 0) ^ (seed | 0)
  h = Math.imul(h ^ (h >>> 16), 2246822507)
  h = Math.imul(h ^ (h >>> 13), 3266489909)
  return (h ^ (h >>> 16)) >>> 0
}

export function rng(i, seed) {
  let n = hash32(i, seed)
  return () => { n = hash32(n, 0x9E3779B9); return n / 4294967296 }
}

export const lerp = (a, b, t) => a + (b - a) * t

export const cylinderOf = (engine, layer) => engine.PANES * layer.surge
export const authorPeriodOf = (engine, layer) => cylinderOf(engine, layer) / layer.m

// Seeded jitter breaks up the cosine trough's flat neighbourhood — see
// concepts/world-07-ring.html's arcAt() comment for why (S1 defect: "nothing
// is a moment," reproducible at stations 6-8 without it).
//
// The trough is symmetric by construction: stations equidistant from the
// minimum (e.g. 6 and 8, either side of 7) get IDENTICAL `base` before any
// jitter is applied. An earlier version of this jitter was a ±10% multiplier
// on `base` itself — near the trough `base` is only ~18, so ±10% is only
// ~±1.8, nowhere near enough to separate two already-identical values on an
// 18-52 range (confirmed: loudness at 6/7/8 stayed ~0.14/0/0.04, i.e. still
// visually flat, even though the gate's own span/no-flat-neighbours numbers
// happened to pass). Scaling the jitter to the ARC's own range (hi-lo)
// instead of to the local base value is what actually breaks the symmetry —
// seed 0x1234 at ±14% of range gives loudness 0.149/0.000/0.073 at
// stations 6/7/8: real, visible separation, not just a passing metric.
export function arcAt(engine, world, i) {
  const { lo, hi, exp } = engine.ARC
  const t = 0.5 - 0.5 * Math.cos(2 * Math.PI * (i + world.phase) / engine.PANES)
  const base = lo + (hi - lo) * Math.pow(t, exp)
  const jitter = lerp(-0.14, 0.14, rng(i, 0x1234)()) * (hi - lo)
  return Math.max(1, base + jitter)
}

export function buildArc(engine, world) {
  return Array.from({ length: engine.PANES }, (_, i) => arcAt(engine, world, i))
}

export function loudnessOf(arc, i) {
  const min = Math.min(...arc), max = Math.max(...arc)
  return (arc[i] - min) / (max - min)
}
