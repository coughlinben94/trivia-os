// Shared Next/Prev step DECISION logic for a live show.
//
// This is the single implementation of "what does one Next/Prev press do":
// the reveal-after-go-live beat, invoke-gated walkout audio, the shiny
// intro-reveal beat, multi-part stepping (shiny series + team-picker), and
// the plain advance/retreat fallback. It used to live only inside
// `useShow.js`'s nextSlide()/prevSlide(), which meant `/display` — a
// separate show-state implementation (SKILL.md: "Two independent show-shape
// implementations") — could only ever do a dumb index±1 via the anon
// `advance_show` RPC.
//
// Everything here is data-in/patch-out, deliberately Supabase-free: the one
// live lookup that's needed (the team count team-picker parts are baked
// from) is passed in as a `fetchTeamCount` function so both callers can
// supply their own. The returned patch uses shows-table COLUMN names, since
// that's what both callers ultimately write:
//
//   { slides, current_slide_index?, current_slide_id?, answer_reveal? }
//
// `null` means "this press does nothing" (no slide, already at the end).
// Callers own the write + their own local-state update; nothing here
// touches the network or React.

import { isShinySeriesSibling, isMatchingShiny, isWagerShiny, isOrderShiny } from './shinySeries.js'

// Kill switch for the closing-beat branch in computeNextStep() below. Kept
// (rather than inlined away) purely as a same-night escape hatch: flipping
// this to false restores the straight "last part → next slide" step with no
// other edit. See that branch for the full history.
export const CLOSING_BEAT_ENABLED = true

// Grace window after invoking a walkout song before a second press is
// allowed to "cut it short" and advance. Between the invoke press landing
// and the song being AUDIBLE sits real, silent dead time — the Supabase
// write, /display's realtime round-trip (no optimistic update there), the
// YouTube iframe loading, the player buffering and seeking — easily 2-4s
// with zero on-screen sign the first press did anything. Any second press
// inside that window (an impatient retry, a trailing click, Stream Deck
// chatter) used to read as "the host wants to cut the song short" and
// advanced immediately, ~1s after the song actually started — exactly
// Ben's "plays for like a second, then jumps to the next slide" (2026-08-24,
// diagnosed by an independent Fable 5 read after the fullscreen-click
// collision fix, 4dde9d4, didn't fully resolve it). 4000ms rather than
// something tighter: it needs to comfortably outlast the round-trip, not
// just the write.
const WALKOUT_INVOKE_GRACE_MS = 4000

export function sortSlides(slides) {
  return [...(slides ?? [])].sort((a, b) => a.order - b.order)
}

// Exported so Display.jsx's own raw shows-row writes (it has no `actions`
// object, just a host-verified UPDATE) can patch one slide's data the same
// way every internal caller here does, instead of growing a second copy of
// this map — e.g. writing the "Next locks answers" countdown fields.
export function patchSlideData(slides, id, dataPatch) {
  return slides.map(s => s.id === id ? { ...s, data: { ...s.data, ...dataPatch } } : s)
}

