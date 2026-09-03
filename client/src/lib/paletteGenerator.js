// Seeded random palette + drift arc generator — Phase 3 of
// docs/superpowers/plans/2026-09-02-ring-palette-runtime.md, adopted
// verbatim. Never Math.random. Same seed forever produces the same
// palette, so a shelf row (Task 5) or a saved show reproduces on any
// reload. This module NEVER applies a palette itself and never talks to
// the network — Task 6's sweep tool calls it to produce candidates, and
// (future, out of this plan's scope) a "Surprise me" button draws from
// the CERTIFIED SHELF those candidates land on, never from a fresh call
// to this function at show time — that would be the "live check" path
// Ben explicitly chose not to build.
import { rng } from './ringEngine.js'
import { derivePalette, hexToHslHue, DEAD_BAND } from './weightedPalette.js'
import { regionHueWarnings } from './ringRecolor.js'
import { skyRegionHues } from './ringPrimitives.js'

export const MIN_SEPARATION = 60
export const DRIFT_MIN = 30
export const DRIFT_MAX = 90
export const LUMA_RISE_MAX = null // STAYS HUMAN — set once Task 6's sweep has run against real palettes; null = check disabled
export const BASE_PALETTE = { colors: ['#a855f7', '#3b82f6'], weights: [0.65, 0.35] }

// One-click starting points the picker offers — also the FULL list of
// palettes that must always be shelved as certified (Task 6's --seed-batch),
// since Apply only ever offers shelf matches (Task 7) and a preset click
// (or the picker's own untouched default, which equals PRESETS[0]) must
// always be able to apply instantly, even before the shelf has been seeded
// with any generated candidates.
export const PRESETS = [
  { name: 'Purple & Blue',  colors: ['#a855f7', '#3b82f6'], weights: [0.65, 0.35] },
  { name: 'Violet & Pink',  colors: ['#8b5cf6', '#ec4899'], weights: [0.6, 0.4] },
  { name: 'Blue & Teal',    colors: ['#3b82f6', '#14b8a6'], weights: [0.6, 0.4] },
  { name: 'Amber & Rose',   colors: ['#f59e0b', '#f43f5e'], weights: [0.55, 0.45] },
  { name: 'Emerald & Indigo', colors: ['#10b981', '#6366f1'], weights: [0.55, 0.45] },
  { name: 'Crimson & Gold', colors: ['#dc2626', '#eab308'], weights: [0.6, 0.4] },
]

export function seedFrom(text) {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

function hslHex(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  let r, g, b
  if (h < 60) [r, g, b] = [c, x, 0]
  else if (h < 120) [r, g, b] = [x, c, 0]
  else if (h < 180) [r, g, b] = [0, c, x]
  else if (h < 240) [r, g, b] = [0, x, c]
  else if (h < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  const to255 = v => Math.round((v + m) * 255)
  return '#' + [to255(r), to255(g), to255(b)].map(v => v.toString(16).padStart(2, '0')).join('')
}

function pickHues(r, k) {
  const hues = []
  let guard = 0
  while (hues.length < k && guard++ < 200) {
    const h = r() * 360
    const inBand = h >= DEAD_BAND[0] - 1 && h < DEAD_BAND[1] + 1 // ponytail: +/- 1° buffer for hex quantization up to 0.44° rounding
    if (inBand) continue
    if (hues.some(existing => Math.min(Math.abs(existing - h), 360 - Math.abs(existing - h)) < MIN_SEPARATION)) continue
    hues.push(h)
  }
  return hues.length === k ? hues : null // caller's retry loop handles a null (dead-band + separation left no room)
}

function pickWeights(r, k) {
  const heaviest = 0.55 + r() * 0.15
  if (k === 2) return [heaviest, +(1 - heaviest).toFixed(3)]
  const rest = 1 - heaviest
  const split = 0.3 + r() * 0.4
  return [heaviest, +(rest * split).toFixed(3), +(rest * (1 - split)).toFixed(3)]
}

export function generatePalette(seed, base, baseTheme) {
  const r = rng(seed, 0xC0105)
  for (let t = 0; t < 64; t++) {
    const k = r() < 0.25 ? 3 : 2
    const hues = pickHues(r, k)
    if (!hues) continue
    const colors = hues.map(h => hslHex(h, 0.70 + r() * 0.25, 0.50 + r() * 0.15))
    const weights = pickWeights(r, k)
    const drift = { arc: Math.round(DRIFT_MIN + r() * (DRIFT_MAX - DRIFT_MIN)) }
    const candidate = { colors, weights, drift }
    if (accept(candidate, base, baseTheme)) return { ...candidate, seed, tries: t + 1 }
  }
  return { ...BASE_PALETTE, drift: { arc: 0 }, seed, tries: 64, fallback: true }
}

function accept({ colors, weights, drift }, base, baseTheme) {
  let derived
  try {
    derived = derivePalette({
      colors, weights, stationCount: base.stations.length,
      currentHues: base.stations.map(s => s.hue), baseTheme, drift,
    })
  } catch {
    return false
  }
  if (derived.warnings.some(w => w.includes('overlap'))) return false
  const stations = base.stations.map((s, i) => ({ ...s, hue: derived.hues[i] }))
  const regions = skyRegionHues(stations)
  if (regionHueWarnings(regions, derived.hueAnchors).length) return false
  if (LUMA_RISE_MAX != null) {
    const rise = Math.max(...derived.advisory.map(a => a.delta))
    if (rise > LUMA_RISE_MAX) return false
  }
  return true
}
