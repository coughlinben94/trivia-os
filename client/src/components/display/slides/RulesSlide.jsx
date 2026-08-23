import { useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { useTheme } from '../../shared/ThemeProvider.jsx'
import { EASE_OUT } from '../../../lib/easings.js'
import { analyzeAudioGain } from '../../../lib/audioNormalize.js'

// Fixed hazard-broadcast palette — like StateOfUnionSlide's locked RWB, this
// slide is an identity ("emergency bulletin"), not a themed moment, so it
// reads the same on all 21 ambient themes. Only the display font follows theme.
const WARN_BG   = '#050007'
const WARN_RED  = '#ff4d6d'
const WARN_TEXT = '#e8d0ff'

export const DEFAULT_RULES = [
  "This ain't just your mommas trivia....",
  'Teams up to 6 — extra players cost you points. 20 for the first extra, 10 each after.',
  'Whatever the quizmaster says, goes.',
  'Phones down. Cheating gets your phone thrown in the river.',
  "Have fun, and don't yell at me — I'm not a professional trivia writer!",
]

// Ben's chosen beep clip (public/rules-beep.mp3, ~1.62s) — played at 2×
// speed (2026-08-18, Ben: "cut in half... beginning and end are needed,
// should just be faster") so the full attack+decay survives, just
// compressed, rather than truncating the tail. Played three times back to
// back; the flash pulses further down are timed off this same effective
// duration so each flash lands on a beep, not against dead air.
const RULES_BEEP_SRC = '/rules-beep.mp3'
const RULES_BEEP_PLAYBACK_RATE = 2
export const RULES_BEEP_DURATION_S = 1.65 / RULES_BEEP_PLAYBACK_RATE

// Ben's recorded PSA line (public/rules-psa.mp3) — replaced the browser
// speechSynthesis attempt entirely (2026-08-18): TTS can't do a specific
// "manly and intimidating" voice, a real recording just is one.
const RULES_PSA_SRC = '/rules-psa.mp3'

// HTMLAudioElement.play() has non-deterministic startup latency (decode/
// buffer delay) — three separate `new Audio()` + setTimeout calls sounded
// "staggered weird" (2026-08-18, Ben) even though the delays themselves were
// exact. Web Audio's AudioBufferSourceNode.start(time) schedules on the
// audio clock instead of the JS event loop, so all three land exactly
// RULES_BEEP_DURATION_S apart with no jitter. Buffer is decoded once and
// cached module-level — safe to reuse across a remount (e.g. a Stream Deck
// back-then-forward) since the cleanup below cancels any in-flight sequence
// before a new one can start.
let cachedBeepBuffer = null
async function loadBeepBuffer(ctx) {
  if (cachedBeepBuffer) return cachedBeepBuffer
  const res = await fetch(RULES_BEEP_SRC)
  const arrayBuffer = await res.arrayBuffer()
  cachedBeepBuffer = await ctx.decodeAudioData(arrayBuffer)
  return cachedBeepBuffer
}

// Loudness normalization for this slide's two fixed audio assets (2026-08-19,
// Ben: uploaded clips play at wildly different perceived volume against each
// other). Reuses the same RMS analysis `SlideEditor.jsx` already runs on every
// user-uploaded audio file (`analyzeAudioGain`, live since 2026-06-25) — these
// two are static `public/` files rather than something uploaded through the
// app, so there's no upload-time hook to compute this at; done once here
// instead and cached module-level like the beep buffer above it. Returns a dB
// value that can be POSITIVE (a boost) as well as negative — `analyzeAudioGain`
// allows up to +12dB with a peak-ceiling guard against clipping, which a plain
// HTMLMediaElement.volume (hard-capped at 1.0/unity) can't apply; the PSA
// playback below routes through a real GainNode when gainDb is positive.
const gainDbCache = new Map()
async function loadGainDb(src) {
  if (gainDbCache.has(src)) return gainDbCache.get(src)
  const blob = await fetch(src).then(r => r.blob())
  const gainDb = await analyzeAudioGain(blob)
  gainDbCache.set(src, gainDb)
  return gainDb
}

// Fires `onAllBeepsEnded` off the LAST beep's real `onended` event, not a
// guessed duration — so whatever plays next is never racing an estimate.
async function playThreeBeeps(ctx, onAllBeepsEnded) {
  const [buffer, gainDb] = await Promise.all([loadBeepBuffer(ctx), loadGainDb(RULES_BEEP_SRC).catch(() => 0)])
  const gainNode = ctx.createGain()
  gainNode.gain.value = Math.pow(10, gainDb / 20)
  gainNode.connect(ctx.destination)
  const startAt = ctx.currentTime + 0.05 // small headroom so decode latency can't clip beep 1
  const sources = [0, 1, 2].map(i => {
    const src = ctx.createBufferSource()
    src.buffer = buffer
    src.playbackRate.value = RULES_BEEP_PLAYBACK_RATE
    src.connect(gainNode)
    src.start(startAt + i * RULES_BEEP_DURATION_S)
    return src
  })
  sources[sources.length - 1].onended = onAllBeepsEnded
}

// The strobe/flash must not stop — and the rules must not reveal — until the
// beeps AND the PSA clip have BOTH actually finished playing, not some
// estimated duration (2026-08-18, Ben: it was cutting away while the voice
// was still audible). Driven entirely off real `ended` events.
//
// `handles` (owned by the calling effect) is how a mid-sequence unmount gets
// cancelled: it holds the live AudioContext/PSA element so cleanup can
// ctx.close()/psa.pause() them, and a `cancelled` flag every callback below
// checks before touching React state or starting the next stage. Without
// this, a host advancing off this slide mid-beep leaves the beeps AND the
// 4s PSA clip playing in full over whatever slide comes next.
function playAlertSequence(onCinematicDone, handles) {
  try {
    const AC = window.AudioContext || window.webkitAudioContext
    const ctx = new AC()
    handles.ctx = ctx
    ctx.resume().catch(() => {}) // no-op if already running; recovers a cold-started suspended context
    playThreeBeeps(ctx, () => {
      if (handles.cancelled) return
      ctx.close().catch(() => {})
      // gainDb resolved BEFORE the Audio element is created/played, not
      // applied after — createMediaElementSource reroutes an element's
      // entire output through the Web Audio graph, so building that graph
      // mid-playback risks an audible glitch. The gain is cached after the
      // first show, so this await is only real latency once.
      loadGainDb(RULES_PSA_SRC).catch(() => 0).then(gainDb => {
        if (handles.cancelled) return
        const psa = new Audio(RULES_PSA_SRC)
        handles.psa = psa
        const finish = () => { if (!handles.cancelled) onCinematicDone() }
        psa.addEventListener('ended', finish, { once: true })
        psa.addEventListener('error', finish, { once: true })
        if (gainDb > 0) {
          // A boost needs a real gain node — .volume can't exceed 1.0/unity.
          try {
            const psaCtx = new AC()
            handles.psaCtx = psaCtx
            // Missing resume() (caught by Opus review) meant a context that
            // starts suspended — the normal state with no prior user
            // gesture on this document, exactly the /display-loaded-cold
            // case — left createMediaElementSource's rerouted output
            // silent: the element's `ended` event still fires on schedule,
            // the slide still reveals on time, nothing errors, the PSA just
            // never plays. The beep sequence above already resumes its own
            // context (line ~110) — this one needs the same.
            psaCtx.resume().catch(() => {})
            const src = psaCtx.createMediaElementSource(psa)
            const gainNode = psaCtx.createGain()
            gainNode.gain.value = Math.pow(10, gainDb / 20)
            src.connect(gainNode)
            gainNode.connect(psaCtx.destination)
          } catch { /* graph failed to build — falls through, plays at raw level */ }
        } else {
          psa.volume = Math.max(0, Math.min(1, Math.pow(10, gainDb / 20)))
        }
        psa.play().catch(finish)
      })
    }).catch(() => { if (!handles.cancelled) onCinematicDone() })
  } catch {
    if (!handles.cancelled) onCinematicDone() // AudioContext unavailable — reveal content anyway
  }
}

export default function RulesSlide({ slide, isPreview }) {
  const { theme } = useTheme()
  const reduce = useReducedMotion()
  const { data } = slide
  const rules = data?.rules?.length ? data.rules : DEFAULT_RULES
  const title = data?.title || 'House Rules — Read Carefully'
  const firedRef = useRef(false)
  // Screen keeps strobing for the WHOLE cinematic phase — beeps AND the
  // spoken PSA line (2026-08-18, Ben: it was going dark and static during
  // the voice line, needed to keep flashing the entire time). Content only
  // reveals once playAlertSequence's real audio-ended callback fires — never
  // a guessed duration, so it can't race ahead of what's still playing.
  const skipAlert = reduce || isPreview // isPreview: the host's build-mode editor/preview tab shouldn't blast beeps+PSA
  const [alerting, setAlerting] = useState(!skipAlert)
  const [contentReady, setContentReady] = useState(skipAlert)

  // Fire once per time this slide becomes current, not on every re-render.
  useEffect(() => {
    if (skipAlert || firedRef.current) return
    firedRef.current = true

    const handles = { cancelled: false, ctx: null, psa: null }
    const reveal = () => { setAlerting(false); setContentReady(true) }
    // Watchdog: a suspended AudioContext (no prior user gesture) never
    // advances its clock, so scheduled sources never fire `onended`; a
    // stalled PSA download on bar wifi fires neither `ended` nor `error`.
    // Either leaves the screen strobing red forever with rules never
    // revealed. Same fix WinnerRevealSlide.jsx already uses for its own
    // "audio might never end" case.
    const watchdog = setTimeout(() => { if (!handles.cancelled) reveal() }, 12000)

    playAlertSequence(() => { clearTimeout(watchdog); reveal() }, handles)

    return () => {
      handles.cancelled = true
      clearTimeout(watchdog)
      handles.ctx?.close().catch(() => {})
      handles.psaCtx?.close().catch(() => {})
      handles.psa?.pause()
    }
  }, [skipAlert])

  return (
    <div
      className="absolute inset-0 flex flex-col overflow-hidden"
      style={{ background: WARN_BG }}
    >
      {/* CRT scanlines */}
      <div aria-hidden style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1, mixBlendMode: 'overlay',
        background: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.05) 0px, rgba(255,255,255,0.05) 1px, transparent 1px, transparent 3px)',
      }} />

      {/* Continuous strobe — covers the whole cinematic phase (beeps + PSA
          voice), so the screen stays alive with sound during the spoken
          line instead of going dark and static. */}
      {alerting && (
        <div aria-hidden style={{
          position: 'absolute', inset: 0, zIndex: 4, pointerEvents: 'none',
          background: WARN_RED,
          animation: 'rulesStrobe 480ms ease-in-out infinite',
        }} />
      )}

      {/* Three sharper punctuation flashes, one per beep, timed to RULES_BEEP_DURATION_S */}
      {!reduce && [0, 1, 2].map(i => (
        <div key={i} aria-hidden style={{
          position: 'absolute', inset: 0, zIndex: 5, pointerEvents: 'none',
          background: WARN_RED,
          animation: 'rulesFlashPulse 300ms ease-out forwards',
          animationDelay: `${i * RULES_BEEP_DURATION_S * 1000}ms`,
        }} />
      ))}
      <style>{`
        @keyframes rulesFlashPulse { 0%{opacity:0;} 22%{opacity:0.88;} 60%{opacity:0;} 100%{opacity:0;} }
        @keyframes rulesStrobe { 0%,100%{opacity:0.12;} 50%{opacity:0.5;} }
      `}</style>

      {/* Hazard-stripe header */}
      <div style={{
        position: 'relative', zIndex: 2, flexShrink: 0,
        background: 'repeating-linear-gradient(135deg, #ff4d6d 0 22px, #1a0004 22px 44px)',
        padding: '1.6% 0', display: 'flex', justifyContent: 'center',
      }}>
        <motion.span
          initial={{ opacity: 0, y: reduce ? 0 : -10 }}
          animate={contentReady ? { opacity: 1, y: 0 } : { opacity: 0, y: reduce ? 0 : -10 }}
          transition={{ duration: 0.3, ease: EASE_OUT }}
          style={{
            background: '#050007', padding: '0.4em 1.4em', borderRadius: 4,
            fontFamily: `'${theme.fonts.display}', sans-serif`,
            letterSpacing: '0.02em', color: '#fff',
            fontSize: 'clamp(1.8rem, 4.5vw, 3.2rem)',
          }}
        >
          {title}
        </motion.span>
      </div>

      {/* Rules — type on one at a time */}
      <div style={{ position: 'relative', zIndex: 2, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '2.6%', padding: '0 9%' }}>
        {rules.map((rule, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: reduce ? 0 : 18 }}
            animate={contentReady ? { opacity: 1, y: 0 } : { opacity: 0, y: reduce ? 0 : 18 }}
            transition={{ duration: 0.35, ease: EASE_OUT, delay: reduce ? 0 : 0.4 + i * 0.4 }}
            style={{ display: 'flex', gap: '1.1rem', alignItems: 'baseline' }}
          >
            <span style={{
              fontFamily: `'${theme.fonts.display}', sans-serif`,
              color: WARN_RED, fontSize: 'clamp(1.8rem, 4vw, 2.7rem)', flexShrink: 0, width: '2ch',
            }}>
              {String(i + 1).padStart(2, '0')}
            </span>
            <span style={{
              color: WARN_TEXT, fontSize: 'clamp(1.8rem, 3.8vw, 2.6rem)', lineHeight: 1.35, fontWeight: 500,
              fontFamily: "'DM Sans', sans-serif",
            }}>
              {rule}
            </span>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