// Every shiny question gets a standalone intro beat (data.introDone: false)
// before its content — image/audio/parts — is revealed. Multi-part shiny
// series (data.parts.length > 1) additionally step through their parts
// once revealed. Entering a slide fresh (goLive/goLiveFrom, or crossing
// into it from an adjacent slide) always resets to a specific state
// rather than resuming wherever a previous visit left off, so jumping to
// a slide is predictable.
export function withEntryState(slides, slide, { currentPart, introDone } = {}) {
  if (!slide) return slides
  const patch = {}
  if (currentPart !== undefined && (slide.data?.parts?.length ?? 0) > 1 && (slide.data.currentPart ?? 0) !== currentPart) {
    patch.currentPart = currentPart
  }
  // Same guard as the Prev-key handler below: never regress introDone to
  // false on a wager/matching/order slide that's already locked — jumping away
  // from an in-progress locked question and back to it (Go Live's "jump
  // to a slide" picker, reachable after exiting Live Mode) would otherwise
  // blank every phone back to the teaser screen with no way to submit.
  const wouldRegressLockedQuestion = introDone === false &&
    (slide.data?.wagerTiersLocked || slide.data?.wagerGuessesLocked || slide.data?.matchingLocked || slide.data?.orderLocked)
  if (introDone !== undefined && slide.data?.isShiny) {
    if (!wouldRegressLockedQuestion && !!slide.data.introDone !== introDone) {
      patch.introDone = introDone
    }
    // Fresh entry always restarts the closing-beat cycle too (see
    // computeNextStep's outroShown handling below) — a stale true from a
    // previous visit would otherwise skip straight past the closing
    // title card next time this slide's last part is reached. This must
    // NOT be nested inside wouldRegressLockedQuestion, on top of not being
    // nested inside the introDone-changed check: a locked-and-scored
    // matching/wager slide re-entered after a rehearsal (introDone:false,
    // outroShown:true, matchingRevealed/wagerGuessesLocked true — exactly
    // what a real Go Live after a rehearsal leaves behind) kept
    // outroShown stuck true when this lived inside that guard, so the
    // very next Next press skipped the closing card straight past the
    // question into the next slide — the question was never shown at all
    // (2026-08-24, Opus review after CLOSING_BEAT_ENABLED went live made
    // outroShown:true reachable for the first time).
    if (slide.data?.outroShown) patch.outroShown = false
  }
  // Fresh entry always re-arms invoke-gated audio too — a stale `invoked:
  // true` from an earlier rehearsal/visit would otherwise skip straight
  // past the silent hold and autoplay again on this new entry.
  if (slide.data?.walkoutSong?.trigger === 'invoke' && slide.data.walkoutSong.invoked) {
    patch.walkoutSong = { ...slide.data.walkoutSong, invoked: false, invokedAt: null }
  }
  // Fresh entry always clears a stale "Next locks answers" countdown too
  // (2026-08-25 review) — a countdown interrupted before completing (Live
  // Mode exited mid-countdown, a reload) otherwise leaves lockCountdownPhase/
  // StartedAt sitting on the slide. The next time the host lands on it, the
  // completion effect computes remaining = max(startedAt + LOCK_COUNTDOWN_MS
  // - now, 0) off that stale startedAt, gets 0, and fires the real lock+score
  // IMMEDIATELY — before any team has answered, with no countdown shown to
  // explain why. Same unconditional-truthy shape as outroShown's reset above.
  if (slide.data?.lockCountdownPhase || slide.data?.lockCountdownStartedAt) {
    patch.lockCountdownPhase = null
    patch.lockCountdownStartedAt = null
  }
  if (Object.keys(patch).length === 0) return slides
  return patchSlideData(slides, slide.id, patch)
}

// team-picker slides step through [intro, ...teams, outro, landed] using the
// exact same data.currentPart mechanism as shiny series (withEntryState above
// and the parts-stepping branches in computeNextStep/computePrevStep already
// handle any slide with an array in data.parts — no changes needed there). The
// only team-picker-specific piece is baking data.parts to the right LENGTH
// from a live count of the teams table — after that it's just a plain step
// counter (TeamPickerSlide fetches the actual names itself).
//
// Re-bakes on EVERY call, not just the first. All 5 call sites (goLive,
// goLiveFrom, and the reveal/advance/retreat branches below) fire only at
// slide-ENTRY — never mid-reveal, since currentPart-stepping doesn't touch
// this function — so there is no in-progress sequence this can resize out
// from under. The original "bake once, ever" guard (`Array.isArray(...)
// return slides`) protected against that non-existent risk while creating a
// real one: `data.parts`, once baked, never expired — a rehearsal with 1
// team registered permanently froze the roster at 1 team for that slide,
// even after 20 more teams joined and the show went live for real
// (2026-08-24, Ben: "only saw one team name" / "said 1/1 on the bottom" —
// confirmed live, `registered_teams: 21` against a stale 4-length `parts`
// array baked back when only 1 was registered).
export async function bakeTeamPickerParts(slides, slide, fetchTeamCount) {
  if (!slide || slide.type !== 'team-picker') return slides
  const count = await fetchTeamCount()
  const parts = new Array(count + 3).fill(null) // intro + teams + outro + landed
  return patchSlideData(slides, slide.id, { parts })
}

// Is this team-picker part one the host-side auto-roll should step off on its
// own? Lives here, next to bakeTeamPickerParts, because it is the same
// [intro, ...teams, outro, landed] shape law — LiveMode.jsx used to restate
// those indices itself, which is exactly how the roll silently drifts a beat
// if the baked length ever changes.
//
// Ben's confirmed Team Intro flow (2026-08-20, re-confirmed 2026-08-24):
//   0            opening text   — waits for ONE explicit Next to start the roll
//   1..len-3     team names     — auto-roll, no press per name
//   len-2        closing text   — the roll lands here and STOPS, waits for Next
//   len-1        landed         — ring-world reveal, then one more Next leaves
// So part 0 is excluded (it would rob the host of the start press) and both
// closing parts are excluded (they would blow past the closing statement and
// the reveal). A zero-team roster bakes len 3, which yields an empty range.
export function isAutoRollPart(partsLen, curPart) {
  return curPart >= 1 && curPart <= partsLen - 3
}

