import { describe, it, expect } from 'vitest'
import { computeNextStep, computePrevStep, withEntryState, bakeTeamPickerParts } from './slideStepping.js'

const noTeams = async () => 0
const slide = (id, order, type = 'question', data = {}) => ({ id, order, type, roundId: 'r1', data })
const dataOf = (patch, id) => patch.slides.find(s => s.id === id).data

describe('computeNextStep', () => {
  it('reveals the queued slide without stepping past it on the first advance', async () => {
    const slides = [slide('a', 0), slide('b', 1)]
    const patch = await computeNextStep({ slides, currentSlideIndex: 0, currentSlideId: null }, noTeams)
    expect(patch.current_slide_id).toBe('a')
    expect(patch.current_slide_index).toBeUndefined()
  })

  it('fires invoke-gated walkout audio on that same reveal press', async () => {
    const slides = [slide('a', 0, 'pre-show', { walkoutSong: { trigger: 'invoke', videoId: 'x' } })]
    const patch = await computeNextStep({ slides, currentSlideIndex: 0, currentSlideId: null }, noTeams)
    expect(dataOf(patch, 'a').walkoutSong.invoked).toBe(true)
  })

  it('fires invoke-gated walkout audio in place, without advancing', async () => {
    const slides = [slide('a', 0, 'pre-show', { walkoutSong: { trigger: 'invoke', videoId: 'x' } }), slide('b', 1)]
    const patch = await computeNextStep({ slides, currentSlideIndex: 0, currentSlideId: 'a' }, noTeams)
    expect(dataOf(patch, 'a').walkoutSong.invoked).toBe(true)
    expect(patch.current_slide_index).toBeUndefined()
    // second press advances normally
    const next = await computeNextStep({ slides: patch.slides, currentSlideIndex: 0, currentSlideId: 'a' }, noTeams)
    expect(next.current_slide_index).toBe(1)
  })

  it('reveals a shiny intro before its content, then steps its parts', async () => {
    const slides = [slide('a', 0, 'question', { isShiny: true, parts: [null, null, null] }), slide('b', 1)]
    const reveal = await computeNextStep({ slides, currentSlideIndex: 0, currentSlideId: 'a' }, noTeams)
    expect(dataOf(reveal, 'a').introDone).toBe(true)
    expect(reveal.current_slide_index).toBeUndefined()

    const p1 = await computeNextStep({ slides: reveal.slides, currentSlideIndex: 0, currentSlideId: 'a' }, noTeams)
    expect(dataOf(p1, 'a').currentPart).toBe(1)
    const p2 = await computeNextStep({ slides: p1.slides, currentSlideIndex: 0, currentSlideId: 'a' }, noTeams)
    expect(dataOf(p2, 'a').currentPart).toBe(2)
    // last part reached — now it actually advances
    const adv = await computeNextStep({ slides: p2.slides, currentSlideIndex: 0, currentSlideId: 'a' }, noTeams)
    expect(adv.current_slide_index).toBe(1)
  })

  it('bakes team-picker parts from the live team count on entry', async () => {
    const slides = [slide('a', 0), slide('b', 1, 'team-picker', {})]
    const patch = await computeNextStep({ slides, currentSlideIndex: 0, currentSlideId: 'a' }, async () => 4)
    expect(dataOf(patch, 'b').parts).toHaveLength(7) // intro + 4 teams + outro + landed
  })

  it('returns null at the end of the show', async () => {
    const slides = [slide('a', 0)]
    expect(await computeNextStep({ slides, currentSlideIndex: 0, currentSlideId: 'a' }, noTeams)).toBe(null)
  })
})

describe('computePrevStep', () => {
  it('steps parts backward before un-revealing the intro', async () => {
    const slides = [slide('a', 0, 'question', { isShiny: true, introDone: true, currentPart: 2, parts: [null, null, null] })]
    const back = await computePrevStep({ slides, currentSlideIndex: 0 }, noTeams)
    expect(dataOf(back, 'a').currentPart).toBe(1)
  })

  it('does not regress introDone on a locked wager slide', async () => {
    const slides = [slide('a', 0), slide('b', 1, 'question', { isShiny: true, introDone: true, wagerTiersLocked: true })]
    const back = await computePrevStep({ slides, currentSlideIndex: 1 }, noTeams)
    expect(back.current_slide_index).toBe(0)
    expect(dataOf(back, 'b').introDone).toBe(true)
  })

  it('lands on the previous slide’s last revealed state', async () => {
    const slides = [
      slide('a', 0, 'question', { isShiny: true, parts: [null, null, null] }),
      slide('b', 1),
    ]
    const back = await computePrevStep({ slides, currentSlideIndex: 1 }, noTeams)
    expect(back.current_slide_index).toBe(0)
    expect(dataOf(back, 'a').introDone).toBe(true)
    expect(dataOf(back, 'a').currentPart).toBe(2)
  })

  it('returns null at the start of the show', async () => {
    const slides = [slide('a', 0)]
    expect(await computePrevStep({ slides, currentSlideIndex: 0 }, noTeams)).toBe(null)
  })
})

describe('withEntryState', () => {
  it('re-arms invoke-gated audio on a fresh entry', () => {
    const s = slide('a', 0, 'pre-show', { walkoutSong: { trigger: 'invoke', videoId: 'x', invoked: true } })
    const out = withEntryState([s], s, { currentPart: 0, introDone: false })
    expect(out[0].data.walkoutSong.invoked).toBe(false)
  })

  it('clears a stale outroShown even when introDone is already false', () => {
    const s = slide('a', 0, 'question', { isShiny: true, introDone: false, outroShown: true })
    const out = withEntryState([s], s, { currentPart: 0, introDone: false })
    expect(out[0].data.outroShown).toBe(false)
  })
})

describe('bakeTeamPickerParts', () => {
  it('bakes only once — an existing parts array is left alone', async () => {
    const s = slide('a', 0, 'team-picker', { parts: [null, null] })
    expect(await bakeTeamPickerParts([s], s, async () => 9)).toEqual([s])
  })
})
