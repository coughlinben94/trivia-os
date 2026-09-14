import { describe, it, expect, vi } from 'vitest'
import { FIXED_SHAPE_KINDS, buildGridSlide, buildVennSlide, buildElimSlide, buildRaceSlide } from './shinyWizardKinds.jsx'

const baseFmt = { id: 'fmt_1', name: 'Test Format', icon: '✨' }

describe('FIXED_SHAPE_KINDS registry', () => {
  it('has exactly the nine known fixed-shape kinds', () => {
    expect(Object.keys(FIXED_SHAPE_KINDS).sort()).toEqual(['bendle', 'choice', 'elimination', 'grid', 'matching', 'order', 'race', 'venn', 'wager'])
  })

  it('matching/wager/order/choice have no own controls or builder — they fall through to the generic flat-asset path', () => {
    for (const kind of ['matching', 'wager', 'order', 'choice']) {
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
    })
    expect(result.data.columnLabels).toBe(true)
  })

  it('never seeds introDone — the announce beat is a separate shiny-title slide now', () => {
    const result = buildGridSlide({
      qNum: 1, roundId: null, afterId: null, gridCols: 1, gridRows: 1,
      selectedShinyFmt: { ...baseFmt, input_schema: { type: 'grid' } },
      shinyQuestion: '', shinyAnswer: '',
    })
    expect(result.data).not.toHaveProperty('introDone')
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
      // The announce beat is a separate shiny-title slide now, prepended by
      // AddSlideWizard — no sibling carries introDone.
      expect(slide.data).not.toHaveProperty('introDone')
    })
  })

  it('clamps vennSlideCount and vennPerSide to sane bounds', () => {
    const result = buildVennSlide({
      qNum: 1, roundId: null, afterId: null, vennPerSide: 3, vennSlideCount: 'not a number',
      selectedShinyFmt: { ...baseFmt, input_schema: { type: 'venn' } },
      shinyQuestion: '', shinyAnswer: '',
    })
    // Garbage input falls back to 1 (single slide), not a batch.
    expect(result.slides).toBeUndefined()
    expect(result.type).toBe('venn')
  })
})

describe('elimination kind has no own controls but does have a builder', () => {
  it('has hasOwnControls: false and a buildSlideData function', () => {
    expect(FIXED_SHAPE_KINDS.elimination.hasOwnControls).toBe(false)
    expect(typeof FIXED_SHAPE_KINDS.elimination.buildSlideData).toBe('function')
  })
})

describe('buildElimSlide', () => {
  it('builds a flip-em-down slide with 8 blank items, 3 blank hints, elimStep 0', () => {
    const result = buildElimSlide({
      qNum: 5,
      roundId: 'round_1',
      afterId: 'slide_before',
      selectedShinyFmt: { id: 'fmt_1', name: 'Flip \'Em Down!', icon: '🫥' },
    })
    expect(result.type).toBe('flip-em-down')
    expect(result.roundId).toBe('round_1')
    expect(result.afterSlideId).toBe('slide_before')
    expect(result.data.questionNumber).toBe(5)
    expect(result.data.questionLabel).toBe('Q5')
    expect(result.data.isShiny).toBe(true)
    expect(result.data.shinyFormatId).toBe('fmt_1')
    expect(result.data.shinyFormatName).toBe('Flip \'Em Down!')
    expect(result.data.shinyFormatIcon).toBe('🫥')
    expect(result.data.items).toHaveLength(8)
    for (const item of result.data.items) {
      expect(item).toMatchObject({ label: '', imageUrl: null })
      expect(typeof item.id).toBe('string')
      expect(item.id.length).toBeGreaterThan(0)
    }
    expect(result.data.hints).toHaveLength(3)
    expect(result.data.hints[0]).toEqual({ text: '', survivors: [] })
    expect(result.data.hints[1]).toEqual({ text: '', survivors: [] })
    expect(result.data.hints[2]).toEqual({ text: '' })
    expect(result.data.elimStep).toBe(0)
    expect(result.data.answer).toBe('')
  })

  it('gives every item a distinct id', () => {
    const result = buildElimSlide({ qNum: 1, roundId: 'r', afterId: 'a', selectedShinyFmt: { id: 'fmt_1', name: 'X', icon: '🫥' } })
    const ids = result.data.items.map(i => i.id)
    expect(new Set(ids).size).toBe(8)
  })
})

describe('buildRaceSlide', () => {
  it('builds a race slide with 4 blank contenders, 10 blank beats, format metadata', () => {
    const result = buildRaceSlide({
      qNum: 7,
      roundId: 'round_1',
      afterId: 'slide_before',
      selectedShinyFmt: { id: 'fmt_1', name: 'And They\'re Off!', icon: '🏇' },
      shinyQuestion: '  Who wins the Kentucky Derby?  ',
      shinyAnswer: '',
    })
    expect(result.type).toBe('race')
    expect(result.roundId).toBe('round_1')
    expect(result.afterSlideId).toBe('slide_before')
    expect(result.data.questionNumber).toBe(7)
    expect(result.data.questionLabel).toBe('Q7')
    expect(result.data.questionMode).toBe('shiny')
    expect(result.data.isShiny).toBe(true)
    expect(result.data.shinyFormatId).toBe('fmt_1')
    expect(result.data.shinyFormatName).toBe('And They\'re Off!')
    expect(result.data.shinyFormatIcon).toBe('🏇')
    expect(result.data.text).toBe('Who wins the Kentucky Derby?')
    expect(result.data.contenders).toHaveLength(4)
    result.data.contenders.forEach((c) => {
      expect(c.id).toBeTruthy()
      expect(c.name).toBe('')
      expect(c.imageUrl).toBeNull()
    })
    expect(result.data.beats).toHaveLength(10)
    result.data.beats.forEach((b) => expect(b.values).toEqual([0, 0, 0, 0]))
    expect(result.data.raceStartedAt).toBeNull()
    expect(result.data.answer).toBe('')
  })

  it('has hasOwnControls: false', () => {
    expect(FIXED_SHAPE_KINDS.race.hasOwnControls).toBe(false)
  })

  it('gives every contender a distinct id', () => {
    const result = buildRaceSlide({
      qNum: 1,
      roundId: 'r',
      afterId: 'a',
      selectedShinyFmt: { id: 'fmt_1', name: 'X', icon: '🏇' },
      shinyQuestion: '',
      shinyAnswer: '',
    })
    const ids = result.data.contenders.map(c => c.id)
    expect(new Set(ids).size).toBe(4)
  })
})
