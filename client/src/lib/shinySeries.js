import { nanoid } from 'nanoid'

// Multi-part shiny series (data.parts.length > 1) store one text/answer/media
// per part on a single slide; ordinary shiny/regular questions keep their
// flat top-level fields. This resolves whichever shape a slide is in down
// to one consistent set of fields, so renderers don't need to branch.
//
// Also normalizes two other things that have drifted apart in this codebase:
// - media lives in data.mediaSlots[0] (host editor) OR the legacy flat
//   data.mediaUrl/mediaType (legacy Swing Round bulk-import shape)
// - visual-type shiny questions are flagged two different ways:
//   data.shinyType === 'visual' (legacy/Swing Round) or
//   data.shinyInputSchema.type === 'image' (current format library)
// overridePart (2026-08-19): /join's own local per-part position, when a
// team has stepped back to an earlier part of the CURRENT live series —
// data.currentPart alone is the host's live position, which is all every
// viewer used to render (see Join.jsx's LiveView localPart state for why a
// phone needs its own).
export function resolveShinyPart(data, overridePart) {
  if (Array.isArray(data.parts) && data.parts.length > 0) {
    const idx = Math.min(Math.max(overridePart ?? data.currentPart ?? 0, 0), data.parts.length - 1)
    const part = data.parts[idx] ?? {}
    const media = part.mediaSlots?.[0]
    const isYoutube = media?.type === 'youtube'
    return {
      text: part.text ?? '',
      answer: part.answer || data.answer || null,
      mediaUrl: isYoutube ? null : (media?.url ?? null),
      mediaType: media?.type ?? null,
      subtitle: part.label || null,
      questionNumber: part.questionNumber ?? null,
      youtubeId: isYoutube ? media.videoId : null,
      youtubeStart: isYoutube ? (media.start ?? 0) : null,
      youtubeEnd: isYoutube ? (media.end ?? null) : null,
      // Caught by Opus review 2026-08-19: without this, QuestionSlide.jsx's
      // YT.Player conversion always reads part.volume as undefined and the
      // whole point of that conversion (applying a manual gain) silently
      // never happens.
      volume: isYoutube ? (media.volume ?? 100) : null,
    }
  }
  // Legacy Swing Round dual-image visual questions (shinyType: 'visual',
  // e.g. "the 4 heads" then "the 4 weapons") stash a SECOND image in
  // mediaSlots[1] and reveal it via data.imagesRevealed — QuestionSlide.jsx's
  // ShinySwingVisualQuestion reads mediaSlots directly for its two-beat pan
  // and never calls this function for its own mediaUrl, so this always fell
  // through to slot 0. Join.jsx (phones) has no pan beat — it only ever
  // calls this — so it was stuck showing beat 1's image forever, even after
  // the host revealed beat 2 on the TV: a guaranteed phone/TV mismatch, and
  // "only seeing half the images" for any dual-image swing question. Bug
  // fixed 2026-08-25, found auditing tonight's shiny-question reports.
  const slots = data.mediaSlots ?? []
  const media = (data.shinyType === 'visual' && data.imagesRevealed && slots.length >= 2)
    ? slots[1]
    : slots[0]
  const isYoutube = media?.type === 'youtube'
  return {
    text: data.text ?? '',
    answer: data.answer || null,
    mediaUrl: isYoutube ? null : (media?.url ?? data.mediaUrl ?? null),
    mediaType: media?.type ?? data.mediaType ?? null,
    subtitle: data.subtitle ?? null,
    questionNumber: null,
    youtubeId: isYoutube ? media.videoId : null,
    youtubeStart: isYoutube ? (media.start ?? 0) : null,
    youtubeEnd: isYoutube ? (media.end ?? null) : null,
    volume: isYoutube ? (media.volume ?? 100) : null,
  }
}

export function isVisualShiny(data) {
  return data.shinyType === 'visual' || data.shinyInputSchema?.type === 'image'
}

export function isAudioShiny(data) {
  return data.shinyType === 'audio' || data.shinyInputSchema?.type === 'audio'
}

export function isListShiny(data) {
  return data.shinyInputSchema?.type === 'list'
}

export function isVideoShiny(data) {
  return data.shinyInputSchema?.type === 'video'
}

export function isMatchingShiny(data) {
  return data.shinyInputSchema?.type === 'matching'
}

export function isWagerShiny(data) {
  return data.shinyInputSchema?.type === 'wager'
}

export function isOrderShiny(data) {
  return data.shinyInputSchema?.type === 'order'
}

export function isVennShiny(data) {
  return data.shinyInputSchema?.type === 'venn'
}

