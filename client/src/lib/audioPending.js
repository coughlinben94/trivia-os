// The "Next plays audio" gate, in ONE place so /host and /display cannot
// disagree about it (audio pipeline spec, 2026-10-01). It used to live only in
// LiveMode.jsx; /display's own Next stepped straight past an audio question,
// so a Stream Deck Right-Arrow landing on the TV window advanced the show
// silently with no sound (the prime suspect for 2026-09-29).
import { resolveShinyPart, isAudioShiny, isBendleShiny } from './shinySeries.js'
import { computeNextStep, computePrevStep } from './slideStepping.js'

// Which part of a multi-part series is current (0 for everything else),
// clamped the same way resolveShinyPart clamps it. A series keeps ONE slide.id
// across all its parts, so a mark naming only the slide could not say WHICH
// part had played: Next played part 0 and parts 1..N needed a click on the TV.
export function audioPartOf(data) {
  const n = Array.isArray(data?.parts) ? data.parts.length : 0
  if (n === 0) return 0
  return Math.min(Math.max(data.currentPart ?? 0, 0), n - 1)
}

// True when the next Next press should PLAY this slide's clip instead of
// advancing. Checked off show.audio_playing itself, not local state, so it
// reads the same no matter which window's press fired it.
export function audioPlayPending(slide, audioPlaying) {
  if (!slide || slide.type !== 'question') return false
  const data = slide.data ?? {}
  // Bendle's audio isn't mediaUrl-shaped (a Tone.js stem mix keyed by
  // bendleSongId), so resolveShinyPart/hasAudio below don't apply to it.
  if (isBendleShiny(data)) return audioPlaying?.slideId !== slide.id
  if (data.isShiny) {
    // The announce card is its own `shiny-title` slide, so a shiny content
    // slide shows its content from its first frame and the first Next on it
    // is the play press (2026-09-01, P1 live: "hitting next skips to next
    // question, doesnt play audio").
    if (!isAudioShiny(data)) return false
  } else if (data.audioTrigger === 'advance') {
    return false
  }
  const part = resolveShinyPart(data)
  const hasAudio = !!part.youtubeId || (!!part.mediaUrl && String(part.mediaType ?? '').startsWith('audio'))
  if (!hasAudio) return false
  // Slide-id only, as on main: the first Next on the slide plays part 0. After that
  // every PART STEP writes its own mark (slideStepping.partStepPatch), so a series
  // takes play + one press per part — never a silent extra step.
  return audioPlaying?.slideId !== slide.id
}

// What /display's own Next should do on a raw `shows` row: when the current
// slide owes its clip, write audio_playing (the same payload /host writes)
// INSTEAD of stepping; otherwise null and the caller steps as before.
export function tvAudioStepPatch(showRow) {
  const slide = showRow?.slides?.find?.(s => s.id === showRow.current_slide_id)
  if (!audioPlayPending(slide, showRow?.audio_playing)) return null
  return { audio_playing: { slideId: slide.id, playing: true, part: audioPartOf(slide.data) } }
}

// A slide change must leave audio_playing either matching the new slide or
// cleared — never stale. A shiny-audio slide whose flag stayed set autoplays on
// mere arrival the next time it is visited (confirmed live: Round 2 Q8,
// 2026-09-14). /host always did this (useShow's withAudioReset); the TV step
// path did not, and it gained the power to SET the flag in 2026-10-01, so it
// needs the same clear. Pure: takes the CURRENT audio_playing.
export function withAudioReset(patch, audioPlaying) {
  if (!patch || !audioPlaying || patch.current_slide_id === undefined) return patch
  if (patch.current_slide_id === audioPlaying.slideId) return patch
  return { ...patch, audio_playing: null }
}

function stepArgs(showRow) {
  return {
    slides: showRow.slides,
    currentSlideIndex: showRow.current_slide_index,
    currentSlideId: showRow.current_slide_id,
  }
}

// /display's whole Next decision for one press: play the owed clip, else step
// (clearing a stale mark if the step leaves the marked slide). Same inputs
// stepShow always passed computeNextStep, plus the raw row's audio_playing, so
// the TV and /host share one gate.
export async function computeTvNextStep(showRow, fetchTeamCount) {
  const patch = tvAudioStepPatch(showRow) ?? await computeNextStep(stepArgs(showRow), fetchTeamCount)
  return withAudioReset(patch, showRow.audio_playing)
}

export async function computeTvPrevStep(showRow, fetchTeamCount) {
  return withAudioReset(await computePrevStep(stepArgs(showRow), fetchTeamCount), showRow.audio_playing)
}
