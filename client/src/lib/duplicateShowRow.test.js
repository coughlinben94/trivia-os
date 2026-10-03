import { describe, it, expect } from 'vitest'
import { duplicateShowRow } from './duplicateShowRow.js'

const original = {
  id: 'show_old', title: 'Week 40', date: '2026-10-01', slides: [{ id: 'a' }], rounds: [],
  is_live: true, scoreboard_visible: true, scores_revealed: true, answer_reveal: true,
  late_team_qr_visible: true, final_scores: { a: 1 }, player_count: 12, current_slide_id: 'a', current_slide_index: 4,
  special_event: { timer: { id: 't1', state: 'paused', totalMs: 60000, remainingMs: 42000, endsAt: 0, sentAt: 1 } },
}

describe('duplicateShowRow', () => {
  const row = duplicateShowRow(original, { newId: 'show_new', now: '2026-10-08T00:00:00Z' })

  it('gives the copy a new id, title and timestamps, and keeps the content', () => {
    expect(row.id).toBe('show_new')
    expect(row.title).toBe('Week 40 (copy)')
    expect(row.created_at).toBe('2026-10-08T00:00:00Z')
    expect(row.slides).toEqual(original.slides)
  })
  it('resets every live-state field so the copy starts fresh', () => {
    expect(row).toMatchObject({
      is_live: false, scoreboard_visible: false, scores_revealed: false, answer_reveal: false,
      late_team_qr_visible: false, final_scores: null, player_count: null, current_slide_id: null, current_slide_index: 0,
    })
  })
  it('does NOT carry a forgotten (e.g. paused) host timer into next week\'s show', () => {
    expect(row.special_event).toBeNull()
  })
  it('does not touch the original', () => {
    expect(original.special_event.timer.id).toBe('t1')
  })
})

describe('duplicateShowRow: phone-mechanic state (a rehearsed Bendle must not leak in the copy)', () => {
  const bendle = (id, i, extra = {}) => ({ id, type: 'question', data: { isShiny: true, shinyInputSchema: { type: 'bendle' }, shinyGroupId: 'g1', bendleSongId: 'bnd_1', bendleStepIndex: i, ...extra } })
  const rehearsed = {
    ...original,
    slides: [
      bendle('s1', 0), bendle('s2', 1),
      bendle('s3', 2, { bendleLocked: true, bendleLockedAt: 'x', bendleRevealed: true, bendleAnswer: 'Crazy On You — Heart', bendleResults: [{ teamId: 't' }], bendleOverrides: { t: 30 } }),
      { id: 'w', type: 'question', data: { isShiny: true, text: 'How many?', wagerGuessesLocked: true, wagerRevealed: true } },
    ],
  }
  const row = duplicateShowRow(rehearsed, { newId: 'show_new', now: '2026-10-08T00:00:00Z' })
  it('clears every lock, reveal and result field on every slide', () => {
    const s3 = row.slides.find(s => s.id === 's3').data
    expect(s3).toMatchObject({ bendleLocked: false, bendleRevealed: false, bendleAnswer: null, bendleResults: null, bendleLockedAt: null, bendleOverrides: null })
    expect(row.slides.find(s => s.id === 'w').data).toMatchObject({ wagerGuessesLocked: false, wagerRevealed: false, text: 'How many?' })
    expect(JSON.stringify(row.slides)).not.toContain('Crazy On You')
  })
  it('keeps the song pick and leaves the original alone', () => {
    expect(row.slides.find(s => s.id === 's3').data.bendleSongId).toBe('bnd_1')
    expect(rehearsed.slides[2].data.bendleRevealed).toBe(true)
  })
})
