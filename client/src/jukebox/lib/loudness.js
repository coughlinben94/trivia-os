import { GAIN_DB_MAX, GAIN_DB_MIN } from './track.js'

export function offsetFromLufs(measuredLufs, targetLufs = -18) {
  if (!Number.isFinite(measuredLufs) || !Number.isFinite(targetLufs)) return 0
  const offset = Math.max(GAIN_DB_MIN, Math.min(GAIN_DB_MAX, targetLufs - measuredLufs))
  return Math.round(offset * 10) / 10
}

export function validateMeasurement({ frames, nonZeroFrames, sampleRate, peak, lufs } = {}) {
  if (!Number.isFinite(frames) || !Number.isFinite(sampleRate) || sampleRate <= 0 || frames / sampleRate < 20) {
    return { ok: false, reason: 'too-short' }
  }
  if (!Number.isFinite(nonZeroFrames) || nonZeroFrames / frames < 0.9) {
    return { ok: false, reason: 'too-silent' }
  }
  if (!Number.isFinite(lufs) || lufs < -50 || lufs > 0) {
    return { ok: false, reason: 'invalid-lufs' }
  }
  return { ok: true, reason: null }
}

export function chooseTarget(lufsList, { masterVolume = 0.8 } = {}) {
  const lufs = lufsList.filter(Number.isFinite).sort((a, b) => a - b)
  const headroomDb = masterVolume > 0 && Number.isFinite(masterVolume)
    ? Math.max(0, 20 * Math.log10(1 / masterVolume))
    : 0
  if (!lufs.length) return { targetLufs: -18, headroomDb, clippedQuietCount: 0 }

  const quietCount = Math.max(1, Math.ceil(lufs.length * 0.1))
  const quietest = lufs.slice(0, quietCount)
  const desiredTarget = Math.min(-18, quietest[0] + headroomDb)
  const targetLufs = Math.round(Math.max(-24, Math.min(-14, desiredTarget)) * 10) / 10
  const clippedQuietCount = quietest.filter(value => targetLufs - value > headroomDb + 0.05).length
  return { targetLufs, headroomDb, clippedQuietCount }
}
