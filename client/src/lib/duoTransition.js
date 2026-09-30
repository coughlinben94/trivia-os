// Maps "how many ring-visible slides have played" to which step of the duo
// walk (duoWalk.js) is active, and the two duos a live two-world transition
// renderer needs at any moment: outgoing (fading out) and incoming (fading
// in) — see outgoingAndIncomingDuo below for why it's this direction and
// not "current/next."
// (docs/superpowers/specs/2026-09-24-ring-world-night-color-evolution-design.md)
import { rng } from './ringEngine.js'
import { seedFrom } from './paletteGenerator.js'
import { duoWalk } from './duoWalk.js'

const STEP_GAP_SALT = 0x57E9CADE
const MIN_GAP = 3
const MAX_GAP = 4 // inclusive — Ben: world changes every 3-4 slides
const WIPE_SALT = 0x4F1BBCDC

// Step gaps are randomized 3-4 slides, not a fixed cadence —
// deterministic from the show's own seed (same replay-not-store discipline
// as duoWalk itself), so Host and Display always agree and a reload doesn't
// re-roll the cadence already played.
export function stepIndexForSlide(seed, ringVisibleIndex) {
  const r = rng(seedFrom(String(seed)), STEP_GAP_SALT)
  let boundary = 0, step = 0
  while (boundary <= ringVisibleIndex) {
    const gap = MIN_GAP + Math.floor(r() * (MAX_GAP - MIN_GAP + 1))
    boundary += gap
    step++
  }
  return Math.max(0, step - 1)
}

// v2 (Codex review, 2026-09-24, against real output — a real bug, not a
// naming nitpick): the original current/next shape returned the duo for
// THIS step and a PREVIEW of the step after that. What a two-world
// transition renderer actually needs at any moment is the OPPOSITE
// direction — what it's blending FROM (the previous step's duo, fading
// out) and what it's blending TO (this step's duo, fading in). Verified
// with real output: seed "show_b" at ringVisibleIndex 2 (step 1) used to
// return { current: 'turquoise_bloom', next: 'mint_drift' } — next pointed
// backward toward mint_drift (a valid future edge, but not what "coming up"
// means at a live boundary) instead of forward at what's actually incoming.
//
// At step 0 (the very start of a show) there is nothing to transition
// FROM — outgoing === incoming, which a renderer can read as "show one
// world, no split needed yet."
export function outgoingAndIncomingDuo(seed, graph, ringVisibleIndex) {
  const step = stepIndexForSlide(seed, ringVisibleIndex)
  const incoming = duoWalk(seed, graph, step)
  const outgoing = step > 0 ? duoWalk(seed, graph, step - 1) : incoming
  return { outgoing, incoming }
}

// A slide is a transition slide iff the walk's step just changed arriving at
// it — i.e. this slide and the one before it belong to different steps.
// Pure function of the index: no ref, no stored "am I mid-transition" state,
// so back-nav (Stream Deck back button) just recomputes the same answer
// walking the other direction, for free — the same discipline duoWalk.js's
// own header comment already argues for.
export function isTransitionSlide(seed, ringVisibleIndex) {
  if (ringVisibleIndex <= 0) return false
  return stepIndexForSlide(seed, ringVisibleIndex) !== stepIndexForSlide(seed, ringVisibleIndex - 1)
}

// Stable per-world-switch geometry. The ranges are intentionally gentle:
// enough variation to feel like a different world opening, without turning
// the wipe into a sharp or distracting effect.
export function transitionWipeFor(seed, stepIndex) {
  const r = rng(seedFrom(String(seed)) ^ (stepIndex | 0), WIPE_SALT)
  const between = (lo, hi) => lo + r() * (hi - lo)
  return {
    angleDeg: between(-12, 12),
    centerY: between(25, 75),
    direction: r() < 0.5 ? -1 : 1,
    bulge: between(12, 36),
    warp: between(2, 10),
    feather: between(1.5, 4),
  }
}
