// Shared by YoutubeClipEditor and BendleOffsetScrubber — mm:ss for a
// non-negative duration/offset.
export function formatTime(seconds) {
  const s = Math.max(0, Math.round(seconds || 0))
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${String(sec).padStart(2, '0')}`
}
