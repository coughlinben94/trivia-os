// "Time's up" sound for the host timer: the same three beeps that open the rules slide
// (public/rules-beep.mp3, played three times back to back at 2x speed with the same loudness
// boost), so the room hears one familiar "attention" sound. Played on the audio director's
// shared AudioContext. If the clip cannot be loaded (an offline TV) it falls back to three
// synthesized two-tone dings, so there is always a sound. Every function is safe to call and
// never throws into the live TV.
import { director } from '../audio/director.js'
import { analyzeAudioGain } from './audioNormalize.js'

// Kept in step with RulesSlide.jsx (RULES_BEEP_SRC / RULES_BEEP_PLAYBACK_RATE / RULES_BEEP_DURATION_S).
export const TIMER_BEEP_SRC = '/rules-beep.mp3'
const BEEP_RATE = 2
const BEEP_STEP_S = 1.65 / BEEP_RATE // the 1.62s clip at 2x, plus a hair, like the rules slide
const BEEP_HEADROOM_S = 0.05 // so decode latency cannot clip beep 1

// One fetch of the clip, shared by the loudness analysis and the decode. Cached for the page's life.
let clipPromise = null
function loadClip() {
  if (!clipPromise) {
    clipPromise = (async () => {
      const res = await fetch(TIMER_BEEP_SRC)
      if (res && res.ok === false) throw new Error(`beep clip ${res.status}`)
      const blob = await res.blob()
      const gainDb = await analyzeAudioGain(blob).catch(() => 0)
      return { blob, gainDb }
    })().catch(err => { clipPromise = null; throw err }) // a failed load is retried next time
  }
  return clipPromise
}

// Decoded once per AudioContext (the director keeps one for the page's life).
let decoded = null // { ac, buffer }
async function decodeFor(ac, blob) {
  if (decoded?.ac === ac) return decoded.buffer
  const buffer = await ac.decodeAudioData(await blob.arrayBuffer())
  decoded = { ac, buffer }
  return buffer
}

// Fetch the clip ahead of time (the overlay calls this when a timer starts) so the chime is not
// waiting on the network at zero. Never throws.
export async function warmTimerChime() {
  try { await loadClip() } catch { /* the chime falls back to the dings */ }
}

// Test seam.
export function resetTimerChimeCache() { clipPromise = null; decoded = null }

// Call from a real click/key so Chrome lets the shared context run later, when no gesture is
// happening (the timer rings on its own).
export function unlockTimerAudio() {
  try { director.unlock() } catch { /* ignore */ }
}

function ding(ac, at, freq) {
  for (const [mult, peak] of [[1, 0.5], [2, 0.18]]) { // note + octave overtone
    const osc = ac.createOscillator()
    const gain = ac.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq * mult
    gain.gain.setValueAtTime(0.0001, at)
    gain.gain.exponentialRampToValueAtTime(peak, at + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.42)
    osc.connect(gain).connect(ac.destination)
    osc.start(at)
    osc.stop(at + 0.45)
  }
}

function synthChime(ac) {
  const t0 = ac.currentTime + 0.05
  for (let i = 0; i < 3; i++) {
    ding(ac, t0 + i * 0.55, 880)
    ding(ac, t0 + i * 0.55 + 0.16, 1175)
  }
}

// Resolves true if the chime was scheduled on a running context, false if the browser kept
// the context suspended (autoplay block, reported once by the director) or audio is
// unavailable. The overlay shows its own "Click for sound" on false.
export async function playTimerChime() {
  try {
    const ac = await director.audioContext({ label: 'timer chime', waitMs: 1500 }) // 1.5s: a busy TV tab can take a while to resume; giving up early shows the cue on a context about to run
    if (!ac) return false
    try {
      const { blob, gainDb } = await loadClip()
      const buffer = await decodeFor(ac, blob)
      const gainNode = ac.createGain()
      gainNode.gain.value = Math.pow(10, gainDb / 20)
      gainNode.connect(ac.destination)
      const startAt = ac.currentTime + BEEP_HEADROOM_S
      for (let i = 0; i < 3; i++) {
        const src = ac.createBufferSource()
        src.buffer = buffer
        src.playbackRate.value = BEEP_RATE
        src.connect(gainNode)
        src.start(startAt + i * BEEP_STEP_S)
      }
    } catch {
      synthChime(ac) // clip unavailable or undecodable: still ring
    }
    return true
  } catch {
    return false
  }
}
