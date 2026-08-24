// Counts only ring-VISIBLE slides up to currentIndex, so the ring's station
// index stays flat across a run of hidden slides (each paints its own opaque
// cover — the ring isn't on screen) and advances exactly one station the
// moment a visible slide is next reached, no matter how many hidden slides
// sat in between. isVisible is injected so this file has no component
// imports (Display.jsx/SlideRenderer.jsx pull in the whole slide-component
// tree) and can be unit-tested standalone.
export function ringVisibleStationIndex(sortedSlides, currentIndex, isVisible) {
  let count = -1
  for (let i = 0; i <= currentIndex && i < sortedSlides.length; i++) {
    if (isVisible(sortedSlides[i])) count++
  }
  return count
}

// What the ring should do when the station index moves from `prev` to `next`.
// Single-step moves in EITHER direction glide (turn / turn-back) — that's the
// ordinary Next/Prev walk through a run of ring-visible slides, and both ways
// must read as one smooth station rotation (2026-08-24, Ben: "why i cant go
// back and forth between ring slides and have it be smooth"). Anything larger
// snaps (jump): a multi-station move is a real "we skipped ahead/behind"
// event, not an adjacent transition — and the pan cylinders only carry
// authored content for single-surge travel anyway (see RingAmbient's turn()).
// prev == null is the first real index seen (Go Live resuming mid-show):
// align by jumping. Pure and component-free so RingAmbient's slideIndex
// effect and the unit tests share one source of truth for this decision.
export function ringNavAction(prev, next) {
  if (next == null) return 'none'
  if (prev == null) return 'jump'
  if (prev === next) return 'none'
  if (next === prev + 1) return 'turn'
  if (next === prev - 1) return 'turn-back'
  return 'jump'
}
