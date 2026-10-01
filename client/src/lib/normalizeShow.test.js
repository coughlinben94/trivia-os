// A host-laptop reload re-fetches the show row through normalizeShow. It used to
// DROP audio_playing, so after a reload on a question that already played the
// host's gate read undefined: its first Next re-wrote the same mark (an eaten
// press, since the TV's effect is keyed on values) and stepping away could not
// clear the stale mark (withAudioReset saw nothing). Review of the audio branch,
// 2026-10-01.
import { describe, it, expect } from 'vitest'
import { normalizeShow } from './normalizeShow.js'

const row = extra => ({ id: 's1', title: 't', date: '2026-10-01', slides: [], rounds: [], ...extra })

describe('normalizeShow: audio_playing', () => {
  it('carries the mark from the row', () => {
    expect(normalizeShow(row({ audio_playing: { slideId: 'q1', playing: true, part: 0 } })).audio_playing)
      .toEqual({ slideId: 'q1', playing: true, part: 0 })
  })
  it('is null when the row has none (never undefined)', () => {
    expect(normalizeShow(row({})).audio_playing).toBeNull()
    expect(normalizeShow(row({ audio_playing: null })).audio_playing).toBeNull()
  })
  it('still normalizes the rest of the row', () => {
    const n = normalizeShow(row({ current_slide_id: 'q1', current_slide_index: 3, is_live: true }))
    expect(n.showState).toMatchObject({ currentSlideId: 'q1', currentSlideIndex: 3, isLive: true })
    expect(n.slides).toEqual([])
  })
})
