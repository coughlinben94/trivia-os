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
