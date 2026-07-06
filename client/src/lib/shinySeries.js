// Multi-part shiny series (data.parts.length > 1) store one text/answer/media
// per part on a single slide; ordinary shiny/regular questions keep their
// flat top-level fields. This resolves whichever shape a slide is in down
// to one consistent set of fields, so renderers don't need to branch.
//
// Also normalizes two other things that have drifted apart in this codebase:
// - media lives in data.mediaSlots[0] (host editor) OR the legacy flat
//   data.mediaUrl/mediaType (Swing Round bulk-import via shinyStampers.js)
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
