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
  pendingLockPhase,
  pendingReveal,
  REVEAL_FIELD,
  nextSlideAfter,
} from './slideStepping.js'

const noTeams = async () => 0
const slide = (id, order, type = 'question', data = {}) => ({ id, order, type, roundId: 'r1', data })
const dataOf = (patch, id) => patch.slides.find(s => s.id === id).data

// 2026-08-25: team-picker's own "Round 1" teaser used to fire unconditionally
// on landing, assuming it always precedes round-intro directly. A real show's
// default opening (team-picker -> team-preview -> round-intro) violates that,
// producing a "Round 1 / Team List / Round 1" flicker that read as a nav bug.
// nextSlideAfter is the fix's load-bearing lookup — TeamPickerSlide gates its
// teaser on this returning a round-intro slide.
describe('nextSlideAfter', () => {
  it('returns the slide immediately after, in authored order', () => {
    const slides = [slide('a', 0), slide('b', 1), slide('c', 2)]
    expect(nextSlideAfter(slides, 'a').id).toBe('b')
  })
  it('returns null for the last slide', () => {
    const slides = [slide('a', 0), slide('b', 1)]
    expect(nextSlideAfter(slides, 'b')).toBe(null)
  })
  it('returns null when the slide id is not found', () => {
    const slides = [slide('a', 0)]
    expect(nextSlideAfter(slides, 'missing')).toBe(null)
  })
  it('respects order, not array position', () => {
    const slides = [slide('b', 1), slide('a', 0)]
    expect(nextSlideAfter(slides, 'a').id).toBe('b')
  })
})

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

  // 2026-09-01 (SPEC.md "Standalone Shiny Title Slide"): the announce card is
  // a real `shiny-title` slide now, so a shiny content slide has NO intro
  // beat to dismiss and NO closing beat to pan down to — the first Next on it
  // steps its first part, and the Next after its last part advances.
  it('steps a shiny series through its parts, then advances straight to the next slide', async () => {
    const slides = [slide('a', 0, 'question', { isShiny: true, parts: [null, null, null] }), slide('b', 1)]
    const p1 = await computeNextStep({ slides, currentSlideIndex: 0, currentSlideId: 'a' }, noTeams)
    expect(dataOf(p1, 'a').currentPart).toBe(1)
    expect(dataOf(p1, 'a')).not.toHaveProperty('introDone')
    const p2 = await computeNextStep({ slides: p1.slides, currentSlideIndex: 0, currentSlideId: 'a' }, noTeams)
    expect(dataOf(p2, 'a').currentPart).toBe(2)

    const adv = await computeNextStep({ slides: p2.slides, currentSlideIndex: 0, currentSlideId: 'a' }, noTeams)
    expect(adv.current_slide_index).toBe(1)
    expect(dataOf(adv, 'a')).not.toHaveProperty('outroShown')
  })

  it('a shiny-title slide is a plain slide — Next on it advances to the first content slide', async () => {
    const grp = { isShiny: true, shinyGroupId: 'g1' }
    const slides = [slide('t', 0, 'shiny-title', grp), slide('a', 1, 'question', { ...grp, parts: [null, null] })]
    const adv = await computeNextStep({ slides, currentSlideIndex: 0, currentSlideId: 't' }, noTeams)
    expect(adv.current_slide_index).toBe(1)
    expect(dataOf(adv, 'a').currentPart ?? 0).toBe(0)
  })

  // 2026-08-25, found live the same night this format shipped: Ben clicked
  // into a PYL "Song Lyrics" (ShinyConcurrentQuestion) slide and the first
  // row's answer was already showing before any Next press. Root cause was
  // an off-by-one in the OLD revealedGroups formula (currentPart + 1), which
  // meant currentPart's fresh-entry value of 0 already counted as "one
  // revealed" instead of "nothing revealed" — and symmetrically made the
  // LAST group unreachable by any number of Next presses. revealStepCount()
  // gives this format (data.shinyInputSchema.type/concurrent) one extra
  // Next-reachable state so currentPart can mean "count of groups revealed,"
  // 0 included.
  it('reveals a concurrent text series cumulatively, starting with nothing revealed', async () => {
    const concurrent = { isShiny: true, shinyInputSchema: { type: 'text', concurrent: true }, parts: [null, null, null] }
    const slides = [slide('a', 0, 'question', concurrent), slide('b', 1)]
    const p1 = await computeNextStep({ slides, currentSlideIndex: 0, currentSlideId: 'a' }, noTeams)
    expect(dataOf(p1, 'a').currentPart).toBe(1) // group 0 revealed
    const p2 = await computeNextStep({ slides: p1.slides, currentSlideIndex: 0, currentSlideId: 'a' }, noTeams)
    expect(dataOf(p2, 'a').currentPart).toBe(2) // group 1 revealed
    const p3 = await computeNextStep({ slides: p2.slides, currentSlideIndex: 0, currentSlideId: 'a' }, noTeams)
    expect(dataOf(p3, 'a').currentPart).toBe(3) // group 2 (the last one) revealed — unreachable before this fix

    // fully revealed — the next press advances, same as any other shiny
    const adv = await computeNextStep({ slides: p3.slides, currentSlideIndex: 0, currentSlideId: 'a' }, noTeams)
    expect(adv.current_slide_index).toBe(1)
  })

  // The closing beat (2026-08-17 → 2026-09-01, CLOSING_BEAT_ENABLED /
  // data.outroShown) is gone with the intro swap it mirrored. Every shiny
  // content slide now leaves on a plain advance, whatever its lock state —
  // these pin that down so the dead-press regression the closing beat had
  // become (Next flipping flags nothing rendered) can't come back.
  describe('shiny content slides advance like any other slide', () => {
    const shiny = (id, order, extra = {}) =>
      slide(id, order, 'question', { isShiny: true, ...extra })

    it('a single-shot shiny question advances on its first Next, no flags written', async () => {
      const slides = [shiny('a', 0), slide('b', 1)]
      const adv = await computeNextStep({ slides, currentSlideIndex: 0, currentSlideId: 'a' }, noTeams)
      expect(adv.current_slide_index).toBe(1)
      expect(dataOf(adv, 'a')).not.toHaveProperty('introDone')
      expect(dataOf(adv, 'a')).not.toHaveProperty('outroShown')
    })

    it('advances between two slides of the same shiny series without touching either', async () => {
      const series = { isSeries: true, shinyGroupId: 'g1', shinyFormatId: 'f1', seriesTheme: 'Not So Different' }
      const slides = [shiny('a', 0, series), shiny('b', 1, series)]
      const patch = await computeNextStep({ slides, currentSlideIndex: 0, currentSlideId: 'a' }, noTeams)
      expect(patch.current_slide_index).toBe(1)
      expect(dataOf(patch, 'b')).not.toHaveProperty('introDone')
    })

    it('advances for a matching slide whether locked, scored, or neither', async () => {
      // Ben shipped a hard block here 2026-08-25 (Next did nothing until A
      // was pressed), then reverted it live the same night — the TV gave no
      // hint why Next looked broken, and it stranded a real show mid-round.
      const locked = { shinyInputSchema: { type: 'matching' }, matchingLocked: true }
      const mid = await computeNextStep({ slides: [shiny('a', 0, locked), slide('b', 1)], currentSlideIndex: 0, currentSlideId: 'a' }, noTeams)
      expect(mid.current_slide_index).toBe(1)
      const scored = await computeNextStep({ slides: [shiny('a', 0, { ...locked, matchingRevealed: true }), slide('b', 1)], currentSlideIndex: 0, currentSlideId: 'a' }, noTeams)
      expect(scored.current_slide_index).toBe(1)
    })

    it('advances for an order slide whether locked, revealed, or neither', async () => {
      const locked = { shinyInputSchema: { type: 'order' }, orderLocked: true }
      const mid = await computeNextStep({ slides: [shiny('a', 0, locked), slide('b', 1)], currentSlideIndex: 0, currentSlideId: 'a' }, noTeams)
      expect(mid.current_slide_index).toBe(1)
      const revealed = await computeNextStep({ slides: [shiny('a', 0, { ...locked, orderRevealed: true }), slide('b', 1)], currentSlideIndex: 0, currentSlideId: 'a' }, noTeams)
      expect(revealed.current_slide_index).toBe(1)
    })

    it('advances through every wager lock stage, tiers-only, guesses-locked and revealed alike', async () => {
      const tiersOnly = { shinyInputSchema: { type: 'wager' }, wagerTiersLocked: true }
      for (const extra of [tiersOnly, { ...tiersOnly, wagerGuessesLocked: true }, { ...tiersOnly, wagerGuessesLocked: true, wagerRevealed: true }]) {
        const patch = await computeNextStep({ slides: [shiny('a', 0, extra), slide('b', 1)], currentSlideIndex: 0, currentSlideId: 'a' }, noTeams)
        expect(patch.current_slide_index).toBe(1)
      }
    })

    it('Prev on the first part of a shiny slide goes to the previous slide, not to an intro beat', async () => {
      const grp = { isShiny: true, shinyGroupId: 'g1' }
      const slides = [slide('t', 0, 'shiny-title', grp), slide('a', 1, 'question', { ...grp, currentPart: 0, parts: [null, null, null] })]
      const back = await computePrevStep({ slides, currentSlideIndex: 1 }, noTeams)
      expect(back.current_slide_index).toBe(0)
      expect(back.current_slide_id).toBe('t')
      expect(dataOf(back, 'a')).not.toHaveProperty('introDone')
    })
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
  it('steps parts backward before leaving the slide', async () => {
    const slides = [slide('a', 0, 'question', { isShiny: true, currentPart: 2, parts: [null, null, null] })]
    const back = await computePrevStep({ slides, currentSlideIndex: 0 }, noTeams)
    expect(dataOf(back, 'a').currentPart).toBe(1)
  })

  it('leaves a locked wager slide backwards in one press, flags intact', async () => {
    const slides = [slide('a', 0), slide('b', 1, 'question', { isShiny: true, wagerTiersLocked: true })]
    const back = await computePrevStep({ slides, currentSlideIndex: 1 }, noTeams)
    expect(back.current_slide_index).toBe(0)
    expect(dataOf(back, 'b').wagerTiersLocked).toBe(true)
  })

  it('lands on the previous slide’s last revealed state', async () => {
    const slides = [
      slide('a', 0, 'question', { isShiny: true, parts: [null, null, null] }),
      slide('b', 1),
    ]
    const back = await computePrevStep({ slides, currentSlideIndex: 1 }, noTeams)
    expect(back.current_slide_index).toBe(0)
    expect(dataOf(back, 'a').currentPart).toBe(2)
  })

  // Same off-by-one as the computeNextStep test above, seen from the other
  // direction: the OLD lastPartIdx formula (groups - 1) landed a concurrent
  // series backed-into from the next slide with its LAST group still
  // unrevealed, contradicting "last revealed state" for every other format.
  it('lands a concurrent text series fully revealed, not one group short', async () => {
    const concurrent = { isShiny: true, shinyInputSchema: { type: 'text', concurrent: true }, parts: [null, null, null] }
    const slides = [slide('a', 0, 'question', concurrent), slide('b', 1)]
    const back = await computePrevStep({ slides, currentSlideIndex: 1 }, noTeams)
    expect(back.current_slide_index).toBe(0)
    expect(dataOf(back, 'a').currentPart).toBe(3) // all 3 groups, not 2
  })

  // 2026-09-01: Prev's cross-slide entry used to reach withEntryState without
  // protectInProgress, so backing into a fully graded matching/wager/order
  // slide wiped its lock/reveal flags — reopening phone submissions and
  // hiding the already-revealed answer on /display.
  it('preserves lock/reveal flags when backing into a graded question', async () => {
    const graded = { isShiny: true, shinyInputSchema: { type: 'matching' }, matchingLocked: true, matchingRevealed: true }
    const slides = [slide('a', 0, 'question', graded), slide('b', 1)]
    const back = await computePrevStep({ slides, currentSlideIndex: 1 }, noTeams)
    expect(back.current_slide_index).toBe(0)
    expect(dataOf(back, 'a').matchingLocked).toBe(true)
    expect(dataOf(back, 'a').matchingRevealed).toBe(true)
  })

  it('returns null at the start of the show', async () => {
    const slides = [slide('a', 0)]
    expect(await computePrevStep({ slides, currentSlideIndex: 0 }, noTeams)).toBe(null)
  })
})

