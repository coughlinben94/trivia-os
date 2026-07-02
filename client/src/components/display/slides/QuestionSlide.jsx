import { useState, useRef, useEffect } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { useTheme } from '../../shared/ThemeProvider.jsx'
import WaveformBars from '../WaveformBars.jsx'
import SlideElements from '../SlideElements.jsx'
import { resolveShinyPart, isVisualShiny, isAudioShiny } from '../../../lib/shinySeries.js'

const EASE_SNAP = [0.23, 1, 0.32, 1]
const EASE_ASSEMBLE = [0.22, 1, 0.36, 1]

// ─── Standard question ────────────────────────────────────────────────────────

function StandardQuestion({ slide, show, theme, transitionKey }) {
  const { data } = slide
  const part = resolveShinyPart(data)
  const hasSeries = data.isSeries && data.seriesTheme
  const isAssemble = transitionKey === 'assemble'

  const banner = isAssemble
    ? { initial: { opacity: 0, y: -40 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.42, delay: 0.04, ease: EASE_ASSEMBLE } }
    : { initial: { opacity: 0, y: -12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.2, ease: EASE_SNAP } }
  const question = isAssemble
    ? { initial: { opacity: 0, y: 30, scale: 0.97 }, animate: { opacity: 1, y: 0, scale: 1 }, transition: { duration: 0.46, delay: 0.22, ease: EASE_ASSEMBLE } }
    : { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.22, ease: [0.23, 1, 0.32, 1], delay: 0.18 } }
  const photo = isAssemble
    ? { initial: { opacity: 0, scale: 0.8 }, animate: { opacity: 0.7, scale: 1 }, transition: { duration: 0.4, delay: 0.31, ease: EASE_ASSEMBLE } }
    : { initial: { opacity: 0 }, animate: { opacity: 0.7 }, transition: { delay: 0.2, duration: 0.4 } }

  return (
    <div
      className="w-full h-full relative overflow-hidden"
      style={{ background: 'transparent' }}
    >
      {/* Reading-well — soft radial darken behind text center */}
      <div aria-hidden style={{
        position: 'absolute', inset: 0, zIndex: 18, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 56% 46% at 50% 52%, rgba(0,0,0,0.40) 0%, rgba(0,0,0,0.20) 45%, transparent 72%)',
      }} />

      {/* Series banner — top */}
      {hasSeries && (
        <motion.div
          initial={banner.initial}
          animate={banner.animate}
          transition={banner.transition}
          className="absolute top-0 left-0 right-0 py-3 px-10 text-center z-[30]"
          style={{ background: theme.colors.accent }}
        >
          <span
            style={{
              fontFamily: `'${theme.fonts.display}', sans-serif`,
              color: theme.colors.highlight,
              fontSize: '0.9rem',
              fontWeight: 700,
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
            }}
          >
            {data.seriesTheme}
          </span>
          {part.subtitle && (
            <span
              style={{
                display: 'block',
                fontFamily: `'${theme.fonts.ui}', 'Inter', sans-serif`,
                color: theme.colors.text,
                fontSize: '0.7rem',
                fontWeight: 500,
                letterSpacing: '0.08em',
                marginTop: 2,
              }}
            >
              {part.subtitle}
            </span>
          )}
        </motion.div>
      )}

      {/* Question text — large, centered — Section 23 */}
      <motion.div
        initial={question.initial}
        animate={question.animate}
        transition={question.transition}
        className="absolute inset-0 flex items-center justify-center px-24 py-20 z-[30]"
      >
        <p
          className="text-center leading-relaxed"
          style={{
            color: theme.colors.text,
            fontFamily: `'${theme.fonts.body}', 'Inter', sans-serif`,
            fontSize: 'clamp(2rem, 4.5vw, 4.5rem)',
            fontWeight: 500,
            maxWidth: '80ch',
            textShadow: '0 2px 18px rgba(0,0,0,0.85), 0 1px 4px rgba(0,0,0,0.6)',
          }}
        >
          {part.text}
        </p>
      </motion.div>

      {/* Host photo — bottom-right, subtle */}
      {data.hostPhotoUrl && (
        <motion.div
          initial={photo.initial}
          animate={photo.animate}
          transition={photo.transition}
          className="absolute bottom-20 right-10 pointer-events-none z-[30]"
        >
          <img
            src={data.hostPhotoUrl}
            alt=""
            style={{ height: 160, objectFit: 'contain', filter: 'drop-shadow(0 4px 16px rgba(0,0,0,0.5))' }}
          />
        </motion.div>
      )}

      <div className="absolute inset-0" style={{ zIndex: 35 }}>
        <SlideElements elements={data.elements} theme={theme} />
      </div>
    </div>
  )
}

