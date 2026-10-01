// resolveSlideClip — the ONE function that answers "what clip does this slide have
// and what starts it?" (audio pipeline spec, 2026-10-01). It replaces the private
// copies of that logic scattered across LiveMode (audioPlayPending), QuestionSlide
// (hasAudio checks) and the shiny part resolvers. Host and TV can no longer disagree
// about whether a slide has sound, because both ask here.
//
// Returns { clip, trigger } or null.
//   trigger 'click'   — starts when the host's Next press writes the audio_playing mark
//   trigger 'advance' — starts as soon as the slide goes live (plain questions with
//                       data.audioTrigger === 'advance')
// clip is a description only; the director normalizes and plays it. A Bendle clip is
// described here but the director does not play it until Plan 2.
import { resolveShinyPart, isAudioShiny, isBendleShiny } from './shinySeries.js'
import { audioPartOf } from './audioPending.js'

const isAudioMime = type => String(type ?? '').startsWith('audio')

export function resolveSlideClip(slide) {
  if (!slide || slide.type !== 'question') return null
  const data = slide.data ?? {}

  // Bendle's audio is a stem mix keyed by song id, not a mediaUrl.
  if (isBendleShiny(data)) return { clip: { kind: 'bendle', songId: data.bendleSongId ?? null }, trigger: 'click' }

  let trigger = 'click'
  if (data.isShiny) {
    // Shiny audio is always started by the Next press; other shiny formats have no clip here.
    if (!isAudioShiny(data)) return null
  } else if ((data.audioTrigger ?? 'click') !== 'click') {
    trigger = 'advance'
  }

  const part = resolveShinyPart(data)
  const partIdx = audioPartOf(data)

  if (part.youtubeId) {
    return {
      clip: {
        kind: 'youtube',
        videoId: part.youtubeId,
        start: part.youtubeStart ?? 0,
        end: part.youtubeEnd ?? null,
        volume: part.volume ?? 100,
        part: partIdx,
      },
      trigger,
    }
  }
  if (part.mediaUrl && isAudioMime(part.mediaType)) {
    return { clip: { kind: 'file', url: part.mediaUrl, gainDb: data.audioGainDb ?? 0, part: partIdx }, trigger }
  }
  return null
}
