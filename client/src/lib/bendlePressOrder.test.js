// client/src/lib/bendlePressOrder.test.js
import { describe, it, expect } from 'vitest'
import { planHostCommand } from './hostCommands.js'
import { nextPressGate } from './nextPressCue.js'
import { pendingLockPhase, pendingReveal, computeNextStep, patchSlideData, sortSlides } from './slideStepping.js'
import { audioPlayPending, withAudioReset } from './audioPending.js'
import { lockRefusal } from './lockRefusal.js'
import { fixFor } from './remoteFix.js'
import { REFUSAL_TEXT } from './remoteProtocol.js'

const bendle = (id, order, step, extra = {}) => ({ id, order, type: 'question', roundId: 'r1',
  data: { isShiny: true, shinyInputSchema: { type: 'bendle' }, shinyGroupId: 'g1', bendleStepIndex: step, bendleSongId: 'bnd_1', ...extra } })
const idle = { modalOpen: false, pendingAdvance: false, lockCountdownRunning: false, scoringBlocked: false, answerReveal: false, scoringBusy: false, scoreboardVisible: false, scoresRevealed: false }

// A tiny host: real decision code, state applied the way LiveMode applies it.
function makeHost() {
  const st = { slides: [bendle('s1', 0, 0), bendle('s2', 1, 1), bendle('s3', 2, 2), { id: 'q4', order: 3, type: 'question', roundId: 'r1', data: { text: 'next' } }], idx: 0, currentSlideId: 's1', audio: null }
  const cur = () => sortSlides(st.slides)[st.idx]
  const ctx = () => {
    const slide = cur()
    const isBendle = slide.data?.shinyInputSchema?.type === 'bendle'
    return { ...idle, lockPhase: pendingLockPhase(slide), audioPending: audioPlayPending(slide, st.audio), revealPending: !!pendingReveal(slide),
      answerHeld: isBendle && !pendingReveal(slide), lockBlocked: lockRefusal(slide) }
  }
  async function press(cmd) {
    const plan = planHostCommand({ cmd }, ctx())
    switch (plan.run) {
      case 'play-audio': st.audio = { slideId: cur().id, playing: true, part: 0 }; break
      case 'start-lock-countdown': st.slides = patchSlideData(st.slides, cur().id, { bendleLocked: true, bendleLockedAt: 'now' }); break
      case 'reveal-slide': st.slides = patchSlideData(st.slides, cur().id, { bendleRevealed: true, bendleResults: [] }); break
      case 'next': {
        const patch = withAudioReset(await computeNextStep({ slides: st.slides, currentSlideIndex: st.idx, currentSlideId: st.currentSlideId }, async () => 0), st.audio)
        st.slides = patch.slides; st.idx = patch.current_slide_index; st.currentSlideId = patch.current_slide_id
        if ('audio_playing' in patch) st.audio = patch.audio_playing
        break
      }
    }
    return plan.run ?? `refuse:${plan.refuse}`
  }
  return { press, cur, st }
}

describe('Bendle press order', () => {
  it('land, play, advance; play, advance; on step 3: play, lock, A, Next', async () => {
    const h = makeHost()
    const seq = []
    for (const cmd of ['next', 'next', 'next', 'next', 'next', 'next', 'answer', 'next']) seq.push(await h.press(cmd))
    expect(seq).toEqual(['play-audio', 'next', 'play-audio', 'next', 'play-audio', 'start-lock-countdown', 'reveal-slide', 'next'])
    expect(h.cur().id).toBe('q4')
  })
  it('A refuses on steps 1-2 and on step 3 before the lock', async () => {
    const h = makeHost()
    expect(await h.press('answer')).toBe('refuse:answer-held')
    await h.press('next'); await h.press('next')             // play s1, go to s2
    expect(await h.press('answer')).toBe('refuse:answer-held')
    await h.press('next'); await h.press('next'); await h.press('next') // play s2, go s3, play s3
    expect(await h.press('answer')).toBe('refuse:answer-held')  // not locked yet
  })
  it('the remote may still hide an answer that is showing; refuses turning it on', () => {
    expect(planHostCommand({ cmd: 'answer', via: 'remote', sentAt: 1, expectSlideId: 's1', args: { value: true } }, { ...idle, now: 1, slideId: 's1', answerHeld: true })).toEqual({ refuse: 'answer-held' })
    expect(planHostCommand({ cmd: 'answer', via: 'remote', sentAt: 1, expectSlideId: 's1', args: { value: false } }, { ...idle, now: 1, slideId: 's1', answerHeld: true, answerReveal: true })).toEqual({ run: 'set-answer-reveal', value: false })
    expect(planHostCommand({ cmd: 'answer' }, { ...idle, answerHeld: true, answerReveal: true })).toEqual({ run: 'set-answer-reveal', value: false })
  })
  it('other mechanics keep lock-before-audio', () => {
    expect(planHostCommand({ cmd: 'next' }, { ...idle, lockPhase: 'order', audioPending: true })).toEqual({ run: 'start-lock-countdown', phase: 'order' })
  })
  it('the cue and the remote gate follow the same order', () => {
    const s3 = bendle('s3', 2, 2)
    expect(nextPressGate({ slide: s3, nextSlide: null, audioPending: true })).toEqual({ label: 'Play clip', gate: 'audio' })
    expect(nextPressGate({ slide: s3, nextSlide: null, audioPending: false }).gate).toBe('lock')
    expect(nextPressGate({ slide: bendle('s1', 0, 0), nextSlide: s3, audioPending: false }).gate).toBe('advance')
  })
  it('lockRefusal names a broken Bendle; the remote has text for answer-held', () => {
    expect(lockRefusal(bendle('s3', 2, 2, { shinyGroupId: undefined }))).toMatch(/Recreate this Bendle/)
    expect(lockRefusal(bendle('s3', 2, 2))).toBe(null)
    expect(REFUSAL_TEXT['answer-held']).toBeTruthy()
  })
  it('iPad Fix drawer: steps 1-2 have nothing to fix; a locked step 3 can unlock and rescore', () => {
    expect(fixFor(bendle('s1', 0, 0))).toMatchObject({ mechanic: 'bendle', canUnlock: false, unlockRefusal: 'nothing-locked', canRescore: false })
    expect(fixFor(bendle('s3', 2, 2, { bendleLocked: true }))).toMatchObject({ canUnlock: true, canRescore: true })
    expect(fixFor(bendle('s3', 2, 2, { bendleLocked: true, bendleRevealed: true }))).toMatchObject({ canRescore: false, rescoreRefusal: 'already-revealed' })
  })
})
