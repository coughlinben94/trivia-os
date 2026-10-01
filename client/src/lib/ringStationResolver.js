import { ringVisibleStationIndex, ringPeekIndex } from './ringStationIndex.js'

// Shared by Display.jsx (TV ring) and, later, Join.jsx (phone backdrop) so
// both resolve the same station from the HOST position. Pure, no component
// imports. Moved verbatim from Display.jsx (Phase 3d-2); its comment below
// was written there, so "this formula" = ringVisibleStationIndex's isVisible.

// Deliberately NOT skipsLockedBackground(s) — that function also answers
// "is THIS render of the slide painting its own opaque lock", which for a
// shiny question/grid/venn is DATA-dependent (data.introDone): true during
// the intro/closing beat (ambient, ring shows through — see SlideRenderer's
// isShinyIntroBeat), false during content (opaque backdrop, ring hidden).
// ringVisibleStationIndex sums isVisible(slide) INCLUSIVE of the current
// index every render, so reusing that same data-dependent check here meant
// the running total could change TWICE for one physical slide — once on
// entry (content's introDone flips true, uncounting it) and, since
// 2026-08-24's closing beat, AGAIN on exit (outroShown flips introDone back
// to false, re-counting it) — a second, spurious turn() on a slide the show
// never actually left. Ben: "coming out of not so different... there was a
// ring move. shouldnt be diff from the original intro." Station-visibility
// has to be a stable, TYPE-only fact for the whole lifetime of a slide — but
// that means COUNTING it once (like any other question), not excluding it
// entirely. 2026-08-24's fix over-corrected into the latter: shiny questions
// stopped moving the ring AT ALL (not even the one entry turn every other
// slide gets), which is a live-show regression flagged 2026-08-25 (Ben, live,
// on this exact Q2 -> "We're not so different, you and I" transition: "ring
// world change... is non existent"). Fixed by counting shiny questions the
// same as plain ones — the type-only-ness (no introDone in the formula) is
// what actually prevents the jitter; excluding shiny outright was never
// required for that, it just also happened to remove the ring move Ben
// wanted to keep.
// 'shiny-title' (2026-09-01): the standalone announce card paints no lock
// (skipsLockedBackground), so the ring is visibly on screen behind it for
// the slide's whole life — a stable type-only fact, exactly what this
// formula wants. Counting it means the ring takes one entry turn on the
// title card, same as it does on round-intro.
export const isRingVisible = s =>
  s?.type === 'team-preview' || s?.type === 'grading-break' ||
  s?.type === 'question' ||
  s?.type === 'pre-show' || s?.type === 'round-intro' || s?.type === 'swing-round-intro' ||
  s?.type === 'shiny-title' || s?.type === 'bonus'

// The TV's station for the host's current slide: peek past a landed
// team-picker, then count ring-visible slides up to that index.
// currentIndex null/undefined reads as 0 (Display's original `?? 0`).
export function resolveRingSlideIndex(sortedSlides, currentIndex) {
  return ringVisibleStationIndex(sortedSlides, ringPeekIndex(sortedSlides, currentIndex ?? 0), isRingVisible)
}
