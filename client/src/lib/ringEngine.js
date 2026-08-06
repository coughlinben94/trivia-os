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

// Seeded ±10% jitter breaks up the cosine trough's flat neighbourhood — see
// concepts/world-07-ring.html's arcAt() comment for why (S1 defect: "nothing
// is a moment," reproducible at stations 6-8 without it).
export function arcAt(engine, world, i) {
  const { lo, hi, exp } = engine.ARC
  const t = 0.5 - 0.5 * Math.cos(2 * Math.PI * (i + world.phase) / engine.PANES)
  const base = lo + (hi - lo) * Math.pow(t, exp)
  const jitter = lerp(-0.10, 0.10, rng(i, 0x4217)())
  return base * (1 + jitter)
}

export function buildArc(engine, world) {
  return Array.from({ length: engine.PANES }, (_, i) => arcAt(engine, world, i))
}

export function loudnessOf(arc, i) {
  const min = Math.min(...arc), max = Math.max(...arc)
  return (arc[i] - min) / (max - min)
}
