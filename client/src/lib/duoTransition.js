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
const MIN_GAP = 2
const MAX_GAP = 3 // inclusive — Ben: "2-3 slides between changes"

// Step gaps are randomized 2-3 ring-visible slides, not a fixed cadence —
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
