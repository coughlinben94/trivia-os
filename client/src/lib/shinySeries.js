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

// ShinyConcurrentQuestion (QuestionSlide.jsx) — a text series played
// all-at-once, each Next cumulatively revealing one more group's answer
// (every prior group stays visible). Unlike every other multi-part format,
// where data.currentPart indexes the single part currently on screen (part 0
// showing immediately on entry is correct there — something must always be
// displayed), this format's data.currentPart counts how many groups have
// been revealed so far, so 0 must mean "nothing revealed yet." See
// slideStepping.js's step-count handling for the off-by-one this drives.
export function isConcurrentTextShiny(data) {
  return data.shinyInputSchema?.type === 'text' && data.shinyInputSchema?.concurrent === true
}

// True when two slides are separate top-level slide objects that together
// make up one shiny "run" — e.g. an image-type format where the host asked
// for N slides (one image each) instead of N parts on one slide. Same round,
// same format, same series title, both flagged isSeries. Used to (a) only
// play the ShinyIntroScreen announce beat once per run instead of once per
// slide, and (b) collapse the run into one group in the host's slide list.
export function isShinySeriesSibling(a, b) {
  const ad = a?.data, bd = b?.data
  if (!ad?.isShiny || !bd?.isShiny || !ad.isSeries || !bd.isSeries) return false
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