// ─── Shiny visual question ────────────────────────────────────────────────────

function ShinyVisualQuestion({ slide, theme }) {
  const { data } = slide
  const part = resolveShinyPart(data)
  const [aspect, setAspect] = useState(null) // 'landscape' | 'portrait' | 'square'
  const [flashVisible, setFlashVisible] = useState(true)

  useEffect(() => {
    // Flash clears after the CSS animation completes — Section 20.
    // Re-fires on currentPart too: a multi-part series keeps the same
    // slide.id across parts, only currentPart changes as the host advances.
    setFlashVisible(true)
    const t = setTimeout(() => setFlashVisible(false), 250)
    return () => clearTimeout(t)
  }, [slide.id, data.currentPart])

  function handleImageLoad(e) {
    const { naturalWidth: w, naturalHeight: h } = e.target
    if (w > h * 1.25) setAspect('landscape')
    else if (h > w * 1.25) setAspect('portrait')
    else setAspect('square')
  }

  const isPortrait = aspect === 'portrait'

  return (
    <div className="w-full h-full relative overflow-hidden" style={{ background: theme.colors.shinyBg }}>
      {/* White flash — Section 20: 1 frame, CSS not JS */}
      {flashVisible && <div className="shiny-flash absolute inset-0 z-50 bg-white" />}

      {/* Gold glow burst — CSS, off main thread */}
      <div
        className="absolute inset-0 pointer-events-none z-10"
        style={{
          background: `radial-gradient(ellipse at center, ${theme.colors.shinyAccent}38 0%, transparent 55%)`,
          animation: 'shinyGlow 0.7s ease-out forwards',
        }}
      />

      {/* Series theme + subtitle — top overlay */}
      {data.isSeries && data.seriesTheme && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, duration: 0.22, ease: EASE_SNAP }}
          className="absolute top-0 left-0 right-0 py-3 px-10 text-center z-30"
          style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.6), transparent)' }}
        >
          <p
            style={{
              color: '#f5f0e8',
              fontFamily: `'${theme.fonts.ui}', 'Inter', system-ui, sans-serif`,
              fontSize: '0.85rem',
              fontWeight: 700,
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
            }}
          >
            {data.seriesTheme}
          </p>
          {part.subtitle && (
            <p
              style={{
                color: '#f5f0e8',
                fontFamily: `'${theme.fonts.ui}', 'Inter', sans-serif`,
                fontSize: '1rem',
                fontWeight: 600,
                marginTop: 2,
              }}
            >
              {part.subtitle}
            </p>
          )}
        </motion.div>
      )}

      {isPortrait ? (
        /* Portrait: image left 50%, text right 50% — Section 14 */
        <div className="w-full h-full flex">
          <motion.div
            className="w-1/2 h-full overflow-hidden"
            initial={{ scale: 1.08, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.05, duration: 0.28, ease: EASE_SNAP }}
          >
            <img
              src={part.mediaUrl}
              onLoad={handleImageLoad}
              alt=""
              className="w-full h-full object-cover"
            />
          </motion.div>
          <motion.div
            className="w-1/2 h-full flex items-center justify-center px-12"
            initial={{ x: 24, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.18, duration: 0.28, ease: EASE_SNAP }}
          >
            <p
              className="text-center leading-relaxed"
              style={{
                color: theme.colors.text,
                fontFamily: `'${theme.fonts.body}', 'Inter', sans-serif`,
                fontSize: 'clamp(1.75rem, 3.5vw, 3.5rem)',
                fontWeight: 500,
              }}
            >
              {part.text}
            </p>
          </motion.div>
        </div>
      ) : (
        /* Landscape / square: full bleed + gradient scrim — Section 14 */
        <>
          <motion.img
            src={part.mediaUrl}
            onLoad={handleImageLoad}
            alt=""
            className="w-full h-full object-cover"
            initial={{ scale: 1.08, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.05, duration: 0.28, ease: EASE_SNAP }}
          />
          <motion.div
            className="absolute bottom-0 left-0 right-0"
            style={{
              background: 'linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.4) 50%, transparent 100%)',
              paddingBottom: 64,
              paddingTop: 120,
              paddingLeft: 64,
              paddingRight: 64,
            }}
            initial={{ y: 32, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.15, duration: 0.22, ease: EASE_SNAP }}
          >
            <p
              className="text-center leading-snug"
              style={{
                color: '#f5f0e8',
                fontFamily: `'${theme.fonts.body}', 'Inter', sans-serif`,
                fontSize: 'clamp(1.75rem, 3.5vw, 3.5rem)',
                fontWeight: 500,
              }}
            >
              {part.text}
            </p>
          </motion.div>
        </>
      )}

      {/* ✨ indicator badge — top-left */}
      <div
        className="absolute top-5 left-5 z-20 text-2xl"
        style={{ filter: `drop-shadow(0 0 8px ${theme.colors.shinyAccent})` }}
      >
        ✨
      </div>

      <div className="absolute inset-0" style={{ zIndex: 25 }}>
        <SlideElements elements={data.elements} theme={theme} />
      </div>
    </div>
  )
}

