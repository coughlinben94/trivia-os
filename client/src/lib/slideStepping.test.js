import { describe, it, expect } from 'vitest'
import { computeNextStep, computePrevStep, withEntryState, bakeTeamPickerParts, isAutoRollPart } from './slideStepping.js'

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
  // 2026-08-24: this used to skip re-baking whenever data.parts already
  // existed, on the theory that only an in-progress reveal could have put it
  // there. All 5 real call sites fire only at slide-entry, never mid-reveal,
  // so that theory was wrong — it just left a stale team count frozen from
  // whenever the slide was first ever entered (confirmed live: a rehearsal
  // with 1 team registered froze the roster at 1 team even after 20 more
  // teams joined for the real show). Every entry must re-bake fresh.
  it('re-bakes from the live count even when a parts array already exists', async () => {
    const s = slide('a', 0, 'team-picker', { parts: [null, null] })
    const out = await bakeTeamPickerParts([s], s, async () => 9)
    expect(out[0].data.parts).toHaveLength(9 + 3)
  })

  it('leaves non-team-picker slides untouched', async () => {
    const s = slide('a', 0, 'question', {})
    expect(await bakeTeamPickerParts([s], s, async () => 9)).toEqual([s])
  })
})

// The Team Intro auto-roll's index law (LiveMode.jsx schedules the timer off
// this). Off-by-one here is invisible in code review and only shows up in
// front of a live room as a skipped team, a skipped closing statement, or a
// roll that never starts — so it gets its own asserts.
describe('isAutoRollPart', () => {
  // 4 teams -> bakeTeamPickerParts length 7: [intro, t1, t2, t3, t4, outro, landed]
  const LEN = 4 + 3

  it('never fires on the opening text — that press is the host\'s roll trigger', () => {
    expect(isAutoRollPart(LEN, 0)).toBe(false)
  })

  it('fires on every team name, first through last', () => {
    expect([1, 2, 3, 4].map(p => isAutoRollPart(LEN, p))).toEqual([true, true, true, true])
  })

  it('stops on the closing statement and the landed reveal', () => {
    expect(isAutoRollPart(LEN, LEN - 2)).toBe(false) // outro
    expect(isAutoRollPart(LEN, LEN - 1)).toBe(false) // landed
  })

  it('rolls the last team name so the roll lands ON the closing statement', () => {
    // The final auto-fire must come from the last team (LEN-3), moving to the
    // outro — otherwise the roll stalls one name short and Ben has to press.
    expect(isAutoRollPart(LEN, LEN - 3)).toBe(true)
  })

  it('never fires for a zero-team roster (baked length 3) or an unbaked slide', () => {
    expect([0, 1, 2].map(p => isAutoRollPart(3, p))).toEqual([false, false, false])
    expect(isAutoRollPart(0, 0)).toBe(false)
  })

  it('scales to any roster size without hardcoded indices', () => {
    const big = 21 + 3
    expect(isAutoRollPart(big, 21)).toBe(true)   // last team
    expect(isAutoRollPart(big, 22)).toBe(false)  // outro
  })
})
