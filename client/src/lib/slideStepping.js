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

import { isShinySeriesSibling, isMatchingShiny, isWagerShiny } from './shinySeries.js'

// See the disabled call site in computeNextStep() below.
export const CLOSING_BEAT_ENABLED = false

export function sortSlides(slides) {
  return [...(slides ?? [])].sort((a, b) => a.order - b.order)
}

function patchSlideData(slides, id, dataPatch) {
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
  // false on a wager/matching slide that's already locked — jumping away
  // from an in-progress locked question and back to it (Go Live's "jump
  // to a slide" picker, reachable after exiting Live Mode) would otherwise
  // blank every phone back to the teaser screen with no way to submit.
  const wouldRegressLockedQuestion = introDone === false &&
    (slide.data?.wagerTiersLocked || slide.data?.wagerGuessesLocked || slide.data?.matchingLocked)
  if (introDone !== undefined && slide.data?.isShiny && !wouldRegressLockedQuestion) {
    if (!!slide.data.introDone !== introDone) {
      patch.introDone = introDone
    }
    // Fresh entry always restarts the closing-beat cycle too (see
    // computeNextStep's outroShown handling below) — a stale true from a
    // previous visit would otherwise skip straight past the closing
    // title card next time this slide's last part is reached. This must
    // NOT be nested inside the introDone-changed check above: a second
    // fresh entry (e.g. rehearsal, then go-live for real) can arrive with
    // introDone already false, which used to skip this reset entirely and
    // leave outroShown stuck true — question never displayed, only the
    // title card, no matter how many times Next was pressed.
    if (slide.data?.outroShown) patch.outroShown = false
  }
  // Fresh entry always re-arms invoke-gated audio too — a stale `invoked:
  // true` from an earlier rehearsal/visit would otherwise skip straight
  // past the silent hold and autoplay again on this new entry.
  if (slide.data?.walkoutSong?.trigger === 'invoke' && slide.data.walkoutSong.invoked) {
    patch.walkoutSong = { ...slide.data.walkoutSong, invoked: false }
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
      newSlides = patchSlideData(newSlides, targetSlide.id, { walkoutSong: { ...revealed.data.walkoutSong, invoked: true } })
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
  // Live lands on it. A second Next while already playing just advances
  // normally (host's own call to cut it short).
  if (data?.walkoutSong?.trigger === 'invoke' && data.walkoutSong.videoId && !data.walkoutSong.invoked) {
    const newSlides = patchSlideData(slides, curSlide.id, { walkoutSong: { ...data.walkoutSong, invoked: true } })
    return { slides: newSlides }
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
  //   - matching / wager: once fully scored (matchingRevealed /
  //     wagerGuessesLocked) — NOT merely locked. Both have a locked-but-
  //     still-scoring window (matching's "Retry Scoring" state, wager's
  //     collecting-guesses-after-tiers-locked state) that must never
  //     regress — same guard withEntryState uses for its own jump-back
  //     case, and the reason isPending exists below.
  //   - everything else (a single-shot list/audio/video/image question,
  //     no parts, not lockable): done the moment its content has been
  //     shown at all, i.e. as soon as introDone is true.
  const isPending = (isMatchingShiny(data) && data.matchingLocked && !data.matchingRevealed) ||
                     (isWagerShiny(data) && data.wagerTiersLocked && !data.wagerGuessesLocked)
  // Disabled 2026-08-19 (Ben, day after this shipped: "shiny intros were
  // shown after the question as well") — SlideRenderer can't distinguish
  // "never shown" from "closing beat" (both read as introDone:false), so
  // flipping it back here replayed the FULL ~2.4s entrance choreography
  // (spin/land/gold-burst/photo-rocket) a second time instead of a quiet
  // pan-down, and one Next press doing that instead of just advancing
  // read as the intro firing unprompted. Block kept intact rather than
  // deleted — CLOSING_BEAT_ENABLED flips this back on if a quiet-variant
  // closing animation (ShinyIntroScreen isClosing prop) gets built later.
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
  // for a wager/matching slide that's already locked. Regressing introDone
  // there blanks every phone back to "Next question incoming…" (Join.jsx
  // gates the WagerBoard/MatchingBoard mount on introDone, so the board
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
  if (data?.isShiny && data.introDone && !isAutoSkippedSibling && !(data.wagerTiersLocked || data.wagerGuessesLocked || data.matchingLocked)) {
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
