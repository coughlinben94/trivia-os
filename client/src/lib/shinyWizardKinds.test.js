import { describe, it, expect, vi } from 'vitest'
import { FIXED_SHAPE_KINDS, buildGridSlide, buildVennSlide } from './shinyWizardKinds.jsx'

const baseFmt = { id: 'fmt_1', name: 'Test Format', icon: '✨' }

describe('FIXED_SHAPE_KINDS registry', () => {
  it('has exactly the five known fixed-shape kinds', () => {
    expect(Object.keys(FIXED_SHAPE_KINDS).sort()).toEqual(['grid', 'matching', 'order', 'venn', 'wager'])
  })

  it('matching/wager/order have no own controls or builder — they fall through to the generic flat-asset path', () => {
    for (const kind of ['matching', 'wager', 'order']) {
      expect(FIXED_SHAPE_KINDS[kind].hasOwnControls).toBe(false)
      expect(FIXED_SHAPE_KINDS[kind].buildSlideData).toBeUndefined()
    }
  })

  it('grid and venn have their own controls and builder', () => {
    for (const kind of ['grid', 'venn']) {
      expect(FIXED_SHAPE_KINDS[kind].hasOwnControls).toBe(true)
      expect(typeof FIXED_SHAPE_KINDS[kind].buildSlideData).toBe('function')
    }
  })
})

describe('buildGridSlide', () => {
  it('builds a 2D columns array sized cols x rows, with the format metadata and trimmed text/answer', () => {
    const result = buildGridSlide({
      qNum: 3,
      roundId: 'round_1',
      afterId: 'slide_before',
      gridCols: 2,
      gridRows: 3,
      selectedShinyFmt: { ...baseFmt, input_schema: { type: 'grid', columnLabels: true } },
      shinyQuestion: '  What connects these?  ',
      shinyAnswer: '  Golf terms  ',
      formatAlreadyIntroducedThisRound: () => false,
    })
    expect(result).toEqual({
      type: 'grid',
      roundId: 'round_1',
      afterSlideId: 'slide_before',
      data: {
        questionNumber: 3,
        questionLabel: 'Q3',
        questionMode: 'shiny',
        isShiny: true,
        introDone: false,
        shinyFormatId: 'fmt_1',
        shinyFormatName: 'Test Format',
        shinyFormatIcon: '✨',
        columns: [
          [{ color: null, mediaUrl: null }, { color: null, mediaUrl: null }, { color: null, mediaUrl: null }],
          [{ color: null, mediaUrl: null }, { color: null, mediaUrl: null }, { color: null, mediaUrl: null }],
        ],
        intraGap: 0,
        interGap: 84,
        columnLabels: true,
        text: 'What connects these?',
        answer: 'Golf terms',
      },
    })
  })

  it('defaults columnLabels to true when the format schema does not set it to false', () => {
    const result = buildGridSlide({
      qNum: 1, roundId: null, afterId: null, gridCols: 1, gridRows: 1,
      selectedShinyFmt: { ...baseFmt, input_schema: { type: 'grid' } },
      shinyQuestion: '', shinyAnswer: '',
      formatAlreadyIntroducedThisRound: () => true,
    })
    expect(result.data.columnLabels).toBe(true)
    expect(result.data.introDone).toBe(true)
  })
})

describe('buildVennSlide', () => {
  it('builds a single venn slide with leftCast/rightCast sized to vennPerSide when vennSlideCount is 1', () => {
    const result = buildVennSlide({
      qNum: 5,
      roundId: 'round_1',
      afterId: 'slide_before',
      vennPerSide: 3,
      vennSlideCount: '1',
      selectedShinyFmt: { ...baseFmt, input_schema: { type: 'venn' } },
      shinyQuestion: 'Name the movie',
      shinyAnswer: 'The Joker - Steve Miller Band',
      formatAlreadyIntroducedThisRound: () => false,
    })
    expect(result).toEqual({
      type: 'venn',
      roundId: 'round_1',
      afterSlideId: 'slide_before',
      data: {
        questionNumber: 5,
        questionLabel: 'Q5',
        questionMode: 'shiny',
        isShiny: true,
        introDone: false,
        shinyFormatId: 'fmt_1',
        shinyFormatName: 'Test Format',
        shinyFormatIcon: '✨',
        leftCast: [{ name: '', mediaUrl: null }, { name: '', mediaUrl: null }, { name: '', mediaUrl: null }],
        rightCast: [{ name: '', mediaUrl: null }, { name: '', mediaUrl: null }, { name: '', mediaUrl: null }],
        text: 'Name the movie',
        answer: 'The Joker - Steve Miller Band',
      },
    })
  })

  it('builds N separate standalone venn slides sharing one shinyGroupId when vennSlideCount > 1, each blank', () => {
    const result = buildVennSlide({
      qNum: 5,
      roundId: 'round_1',
      afterId: 'slide_before',
      vennPerSide: 2,
      vennSlideCount: '3',
      selectedShinyFmt: { ...baseFmt, input_schema: { type: 'venn' } },
      shinyQuestion: 'ignored for batch',
      shinyAnswer: 'ignored for batch',
      formatAlreadyIntroducedThisRound: () => false,
    })
    expect(result.afterSlideId).toBe('slide_before')
    expect(result.slides).toHaveLength(3)
    const groupId = result.slides[0].data.shinyGroupId
    expect(groupId).toMatch(/^sgrp_/)
    result.slides.forEach((slide, i) => {
      expect(slide.type).toBe('venn')
      expect(slide.roundId).toBe('round_1')
      expect(slide.data.questionNumber).toBe(5 + i)
      expect(slide.data.questionLabel).toBe(`Q${5 + i}`)
      expect(slide.data.shinyGroupId).toBe(groupId)
      expect(slide.data.isSeries).toBe(true)
      expect(slide.data.leftCast).toHaveLength(2)
      expect(slide.data.rightCast).toHaveLength(2)
      expect(slide.data.text).toBe('')
      expect(slide.data.answer).toBe('')
      // Only the first slide of a run plays the announce beat.
      expect(slide.data.introDone).toBe(i > 0)
    })
  })

  it('clamps vennSlideCount and vennPerSide to sane bounds', () => {
    const result = buildVennSlide({
      qNum: 1, roundId: null, afterId: null, vennPerSide: 3, vennSlideCount: 'not a number',
      selectedShinyFmt: { ...baseFmt, input_schema: { type: 'venn' } },
      shinyQuestion: '', shinyAnswer: '',
      formatAlreadyIntroducedThisRound: () => false,
    })
    // Garbage input falls back to 1 (single slide), not a batch.
    expect(result.slides).toBeUndefined()
    expect(result.type).toBe('venn')
  })
})
