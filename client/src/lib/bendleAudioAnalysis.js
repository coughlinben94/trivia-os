// Pure DSP helpers for the Bendle start-offset scrubber. No React, no
// Tone.js, no Supabase — just plain arithmetic over decoded PCM, so this is
// testable without a browser AudioContext. BendleOffsetScrubber.jsx is the
// only caller; it owns the actual AudioContext/decodeAudioData calls and
// passes the resulting Float32Array in here.

// Root-mean-square loudness in fixed-size windows across one channel's PCM
// data — a plain, un-tuned energy measure (no threshold, no detection logic)
// so the host's own eye does the judgment call of "where do all three stems
// go solid," rather than a heuristic guessing on their behalf.
export function computeRmsEnvelope(channelData, sampleRate, windowSeconds = 0.15) {
  const windowSize = Math.max(1, Math.round(sampleRate * windowSeconds))
  const windows = []
  for (let i = 0; i < channelData.length; i += windowSize) {
    const end = Math.min(i + windowSize, channelData.length)
    let sumSquares = 0
    for (let j = i; j < end; j++) sumSquares += channelData[j] * channelData[j]
    windows.push(Math.sqrt(sumSquares / (end - i)))
  }
  return windows
}

// Down/up-samples an envelope to a fixed number of buckets (bar-graph
// columns), independent of song length or window size, by averaging
// whichever source windows fall into each bucket's span.
export function resampleEnvelope(envelope, bucketCount) {
  if (envelope.length === 0) return new Array(bucketCount).fill(0)
  const bucketSize = envelope.length / bucketCount
  const buckets = []
  for (let b = 0; b < bucketCount; b++) {
    const start = Math.floor(b * bucketSize)
    const end = Math.max(start + 1, Math.floor((b + 1) * bucketSize))
    let sum = 0
    let count = 0
    for (let j = start; j < end && j < envelope.length; j++) { sum += envelope[j]; count++ }
    buckets.push(count > 0 ? sum / count : 0)
  }
  return buckets
}

// Scales a bucketed envelope to [0, 1] against ITS OWN peak, not an absolute
// loudness value — Demucs stem levels vary too much per track/mastering for
// a fixed scale to mean anything (this is display only, never a detection
// threshold, so per-stem relative scaling is exactly right here).
export function normalizeEnvelope(buckets) {
  const max = Math.max(0, ...buckets)
  if (max <= 0) return buckets.map(() => 0)
  return buckets.map(v => v / max)
}