describe('withEntryState', () => {
  it('re-arms invoke-gated audio on a fresh entry', () => {
    const s = slide('a', 0, 'pre-show', { walkoutSong: { trigger: 'invoke', videoId: 'x', invoked: true } })
    const out = withEntryState([s], s, { currentPart: 0 })
    expect(out[0].data.walkoutSong.invoked).toBe(false)
  })

  // 2026-08-31: stale lock/reveal flags from a rehearsal must not survive a
  // fresh entry (phones would never unlock) — unless this is a re-entry into
  // a question actually in progress (protectInProgress), where clearing them
  // would reopen submission on a question the room already answered.
  it('clears stale lock/reveal flags on a fresh entry, but keeps them on a protected re-entry', () => {
    const s = slide('a', 0, 'question', { isShiny: true, shinyInputSchema: { type: 'matching' }, matchingLocked: true, matchingRevealed: true })
    const fresh = withEntryState([s], s, { currentPart: 0 })
    expect(fresh[0].data.matchingLocked).toBe(false)
    expect(fresh[0].data.matchingRevealed).toBe(false)
    const reentry = withEntryState([s], s, { currentPart: 0, protectInProgress: true })
    expect(reentry[0].data.matchingLocked).toBe(true)
    expect(reentry[0].data.matchingRevealed).toBe(true)
  })

  // 2026-08-25 review: a countdown interrupted before completing (Live Mode
  // exited mid-countdown, a reload) used to leave lockCountdownPhase/
  // StartedAt sitting on the slide. Landing back on it later, the
  // completion effect computed remaining off the stale startedAt, got 0,
  // and fired the real lock+score immediately — before any team had
  // answered, with no countdown shown to explain why.
  it('clears a stale lock countdown on a fresh entry', () => {
    const s = slide('a', 0, 'question', {
      isShiny: true, matchingLocked: false,
      lockCountdownPhase: 'matching', lockCountdownStartedAt: Date.now() - 60_000,
    })
    const out = withEntryState([s], s, { currentPart: 0 })
    expect(out[0].data.lockCountdownPhase).toBe(null)
    expect(out[0].data.lockCountdownStartedAt).toBe(null)
  })

  // For every other multi-part format, currentPart:0 means "part 0 is
  // showing" — correct on fresh entry, nothing to reset. ShinyConcurrentQuestion
  // is the one format where currentPart COUNTS groups revealed, so a stale
  // nonzero value left over from a previous visit (or a rehearsal) must not
  // survive re-entry, or the room sees answers from a prior pass before any
  // Next press this time.
  it('clears a stale currentPart on a fresh entry into a concurrent-reveal slide, so no group starts pre-revealed', () => {
    const s = slide('a', 0, 'question', {
      isShiny: true, shinyInputSchema: { type: 'text', concurrent: true }, parts: [null, null, null], currentPart: 2,
    })
    const out = withEntryState([s], s, { currentPart: 0 })
    expect(out[0].data.currentPart).toBe(0)
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

// The "Next locks answers" phase law. Both /host (which starts the countdown
// AND performs the lock at zero) and /display (which starts it and draws it)
// branch off this one function, so a wrong answer here either strands a
// question's answers open forever or eats a Next press on a question that had
// nothing left to lock — both of them in front of a live room.
describe('pendingLockPhase', () => {
  const shiny = (type, data = {}) => slide('q', 0, 'question', { isShiny: true, shinyInputSchema: { type }, ...data })

  it('returns matching while a matching question is still taking answers', () => {
    expect(pendingLockPhase(shiny('matching'))).toBe('matching')
  })

  it('returns null once matching is locked', () => {
    expect(pendingLockPhase(shiny('matching', { matchingLocked: true }))).toBe(null)
  })

  it('returns order while an Order Up question is still taking answers', () => {
    expect(pendingLockPhase(shiny('order'))).toBe('order')
  })

  it('returns null once Order Up is locked', () => {
    expect(pendingLockPhase(shiny('order', { orderLocked: true }))).toBe(null)
  })

  it('returns "bendle" for an unlocked bendle slide', () => {
    expect(pendingLockPhase(shiny('bendle'))).toBe('bendle')
  })

  it('returns null for a locked bendle slide', () => {
    expect(pendingLockPhase(shiny('bendle', { bendleGuessesLocked: true }))).toBe(null)
  })

  // Wager is the only mechanic with two lock phases on ONE slide: the blind
  // tier lock, then the numeric-guess lock after the question reveals. They
  // must come back in that order from three consecutive Next presses.
  it('walks wager through tiers, then guesses, then null', () => {
    expect(pendingLockPhase(shiny('wager'))).toBe('wager-tiers')
    expect(pendingLockPhase(shiny('wager', { wagerTiersLocked: true }))).toBe('wager-guesses')
    expect(pendingLockPhase(shiny('wager', { wagerTiersLocked: true, wagerGuessesLocked: true }))).toBe(null)
  })

  it('never skips the tier lock just because guesses are somehow already flagged', () => {
    // Out-of-order flags shouldn't let a press jump straight to scoring a
    // wager whose tiers were never locked.
    expect(pendingLockPhase(shiny('wager', { wagerGuessesLocked: true }))).toBe('wager-tiers')
  })

  it('ignores a stale introDone flag left on a legacy slide — content shows from frame one, so the first Next may lock', () => {
    // Pre-2026-09-01 shows still carry introDone on their content slides
    // until the migration script strips it. It must not gate anything.
    expect(pendingLockPhase(shiny('matching', { introDone: false }))).toBe('matching')
    expect(pendingLockPhase(shiny('order', { introDone: false }))).toBe('order')
    expect(pendingLockPhase(shiny('wager', { introDone: false }))).toBe('wager-tiers')
  })

  it('returns null for a question that is not phone-scored at all', () => {
    expect(pendingLockPhase(shiny('list'))).toBe(null)
    expect(pendingLockPhase(shiny('image'))).toBe(null)
    expect(pendingLockPhase(slide('q', 0))).toBe(null)
    expect(pendingLockPhase(slide('tp', 0, 'team-picker', { parts: [null, null] }))).toBe(null)
  })

  it('returns null for no slide / no data rather than throwing mid-press', () => {
    expect(pendingLockPhase(null)).toBe(null)
    expect(pendingLockPhase(undefined)).toBe(null)
    expect(pendingLockPhase({ id: 'q' })).toBe(null)
  })
})

// The other half of the same law: what the host's A press does. A wrong
// answer here either swallows A on a plain question (no answer overlay for
// the room) or fires a phone-scored reveal on a question that hasn't been
// locked or scored yet.
describe('pendingReveal', () => {
  const shiny = (type, data = {}) => slide('q', 0, 'question', { isShiny: true, shinyInputSchema: { type }, ...data })

  it('returns null while a mechanic is still taking answers', () => {
    expect(pendingReveal(shiny('matching'))).toBe(null)
    expect(pendingReveal(shiny('order'))).toBe(null)
    expect(pendingReveal(shiny('wager'))).toBe(null)
  })

  it('names the mechanic once it is locked but not yet revealed', () => {
    expect(pendingReveal(shiny('matching', { matchingLocked: true }))).toBe('matching')
    expect(pendingReveal(shiny('order', { orderLocked: true }))).toBe('order')
    expect(pendingReveal(shiny('wager', { wagerTiersLocked: true, wagerGuessesLocked: true }))).toBe('wager')
  })

  // Locking a wager's TIERS only puts the question on screen — there is no
  // answer to reveal until the guesses are in and scored. A here must still
  // fall through to the ordinary answer_reveal toggle.
  it('does not offer a wager reveal on the tier lock alone', () => {
    expect(pendingReveal(shiny('wager', { wagerTiersLocked: true }))).toBe(null)
  })

  it('returns null once revealed, so A cannot un-reveal a scored result', () => {
    expect(pendingReveal(shiny('matching', { matchingLocked: true, matchingRevealed: true }))).toBe(null)
    expect(pendingReveal(shiny('order', { orderLocked: true, orderRevealed: true }))).toBe(null)
    expect(pendingReveal(shiny('wager', { wagerTiersLocked: true, wagerGuessesLocked: true, wagerRevealed: true }))).toBe(null)
  })

  it('returns null for plain questions and non-questions, leaving A untouched', () => {
    expect(pendingReveal(shiny('list'))).toBe(null)
    expect(pendingReveal(slide('q', 0))).toBe(null)
    expect(pendingReveal(slide('tp', 0, 'team-picker', { parts: [null, null] }))).toBe(null)
    expect(pendingReveal(null)).toBe(null)
    expect(pendingReveal(undefined)).toBe(null)
    expect(pendingReveal({ id: 'q' })).toBe(null)
  })

  it('returns "bendle" for a locked-but-not-revealed bendle slide', () => {
    expect(pendingReveal(shiny('bendle', { bendleGuessesLocked: true }))).toBe('bendle')
  })

  it('returns null for a bendle slide not yet locked', () => {
    expect(pendingReveal(shiny('bendle'))).toBe(null)
  })

  it('returns null for an already-revealed bendle slide', () => {
    expect(pendingReveal(shiny('bendle', { bendleGuessesLocked: true, bendleRevealed: true }))).toBe(null)
  })

  it('maps every mechanic it can return to a real slide.data flag', () => {
    // REVEAL_FIELD is what LiveMode.jsx writes off this return value — a
    // mechanic missing from it would silently write `undefined: true`.
    for (const mechanic of ['matching', 'wager', 'order', 'bendle']) {
      expect(REVEAL_FIELD[mechanic]).toBeTruthy()
    }
  })
})

// ── Shiny suite rebuild (2026-08-26) ────────────────────────────────────────
// Stepping now reads data.shinyDisplay instead of inferring the display mode
// from the format's schema flags. Three step-count laws:
//   sequential      -> N states (one part on screen per press)
//   concurrent text -> N + 1 states (currentPart counts groups REVEALED)
//   concurrent media-> 1 state (every tile on screen at once, one answer)
describe('shinyDisplay stepping', () => {
  const shinyParts = (extra) => ({
    isShiny: true, currentPart: 0,
    parts: [null, null, null], ...extra,
  })

  it('steps a sequential multi-asset slide one asset per press', async () => {
    const data = shinyParts({ shinyDisplay: 'sequential', shinyInputSchema: { type: 'image' } })
    const slides = [slide('a', 0, 'question', data), slide('b', 1)]
    const p1 = await computeNextStep({ slides, currentSlideIndex: 0, currentSlideId: 'a' }, noTeams)
    expect(dataOf(p1, 'a').currentPart).toBe(1)
    const p2 = await computeNextStep({ slides: p1.slides, currentSlideIndex: 0, currentSlideId: 'a' }, noTeams)
    expect(dataOf(p2, 'a').currentPart).toBe(2)
    // 3 assets = 3 states — the next press advances, not a 4th asset.
    const adv = await computeNextStep({ slides: p2.slides, currentSlideIndex: 0, currentSlideId: 'a' }, noTeams)
    expect(adv.current_slide_index).toBe(1)
  })

  it('gives a concurrent TEXT slide the extra nothing-revealed-yet state', async () => {
    const data = shinyParts({ shinyDisplay: 'concurrent', shinyInputSchema: { type: 'text' } })
    const slides = [slide('a', 0, 'question', data), slide('b', 1)]
    let patch = { slides }
    for (const expected of [1, 2, 3]) {
      patch = await computeNextStep({ slides: patch.slides, currentSlideIndex: 0, currentSlideId: 'a' }, noTeams)
      expect(dataOf(patch, 'a').currentPart).toBe(expected)
    }
    const adv = await computeNextStep({ slides: patch.slides, currentSlideIndex: 0, currentSlideId: 'a' }, noTeams)
    expect(adv.current_slide_index).toBe(1)
  })

  it('never steps inside a concurrent MEDIA slide — all assets show at once', async () => {
    // Ben, 2026-08-26: concurrent media shows every asset together with one
    // shared answer. "One at a time" is what sequential is for, so a Next
    // press here must go straight to the next slide, not reveal a tile.
    const data = shinyParts({ shinyDisplay: 'concurrent', shinyInputSchema: { type: 'image' } })
    const slides = [slide('a', 0, 'question', data), slide('b', 1)]
    const adv = await computeNextStep({ slides, currentSlideIndex: 0, currentSlideId: 'a' }, noTeams)
    expect(adv.current_slide_index).toBe(1)
    expect(dataOf(adv, 'a').currentPart ?? 0).toBe(0)
  })

  it('backs into a concurrent MEDIA slide on its single state, not its last part', async () => {
    const data = shinyParts({ shinyDisplay: 'concurrent', shinyInputSchema: { type: 'image' }, currentPart: 0 })
    const slides = [slide('a', 0, 'question', data), slide('b', 1)]
    const back = await computePrevStep({ slides, currentSlideIndex: 1 }, noTeams)
    expect(back.current_slide_index).toBe(0)
    expect(dataOf(back, 'a').currentPart ?? 0).toBe(0)
  })

  it('backs into a sequential multi-asset slide on its LAST asset', async () => {
    const data = shinyParts({ shinyDisplay: 'sequential', shinyInputSchema: { type: 'image' } })
    const slides = [slide('a', 0, 'question', data), slide('b', 1)]
    const back = await computePrevStep({ slides, currentSlideIndex: 1 }, noTeams)
    expect(dataOf(back, 'a').currentPart).toBe(2)
  })

  it('two runs of the same format back to back: each announces via its OWN shiny-title slide, stepping is plain', async () => {
    // Announce beats are slides now, so stepping needs no sibling awareness:
    // run 1's last content slide advances onto run 2's title slide, which
    // advances onto run 2's first content slide. Nothing is skipped or
    // flagged along the way.
    const base = { isShiny: true, isSeries: true, shinyFormatId: 'f1', seriesTheme: 'Same Format' }
    const slides = [
      slide('t1', 0, 'shiny-title', { ...base, shinyGroupId: 'grp_1' }),
      slide('a', 1, 'question', { ...base, shinyGroupId: 'grp_1' }),
      slide('t2', 2, 'shiny-title', { ...base, shinyGroupId: 'grp_2' }),
      slide('b', 3, 'question', { ...base, shinyGroupId: 'grp_2' }),
    ]
    let idx = 0
    let cur = slides
    for (const expectedId of ['a', 't2', 'b']) {
      const patch = await computeNextStep({ slides: cur, currentSlideIndex: idx, currentSlideId: cur[idx].id }, noTeams)
      expect(patch.current_slide_id).toBe(expectedId)
      idx = patch.current_slide_index
      cur = patch.slides
    }
    expect(dataOf({ slides: cur }, 'b')).not.toHaveProperty('introDone')
  })
})
