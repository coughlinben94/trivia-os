// "Next plays audio" gate, shared by /host (LiveMode) and /display (stepShow).
// Before 2026-10-01 only /host had it: a Stream Deck Right-Arrow that landed on
// the /display window stepped past an audio question with no sound (confirmed
// live 2026-08-24 for the team-picker; the prime suspect for 2026-09-29).
import { describe, it, expect } from 'vitest'
import { audioPlayPending, tvAudioStepPatch, computeTvNextStep, computeTvPrevStep, withAudioReset, audioPartOf } from './audioPending.js'

const yt = (over = {}) => ({
  id: 'q1',
  type: 'question',
  data: { isShiny: true, shinyType: 'audio', mediaSlots: [{ type: 'youtube', videoId: 'abc' }], youtubeId: 'abc', ...over },
})
const plain = (over = {}) => ({
  id: 'q2',
  type: 'question',
  data: { mediaUrl: 'https://x/y.mp3', mediaType: 'audio/mpeg', ...over },
})
const bendle = () => ({ id: 'b1', type: 'question', data: { isShiny: true, shinyInputSchema: { type: 'bendle' } } })

describe('audioPlayPending', () => {
  it('is false when there is no slide or it is not a question', () => {
    expect(audioPlayPending(null, null)).toBe(false)
    expect(audioPlayPending({ id: 't', type: 'title', data: {} }, null)).toBe(false)
  })

  it('is true for a shiny audio question that has not been played', () => {
    expect(audioPlayPending(yt(), null)).toBe(true)
    expect(audioPlayPending(yt(), { slideId: 'other', playing: true })).toBe(true)
  })

  it('is false once audio_playing already names this slide', () => {
    expect(audioPlayPending(yt(), { slideId: 'q1', playing: true })).toBe(false)
  })

  it('is true for a plain question with click-triggered audio, false when the trigger is not click', () => {
    expect(audioPlayPending(plain(), null)).toBe(true)
    expect(audioPlayPending(plain({ audioTrigger: 'auto' }), null)).toBe(false)
  })

  it('is false when the slide has no audio at all', () => {
    expect(audioPlayPending({ id: 'q3', type: 'question', data: {} }, null)).toBe(false)
    expect(audioPlayPending(yt({ youtubeId: undefined, mediaSlots: [], mediaUrl: undefined }), null)).toBe(false)
  })

  it('is false for a shiny question that is not an audio shiny (e.g. a list)', () => {
    expect(audioPlayPending({ id: 'l1', type: 'question', data: { isShiny: true, shinyInputSchema: { type: 'list' } } }, null)).toBe(false)
  })

  it('treats Bendle as audio: pending until audio_playing names the slide', () => {
    expect(audioPlayPending(bendle(), null)).toBe(true)
    expect(audioPlayPending(bendle(), { slideId: 'b1', playing: true })).toBe(false)
  })
})

describe('tvAudioStepPatch', () => {
  const row = (slide, audio_playing = null) => ({
    id: 'show1',
    slides: [{ id: 'a', type: 'title', data: {} }, slide],
    current_slide_id: slide.id,
    current_slide_index: 1,
    audio_playing,
  })

  it('returns the audio_playing write instead of a step when audio is pending', () => {
    expect(tvAudioStepPatch(row(yt()))).toEqual({ audio_playing: { slideId: 'q1', playing: true, part: 0 } })
  })

  it('returns null (plain step) when the clip already played', () => {
    expect(tvAudioStepPatch(row(yt(), { slideId: 'q1', playing: true }))).toBeNull()
  })

  it('returns null when the current slide has no audio or the row has no slides', () => {
    expect(tvAudioStepPatch(row({ id: 'q9', type: 'question', data: {} }))).toBeNull()
    expect(tvAudioStepPatch({ id: 's', slides: null, current_slide_id: 'x' })).toBeNull()
    expect(tvAudioStepPatch(null)).toBeNull()
  })

  it('returns null when current_slide_id matches no slide', () => {
    expect(tvAudioStepPatch({ ...row(yt()), current_slide_id: 'gone' })).toBeNull()
  })
})

