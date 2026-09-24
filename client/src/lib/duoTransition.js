// Maps "how many ring-visible slides have played" to which step of the duo
// walk (duoWalk.js) is current, and which is next — the two duos a live
// two-world transition renderer needs at any moment.
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

export function currentAndNextDuo(seed, graph, ringVisibleIndex) {
  const step = stepIndexForSlide(seed, ringVisibleIndex)
  return {
    current: duoWalk(seed, graph, step),
    next: duoWalk(seed, graph, step + 1),
  }
}