// How long each team-picker TEAM NAME holds before auto-rolling to the next.
// Lived in LiveMode.jsx until /display grew its own copy of the timer (see
// ownsAutoRoll below) — two windows pacing the same ceremony must not be able
// to drift to two different tempos, so the number lives here with the index
// law it belongs to.
//
// 2400ms, not the 1400ms the first (reverted, /display-side) version used:
// this timer measures currentPart-change to currentPart-change, and the
// display burns most of that window on choreography before the name is even
// readable. TeamPickerSlide's draw loop exits the outgoing name over E=620ms,
// then approaches the incoming one over A=1050ms, and only then enters its
// indefinite `hold` phase. That's ~1670ms of motion per step, so 1400ms never
// let a name finish arriving, let alone be read; 2400ms leaves ~730ms of
// actual still hold. Retune here if Ben wants the roll faster or slower —
// anything at or below ~1700ms starts eating the arrival animation itself.
export const TEAM_PICKER_HOLD_MS = 2400

// How stale a window's own-write record may be and still count as "I am the
// one driving this roll" (see ownsAutoRoll). Normally the gap between a
// window's write and seeing that write come back is a realtime round trip —
// a few hundred ms — so this is generous by an order of magnitude. Its only
// job is to make ownership EXPIRE, so a cursor a window wrote minutes ago
// can't be re-matched by the OTHER window navigating back onto that exact
// part later and have both windows arm a timer off it.
export const AUTO_ROLL_OWNERSHIP_MAX_AGE_MS = TEAM_PICKER_HOLD_MS + 3000

// Where a live show is sitting, IF it's sitting on a team-picker slide:
// { slideId, part, partsLen }, or null for anything else (no slide revealed
// yet, some other slide type). This is the whole state the auto-roll cares
// about, in one comparable value — see ownsAutoRoll.
export function teamPickerCursor(show) {
  if ((show?.currentSlideId ?? null) === null) return null
  const slide = sortSlides(show?.slides ?? [])[show?.currentSlideIndex ?? 0]
  if (!slide || slide.type !== 'team-picker') return null
  return {
    slideId: slide.id,
    part: slide.data?.currentPart ?? 0,
    partsLen: slide.data?.parts?.length ?? 0,
  }
}

// The cursor a step patch will leave the show on, computed BEFORE the write
// echoes back. A window records this as "the state my own press caused" —
// see ownsAutoRoll. `show` is the pre-write state, `patch` what
// computeNextStep/computePrevStep returned (shows COLUMN names); the merge
// lives here because both callers hold the pre-write row in a different shape.
export function cursorAfterStep(show, patch, now = Date.now()) {
  if (!patch) return null
  const cursor = teamPickerCursor({
    slides: patch.slides ?? show?.slides,
    currentSlideIndex: patch.current_slide_index ?? show?.currentSlideIndex,
    currentSlideId: patch.current_slide_id !== undefined ? patch.current_slide_id : show?.currentSlideId,
  })
  return cursor && { ...cursor, at: now }
}

// Should THIS window arm the auto-roll timer for the state it's now observing?
//
// The team-picker roll has to keep rolling no matter which window the human's
// Next press actually lands in — /host and /display are both open all show
// (laptop + extended monitor), only one has OS keyboard focus, and the Stream
// Deck sends its Right-Arrow to whichever that happens to be. Both windows
// therefore run the same timer. What must NEVER happen is both of them
// arming a timer off the same transition and double-advancing (skipping a
// team name).
//
// The rule that keeps exactly one of them armed: a window only paces the roll
// it is itself driving. `owned` is the cursor that window's OWN last
// successful write produced (cursorAfterStep); `cursor` is what it is
// observing now. They match only for the window whose press caused this
// state — the other window is merely watching it arrive over realtime, and
// stays silent. Whichever window is being driven drives the pacing too, with
// no coordination between them beyond the Supabase writes they already do.
export function ownsAutoRoll(cursor, owned, now = Date.now()) {
  if (!cursor || !owned) return false
  if (!isAutoRollPart(cursor.partsLen, cursor.part)) return false
  if (cursor.slideId !== owned.slideId || cursor.part !== owned.part) return false
  return now - (owned.at ?? 0) <= AUTO_ROLL_OWNERSHIP_MAX_AGE_MS
}

