// "Time's up" sound for the host timer, synthesized with Web Audio so there is no
// file to ship or load: three bright two-tone dings, about 1.6s, loud enough for
// a bar. One shared AudioContext; every function is safe to call and never throws
// into the live TV.
let ctx = null

function getCtx() {
  if (ctx) return ctx
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext
  if (!AC) return null
  try { ctx = new AC() } catch { ctx = null }
  return ctx
}

// Call from a real click/key so Chrome lets the context run later, when no
// gesture is happening (the timer rings on its own).
export function unlockTimerAudio() {
  try { getCtx()?.resume?.() } catch { /* ignore */ }
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

// Resolves true if the chime was scheduled on a running context, false if the
// browser kept the context suspended (autoplay block) or audio is unavailable.
export async function playTimerChime() {
  try {
    const ac = getCtx()
    if (!ac) return false
    if (ac.state !== 'running') {
      // Without a gesture resume() can hang forever, so only wait a moment for it
      // (1.5s: a busy TV tab can take a while to resume, and giving up early shows
      // the click-for-sound cue on a context that is about to run).
      await Promise.race([ac.resume(), new Promise(r => setTimeout(r, 1500))])
    }
    if (ac.state !== 'running') return false
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
