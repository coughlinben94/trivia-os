// The audio-director clip for a slide's walkout song (data.walkoutSong: {videoId, start, end,
// volume, trigger, invoked}), shared by Display's warm effect and the two slides that play it.
//
// The player's own `end` is deliberately NOT used (a walkout ends by fading or looping at
// outPoint, polled by the director), so the pool key is `videoId:start:` for warm AND claim.
//   onOut 'fade' (Pre-Show): plays once, fades out over fadeMs ending at the out-point, stops.
//   onOut 'loop' (State of the Union): seeks back to start at the out-point, forever.
//   volumeFactor: a deliberate duck on top of the editor's loudness correction (the State of the
//   Union loop plays under a host monologue at 75%), composed multiplicatively.
export const WALKOUT_FADE_MS = 2500

export function walkoutClip(walkoutSong, onOut = 'end', volumeFactor = 1) {
  if (!walkoutSong?.videoId) return null
  return {
    kind: 'youtube',
    videoId: walkoutSong.videoId,
    start: walkoutSong.start ?? 0,
    volume: Math.round((walkoutSong.volume ?? 100) * volumeFactor),
    outPoint: walkoutSong.end ?? null,
    onOut,
    fadeMs: WALKOUT_FADE_MS,
    part: 0,
  }
}
