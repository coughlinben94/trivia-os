// Parsing + embed-URL helpers for the "video" shiny format and the
// audio-shiny-sourced-from-YouTube bonus. Kept dependency-free (no
// youtube-related npm packages) since the actual playback control on
// /host uses the IFrame Player API script directly (see
// YoutubeClipEditor.jsx) and /display just drops a plain <iframe> whose
// src already encodes start/end/autoplay — no JS player needed there.

const ID_RE = /^[a-zA-Z0-9_-]{11}$/

// Accepts watch?v=, youtu.be/, embed/, shorts/ URL forms, and a bare
// 11-char video id pasted directly. Returns null if nothing matches.
export function extractYoutubeId(input) {
  if (!input) return null
  const trimmed = input.trim()
  if (ID_RE.test(trimmed)) return trimmed

  let url
  try {
    url = new URL(trimmed)
  } catch {
    return null
  }

  const host = url.hostname.replace(/^www\./, '').replace(/^m\./, '')

  if (host === 'youtu.be') {
    const id = url.pathname.slice(1).split('/')[0]
    return ID_RE.test(id) ? id : null
  }

  if (host === 'youtube.com' || host === 'music.youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/watch') {
      const id = url.searchParams.get('v')
      return id && ID_RE.test(id) ? id : null
    }
    const embedMatch = url.pathname.match(/^\/embed\/([a-zA-Z0-9_-]{11})/)
    if (embedMatch) return embedMatch[1]
    const shortsMatch = url.pathname.match(/^\/shorts\/([a-zA-Z0-9_-]{11})/)
    if (shortsMatch) return shortsMatch[1]
  }

  return null
}

// Builds a privacy-enhanced (youtube-nocookie.com) embed URL for a clip.
// start/end are seconds; only included when a truthy value > 0 is given
// (end: null/0 means "play to the end of the video").
export function youtubeEmbedUrl(videoId, { start, end, autoplay = false, controls = true } = {}) {
  const params = new URLSearchParams()
  params.set('rel', '0')
  params.set('modestbranding', '1')
  params.set('playsinline', '1')
  params.set('controls', controls ? '1' : '0')
  if (autoplay) params.set('autoplay', '1')
  if (start && start > 0) params.set('start', String(Math.floor(start)))
  if (end && end > 0) params.set('end', String(Math.floor(end)))
  return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`
}
