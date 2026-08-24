import { describe, it, expect } from 'vitest'
import {
  computeNextStep,
  computePrevStep,
  withEntryState,
  bakeTeamPickerParts,
  isAutoRollPart,
  teamPickerCursor,
  cursorAfterStep,
  ownsAutoRoll,
  AUTO_ROLL_OWNERSHIP_MAX_AGE_MS,
} from './slideStepping.js'

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
    expect(dataOf(patch, 'a').walkoutSong.invokedAt).toEqual(expect.any(Number))
    expect(patch.current_slide_index).toBeUndefined()
  })

  // 2026-08-24 (Fable 5 diagnosis): the real-world gap between "invoke press
  // lands" and "song is actually audible" is 2-4s (Supabase write + /display's
  // realtime round-trip + YouTube iframe load/buffer/seek), with nothing on
  // screen showing the first press worked. An impatient retry or a trailing
  // click inside that window used to read as "cut the song short" and
  // advanced almost immediately — Ben: "plays for like a second, then jumps
  // to the next slide." A press this soon after invoking must be absorbed,
  // not treated as a deliberate cut-it-short.
  it('absorbs a second press that lands inside the invoke grace window', async () => {
    const slides = [slide('a', 0, 'pre-show', {
      walkoutSong: { trigger: 'invoke', videoId: 'x', invoked: true, invokedAt: Date.now() },
    }), slide('b', 1)]
    const patch = await computeNextStep({ slides, currentSlideIndex: 0, currentSlideId: 'a' }, noTeams)
    expect(patch).toBe(null)
  })

  it('still lets a press well after the grace window cut the song short', async () => {
    const slides = [slide('a', 0, 'pre-show', {
      walkoutSong: { trigger: 'invoke', videoId: 'x', invoked: true, invokedAt: Date.now() - 10_000 },
    }), slide('b', 1)]
    const patch = await computeNextStep({ slides, currentSlideIndex: 0, currentSlideId: 'a' }, noTeams)
    expect(patch.current_slide_index).toBe(1)
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

// Which of the two live windows (/host and /display, both open all show, only
// one holding OS keyboard focus) owns the auto-roll pacing. Both run the same
// timer; exactly one of them may arm it per transition, or the roll skips a
// team name. See ownsAutoRoll's comment in slideStepping.js.
describe('team-picker auto-roll ownership', () => {
  const parts = n => new Array(n).fill(null)
  const picker = (part, len = 7) => slide('tp', 0, 'team-picker', { parts: parts(len), currentPart: part })
  const at = (slides, id = 'tp') => ({ slides, currentSlideIndex: 0, currentSlideId: id })

  describe('teamPickerCursor', () => {
    it('reads slide id, part and baked length off the live slide', () => {
      expect(teamPickerCursor(at([picker(3)]))).toEqual({ slideId: 'tp', part: 3, partsLen: 7 })
    })

    it('is null before the queued slide is revealed (currentSlideId null)', () => {
      // Go Live leaves currentSlideId null with a stale currentPart possible —
      // arming there would start the whole ceremony with no host press at all.
      expect(teamPickerCursor({ slides: [picker(2)], currentSlideIndex: 0, currentSlideId: null })).toBe(null)
    })

    it('is null on any other slide type', () => {
      expect(teamPickerCursor(at([slide('a', 0, 'question')], 'a'))).toBe(null)
    })

    it('defaults an unbaked/unstarted slide to part 0', () => {
      expect(teamPickerCursor(at([slide('tp', 0, 'team-picker', {})]))).toEqual({ slideId: 'tp', part: 0, partsLen: 0 })
    })
  })

  describe('cursorAfterStep', () => {
    it('describes where a window\'s own press just left the show', async () => {
      const slides = [picker(1)]
      const patch = await computeNextStep(at(slides), noTeams)
      expect(cursorAfterStep(at(slides), patch, 1000)).toEqual({ slideId: 'tp', part: 2, partsLen: 7, at: 1000 })
    })

    it('follows a step that crosses ONTO a team-picker slide', async () => {
      // Landing on Team Intro from the previous slide bakes parts and resets to
      // part 0 — not an auto-roll part, but the cursor must still track it so
      // the next (host-pressed) step is correctly owned.
      const slides = [slide('a', 0), slide('tp', 1, 'team-picker', {})]
      const patch = await computeNextStep({ slides, currentSlideIndex: 0, currentSlideId: 'a' }, async () => 4)
      const c = cursorAfterStep({ slides, currentSlideIndex: 0, currentSlideId: 'a' }, patch, 5)
      expect(c).toEqual({ slideId: 'tp', part: 0, partsLen: 7, at: 5 })
    })

    it('is null when the press stepped off the team-picker entirely', async () => {
      const slides = [picker(6), slide('b', 1)]
      const patch = await computeNextStep(at(slides), noTeams)
      expect(cursorAfterStep(at(slides), patch, 1)).toBe(null)
    })

    it('is null for a no-op press', () => {
      expect(cursorAfterStep(at([picker(1)]), null)).toBe(null)
    })
  })

  describe('ownsAutoRoll', () => {
    const cursor = { slideId: 'tp', part: 2, partsLen: 7 }

    it('arms the window whose own write produced the state it is observing', () => {
      expect(ownsAutoRoll(cursor, { ...cursor, at: 1000 }, 1200)).toBe(true)
    })

    it('stays silent in the window that only WATCHED the change arrive', () => {
      // The whole point: /host press -> /display sees it over realtime with no
      // own-write record. Two armed timers here = a skipped team name.
      expect(ownsAutoRoll(cursor, null, 1200)).toBe(false)
    })

    it('stays silent while its own write is still in flight (cursor behind owned)', () => {
      // setOwnedCursor lands before the realtime echo: owned is already part 2
      // while the observed row still reads part 1. Arming then would advance
      // off a beat that hasn\'t been shown yet.
      expect(ownsAutoRoll({ ...cursor, part: 1 }, { ...cursor, at: 1000 }, 1100)).toBe(false)
    })

    it('stays silent when the observed slide is not the one it wrote', () => {
      expect(ownsAutoRoll(cursor, { ...cursor, slideId: 'other', at: 1000 }, 1100)).toBe(false)
    })

    it('never arms outside the auto-roll range, however clear the ownership', () => {
      const opening = { slideId: 'tp', part: 0, partsLen: 7 }
      const closing = { slideId: 'tp', part: 5, partsLen: 7 }
      const landed  = { slideId: 'tp', part: 6, partsLen: 7 }
      expect(ownsAutoRoll(opening, { ...opening, at: 1000 }, 1100)).toBe(false)
      expect(ownsAutoRoll(closing, { ...closing, at: 1000 }, 1100)).toBe(false)
      expect(ownsAutoRoll(landed,  { ...landed,  at: 1000 }, 1100)).toBe(false)
    })

    it('expires stale ownership so the other window can never re-match it', () => {
      // Guards the one remaining double-arm shape: this window wrote part 2
      // long ago, the OTHER window later navigates back onto part 2 and arms
      // its own timer. Without the age bound both would fire on that beat.
      const owned = { ...cursor, at: 1000 }
      expect(ownsAutoRoll(cursor, owned, 1000 + AUTO_ROLL_OWNERSHIP_MAX_AGE_MS)).toBe(true)
      expect(ownsAutoRoll(cursor, owned, 1001 + AUTO_ROLL_OWNERSHIP_MAX_AGE_MS)).toBe(false)
    })

    it('survives a full roll: each own step re-arms, the last one lands and stops', async () => {
      // The chain the live show actually runs, one window driving: press ->
      // write -> echo -> arm -> write -> echo ... and it must stop ON the
      // closing statement, not blow through it.
      let slides = [picker(0)]
      let owned = null
      const armed = []
      for (let i = 0; i < 8; i++) {
        const patch = await computeNextStep(at(slides), noTeams)
        if (!patch?.slides) break
        owned = cursorAfterStep(at(slides), patch, 1000)
        slides = patch.slides
        armed.push(ownsAutoRoll(teamPickerCursor(at(slides)), owned, 1100))
      }
      // parts 1..4 are the four team names (auto), 5 = closing, 6 = landed;
      // the 7th press is a no-op (nothing after this slide) and breaks out.
      expect(armed).toEqual([true, true, true, true, false, false])
    })
  })
})