// How long the "Next locks answers" countdown runs before the real lock+score
// fires — 3-2-1, ~1s a number. Lives here, next to the phase law it paces, for
// the same reason TEAM_PICKER_HOLD_MS does: /host arms the completion timer off
// it while /display draws the numbers off it, and two windows pacing one
// ceremony must never be able to drift to two tempos.
export const LOCK_COUNTDOWN_MS = 3000

// Which lock phase, if any, is still OPEN on this slide — i.e. what a Next
// press here should start a countdown for instead of advancing. null when the
// slide isn't a phone-scored question at all, or every lock phase it has is
// already past.
//
// The ONE definition of "is a lock phase pending". Both LiveMode.jsx (which
// starts the countdown and later performs the actual lock) and Display.jsx
// (which starts it and only draws it) call this, so they cannot drift on the
// question the way LiveMode.jsx used to drift from bakeTeamPickerParts by
// restating its index law inline — same reasoning isAutoRollPart documents.
//
// Deliberately NOT paired with an ownsAutoRoll-style ownership handshake. That
// one exists because EITHER window can perform the auto-roll's shared action
// (actions.nextSlide() is identical on both sides), so both arming a timer off
// the same observed state double-advances. Here the actual lock+score reads
// phone_answers/teams and writes scoreboard_teams through host-side `actions`
// that Display.jsx simply does not have — exactly one window in the app is
// capable of completing this ceremony, so there is no double-completion race
// to arbitrate. Starting it is safe from either window too: one physical
// keypress reaches only the one OS-focused listener.
//
// Wager is the only mechanic with TWO lock phases on one slide (blind tiers
// first, then the numeric guesses once the question is out), so it gets
// checked in that order and returns null only when both are shut.
export function pendingLockPhase(slide) {
  const data = slide?.data
  if (!data) return null
  if (isMatchingShiny(data)) return data.introDone && !data.matchingLocked ? 'matching' : null
  if (isWagerShiny(data)) {
    if (data.introDone && !data.wagerTiersLocked) return 'wager-tiers'
    if (data.introDone && !data.wagerGuessesLocked) return 'wager-guesses'
    return null
  }
  if (isOrderShiny(data)) return data.introDone && !data.orderLocked ? 'order' : null
  return null
}

// The slide.data flag each phone-scored mechanic flips when its answer is
// finally shown to the room. One map, so nothing has to restate the field
// names it is about to write (LiveMode.jsx's A-key reveal is the only writer).
export const REVEAL_FIELD = {
  matching: 'matchingRevealed',
  wager: 'wagerRevealed',
  order: 'orderRevealed',
}

// Which mechanic on this slide is locked but NOT yet revealed — i.e. what the
// host's A press should reveal, or null when A should do its ordinary
// show-level answer_reveal toggle instead. The sibling of pendingLockPhase
// above, and the ONE definition of "does this slide owe the room a reveal"
// (2026-08-25: reveal was split out of lock+score, so this state is now
// whatever the host lets it be — he talks, then presses A).
//
// Wager keys off wagerGuessesLocked, NOT wagerTiersLocked: locking tiers only
// puts the QUESTION up, there is nothing to reveal until the guesses are in
// and scored. Note that computeNextStep's own closing-beat `isPending` check
// deliberately uses the WIDER wagerTiersLocked window for the same slide —
// it is asking a different question ("may this slide pan away yet", which
// must stay false from the very first lock), so the two are not duplicates of
// each other and must not be collapsed.
export function pendingReveal(slide) {
  const data = slide?.data
  if (!data) return null
  if (isMatchingShiny(data)) return data.matchingLocked && !data.matchingRevealed ? 'matching' : null
  if (isWagerShiny(data)) return data.wagerGuessesLocked && !data.wagerRevealed ? 'wager' : null
  if (isOrderShiny(data)) return data.orderLocked && !data.orderRevealed ? 'order' : null
  return null
}

/**
 * One Next press. `show` is { slides, currentSlideIndex, currentSlideId }.
 * Returns a shows-row patch, or null when the press is a no-op.
 */
