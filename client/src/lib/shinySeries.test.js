import { describe, it, expect } from 'vitest'
import {
  isShinySeriesSibling,
  seriesGroupIndices,
  reorderWithinRound,
  resolveShinyPart,
  isConcurrentShiny,
  isConcurrentMediaShiny,
  partsToGridView,
} from './shinySeries.js'

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

describe('resolveShinyPart — legacy dual-image swing visual', () => {
  // Bug fixed 2026-08-25: ShinySwingVisualQuestion (TV) reads
  // data.mediaSlots/imagesRevealed directly for its two-beat pan and never
  // calls resolveShinyPart for its own image, so this always fell through to
  // slot 0. Join.jsx (phones) has no pan beat and ONLY calls resolveShinyPart
  // — so a phone was stuck showing beat 1's image forever, even after the
  // host revealed beat 2 on the TV. Reported live as "teams were only seeing
  // half the images" / phone not matching TV.
  function dualImageSlide(imagesRevealed) {
    return {
      shinyType: 'visual',
      isShiny: true,
      text: 'Guess the answer',
      imagesRevealed,
      mediaSlots: [
        { url: 'heads.jpg', type: 'image/jpeg' },
        { url: 'weapons.jpg', type: 'image/jpeg' },
      ],
    }
  }

  it('shows slot 0 (beat 1) before the host reveals the second image', () => {
    expect(resolveShinyPart(dualImageSlide(false)).mediaUrl).toBe('heads.jpg')
  })

  it('shows slot 1 (beat 2) once the host reveals the second image', () => {
    expect(resolveShinyPart(dualImageSlide(true)).mediaUrl).toBe('weapons.jpg')
  })

  it('a single-image visual question is unaffected by imagesRevealed', () => {
    const data = { shinyType: 'visual', isShiny: true, text: 'Q', imagesRevealed: true, mediaSlots: [{ url: 'only.jpg', type: 'image/jpeg' }] }
    expect(resolveShinyPart(data).mediaUrl).toBe('only.jpg')
  })

  it('a non-visual shiny type ignores imagesRevealed (never picks slot 1)', () => {
    const data = { shinyType: 'audio', isShiny: true, imagesRevealed: true, mediaSlots: [{ url: 'a.mp3' }, { url: 'b.mp3' }] }
    expect(resolveShinyPart(data).mediaUrl).toBe('a.mp3')
  })
})

// ── Shiny suite rebuild (2026-08-26) ────────────────────────────────────────
// data.shinyDisplay is the ONE field that decides one-at-a-time vs all-at-once
// for slides created by the rebuilt AddSlideWizard. Everything created before
// it has to keep reading exactly as it did — no row is ever rewritten, so the
// legacy gate below is the whole compatibility surface.

describe('isConcurrentShiny', () => {
  it('reads the new shinyDisplay field when present', () => {
    expect(isConcurrentShiny({ shinyDisplay: 'concurrent' })).toBe(true)
    expect(isConcurrentShiny({ shinyDisplay: 'sequential' })).toBe(false)
  })

  it('shinyDisplay wins over the legacy schema flags', () => {
    // A legacy-shaped text format the host later flipped to one-at-a-time in
    // the editor: the new field must not be overridden by the old flags.
    const data = { shinyDisplay: 'sequential', shinyInputSchema: { type: 'text', concurrent: true } }
    expect(isConcurrentShiny(data)).toBe(false)
  })

  it('treats a legacy concurrent TEXT slide as concurrent (unchanged behavior)', () => {
    expect(isConcurrentShiny({ shinyInputSchema: { type: 'text', concurrent: true } })).toBe(true)
  })

  it('leaves legacy concurrent IMAGE series one-at-a-time (they set concurrent: true too)', () => {
    // "Time for a Close Up" and friends set concurrent: true in their schema
    // but have always rendered one part per Next press. Never regress this.
    expect(isConcurrentShiny({ shinyInputSchema: { type: 'image', concurrent: true } })).toBe(false)
    expect(isConcurrentShiny({ shinyInputSchema: { type: 'audio', concurrent: true } })).toBe(false)
  })

  it('is false for a flat legacy shiny question with no relevant fields', () => {
    expect(isConcurrentShiny({ isShiny: true, text: 'q', answer: 'a' })).toBe(false)
    expect(isConcurrentShiny({})).toBe(false)
  })
})

