const TARGET_RMS_DB = -20
const PEAK_CEILING_DB = -1
const GAIN_MIN_DB = -12
const GAIN_MAX_DB = 12

export async function analyzeAudioGain(file) {
  try {
    const arrayBuffer = await file.arrayBuffer()
    const ctx = new AudioContext()
    let audioBuffer
    try {
      audioBuffer = await ctx.decodeAudioData(arrayBuffer)
    } finally {
      ctx.close()
    }

    let sumSquares = 0
    let totalSamples = 0
    let peak = 0

    for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
      const samples = audioBuffer.getChannelData(ch)
      for (let i = 0; i < samples.length; i++) {
        const s = samples[i]
        sumSquares += s * s
        const abs = Math.abs(s)
        if (abs > peak) peak = abs
      }
      totalSamples += samples.length
    }

    if (totalSamples === 0 || peak === 0) return 0

    const rms = Math.sqrt(sumSquares / totalSamples)
    if (rms === 0) return 0

    const rmsDb = 20 * Math.log10(rms)
    const peakDb = 20 * Math.log10(peak)

    let gainDb = TARGET_RMS_DB - rmsDb

    // Peak guard: post-gain peak must not exceed ceiling
    if (peakDb + gainDb > PEAK_CEILING_DB) {
      gainDb = PEAK_CEILING_DB - peakDb
    }

    gainDb = Math.max(GAIN_MIN_DB, Math.min(GAIN_MAX_DB, gainDb))
    return Math.round(gainDb * 100) / 100
  } catch {
    return 0
  }
}