describe('computeTvNextStep (what /display Next does on a raw shows row)', () => {
  const slides = [
    { id: 'a', type: 'title', data: {} },
    { id: 'q1', type: 'question', data: { isShiny: true, shinyType: 'audio', mediaSlots: [{ type: 'youtube', videoId: 'abc' }] } },
    { id: 'z', type: 'title', data: {} },
  ]
  const at = (i, audio_playing = null) => ({ id: 's', slides, current_slide_index: i, current_slide_id: slides[i].id, audio_playing })
  const noTeams = async () => 0

  it('plays the clip and does NOT advance when the current slide owes its audio', async () => {
    const patch = await computeTvNextStep(at(1), noTeams)
    expect(patch).toEqual({ audio_playing: { slideId: 'q1', playing: true, part: 0 } })
    expect(patch.current_slide_index).toBeUndefined()
    expect(patch.current_slide_id).toBeUndefined()
  })

  it('steps normally once the clip has played', async () => {
    const patch = await computeTvNextStep(at(1, { slideId: 'q1', playing: true }), noTeams)
    expect(patch.current_slide_index).toBe(2)
    expect(patch.current_slide_id).toBe('z')
  })

  it('steps normally on a slide with no audio', async () => {
    const patch = await computeTvNextStep(at(0), noTeams)
    expect(patch.current_slide_index).toBe(1)
  })
})

// Bendle (a Tone.js stem mix, not mediaUrl-shaped) is reached by the TV's Next too
// now. Its slide component keys on slideId + playing and ignores part, so the TV
// writes the same mark /host does and Bendle's own start-once latch does the rest.
describe('TV Next on a Bendle slide', () => {
  const bendleRow = (audio_playing = null) => ({
    id: 's', current_slide_index: 0, current_slide_id: 'b1', audio_playing,
    slides: [{ id: 'b1', type: 'question', order: 0, data: { isShiny: true, shinyInputSchema: { type: 'bendle' }, bendleSongId: 'song1' } }, { id: 'z', type: 'title', order: 1, data: {} }],
  })
  it('plays instead of stepping, then steps once it has played', async () => {
    const noTeams = async () => 0
    const first = await computeTvNextStep(bendleRow(), noTeams)
    expect(first).toEqual({ audio_playing: { slideId: 'b1', playing: true, part: 0 } })
    const second = await computeTvNextStep(bendleRow({ slideId: 'b1', playing: true, part: 0 }), noTeams)
    expect(second.current_slide_id).toBe('z')
    expect(second.audio_playing).toBeNull() // leaving the slide clears the mark
  })
})

// Review of ad52e56: the TV step path never cleared audio_playing, so after the
// TV played Q5 and moved on, Left-Arrow back to Q5 autoplayed it on arrival
// (the 2026-09-14 Round 2 Q8 bug by a new route). Host has always cleared it.
describe('withAudioReset', () => {
  const played = { slideId: 'q1', playing: true }
  it('clears the mark when the patch moves to a different slide', () => {
    expect(withAudioReset({ current_slide_id: 'z', current_slide_index: 2 }, played)).toEqual({ current_slide_id: 'z', current_slide_index: 2, audio_playing: null })
  })
  it('keeps the mark when the patch stays on the marked slide', () => {
    expect(withAudioReset({ current_slide_id: 'q1' }, played)).toEqual({ current_slide_id: 'q1' })
  })
  it('leaves patches alone that do not change slides or when nothing is marked', () => {
    expect(withAudioReset({ answer_reveal: true }, played)).toEqual({ answer_reveal: true })
    expect(withAudioReset({ current_slide_id: 'z' }, null)).toEqual({ current_slide_id: 'z' })
    expect(withAudioReset(null, played)).toBeNull()
  })
})

describe('TV step clears a stale audio mark when it leaves the slide', () => {
  const slides = [
    { id: 'a', type: 'title', data: {} },
    { id: 'q1', type: 'question', data: { isShiny: true, shinyType: 'audio', mediaSlots: [{ type: 'youtube', videoId: 'abc' }] } },
    { id: 'z', type: 'title', data: {} },
  ]
  const row = { id: 's', slides, current_slide_index: 1, current_slide_id: 'q1', audio_playing: { slideId: 'q1', playing: true } }
  it('Next off the played slide clears audio_playing', async () => {
    const patch = await computeTvNextStep(row, async () => 0)
    expect(patch.current_slide_id).toBe('z')
    expect(patch.audio_playing).toBeNull()
  })
  it('Prev off the played slide clears audio_playing', async () => {
    const patch = await computeTvPrevStep(row, async () => 0)
    expect(patch.current_slide_id).toBe('a')
    expect(patch.audio_playing).toBeNull()
  })
})

