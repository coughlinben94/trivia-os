// "Time's up" sound for the host timer, synthesized with Web Audio so there is no
// file to ship or load: three bright two-tone dings, about 1.6s, loud enough for
// a bar. On the audio director's shared AudioContext; every function is safe to call and
// never throws into the live TV.
import { director } from '../audio/director.js'

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

// Resolves true if the chime was scheduled on a running context, false if the browser kept
// the context suspended (autoplay block, reported once by the director) or audio is
// unavailable. The overlay shows its own "Click for sound" on false.
export async function playTimerChime() {
  try {
    const ac = await director.audioContext({ label: 'timer chime', waitMs: 400 })
    if (!ac) return false
    const t0 = ac.currentTime + 0.05
    for (let i = 0; i < 3; i++) {
      ding(ac, t0 + i * 0.55, 880)
      ding(ac, t0 + i * 0.55 + 0.16, 1175)
    }
    return true
  } catch {
    return false
  }
}
