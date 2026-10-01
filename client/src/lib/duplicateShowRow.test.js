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