// THE one place "is this slide shown all at once" is decided — the TV
// dispatcher, the step-count math, and the host editor all read it here
// rather than restating the condition (they used to disagree by luck).
//
// data.shinyDisplay ('sequential' | 'concurrent') is stamped at creation by
// AddSlideWizard and flipped by SlideEditor's display-mode toggle. It is the
// ONLY field new slides need; everything below it is the read-only legacy
// path for rows created before it existed. Nothing is ever backfilled.
//
// The legacy gate is text-only ON PURPOSE: legacy image-series formats
// ("Time for a Close Up") also set input_schema.concurrent: true and have
// always rendered one asset per Next press. Widening this would silently
// change how every one of those existing slides plays.
export function isConcurrentShiny(data) {
  // Must agree with the dispatcher's own guard (QuestionSlide.jsx requires
  // parts.length > 1) on BOTH paths — without it, a 1-part concurrent
  // question diverges from the renderer: revealStepCount adds its +1
  // "nothing revealed yet" state, so computeNextStep bumps currentPart on
  // the first Next press, but the dispatcher falls through to plain
  // StandardQuestion, which never reads currentPart — a dead Next press
  // live. (This is the exact bug main independently found and fixed on
  // the old isConcurrentTextShiny 2026-08-26 — carried forward here so the
  // new shinyDisplay path can't reintroduce it.)
  const hasMultipleParts = Array.isArray(data.parts) && data.parts.length > 1
  if (!hasMultipleParts) return false
  if (data.shinyDisplay) return data.shinyDisplay === 'concurrent'
  return data.shinyInputSchema?.type === 'text' && data.shinyInputSchema?.concurrent === true
}

// Concurrent with MEDIA assets (images/video/audio) rather than text.
//
// The two concurrent flavors step differently and render differently:
//   - text  -> ShinyConcurrentQuestion, where data.currentPart counts how many
//              groups have been REVEALED so far (0 = nothing revealed yet),
//              which is why it needs one extra Next-reachable state.
//   - media -> every asset on screen together (GridContent, fed by
//              partsToGridView), one shared answer, no per-press reveal:
//              exactly one state. "One at a time" is what sequential is for
//              (Ben, 2026-08-26).
// Only reachable via the new shinyDisplay field, so no legacy slide is media
// concurrent.
export function isConcurrentMediaShiny(data) {
  return isConcurrentShiny(data) && data.shinyInputSchema?.type !== 'text'
}

// parts[] -> the columns[][] view GridContent (GridSlide.jsx) already knows
// how to draw: N assets become N columns of one tile, matching the shape the
// old creation path used to bake into a real `grid` slide. Reusing that
// drawing code is why concurrent media needs no new renderer — and keeping
// the slide on `type: 'question'` with parts[] is what lets the host flip
// between one-at-a-time and all-at-once after creation, which the old
// frozen-at-creation grid shape never allowed.
export function partsToGridView(data) {
  return {
    columns: (data.parts ?? []).map(p => [{ color: null, mediaUrl: p?.mediaSlots?.[0]?.url ?? null }]),
    columnLabels: false,
    intraGap: 0,
    interGap: 84,
    text: data.text,
    answer: data.answer,
  }
}

// True when two slides are separate top-level slide objects that together
// make up one shiny "run" — e.g. an image-type format where the host asked
// for N slides (one image each) instead of N parts on one slide. Same round,
// same format, same series title, both flagged isSeries. Used to (a) only
// play the ShinyIntroScreen announce beat once per run instead of once per
// slide, and (b) collapse the run into one group in the host's slide list.
export function isShinySeriesSibling(a, b) {
  const ad = a?.data, bd = b?.data
  if (!ad?.isShiny || !bd?.isShiny) return false
  // New creations carry a shinyGroupId stamped once per run — exact, and
  // collision-proof. A slide that has one is never a sibling of a slide that
  // doesn't (a legacy row can't have belonged to a run stamped after it).
  if (ad.shinyGroupId || bd.shinyGroupId) return ad.shinyGroupId === bd.shinyGroupId
  // Legacy rows keep the original heuristic, unchanged and never backfilled.
  // Known ceiling: seriesTheme is stamped as the FORMAT'S NAME, so two runs
  // of the same format in the same round are indistinguishable and merge —
  // the second run loses its announce beat and the sidebar collapses both
  // into one row. Accepted for old shows, impossible for new ones.
  if (!ad.isSeries || !bd.isSeries) return false
  if (a.roundId !== b.roundId) return false
  if (!ad.shinyFormatId || ad.shinyFormatId !== bd.shinyFormatId) return false
  return !!ad.seriesTheme && ad.seriesTheme === bd.seriesTheme
}

// A shiny series is meant to drag-reorder as one atomic unit in
// RoundSidebar — the lead slide's grip is the only handle shown once a
// group is collapsed, but treating a drag as moving only the single slide
// under the cursor silently splits a multi-slide series apart. This walks
// outward from a slide's own index to find every contiguous series sibling
// on either side (via isShinySeriesSibling), so callers can move the whole
// run together regardless of whether the drag started on the lead or a
// sibling. For a non-series slide this always returns [idx, idx] — a
// "group" of one — so it's safe to call unconditionally on any slide.
export function seriesGroupIndices(slides, idx) {
  let start = idx, end = idx
  while (start > 0 && isShinySeriesSibling(slides[start - 1], slides[start])) start--
  while (end < slides.length - 1 && isShinySeriesSibling(slides[end], slides[end + 1])) end++
  return [start, end]
}

