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
export function resolveShinyPart(data) {
  if (Array.isArray(data.parts) && data.parts.length > 0) {
    const idx = Math.min(Math.max(data.currentPart ?? 0, 0), data.parts.length - 1)
    const part = data.parts[idx] ?? {}
    const media = part.mediaSlots?.[0]
    const isYoutube = media?.type === 'youtube'
    return {
      text: part.text ?? '',
      answer: part.answer || data.answer || null,
      mediaUrl: isYoutube ? null : (media?.url ?? null),
      mediaType: media?.type ?? null,
      subtitle: part.label || null,
      youtubeId: isYoutube ? media.videoId : null,
      youtubeStart: isYoutube ? (media.start ?? 0) : null,
      youtubeEnd: isYoutube ? (media.end ?? null) : null,
    }
  }
  const media = data.mediaSlots?.[0]
  const isYoutube = media?.type === 'youtube'
  return {
    text: data.text ?? '',
    answer: data.answer || null,
    mediaUrl: isYoutube ? null : (media?.url ?? data.mediaUrl ?? null),
    mediaType: media?.type ?? data.mediaType ?? null,
    subtitle: data.subtitle ?? null,
    youtubeId: isYoutube ? media.videoId : null,
    youtubeStart: isYoutube ? (media.start ?? 0) : null,
    youtubeEnd: isYoutube ? (media.end ?? null) : null,
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