describe('isConcurrentMediaShiny', () => {
  it('is true only for a concurrent slide whose assets are not text', () => {
    expect(isConcurrentMediaShiny({ shinyDisplay: 'concurrent', shinyInputSchema: { type: 'image' } })).toBe(true)
    expect(isConcurrentMediaShiny({ shinyDisplay: 'concurrent', shinyInputSchema: { type: 'video' } })).toBe(true)
    expect(isConcurrentMediaShiny({ shinyDisplay: 'concurrent', shinyInputSchema: { type: 'text' } })).toBe(false)
  })

  it('is false for a sequential media slide', () => {
    expect(isConcurrentMediaShiny({ shinyDisplay: 'sequential', shinyInputSchema: { type: 'image' } })).toBe(false)
  })

  it('is false for every legacy shape (no slide created before this existed is concurrent media)', () => {
    expect(isConcurrentMediaShiny({ shinyInputSchema: { type: 'image', concurrent: true } })).toBe(false)
    expect(isConcurrentMediaShiny({ shinyInputSchema: { type: 'text', concurrent: true } })).toBe(false)
  })
})

describe('isShinySeriesSibling — shinyGroupId', () => {
  const grouped = (id, groupId, extra = {}) => ({
    id,
    roundId: 'round_1',
    data: {
      isShiny: true, isSeries: true, shinyGroupId: groupId,
      shinyFormatId: 'fmt_a', seriesTheme: 'Same Format', ...extra,
    },
  })

  it('groups two slides sharing a shinyGroupId', () => {
    expect(isShinySeriesSibling(grouped('a', 'g1'), grouped('b', 'g1'))).toBe(true)
  })

  it('does NOT group two slides with different shinyGroupIds', () => {
    expect(isShinySeriesSibling(grouped('a', 'g1'), grouped('b', 'g2'))).toBe(false)
  })

  it('does NOT group a groupId slide with a legacy slide that has none', () => {
    const legacy = { id: 'b', roundId: 'round_1', data: { isShiny: true, isSeries: true, shinyFormatId: 'fmt_a', seriesTheme: 'Same Format' } }
    expect(isShinySeriesSibling(grouped('a', 'g1'), legacy)).toBe(false)
    expect(isShinySeriesSibling(legacy, grouped('a', 'g1'))).toBe(false)
  })

  it('REGRESSION: two runs of the same format in the same round stay separate', () => {
    // The latent bug the rebuild fixes. seriesTheme was stamped as the
    // format's NAME, so two runs of one format in one round were
    // indistinguishable — the second run's intro beat got skipped and the
    // sidebar collapsed both runs into a single row. With shinyGroupId the
    // two runs are distinct even though every other field matches.
    const slides = [
      grouped('run1-a', 'g1'), grouped('run1-b', 'g1'),
      grouped('run2-a', 'g2'), grouped('run2-b', 'g2'),
    ]
    expect(isShinySeriesSibling(slides[1], slides[2])).toBe(false)
    expect(seriesGroupIndices(slides, 0)).toEqual([0, 1])
    expect(seriesGroupIndices(slides, 2)).toEqual([2, 3])
  })

  it('LEGACY CEILING: two groupId-less runs of one format in one round still merge', () => {
    // Documented, deliberate: old rows are never backfilled, so they keep the
    // old heuristic and its known collision. Locked down here so the legacy
    // branch cannot silently change shape.
    const legacy = id => ({ id, roundId: 'round_1', data: { isShiny: true, isSeries: true, shinyFormatId: 'fmt_a', seriesTheme: 'Same Format' } })
    expect(isShinySeriesSibling(legacy('x'), legacy('y'))).toBe(true)
  })

  it('still requires both slides to be shiny', () => {
    const notShiny = { id: 'b', roundId: 'round_1', data: { isShiny: false, shinyGroupId: 'g1' } }
    expect(isShinySeriesSibling(grouped('a', 'g1'), notShiny)).toBe(false)
  })
})

describe('partsToGridView', () => {
  const media = url => ({ mediaSlots: [{ url, type: 'image/jpeg' }] })

  it('maps N parts to N single-tile columns, in order', () => {
    const view = partsToGridView({ parts: [media('1.jpg'), media('2.jpg'), media('3.jpg')] })
    expect(view.columns).toEqual([
      [{ color: null, mediaUrl: '1.jpg' }],
      [{ color: null, mediaUrl: '2.jpg' }],
      [{ color: null, mediaUrl: '3.jpg' }],
    ])
  })

  it('carries the slide-level question and answer, and matches the old grid gaps', () => {
    const view = partsToGridView({ parts: [media('1.jpg')], text: 'What links these?', answer: 'Michigan' })
    expect(view.text).toBe('What links these?')
    expect(view.answer).toBe('Michigan')
    expect(view.columnLabels).toBe(false)
    expect(view.intraGap).toBe(0)
    expect(view.interGap).toBe(84)
  })

  it('renders an empty tile for a part with no media yet', () => {
    const view = partsToGridView({ parts: [{}, media('2.jpg')] })
    expect(view.columns[0]).toEqual([{ color: null, mediaUrl: null }])
  })

  it('survives a missing parts array', () => {
    expect(partsToGridView({}).columns).toEqual([])
  })
})
