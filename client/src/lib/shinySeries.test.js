import { describe, it, expect } from 'vitest'
import {
  isShinySeriesSibling,
  seriesGroupIndices,
  reorderWithinRound,
  resolveShinyPart,
  isConcurrentShiny,
  isConcurrentMediaShiny,
  partsToGridView,
  buildShinyTitleSlide,
  withShinyTitleSlide,
  withShinyGroupId,
  resolveJumpIndex,
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
  const twoParts = [{ text: 'a' }, { text: 'b' }]

  it('reads the new shinyDisplay field when present', () => {
    expect(isConcurrentShiny({ shinyDisplay: 'concurrent', parts: twoParts })).toBe(true)
    expect(isConcurrentShiny({ shinyDisplay: 'sequential', parts: twoParts })).toBe(false)
  })

  it('shinyDisplay wins over the legacy schema flags', () => {
    // A legacy-shaped text format the host later flipped to one-at-a-time in
    // the editor: the new field must not be overridden by the old flags.
    const data = { shinyDisplay: 'sequential', shinyInputSchema: { type: 'text', concurrent: true }, parts: twoParts }
    expect(isConcurrentShiny(data)).toBe(false)
  })

  it('treats a legacy concurrent TEXT slide as concurrent (unchanged behavior)', () => {
    expect(isConcurrentShiny({ shinyInputSchema: { type: 'text', concurrent: true }, parts: twoParts })).toBe(true)
  })

  it('leaves legacy concurrent IMAGE series one-at-a-time (they set concurrent: true too)', () => {
    // "Time for a Close Up" and friends set concurrent: true in their schema
    // but have always rendered one part per Next press. Never regress this.
    expect(isConcurrentShiny({ shinyInputSchema: { type: 'image', concurrent: true }, parts: twoParts })).toBe(false)
    expect(isConcurrentShiny({ shinyInputSchema: { type: 'audio', concurrent: true }, parts: twoParts })).toBe(false)
  })

  it('is false for a flat legacy shiny question with no relevant fields', () => {
    expect(isConcurrentShiny({ isShiny: true, text: 'q', answer: 'a' })).toBe(false)
    expect(isConcurrentShiny({})).toBe(false)
  })

  // 2026-08-26, overseer review: must agree with QuestionSlide.jsx's
  // dispatcher guard (parts.length > 1) on EVERY path, new and legacy alike.
  // Without this, a 1-part concurrent question diverges from the renderer —
  // revealStepCount adds its +1 "nothing revealed yet" state so
  // computeNextStep bumps currentPart on the first Next press, but the
  // dispatcher (needing >1 part) falls through to plain StandardQuestion,
  // which never reads currentPart. Dead Next press, live. Independently
  // found and fixed the same night on the pre-rebuild isConcurrentTextShiny
  // (main, commit-adjacent to this branch) — carried forward here so the
  // new shinyDisplay path can't reintroduce the identical bug.
  it('is false with exactly one part, on the new shinyDisplay path', () => {
    expect(isConcurrentShiny({ shinyDisplay: 'concurrent', parts: [{ text: 'only' }] })).toBe(false)
  })

  it('is false with exactly one part, on the legacy text path', () => {
    expect(isConcurrentShiny({ shinyInputSchema: { type: 'text', concurrent: true }, parts: [{ text: 'only' }] })).toBe(false)
  })

  it('is false with no parts array at all, on either path', () => {
    expect(isConcurrentShiny({ shinyDisplay: 'concurrent' })).toBe(false)
    expect(isConcurrentShiny({ shinyInputSchema: { type: 'text', concurrent: true } })).toBe(false)
  })
})

