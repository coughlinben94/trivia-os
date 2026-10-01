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

describe('mergeShowStateRow: special_event (host timer)', () => {
  const t = (sentAt) => ({ timer: { id: 'x', sentAt } })
  it('keeps ours when the column is absent from the payload', () => {
    const p = { ...prev, special_event: t(5) }
    expect(mergeShowStateRow(p, { id: 's1', answer_reveal: true }).special_event).toEqual(t(5))
  })
  it('takes a newer timer and ignores an older echo, including one with no timer at all', () => {
    const p = { ...prev, special_event: t(5) }
    expect(mergeShowStateRow(p, { id: 's1', special_event: t(9) }).special_event).toEqual(t(9))
    expect(mergeShowStateRow(p, { id: 's1', special_event: t(2) }).special_event).toEqual(t(5))
    // The host clears its OWN copy the instant it cancels (setShowTimer is optimistic), so a row
    // with no timer arriving while the host still holds one is an older echo, never a cancel.
    expect(mergeShowStateRow(p, { id: 's1', special_event: null }).special_event).toEqual(t(5))
  })
  it('after the host cancels, the local copy is empty and an echo of the cancel keeps it empty', () => {
    const cancelled = { ...prev, special_event: null }
    expect(mergeShowStateRow(cancelled, { id: 's1', special_event: null }).special_event).toBeNull()
  })

  describe('special_event timer', () => {
    const withTimer = sentAt => ({ ...prev, special_event: { timer: { id: 't', sentAt } } })
    it('an older echo of a timer write cannot undo a newer local timer', () => {
      const next = mergeShowStateRow(withTimer(2000), { id: 's1', special_event: { timer: { id: 'old', sentAt: 1000 } } })
      expect(next.special_event.timer.id).toBe('t')
    })
    it('a newer row timer wins', () => {
      const next = mergeShowStateRow(withTimer(1000), { id: 's1', special_event: { timer: { id: 'new', sentAt: 2000 } } })
      expect(next.special_event.timer.id).toBe('new')
    })
    it('an older echo that has NO timer (e.g. from a Next press) cannot wipe a timer the host just started', () => {
      expect(mergeShowStateRow(withTimer(2000), { id: 's1', special_event: null }).special_event.timer.id).toBe('t')
      expect(mergeShowStateRow(withTimer(2000), { id: 's1', special_event: {} }).special_event.timer.id).toBe('t')
    })
    it('with no local timer, a row without one stays without one', () => {
      expect(mergeShowStateRow(prev, { id: 's1', special_event: null }).special_event).toBeNull()
    })
    it('a column absent from the payload keeps ours', () => {
      expect(mergeShowStateRow(withTimer(2000), { id: 's1' }).special_event.timer.id).toBe('t')
    })
  })
})
