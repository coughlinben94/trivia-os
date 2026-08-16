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

// The arc's absolute value must reach a pixel. loudnessOf() normalises it
// away (proved 2026-08-08: scaling ARC.lo/hi 10x rendered byte-identical
// frames at all 12 stations — B2-luminance.md §1.2). `fill` is the channel:
// it multiplies every primitive's interior gradient alpha and painted
// extent (see ringPrimitives.js's ALPHA_GAIN/EXTENT_GAIN).
export function fillOf(engine, arc, i) {
  const { ref, fillMin, fillMax } = engine.ARC
  return Math.min(fillMax, Math.max(fillMin, arc[i] / ref))
}

// Single source for a space world's 4-stop sky ramp, derived from a theme's
// 2 sky-relevant color stops (bg, bgDeep). Previously duplicated: a literal
// hardcoded 4-stop array in concepts/world-07-ring.html, and this same
// mixHex/darken derivation copy-pasted into client/src/worlds/
// midnightGalaxy.ring.js — the two had already drifted (2026-08-08: the
// reference build's hardcoded stops no longer matched the theme's actual
// colors). Both now import this one function instead.
const mixHex = (a, b, t) => {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16)
  const ch = (shift) => Math.round((((pa >> shift) & 255) * (1 - t)) + (((pb >> shift) & 255) * t))
  return `#${[16, 8, 0].map(s => ch(s).toString(16).padStart(2, '0')).join('')}`
}
const darken = (hex, t) => mixHex(hex, '#000000', t)

// Multiplies every channel by k (clamped 255) — a flat luma lift, not an
// interpolation toward a target color (mixHex's job). B2-luminance.md §2.3:
// the derived ramp sits below where a TV's black floor and a taproom's
// ambient light swamp it (bg measured luma 3.58, terminal stop 0.5); lifting
// the whole ramp 1.6x gets it off that floor without carrying the arc's
// contrast (that's fillOf()'s job, not the sky's — a bigger lift here would
// compress the arc's span instead, measured in the same section).
const liftHex = (hex, k) => {
  const p = parseInt(hex.slice(1), 16)
  const ch = (shift) => Math.min(255, Math.round(((p >> shift) & 255) * k))
  return `#${[16, 8, 0].map(s => ch(s).toString(16).padStart(2, '0')).join('')}`
}

// theme.colors only has 2 sky-relevant stops (bg, bgDeep); a space world's
// sky is a continuous 4-stop ramp. Duplicating bgDeep for both middle stops
// renders a flat solid band from 46% to 78% of the gradient radius — a
// visible regression from a smooth falloff. Interpolating a real midpoint
// keeps the ramp continuous. Terminal stop darkens toward black relative to
// bgDeep's own hue (spec §9), not a fixed literal, so it never defaults to
// blue-black regardless of the theme's actual color.
export function skyFromTheme(theme) {
  const ramp = [theme.colors.bg, mixHex(theme.colors.bg, theme.colors.bgDeep, 0.5), theme.colors.bgDeep, darken(theme.colors.bgDeep, 0.75)]
  return ramp.map(hex => liftHex(hex, 1.6))
}