// ─── Shiny audio question ─────────────────────────────────────────────────────

function ShinyAudioQuestion({ slide, show, theme }) {
  const { data } = slide
  const part = resolveShinyPart(data)
  const [playing, setPlaying] = useState(false)
  const audioRef = useRef(null)
  const audioCtxRef = useRef(null)

  useEffect(() => {
    return () => { audioCtxRef.current?.close() }
  }, [])

  // A multi-part series keeps the same slide.id across parts — reset
  // playback state when the host advances to a different clip.
  useEffect(() => {
    setPlaying(false)
    audioRef.current?.pause()
  }, [slide.id, data.currentPart])

  function ensureAudioGraph() {
    if (!audioRef.current || audioCtxRef.current) return audioCtxRef.current
    const ctx = new AudioContext()
    const src = ctx.createMediaElementSource(audioRef.current)
    const gainNode = ctx.createGain()
    gainNode.gain.value = Math.pow(10, (data.audioGainDb ?? 0) / 20)
    src.connect(gainNode)
    gainNode.connect(ctx.destination)
    audioCtxRef.current = ctx
    return ctx
  }

  async function playWithGain() {
    const ctx = ensureAudioGraph()
    if (ctx?.state === 'suspended') await ctx.resume()
    await audioRef.current.play()
    setPlaying(true)
  }

  // React to show.audio_playing from Supabase (wired in step 5 Live Mode)
  useEffect(() => {
    const ap = show?.audio_playing
    if (ap?.slideId === slide.id && ap?.playing && audioRef.current) {
      playWithGain().catch(() => {})
    }
  }, [show?.audio_playing, slide.id])

  return (
    <div
      className="w-full h-full relative flex flex-col items-center justify-center gap-10 overflow-hidden"
      style={{ background: theme.colors.shinyBg }}
    >
      {/* Background glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse 70% 60% at 50% 50%, ${theme.colors.shinyAccent}18 0%, transparent 65%)`,
        }}
      />

      {/* Series theme label */}
      {data.isSeries && data.seriesTheme && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, duration: 0.22, ease: EASE_SNAP }}
          className="text-center"
        >
          <p
            style={{
              color: theme.colors.textMuted,
              fontFamily: `'${theme.fonts.ui}', 'Inter', system-ui, sans-serif`,
              fontSize: '0.85rem',
              fontWeight: 700,
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
            }}
          >
            {data.seriesTheme}
          </p>
          {part.subtitle && (
            <p
              style={{
                color: theme.colors.text,
                fontFamily: `'${theme.fonts.ui}', 'Inter', sans-serif`,
                fontSize: '1rem',
                fontWeight: 600,
                marginTop: 4,
              }}
            >
              {part.subtitle}
            </p>
          )}
        </motion.div>
      )}

      {/* Question number/label */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.06, duration: 0.22, ease: EASE_SNAP }}
        className="relative z-10 text-center"
      >
        <p
          style={{
            fontFamily: `'${theme.fonts.display}', sans-serif`,
            color: theme.colors.text,
            fontSize: 'clamp(3rem, 8vw, 6rem)',
            fontWeight: 700,
            lineHeight: 1,
          }}
        >
          {data.questionLabel ?? data.questionNumber}
        </p>
        {part.text && (
          <p className="mt-3" style={{ color: theme.colors.textMuted, fontSize: '1.5rem' }}>
            {part.text}
          </p>
        )}
      </motion.div>

      {/* Waveform — CSS, Section 20 */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15, duration: 0.3 }}
      >
        <WaveformBars theme={theme} playing={playing} />
      </motion.div>

      {/* Play button — shown but host controls audio via Live Mode */}
      {part.mediaUrl && (
        <>
          <audio
            ref={audioRef}
            src={part.mediaUrl}
            onEnded={() => setPlaying(false)}
            preload="auto"
          />
          <motion.div
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.25, ease: EASE_SNAP }}
            className="relative z-10"
          >
            <div
              className="w-24 h-24 rounded-full flex items-center justify-center cursor-pointer"
              onClick={() => {
                if (playing) {
                  audioRef.current?.pause(); setPlaying(false)
                } else {
                  playWithGain()
                }
              }}
              style={{
                background: theme.colors.accent,
                boxShadow: playing ? 'none' : `0 0 40px ${theme.colors.shinyAccent}50`,
                animation: playing ? 'none' : 'playPulse 2.4s ease-in-out infinite',
              }}
            >
              <span style={{ color: theme.colors.shinyAccent, fontSize: '2.5rem', marginLeft: playing ? 0 : 4 }}>
                {playing ? '⏸' : '▶'}
              </span>
            </div>
          </motion.div>
        </>
      )}

      <div className="absolute inset-0" style={{ zIndex: 25 }}>
        <SlideElements elements={data.elements} theme={theme} />
      </div>
    </div>
  )
}

