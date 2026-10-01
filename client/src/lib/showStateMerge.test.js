import { describe, it, expect } from 'vitest'
import { mergeShowStateRow } from './showStateMerge.js'

const prev = {
  id: 's1', slides: [{ id: 'a' }], rounds: [],
  showState: { currentSlideIndex: 2, currentSlideId: 'c', isLive: true, scoreboardVisible: false, scoresRevealed: false, answerReveal: false },
}

describe('mergeShowStateRow', () => {
  it('applies the state fields and leaves slides/rounds alone', () => {
    const next = mergeShowStateRow(prev, { id: 's1', current_slide_index: 5, current_slide_id: 'f', scoreboard_visible: true })
    expect(next.showState.currentSlideIndex).toBe(5)
    expect(next.showState.currentSlideId).toBe('f')
    expect(next.showState.scoreboardVisible).toBe(true)
    expect(next.slides).toBe(prev.slides)
  })

  it('keeps existing values for columns absent from the row (realtime omits unchanged ones)', () => {
    const next = mergeShowStateRow(prev, { id: 's1', answer_reveal: true })
    expect(next.showState.currentSlideIndex).toBe(2)
    expect(next.showState.isLive).toBe(true)
    expect(next.showState.answerReveal).toBe(true)
  })

  it('keepNav skips the nav fields but still applies the toggles', () => {
    const next = mergeShowStateRow(prev, { id: 's1', current_slide_index: 9, current_slide_id: 'z', scores_revealed: true }, { keepNav: true })
    expect(next.showState.currentSlideIndex).toBe(2)
    expect(next.showState.currentSlideId).toBe('c')
    expect(next.showState.scoresRevealed).toBe(true)
  })

  it('ignores a row for another show, or no show loaded', () => {
    expect(mergeShowStateRow(prev, { id: 'other', is_live: false })).toBe(prev)
    expect(mergeShowStateRow(null, { id: 's1' })).toBeNull()
  })
})

// Review of ad52e56 (2026-10-01): the host never read audio_playing from the
// DB, so after the TV played a clip the host's Next wrote it again (eaten
// press / replay) and its own clear ran off a stale copy.
describe('mergeShowStateRow: audio_playing', () => {
  it('carries audio_playing from the row onto the show (the TV can write it now)', () => {
    const next = mergeShowStateRow(prev, { id: 's1', audio_playing: { slideId: 'c', playing: true } })
    expect(next.audio_playing).toEqual({ slideId: 'c', playing: true })
  })

  it('a null in the row clears it', () => {
    const had = { ...prev, audio_playing: { slideId: 'c', playing: true } }
    expect(mergeShowStateRow(had, { id: 's1', audio_playing: null }).audio_playing).toBeNull()
  })

  it('keeps the existing value when the row omits the column', () => {
    const had = { ...prev, audio_playing: { slideId: 'c', playing: true } }
    expect(mergeShowStateRow(had, { id: 's1', answer_reveal: true }).audio_playing).toEqual({ slideId: 'c', playing: true })
  })

  it('keepNav leaves our own just-written audio_playing alone (an older echo must not clobber it)', () => {
    const had = { ...prev, audio_playing: { slideId: 'c', playing: true } }
    expect(mergeShowStateRow(had, { id: 's1', audio_playing: null }, { keepNav: true }).audio_playing).toEqual({ slideId: 'c', playing: true })
  })

  it('the catch-up refetch asks for the column', async () => {
    const { SHOW_STATE_COLUMNS } = await import('./showStateMerge.js')
    expect(SHOW_STATE_COLUMNS).toContain('audio_playing')
  })
})
