// Clip data helpers for the audio director (Plan 1 of 3).
// A "clip" is plain data describing ONE thing to play; slides describe clips and
// never touch AudioContext / Audio / YT.Player themselves.

const num = (v, fallback) => (Number.isFinite(v) ? v : fallback)

// Decibels -> linear gain. Used for file clips so loudness normalization can BOOST
// (gain > 1, up to +12 dB in practice), which element.volume (capped at 1) cannot.
export function dbToGain(db) {
  return Math.pow(10, num(db, 0) / 20)
}

// Validate + fill defaults. Throws on bad input so a malformed clip fails loudly
// at the call site (the director catches it and reports; it never reaches the TV).
export function normalizeClip(c) {
  if (!c || typeof c !== 'object') throw new Error('audio clip must be an object')
  const part = num(c.part, 0)
  if (c.kind === 'youtube') {
    if (!c.videoId) throw new Error('youtube clip needs a videoId')
    return {
      kind: 'youtube',
      videoId: String(c.videoId),
      start: num(c.start, 0),
      // null (never 0/undefined) so warm and claim agree on the pool key videoId:start:end
      end: Number.isFinite(c.end) && c.end > 0 ? c.end : null,
      volume: num(c.volume, 100),
      part,
    }
  }
  if (c.kind === 'file') {
    if (!c.url) throw new Error('file clip needs a url')
    return { kind: 'file', url: String(c.url), gainDb: num(c.gainDb, 0), loop: !!c.loop, start: num(c.start, 0), part }
  }
  throw new Error(`unsupported audio clip kind: ${c.kind}`)
}

// One key per distinct (slide, part, source). The director keeps at most one live
// handle per key, and reports each blocked key to Sentry once.
export function clipKey(slideId, clip) {
  return `${slideId ?? ''}|${clip.kind}|${clip.part}|${clip.videoId ?? clip.url}`
}