// Pure reorder step for RoundSidebar's within-round drag-and-drop: moves the
// slide at fromIdx (plus its whole series group, per seriesGroupIndices) to
// land next to the slide at toIdx, preserving the existing direction rule —
// dragging down lands the moved item AFTER the target, dragging up lands it
// BEFORE the target. Returns the reordered array of slide ids, or null for a
// no-op drop (invalid indices, or dropped inside the dragged slide's own
// group). Extracted as a pure function specifically so this direction logic
// has a test seam — the group-move fix that introduced this once shipped a
// regression where every downward drag landed one slot short (or no-op'd on
// an adjacent-down drag) because nothing exercised the direction case.
export function reorderWithinRound(slides, fromIdx, toIdx) {
  if (fromIdx < 0 || toIdx < 0 || fromIdx >= slides.length || toIdx >= slides.length || fromIdx === toIdx) return null
  const [groupStart, groupEnd] = seriesGroupIndices(slides, fromIdx)
  if (toIdx >= groupStart && toIdx <= groupEnd) return null // dropped inside its own group — no-op
  const targetId = slides[toIdx].id
  const movedGroup = slides.slice(groupStart, groupEnd + 1)
  const remaining = [...slides.slice(0, groupStart), ...slides.slice(groupEnd + 1)]
  const targetIdxInRemaining = remaining.findIndex(s => s.id === targetId)
  if (targetIdxInRemaining === -1) return null
  // toIdx was computed against the ORIGINAL `slides` array, before the group
  // was removed. When the group started above the target (a downward drag),
  // removing it shifts the target's own index down by the group's length —
  // insert one slot past targetIdxInRemaining to land after it, matching the
  // direction rule. Dragging up needs no adjustment: a group removed from
  // below the target never shifts the target's position.
  const insertAt = groupStart < toIdx ? targetIdxInRemaining + 1 : targetIdxInRemaining
  remaining.splice(insertAt, 0, ...movedGroup)
  return remaining.map(s => s.id)
}

// ── Shiny title slide (2026-09-01, SPEC.md "Standalone Shiny Title Slide") ─
// Every shiny series now opens with a real `shiny-title` slide — the first
// member of the group, sharing its shinyGroupId — instead of the first
// content slide swapping ShinyIntroScreen in while data.introDone was false.
// This is the ONE place that shape is stamped; ShinyTitleSlide.jsx renders
// it. Field names are exactly what ShinyIntroScreen already reads:
// seriesTheme / shinyFormatName (title), introSubtitle (optional line — the
// same key SlideEditor's "Optional subtitle…" input writes), hostPhotoUrl
// (left UNSET so the random shared pool applies; `null` means "no photo").
export function buildShinyTitleSlide(fmt, groupId, roundId = null) {
  return {
    type: 'shiny-title',
    roundId: roundId ?? null,
    data: {
      isShiny:         true,
      shinyGroupId:    groupId,
      seriesTheme:     fmt.name,
      shinyFormatId:   fmt.id,
      shinyFormatName: fmt.name,
      shinyFormatIcon: fmt.icon,
    },
  }
}

// Wraps an AddSlideWizard creation payload — either the single-slide shape
// `{ type, roundId, afterSlideId, data }` or the batch shape
// `{ afterSlideId, slides }` — into a batch that leads with the title slide.
// Content slides that don't already carry a shinyGroupId (a lone
// single-asset question, a tied parts[] series, a grid) get one stamped so
// the title and its content group together via isShinySeriesSibling —
// that's what makes the title the group's lead for sidebar grouping and
// atomic reorder without any of those consumers learning a new rule.
// `newGroupId` is injectable purely for tests.
export function withShinyTitleSlide(payload, fmt, newGroupId = () => `sgrp_${nanoid(8)}`) {
  const grouped = withShinyGroupId(payload, newGroupId)
  const lead = grouped.slides[0]
  return {
    ...grouped,
    slides: [buildShinyTitleSlide(fmt, lead?.data?.shinyGroupId, lead?.roundId), ...grouped.slides],
  }
}

// The same grouping without the title card — for the one path that skips the
// announce beat: a round built entirely from one shiny format only introduces
// that format once (AddSlideWizard's formatAlreadyIntroducedThisRound). Those
// later questions still need a shinyGroupId, or they'd be loose slides that
// nothing groups (sidebar rows, atomic reorder, the PYL title-jump) — and
// `shiny-title` is hidden in the picker, so no UI path could add one after
// the fact.
export function withShinyGroupId(payload, newGroupId = () => `sgrp_${nanoid(8)}`) {
  const { afterSlideId, slides, ...single } = payload
  const content = slides ?? [single]
  const groupId = content[0]?.data?.shinyGroupId ?? newGroupId()
  return {
    afterSlideId,
    slides: content.map(s => ({ ...s, data: { ...s.data, shinyGroupId: groupId } })),
  }
}