export async function computeNextStep(show, fetchTeamCount) {
  const slides = show?.slides ?? []
  const sorted = sortSlides(slides)
  const cur = show?.currentSlideIndex ?? 0

  // First advance after going live — reveal the queued slide without stepping past it.
  if ((show?.currentSlideId ?? null) === null) {
    const targetSlide = sorted[cur]
    if (!targetSlide) return null
    const bakedSlides = await bakeTeamPickerParts(slides, targetSlide, fetchTeamCount)
    let newSlides = withEntryState(bakedSlides, bakedSlides.find(s => s.id === targetSlide.id) ?? targetSlide, { currentPart: 0, introDone: false })
    // Invoke-gated audio (pre-show's walkout song) on the revealed slide:
    // this reveal press IS the first real Next press of the show, and per
    // design ("fires the walkout song later, not the instant Go Live lands
    // on it") that's the press meant to fire it. Without this, the check
    // below never runs on this branch (it returns first) — the host would
    // need a second, visually-identical Next press with no on-screen sign
    // the first one did anything.
    const revealed = newSlides.find(s => s.id === targetSlide.id)
    if (revealed?.data?.walkoutSong?.trigger === 'invoke' && revealed.data.walkoutSong.videoId && !revealed.data.walkoutSong.invoked) {
      newSlides = patchSlideData(newSlides, targetSlide.id, { walkoutSong: { ...revealed.data.walkoutSong, invoked: true, invokedAt: Date.now() } })
    }
    return { slides: newSlides, current_slide_id: targetSlide.id, answer_reveal: false }
  }

  const curSlide = sorted[cur]
  const data = curSlide?.data

  // Invoke-gated audio (e.g. pre-show's walkout song, "Hold until triggered"
  // checked): held silent on mount, started by the host's next explicit
  // Next/Stream-Deck press instead — same slide, same index, just flips
  // `invoked`. Ben: the QR screen sits up from doors-open until a
  // Stream-Deck press fires the walkout song later, not the instant Go
  // Live lands on it. A press well after it's actually playing can still
  // cut it short (host's own call) — see WALKOUT_INVOKE_GRACE_MS above for
  // why "well after" isn't just "any second press".
  if (data?.walkoutSong?.trigger === 'invoke' && data.walkoutSong.videoId) {
    if (!data.walkoutSong.invoked) {
      const newSlides = patchSlideData(slides, curSlide.id, { walkoutSong: { ...data.walkoutSong, invoked: true, invokedAt: Date.now() } })
      return { slides: newSlides }
    }
    if (data.walkoutSong.invokedAt && Date.now() - data.walkoutSong.invokedAt < WALKOUT_INVOKE_GRACE_MS) {
      return null
    }
  }

  // Reveal the intro's content before doing anything else. Guarded on
  // !outroShown too (see the closing-beat branch below) — without it,
  // the Next press that's supposed to land on the closing title card
  // would immediately re-reveal the last part's content instead, since
  // this check alone can't tell "never opened yet" from "just closed."
  if (data?.isShiny && !data.introDone && !data.outroShown) {
    return { slides: patchSlideData(slides, curSlide.id, { introDone: true }), answer_reveal: false }
  }

  // Step through this slide's parts before moving to the next slide.
  const parts = data?.parts
  const isMultiPart = Array.isArray(parts) && parts.length > 1
  if (isMultiPart) {
    const curPart = data.currentPart ?? 0
    if (curPart < parts.length - 1) {
      return { slides: patchSlideData(slides, curSlide.id, { currentPart: curPart + 1 }), answer_reveal: false }
    }
  }
  // Closing beat (Ben, 2026-08-17: "then back down to the shiny title
  // screen, which i then advance to [the next question]"): one more Next
  // pans back down to the title card instead of jumping straight to the
  // next slide — outroShown marks that this already happened, so the NEXT
  // Next press (introDone false again, but outroShown true) skips the
  // re-reveal branch above and actually moves on. Reset to false whenever
  // this slide is entered fresh (withEntryState), so revisiting always
  // restarts the cycle.
  //
  // 2026-08-18, Ben: "pan down is always associated with pan up — if up
  // happens, down must happen eventually." Every isShiny slide pans UP on
  // its own (QuestionSlide's intro→content swap, keyed off introDone) —
  // so by that rule every one of them owes a pan DOWN too, once its
  // content is actually done, not just multi-part series (which is all
  // this used to cover). "Done" varies by type:
  //   - multi-part series: the LAST part (isMultiPart, handled above —
  //     any earlier part returns before reaching here)
  //   - matching / wager / order: once fully scored (matchingRevealed /
  //     wagerRevealed / orderRevealed) — NOT merely locked, and NOT merely guesses-locked.
  //     Both have a locked-but-still-scoring window (matching's "Retry
  //     Scoring" state, wager's guesses-locked-but-not-yet-revealed state —
  //     there is no separate Reveal control, it's the host's A key, see
  //     pendingReveal above) that must never regress — same guard
  //     withEntryState uses for its own jump-back case, and the reason
  //     isPending exists below. Wager fixed 2026-08-24 (Opus review): this
  //     used to check wagerGuessesLocked, one stage too early — the closing
  //     beat fired the instant guesses locked but before the host ever
  //     pressed Reveal, panning every phone back to the teaser with no way
  //     to recover except Prev.
  //   - everything else (a single-shot list/audio/video/image question,
  //     no parts, not lockable): done the moment its content has been
  //     shown at all, i.e. as soon as introDone is true.
  const isPending = (isMatchingShiny(data) && data.matchingLocked && !data.matchingRevealed) ||
                     (isWagerShiny(data) && data.wagerTiersLocked && !data.wagerRevealed) ||
                     (isOrderShiny(data) && data.orderLocked && !data.orderRevealed)
  // Disabled 2026-08-19 (Ben, day after this shipped: "shiny intros were
  // shown after the question as well") — SlideRenderer couldn't distinguish
  // "never shown" from "closing beat" (both read as introDone:false), so
  // flipping it back here replayed the FULL ~2.4s entrance choreography
  // (spin/land/gold-burst/photo-rocket) a second time instead of a quiet
  // pan-down, and one Next press doing that instead of just advancing
  // read as the intro firing unprompted.
  //
  // Re-enabled 2026-08-24, once that missing quiet variant existed: every
  // renderer that mounts ShinyIntroScreen on !introDone (QuestionSlide,
  // GridSlide, VennDiagramSlide) now passes `isClosing={!!data.outroShown}`,
  // which is exactly the distinction that was missing — the closing card
  // arrives already landed, no spin/burst/sparks/photo-rocket, and
  // QuestionSlide pans it back down (SHINY_PAN run with dir -1) instead of
  // up. Ben's ask, verbatim: "it should then pan back down to the shiny
  // title ... so i can then move to the next question ring world style and
  // have it look smooth."
  if (CLOSING_BEAT_ENABLED && data?.isShiny && data.introDone && !data.outroShown && !isPending) {
    // Skip the pause when the next slide continues the same shiny series
    // — siblings only get one announce beat at the start (skipIntro
    // below); each one pausing on its own closing title card too would
    // break what's supposed to read as one continuous run. 2026-08-18:
    // this is exactly how 6 separate matching slides chained as one
    // series (isShinySeriesSibling) skip the pan-down between Q1-Q5 and
    // only actually pause after Q6, whose next slide isn't a sibling.
    const peekTarget = sorted[Math.min(cur + 1, sorted.length - 1)]
    const nextIsSeriesSibling = !!peekTarget && peekTarget.id !== curSlide.id && isShinySeriesSibling(curSlide, peekTarget)
    if (!nextIsSeriesSibling) {
      return {
        slides: patchSlideData(slides, curSlide.id, { introDone: false, outroShown: true }),
        answer_reveal: false,
      }
    }
  }

  // Ben's decision (2026-08-25 whole-branch review): Next must not fall
  // through to a plain advance while a phone-scored question is locked but
  // not yet revealed — force the host to press A first, or the room never
  // sees the answer. Deliberately pendingReveal, NOT isPending above:
  // isPending's wager check widens to wagerTiersLocked on purpose (see
  // pendingReveal's own comment) to also gate the closing-beat pan-down,
  // but that means it's still true during wager's transient
  // tiers-locked-but-guesses-not-yet-locked window — a state that is NOT
  // "locked but not revealed" and must keep falling through to a plain
  // advance like it always has. pendingReveal is the narrower, correct
  // check for every mechanic (matching/order match isPending exactly here;
  // wager keys off wagerGuessesLocked instead of wagerTiersLocked).
  if (pendingReveal(curSlide)) return null

  const target = Math.min(cur + 1, sorted.length - 1)
  if (target === cur) return null
  const targetSlide = sorted[target]
  const bakedSlides = await bakeTeamPickerParts(slides, targetSlide, fetchTeamCount)
  // A run of separate sibling slides sharing one shiny series (e.g. an
  // image format where the host asked for N slides) already showed its
  // announce beat on the first slide of the run — skip it on the rest.
  const skipIntro = isShinySeriesSibling(curSlide, targetSlide)
  const newSlides = withEntryState(bakedSlides, bakedSlides.find(s => s.id === targetSlide?.id) ?? targetSlide, { currentPart: 0, introDone: skipIntro })
  return {
    slides: newSlides,
    current_slide_index: target,
    current_slide_id: targetSlide?.id ?? null,
    answer_reveal: false,
  }
}

