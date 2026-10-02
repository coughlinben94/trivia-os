import { describe, it, expect } from 'vitest'
import { resolveSlideClip } from './slideClip.js'
import { audioPlayPending } from './audioPending.js'

const q = (data, id = 'q1') => ({ id, type: 'question', data })
const ytSlot = (over = {}) => ({ type: 'youtube', videoId: 'vid1', start: 10, end: 40, volume: 80, ...over })

describe('resolveSlideClip: what clip does this slide have', () => {
  it('returns null for non-questions and for slides with no audio', () => {
    expect(resolveSlideClip(null)).toBeNull()
    expect(resolveSlideClip({ id: 't', type: 'title', data: {} })).toBeNull()
    expect(resolveSlideClip(q({ text: 'no audio' }))).toBeNull()
    expect(resolveSlideClip(q({ mediaUrl: '/pic.png', mediaType: 'image/png' }))).toBeNull()
  })

  it('plain question with an uploaded clip: file clip, gain from audioGainDb, click by default', () => {
    expect(resolveSlideClip(q({ mediaUrl: '/a.mp3', mediaType: 'audio/mpeg', audioGainDb: 6 }))).toEqual({
      clip: { kind: 'file', url: '/a.mp3', gainDb: 6, part: 0 },
      trigger: 'click',
    })
  })

  it('an odd audioTrigger value (not exactly "advance") waits for the click, like the TV does', () => {
    for (const v of ['', 'auto', 'ADVANCE', null]) {
      expect(resolveSlideClip(q({ mediaUrl: '/a.mp3', mediaType: 'audio/mpeg', audioTrigger: v })).trigger).toBe('click')
    }
  })

  it('plain question with audioTrigger advance: trigger advance', () => {
    expect(resolveSlideClip(q({ mediaUrl: '/a.mp3', mediaType: 'audio/mpeg', audioTrigger: 'advance' })).trigger).toBe('advance')
  })

  it('plain question with a YouTube clip: youtube clip with start/end/volume', () => {
    expect(resolveSlideClip(q({ mediaSlots: [ytSlot()] }))).toEqual({
      clip: { kind: 'youtube', videoId: 'vid1', start: 10, end: 40, volume: 80, part: 0 },
      trigger: 'click',
    })
  })

  it('YouTube defaults: start 0, end null, volume 100', () => {
    const r = resolveSlideClip(q({ mediaSlots: [{ type: 'youtube', videoId: 'v' }] }))
    expect(r.clip).toEqual({ kind: 'youtube', videoId: 'v', start: 0, end: null, volume: 100, part: 0 })
  })

  it('shiny audio question is always click-triggered (the Next press)', () => {
    const r = resolveSlideClip(q({ isShiny: true, shinyType: 'audio', mediaSlots: [ytSlot()], audioTrigger: 'advance' }))
    expect(r.trigger).toBe('click')
  })

  it('shiny non-audio formats have no clip', () => {
    expect(resolveSlideClip(q({ isShiny: true, shinyInputSchema: { type: 'list' } }))).toBeNull()
    expect(resolveSlideClip(q({ isShiny: true, shinyType: 'visual', mediaSlots: [{ type: 'image/png', url: '/x.png' }] }))).toBeNull()
  })

  it('a shiny that is NOT an audio shiny never has a clip, even with an audio file attached', () => {
    // only audio shinies are started by the Next press; a list/visual shiny with a stray mp3 stays silent
    expect(resolveSlideClip(q({ isShiny: true, shinyInputSchema: { type: 'list' }, mediaUrl: '/stray.mp3', mediaType: 'audio/mpeg' }))).toBeNull()
    expect(resolveSlideClip(q({ isShiny: true, shinyType: 'visual', mediaSlots: [ytSlot()] }))).toBeNull()
  })

  it('multi-part series: the clip is the CURRENT part, and part is its index', () => {
    const part = n => ({ text: `p${n}`, mediaSlots: [{ type: 'audio/mpeg', url: `/p${n}.mp3` }] })
    const slide = q({ isShiny: true, shinyType: 'audio', parts: [part(0), part(1), part(2)], currentPart: 1 })
    expect(resolveSlideClip(slide)).toEqual({ clip: { kind: 'file', url: '/p1.mp3', gainDb: 0, part: 1 }, trigger: 'click' })
  })

  it('a series part with no clip of its own resolves to null', () => {
    const slide = q({ isShiny: true, shinyType: 'audio', parts: [{ mediaSlots: [{ type: 'audio/mpeg', url: '/p0.mp3' }] }, { text: 'silent' }], currentPart: 1 })
    expect(resolveSlideClip(slide)).toBeNull()
  })

  it('Bendle: described as a bendle clip keyed by song id, click-triggered', () => {
    expect(resolveSlideClip(q({ isShiny: true, shinyInputSchema: { type: 'bendle' }, bendleSongId: 'song9' }))).toEqual({
      clip: { kind: 'bendle', songId: 'song9' },
      trigger: 'click',
    })
  })
})

// The director's future gate and today's audioPlayPending must never disagree about
// whether a slide has sound. Until Plan 2 swaps one for the other, this agreement
// test is the guard: "pending with no mark" === "has a clip whose trigger is click".
describe('agreement with audioPlayPending', () => {
  const part = n => ({ mediaSlots: [{ type: 'audio/mpeg', url: `/p${n}.mp3` }] })
  const matrix = {
    'plain mp3, click': q({ mediaUrl: '/a.mp3', mediaType: 'audio/mpeg' }),
    'plain mp3, advance': q({ mediaUrl: '/a.mp3', mediaType: 'audio/mpeg', audioTrigger: 'advance' }),
    'plain youtube': q({ mediaSlots: [ytSlot()] }),
    'plain, no audio': q({ text: 'x' }),
    'plain image': q({ mediaUrl: '/p.png', mediaType: 'image/png' }),
    'shiny audio youtube': q({ isShiny: true, shinyType: 'audio', mediaSlots: [ytSlot()] }),
    'shiny audio upload': q({ isShiny: true, shinyType: 'audio', mediaUrl: '/a.mp3', mediaType: 'audio/mpeg' }),
    'shiny list': q({ isShiny: true, shinyInputSchema: { type: 'list' } }),
    'shiny visual': q({ isShiny: true, shinyType: 'visual', mediaSlots: [{ type: 'image/png', url: '/x.png' }] }),
    'shiny list with a stray mp3': q({ isShiny: true, shinyInputSchema: { type: 'list' }, mediaUrl: '/stray.mp3', mediaType: 'audio/mpeg' }),
    'series part 0': q({ isShiny: true, shinyType: 'audio', parts: [part(0), part(1)], currentPart: 0 }),
    'series silent part': q({ isShiny: true, shinyType: 'audio', parts: [part(0), { text: 's' }], currentPart: 1 }),
    bendle: q({ isShiny: true, shinyInputSchema: { type: 'bendle' }, bendleSongId: 's' }),
    'title slide': { id: 't', type: 'title', data: {} },
  }

  for (const [name, slide] of Object.entries(matrix)) {
    it(`${name}: pending-with-no-mark matches "has a click clip"`, () => {
      const r = resolveSlideClip(slide)
      expect(audioPlayPending(slide, null)).toBe(!!r && r.trigger === 'click')
    })
    it(`${name}: a mark naming this slide is never pending`, () => {
      expect(audioPlayPending(slide, { slideId: slide.id, playing: true })).toBe(false)
    })
  }
})
