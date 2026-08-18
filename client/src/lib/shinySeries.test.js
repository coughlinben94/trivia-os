import { describe, it, expect } from 'vitest'
import { isShinySeriesSibling, seriesGroupIndices, reorderWithinRound } from './shinySeries.js'

function seriesSlide(id, overrides = {}) {
  return {
    id,
    roundId: 'round_1',
    data: {
      isShiny: true,
      isSeries: true,
      shinyFormatId: 'fmt_not_so_different',
      seriesTheme: "We're not so different, you and I...",
      ...overrides,
    },
  }
}

function plainSlide(id) {
  return { id, roundId: 'round_1', data: { isShiny: false } }
}

describe('seriesGroupIndices', () => {
  // Bug this guards against: RoundSidebar's within-round drag used to move
  // only the single dragged slide, so dragging a shiny series' lead (or any
  // sibling) split the group apart instead of carrying the whole run — this
  // contradicts SKILL.md's documented "drag-reorder carries the whole group
  // as one atomic unit" guarantee.

  it('returns a single-index group for a slide with no series siblings', () => {
    const slides = [plainSlide('a'), plainSlide('b'), plainSlide('c')]
    expect(seriesGroupIndices(slides, 1)).toEqual([1, 1])
  })

  it('finds the full contiguous run when starting from the lead slide', () => {
    const slides = [plainSlide('before'), seriesSlide('lead'), seriesSlide('p2'), seriesSlide('p3'), plainSlide('after')]
    expect(seriesGroupIndices(slides, 1)).toEqual([1, 3])
  })

  it('finds the full contiguous run when starting from a non-lead sibling', () => {
    const slides = [plainSlide('before'), seriesSlide('lead'), seriesSlide('p2'), seriesSlide('p3'), plainSlide('after')]
    expect(seriesGroupIndices(slides, 3)).toEqual([1, 3]) // dragged from the LAST sibling, same group bounds
  })

  it('does not merge two separate series runs of the same format into one group', () => {
    // Two independent "N slides per run" questions using the same shiny
    // format back-to-back — distinguished by seriesTheme, not just format id.
    const slides = [
      seriesSlide('run1-a', { seriesTheme: 'Run One' }),
      seriesSlide('run1-b', { seriesTheme: 'Run One' }),
      seriesSlide('run2-a', { seriesTheme: 'Run Two' }),
      seriesSlide('run2-b', { seriesTheme: 'Run Two' }),
    ]
    expect(seriesGroupIndices(slides, 0)).toEqual([0, 1])
    expect(seriesGroupIndices(slides, 2)).toEqual([2, 3])
  })

  it('isShinySeriesSibling stays false across a round boundary even with matching format/theme', () => {
    const a = seriesSlide('a')
    const b = { ...seriesSlide('b'), roundId: 'round_2' }
    expect(isShinySeriesSibling(a, b)).toBe(false)
  })
})

describe('reorderWithinRound', () => {
  // Bug this guards against: an earlier version of this logic (adapted from
  // single-slide splice(fromIdx,1)+splice(toIdx,0,moved) to move a whole
  // series group) always inserted BEFORE the target instead of preserving
  // "dragging down lands after target, dragging up lands before" — every
  // downward drag landed one slot short, and an adjacent-down drag was a
  // silent no-op, while the sidebar's own drop-indicator kept pointing at
  // the (wrong) after-target position the whole time. No test caught it
  // because computeNewOrder itself had no test seam — that's what this file
  // is for now.

  const ids = arr => arr.map(s => s.id)
  const abcd = () => [plainSlide('A'), plainSlide('B'), plainSlide('C'), plainSlide('D')]

  it('matches single-slide splice semantics for every downward drag (A onto B/C/D)', () => {
    expect(reorderWithinRound(abcd(), 0, 1)).toEqual(['B', 'A', 'C', 'D']) // A onto B
    expect(reorderWithinRound(abcd(), 0, 2)).toEqual(['B', 'C', 'A', 'D']) // A onto C
    expect(reorderWithinRound(abcd(), 0, 3)).toEqual(['B', 'C', 'D', 'A']) // A onto D
  })

  it('matches single-slide splice semantics for an upward drag (D onto A)', () => {
    expect(reorderWithinRound(abcd(), 3, 0)).toEqual(['D', 'A', 'B', 'C'])
  })

  it('moves a whole series group together, preserving the same direction rule', () => {
    // [before, lead, p2, p3, after] — drag the lead (idx 1, group [1,3]) down onto "after" (idx 4)
    const slides = [plainSlide('before'), seriesSlide('lead'), seriesSlide('p2'), seriesSlide('p3'), plainSlide('after')]
    expect(ids(slides.filter(Boolean))).toEqual(['before', 'lead', 'p2', 'p3', 'after'])
    const result = reorderWithinRound(slides, 1, 4)
    expect(result).toEqual(['before', 'after', 'lead', 'p2', 'p3']) // group lands AFTER "after", not before it
  })

  it('moving a series group upward lands it before the target, group order preserved', () => {
    const slides = [plainSlide('before'), seriesSlide('lead'), seriesSlide('p2'), seriesSlide('p3'), plainSlide('after')]
    const result = reorderWithinRound(slides, 2, 0) // drag a non-lead sibling (p2, still resolves the whole group) onto "before"
    expect(result).toEqual(['lead', 'p2', 'p3', 'before', 'after'])
  })

  it('returns null for a drop inside the dragged slide\'s own group (no-op)', () => {
    const slides = [seriesSlide('lead'), seriesSlide('p2'), seriesSlide('p3'), plainSlide('after')]
    expect(reorderWithinRound(slides, 0, 1)).toBe(null)
  })

  it('returns null for invalid or identical indices', () => {
    const slides = abcd()
    expect(reorderWithinRound(slides, 0, 0)).toBe(null)
    expect(reorderWithinRound(slides, -1, 2)).toBe(null)
    expect(reorderWithinRound(slides, 0, 99)).toBe(null)
  })
})