describe('isConcurrentMediaShiny', () => {
  const twoParts = [{ mediaSlots: [{ url: 'a.jpg' }] }, { mediaSlots: [{ url: 'b.jpg' }] }]

  it('is true only for a concurrent slide whose assets are not text', () => {
    expect(isConcurrentMediaShiny({ shinyDisplay: 'concurrent', shinyInputSchema: { type: 'image' }, parts: twoParts })).toBe(true)
    expect(isConcurrentMediaShiny({ shinyDisplay: 'concurrent', shinyInputSchema: { type: 'video' }, parts: twoParts })).toBe(true)
    expect(isConcurrentMediaShiny({ shinyDisplay: 'concurrent', shinyInputSchema: { type: 'text' }, parts: twoParts })).toBe(false)
  })

  it('is false for a sequential media slide', () => {
    expect(isConcurrentMediaShiny({ shinyDisplay: 'sequential', shinyInputSchema: { type: 'image' }, parts: twoParts })).toBe(false)
  })

  it('is false for every legacy shape (no slide created before this existed is concurrent media)', () => {
    expect(isConcurrentMediaShiny({ shinyInputSchema: { type: 'image', concurrent: true }, parts: twoParts })).toBe(false)
    expect(isConcurrentMediaShiny({ shinyInputSchema: { type: 'text', concurrent: true }, parts: twoParts })).toBe(false)
  })

  it('is false for a single-part media slide even with shinyDisplay: concurrent', () => {
    expect(isConcurrentMediaShiny({ shinyDisplay: 'concurrent', shinyInputSchema: { type: 'image' }, parts: [{ mediaSlots: [{ url: 'only.jpg' }] }] })).toBe(false)
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

// The compatibility contract in one place. Every one of these shapes exists
// in the live database today and is NEVER rewritten — the rebuild's whole
// legacy surface is the read path, so these four assertions are what a
// reviewer checks to know old shows still play the way they always have.
describe('legacy shapes read exactly as before', () => {
  it('flat single-asset shiny — not concurrent, media from mediaSlots[0]', () => {
    const data = { isShiny: true, shinyInputSchema: { type: 'image' }, text: 'Q', answer: 'A', mediaSlots: [{ url: 'x.jpg', type: 'image/jpeg' }] }
    expect(isConcurrentShiny(data)).toBe(false)
    expect(isConcurrentMediaShiny(data)).toBe(false)
    expect(resolveShinyPart(data)).toMatchObject({ text: 'Q', answer: 'A', mediaUrl: 'x.jpg' })
  })

  it('multi-asset one-slide series — not concurrent, resolves the current part', () => {
    const data = {
      isShiny: true, isSeries: true, seriesTheme: 'Hear Me Roar', currentPart: 1,
      shinyInputSchema: { type: 'audio' },
      parts: [{ text: 'one', mediaSlots: [] }, { text: 'two', answer: 'B', mediaSlots: [] }],
    }
    expect(isConcurrentShiny(data)).toBe(false)
    expect(resolveShinyPart(data)).toMatchObject({ text: 'two', answer: 'B' })
  })

  it('concurrent text series — still concurrent, still NOT media', () => {
    const data = { isShiny: true, isSeries: true, shinyInputSchema: { type: 'text', concurrent: true }, parts: [{ text: 'a' }, { text: 'b' }] }
    expect(isConcurrentShiny(data)).toBe(true)
    expect(isConcurrentMediaShiny(data)).toBe(false)
  })

  it('legacy sibling run with no shinyGroupId — still grouped by the old heuristic', () => {
    const s = id => ({ id, roundId: 'r1', data: { isShiny: true, isSeries: true, shinyFormatId: 'f1', seriesTheme: 'Close Up' } })
    expect(isShinySeriesSibling(s('a'), s('b'))).toBe(true)
    expect(seriesGroupIndices([s('a'), s('b'), s('c')], 1)).toEqual([0, 2])
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

describe('buildShinyTitleSlide / withShinyTitleSlide', () => {
  // SPEC.md (2026-09-01): every shiny series opens with a real `shiny-title`
  // slide sharing its content's shinyGroupId. These pin the exact data shape
  // ShinyTitleSlide.jsx / ShinyIntroScreen read and the grouping seam
  // (isShinySeriesSibling) later tasks rely on.
  const fmt = { id: 'fmt_venn', name: "We're not so different, you and I...", icon: '🎭' }
  const fixedId = () => 'sgrp_test1234'

  it('stamps the shiny-title shape ShinyIntroScreen reads', () => {
    expect(buildShinyTitleSlide(fmt, 'sgrp_abc', 'round_1')).toEqual({
      type: 'shiny-title',
      roundId: 'round_1',
      data: {
        isShiny: true,
        shinyGroupId: 'sgrp_abc',
        seriesTheme: fmt.name,
        shinyFormatId: 'fmt_venn',
        shinyFormatName: fmt.name,
        shinyFormatIcon: '🎭',
      },
    })
  })

  it('leaves hostPhotoUrl unset (random pool) and never seeds introDone', () => {
    const { data } = buildShinyTitleSlide(fmt, 'sgrp_abc')
    expect(data).not.toHaveProperty('hostPhotoUrl')
    expect(data).not.toHaveProperty('introDone')
  })

  it('wraps a single-slide payload into a batch led by the title, stamping a fresh shinyGroupId on both', () => {
    const out = withShinyTitleSlide(
      { type: 'question', roundId: 'round_1', afterSlideId: 'slide_prev', data: { isShiny: true, text: 'Q' } },
      fmt, fixedId,
    )
    expect(out.afterSlideId).toBe('slide_prev')
    expect(out.slides.map(s => s.type)).toEqual(['shiny-title', 'question'])
    expect(out.slides[0].roundId).toBe('round_1')
    expect(out.slides.every(s => s.data.shinyGroupId === 'sgrp_test1234')).toBe(true)
    expect(out.slides[1].data.text).toBe('Q')
    expect(out.slides[1]).not.toHaveProperty('afterSlideId')
  })

  it("reuses the batch payload's existing shinyGroupId so the title joins the run", () => {
    const slides = [1, 2, 3].map(i => ({ type: 'venn', roundId: 'round_1', data: { isShiny: true, isSeries: true, shinyGroupId: 'sgrp_run', questionNumber: i } }))
    const out = withShinyTitleSlide({ afterSlideId: 'slide_prev', slides }, fmt, fixedId)
    expect(out.slides).toHaveLength(4)
    expect(out.slides[0].type).toBe('shiny-title')
    expect(out.slides.every(s => s.data.shinyGroupId === 'sgrp_run')).toBe(true)
  })

  it('makes the title a series sibling of its content, so it becomes the group lead', () => {
    const out = withShinyTitleSlide(
      { type: 'grid', roundId: 'round_1', afterSlideId: null, data: { isShiny: true } },
      fmt, fixedId,
    )
    expect(isShinySeriesSibling(out.slides[0], out.slides[1])).toBe(true)
    expect(seriesGroupIndices(out.slides, 1)).toEqual([0, 1])
  })
})

describe('withShinyGroupId (title-less grouping)', () => {
  // A round built entirely from one shiny format only gets ONE announce card
  // (AddSlideWizard's formatAlreadyIntroducedThisRound). The later questions
  // still have to be a real group: without a shinyGroupId they'd be loose
  // slides no sidebar row, atomic reorder or PYL title-jump could see, and
  // `shiny-title` is hidden in the picker so nothing could ever add one later.
  const fixedId = () => 'sgrp_test1234'

  it('stamps a fresh shinyGroupId on a single-slide payload without prepending a title', () => {
    const out = withShinyGroupId(
      { type: 'question', roundId: 'round_1', afterSlideId: 'slide_prev', data: { isShiny: true, text: 'Q' } },
      fixedId,
    )
    expect(out.afterSlideId).toBe('slide_prev')
    expect(out.slides.map(s => s.type)).toEqual(['question'])
    expect(out.slides[0].data.shinyGroupId).toBe('sgrp_test1234')
    expect(out.slides[0].data.text).toBe('Q')
    expect(out.slides[0]).not.toHaveProperty('afterSlideId')
  })

  it('groups a multi-slide batch under one id and leaves an existing group id alone', () => {
    const slides = [1, 2].map(i => ({ type: 'question', roundId: 'round_1', data: { isShiny: true, questionNumber: i } }))
    const out = withShinyGroupId({ afterSlideId: null, slides }, fixedId)
    expect(out.slides).toHaveLength(2)
    expect(out.slides.every(s => s.data.shinyGroupId === 'sgrp_test1234')).toBe(true)
    expect(isShinySeriesSibling(out.slides[0], out.slides[1])).toBe(true)

    const pre = [{ type: 'question', roundId: 'round_1', data: { isShiny: true, shinyGroupId: 'sgrp_run' } }]
    expect(withShinyGroupId({ afterSlideId: null, slides: pre }, fixedId).slides[0].data.shinyGroupId).toBe('sgrp_run')
  })
})

describe('resolveJumpIndex', () => {
  // A PYL Theme Picker row's targetSlideId points at the theme's first
  // CONTENT slide. Since the announce beat became its own `shiny-title`
  // slide sitting before it, jumping straight to the target would skip the
  // announce card the board jump is supposed to open with.
  const title = (id, gid) => ({ id, type: 'shiny-title', data: { isShiny: true, shinyGroupId: gid } })
  const q = (id, gid) => ({ id, type: 'question', data: { isShiny: true, shinyGroupId: gid } })

  it('lands on the title card when it leads the target\'s own group', () => {
    const sorted = [{ id: 'board', type: 'pyl-reveal', data: {} }, title('t1', 'g1'), q('q1', 'g1'), q('q2', 'g1')]
    expect(resolveJumpIndex(sorted, 'q1')).toBe(1)
  })

  it('lands on the target itself when nothing precedes it, or the slide before is not its title', () => {
    expect(resolveJumpIndex([q('q1', 'g1')], 'q1')).toBe(0)
    // a title belonging to a DIFFERENT group is not this target's announce card
    const other = [title('t1', 'g1'), q('qA', 'g1'), q('q1', 'g2')]
    expect(resolveJumpIndex(other, 'q1')).toBe(2)
    // and a plain slide before the target is left alone
    const plain = [{ id: 'x', type: 'question', data: {} }, q('q1', 'g1')]
    expect(resolveJumpIndex(plain, 'q1')).toBe(1)
  })

  it('stays put when the target IS the title card, and returns -1 for an unknown id', () => {
    const sorted = [title('t1', 'g1'), q('q1', 'g1')]
    expect(resolveJumpIndex(sorted, 't1')).toBe(0)
    expect(resolveJumpIndex(sorted, 'nope')).toBe(-1)
  })
})