// Multi-part audio series. The gate stays slide-id only (as on main): the FIRST
// Next on the slide plays part 0; after that every part step writes its own mark
// (see slideStepping: a part step plays the new part on arrival, exactly what
// main did by accident), so a series takes play + one press per part, never an
// extra silent step. The mark still names its part so a STALE mark for another
// part cannot autoplay on arrival (QuestionSlide).
describe('multi-part audio series', () => {
  const part = n => ({ text: `p${n}`, mediaSlots: [{ type: 'audio/mpeg', url: `/p${n}.mp3` }] })
  const series = (currentPart = 0, parts = [part(0), part(1), part(2)]) => ({
    id: 's1', type: 'question', data: { isShiny: true, shinyType: 'audio', parts, currentPart },
  })

  it('audioPartOf: 0 for single-part slides, currentPart for series, clamped', () => {
    expect(audioPartOf({})).toBe(0)
    expect(audioPartOf({ parts: [part(0)] })).toBe(0)
    expect(audioPartOf(series(2).data)).toBe(2)
    expect(audioPartOf(series(9).data)).toBe(2)
    expect(audioPartOf(series(-3).data)).toBe(0)
  })

  it('once the slide has played, Next steps (a played mark for ANY part means not pending)', () => {
    for (const part of [0, 1, 2, undefined]) {
      expect(audioPlayPending(series(1), { slideId: 's1', playing: true, part })).toBe(false)
    }
    expect(audioPlayPending(series(0), null)).toBe(true)
  })

  it('TV Next: play p0, then each Next steps AND plays the next part, then leaves', async () => {
    const mk = (cp, ap) => ({
      id: 'sh', current_slide_index: 0, current_slide_id: 's1', audio_playing: ap,
      slides: [{ ...series(cp), order: 0 }, { id: 'end', type: 'title', order: 1, data: {} }],
    })
    const noTeams = async () => 0
    let p = await computeTvNextStep(mk(0, null), noTeams)
    expect(p).toEqual({ audio_playing: { slideId: 's1', playing: true, part: 0 } }) // press 1: play part 0
    p = await computeTvNextStep(mk(0, { slideId: 's1', playing: true, part: 0 }), noTeams)
    expect(p.slides.find(s => s.id === 's1').data.currentPart).toBe(1) // press 2: step + play part 1
    expect(p.audio_playing).toEqual({ slideId: 's1', playing: true, part: 1, at: expect.any(Number) })
    p = await computeTvNextStep(mk(1, { slideId: 's1', playing: true, part: 1 }), noTeams)
    expect(p.slides.find(s => s.id === 's1').data.currentPart).toBe(2) // press 3: step + play part 2
    expect(p.audio_playing).toEqual({ slideId: 's1', playing: true, part: 2, at: expect.any(Number) })
    p = await computeTvNextStep(mk(2, { slideId: 's1', playing: true, part: 2 }), noTeams)
    expect(p.current_slide_id).toBe('end') // press 4: leaves
  })
})

// Wiring guard: stepShow lives inside Display.jsx (a 2000-line view with no
// test harness), so a revert to the ungated computeNextStep there would pass
// every pure test above. These read the source so that revert fails loudly.
import { readFileSync } from 'node:fs'
describe('wiring (source guards)', () => {
  const display = readFileSync(new URL('../views/Display.jsx', import.meta.url), 'utf8')
  const live = readFileSync(new URL('../components/host/LiveMode.jsx', import.meta.url), 'utf8')
  it('/display steps through computeTvNextStep, never the bare computeNextStep', () => {
    expect(display).toMatch(/await computeTvNextStep\(showRow, fetchTeamCount\)/)
    expect(display).toMatch(/await computeTvPrevStep\(showRow, fetchTeamCount\)/)
    expect(display).not.toMatch(/await computeNextStep\(/)
    expect(display).not.toMatch(/await computePrevStep\(/)
  })
  it('/host writes the part with its play mark', () => {
    expect(live).toMatch(/part: audioPartOf\(currentSlide\.data\)/)
  })
  it('/host uses the shared gate, not a private copy', () => {
    expect(live).toMatch(/audioPlayPendingFor\(currentSlide, show\.audio_playing\)/)
    expect(live).not.toMatch(/isBendleShiny\(/)
  })
})