/**
 * One Prev press. `show` is { slides, currentSlideIndex }.
 * Returns a shows-row patch, or null when the press is a no-op.
 */
export async function computePrevStep(show, fetchTeamCount) {
  const slides = show?.slides ?? []
  const sorted = sortSlides(slides)
  const cur = show?.currentSlideIndex ?? 0
  const curSlide = sorted[cur]
  const data = curSlide?.data
  const parts = data?.parts

  // Undo the closing beat (see computeNextStep's outroShown branch) before
  // anything else — without this, the generic parts-backward branch right
  // below would silently decrement currentPart while still on the closing
  // title card (introDone false there blocks any content from showing
  // regardless of currentPart), so Prev would look like it did nothing
  // while actually desyncing which part you'd land back on.
  if (data?.isShiny && data.outroShown) {
    return {
      slides: patchSlideData(slides, curSlide.id, { introDone: true, outroShown: false }),
      answer_reveal: false,
    }
  }

  // Step back through this slide's parts before un-revealing its intro.
  // Generic on purpose (matches the forward branch in computeNextStep) — not
  // gated to isShiny/introDone, since team-picker uses this same
  // data.parts/currentPart mechanism without either of those fields.
  if (Array.isArray(parts) && parts.length > 1) {
    const curPart = data.currentPart ?? 0
    if (curPart > 0) {
      return { slides: patchSlideData(slides, curSlide.id, { currentPart: curPart - 1 }), answer_reveal: false }
    }
  }

  // Back to the intro beat before moving to the previous slide — but NOT
  // for a wager/matching/order slide that's already locked. Regressing introDone
  // there blanks every phone back to "Next question incoming…" (Join.jsx
  // gates the WagerBoard/MatchingBoard/OrderBoard mount on introDone, so the board
  // unmounts entirely) with no data loss but no way to submit until the
  // host presses Next again — and Prev is one keystroke/Stream Deck press
  // away, the single most likely accidental trigger of this regression.
  // ALSO not for a non-lead shiny-series sibling (bug fixed 2026-08-17,
  // caught by review, not live): computeNextStep skips resetting introDone
  // for these — they never show their own intro card, they share the
  // lead slide's. This branch didn't know that, so one Prev on Q4/Q5/Q6
  // played the full spin-in title card it was never supposed to have,
  // and it took a SECOND Prev to actually move back a slide.
  const prevInOrder = sorted[cur - 1]
  const isAutoSkippedSibling = prevInOrder && isShinySeriesSibling(prevInOrder, curSlide)
  if (data?.isShiny && data.introDone && !isAutoSkippedSibling && !(data.wagerTiersLocked || data.wagerGuessesLocked || data.matchingLocked || data.orderLocked)) {
    return { slides: patchSlideData(slides, curSlide.id, { introDone: false }), answer_reveal: false }
  }

  const target = Math.max(cur - 1, 0)
  if (target === cur) return null
  const targetSlide = sorted[target]
  const bakedSlides = await bakeTeamPickerParts(slides, targetSlide, fetchTeamCount)
  const resolvedTarget = bakedSlides.find(s => s.id === targetSlide?.id) ?? targetSlide
  // Backing into a shiny or team-picker slide lands on its last revealed
  // state — the natural "undo" of advancing forward through it.
  const lastPartIdx = Math.max((resolvedTarget?.data?.parts?.length ?? 1) - 1, 0)
  const newSlides = withEntryState(bakedSlides, resolvedTarget, { currentPart: lastPartIdx, introDone: true })
  return {
    slides: newSlides,
    current_slide_index: target,
    current_slide_id: targetSlide?.id ?? null,
    answer_reveal: false,
  }
}
