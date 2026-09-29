import { describe, it, expect, vi } from 'vitest'

vi.mock('./supabase.js', () => ({ supabase: {} }))

import { slideToArchiveRow } from './questionRows.js'

describe('questionRows — horse-race', () => {
  const data = {
    text: 'Which movie made the most money?',
    answer: 'Forrest Gump',
    shinyFormatName: "And They're Off!",
    contenders: [{ id: 'a', name: 'Lion King', imageUrl: null }],
    beats: [{ label: 'Week 1', values: [1, 2, 3, 4] }],
  }
  const show = { id: 'show1', title: 'Test Show', date: '2026-09-14', rounds: [] }

  it('builds an archive row from race data', () => {
    const row = slideToArchiveRow({ id: 'slide1', type: 'horse-race', data }, show)
    expect(row).toMatchObject({
      type: 'shiny',
      text: data.text,
      answer: 'Forrest Gump',
      is_shiny: true,
      shiny_type: 'race',
      shiny_format_name: "And They're Off!",
      questions_data: { contenders: data.contenders, beats: data.beats },
    })
  })

  it('returns null when text and answer are both blank', () => {
    const row = slideToArchiveRow({ id: 'slide1', type: 'horse-race', data: { ...data, text: '', answer: '' } }, show)
    expect(row).toBeNull()
  })
})

describe('questionRows — pin it', () => {
  const show = { id: 'show1', title: 'Test Show', date: '2026-09-14', rounds: [] }
  it('is not archived: the true-spot coordinates would be lost', () => {
    const slide = { id: 'p1', type: 'question', data: { isShiny: true, shinyInputSchema: { type: 'pin' }, text: 'Where is Chicago?', answer: 'Chicago', pinAnswer: { lat: 41.88, lon: -87.63 } } }
    expect(slideToArchiveRow(slide, show)).toBeNull()
  })
  it('an ordinary shiny question still archives', () => {
    const slide = { id: 'q1', type: 'question', data: { isShiny: true, text: 'Q?', answer: 'A' } }
    expect(slideToArchiveRow(slide, show)).not.toBeNull()
  })
})