// ─── Shiny intro screen ────────────────────────────────────────────────────────
//
// Every shiny question gets a standalone beat before its content — a pure
// announcement, no question/answer/media yet, giving the host room to set
// up what's coming. Modeled on the deck's yellow "shiny round title card"
// slides (tilted handwritten-style title, Ben photo lower-left, format icon
// lower-right) but reworked to fit the app's per-show theme system instead
// of a hardcoded color, and to stay ambient rather than full-bleed — the
// ParticleBackground mounted behind every slide (Display.jsx) should still
// read through around the edges, not get covered by a flat color block.

function ShinyIntroScreen({ slide, theme }) {
  const { data } = slide
  const reduce = useReducedMotion()
  const title = data.seriesTheme || data.shinyFormatName || 'Shiny Question'
  const icon = data.shinyFormatIcon || '✨'

  return (
    <div className="w-full h-full relative overflow-hidden flex items-center justify-center">
      {/* Sunrise glow — theme-colored wash, not a full-screen fill, so the
          ambient background still shows through around the edges. */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse 85% 65% at 50% 62%, ${theme.colors.highlight}4d 0%, ${theme.colors.highlight}22 38%, transparent 72%)`,
        }}
      />

      {/* Host photo — lower-left */}
      {data.hostPhotoUrl && (
        <motion.img
          src={data.hostPhotoUrl}
          alt=""
          initial={{ opacity: 0, x: reduce ? 0 : -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.15, duration: 0.4, ease: EASE_SNAP }}
          className="absolute bottom-0 left-0 z-10 pointer-events-none"
          style={{ height: '56%', objectFit: 'contain', filter: 'drop-shadow(0 8px 20px rgba(0,0,0,0.4))' }}
        />
      )}

      {/* Format icon badge — lower-right */}
      <motion.div
        initial={{ opacity: 0, scale: reduce ? 1 : 0.7, rotate: reduce ? 0 : -8 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        transition={{ delay: 0.3, duration: 0.4, ease: EASE_SNAP }}
        className="absolute bottom-10 right-10 z-10 flex items-center justify-center rounded-3xl"
        style={{
          width: 128, height: 128,
          background: theme.colors.bgDeep,
          boxShadow: `0 10px 30px rgba(0,0,0,0.4), 0 0 0 2px ${theme.colors.highlight}55`,
        }}
      >
        <span style={{ fontSize: '3.5rem' }}>{icon}</span>
      </motion.div>

      {/* Title — big, tilted, marker-style */}
      <motion.p
        initial={{ opacity: 0, scale: reduce ? 1 : 0.85, rotate: reduce ? -6 : -14 }}
        animate={{ opacity: 1, scale: 1, rotate: -6 }}
        transition={reduce ? { duration: 0.3, ease: EASE_SNAP } : { type: 'spring', duration: 0.5, bounce: 0.25 }}
        className="relative z-10 text-center px-20"
        style={{
          fontFamily: `'${theme.fonts.display}', sans-serif`,
          color: theme.colors.text,
          fontSize: 'clamp(2.75rem, 6.5vw, 6rem)',
          fontWeight: 700,
          lineHeight: 1.08,
          textShadow: `0 3px 0 rgba(0,0,0,0.25), 0 2px 24px ${theme.colors.highlight}80`,
        }}
      >
        {title}
      </motion.p>
    </div>
  )
}

// ─── Main dispatcher ──────────────────────────────────────────────────────────

export default function QuestionSlide({ slide, show, transitionKey }) {
  const { theme } = useTheme()
  const { data } = slide

  if (data.isShiny && !data.introDone) {
    return <ShinyIntroScreen slide={slide} theme={theme} />
  }

  const part = resolveShinyPart(data)

  if (data.isShiny && isVisualShiny(data) && part.mediaUrl) {
    return <ShinyVisualQuestion slide={slide} theme={theme} show={show} />
  }
  if (data.isShiny && isAudioShiny(data)) {
    return <ShinyAudioQuestion slide={slide} theme={theme} show={show} />
  }
  return <StandardQuestion slide={slide} theme={theme} show={show} transitionKey={transitionKey} />
}
