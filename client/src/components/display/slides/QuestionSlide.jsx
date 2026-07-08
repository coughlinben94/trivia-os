import { useState, useRef, useEffect } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { useTheme } from '../../shared/ThemeProvider.jsx'
import WaveformBars from '../WaveformBars.jsx'
import ShinyIntroScreen from '../ShinyIntroScreen.jsx'
import { resolveShinyPart, isVisualShiny, isAudioShiny, isListShiny, isVideoShiny } from '../../../lib/shinySeries.js'
import { fitToBox, QUESTION_BOX, useFitToBox, useFitListToBox, LIST_ITEM_FLOOR, LIST_ITEM_CEIL, VISUAL_CAPTION_FLOOR, VISUAL_CAPTION_CEIL } from '../../../lib/autoFitText.js'
import { EASE_OUT } from '../../../lib/easings.js'
import { SHINY_GOLD, SHINY_GOLD_GLOW } from '../../../lib/shinyGold.js'
import { youtubeEmbedUrl } from '../../../lib/youtube.js'

// ─── Standard question ────────────────────────────────────────────────────────

function StandardQuestion({ slide, show, theme, transitionKey }) {
  const { data } = slide
  const part = resolveShinyPart(data)
  const rt = data._regionTransforms ?? {}
  const xf = id => { const t = rt[id]; return t ? { transform: `translate(${t.dx??0}px,${t.dy??0}px) rotate(${t.rotate??0}deg)`, transformOrigin: 'center', display: 'inline-block' } : {} }
  const hasSeries = data.isSeries && data.seriesTheme
  const isAssemble = transitionKey === 'assemble'

  // fitToBox measures via canvas — a first paint before the body font loads
  // measures fallback-font metrics. This flips once web fonts are ready purely
  // to force the re-render that re-runs the inline fitToBox call below with
  // real glyph metrics; the value itself is never read.
  const [fontsReady, setFontsReady] = useState(false)
  useEffect(() => { document.fonts.ready.then(() => setFontsReady(true)) }, [])

  const banner = isAssemble
    ? { initial: { opacity: 0, y: -40 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.42, delay: 0.04, ease: EASE_OUT } }
    : { initial: { opacity: 0, y: -12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.2, ease: EASE_OUT } }
  const question = isAssemble
    ? { initial: { opacity: 0, y: 30, scale: 0.97 }, animate: { opacity: 1, y: 0, scale: 1 }, transition: { duration: 0.46, delay: 0.22, ease: EASE_OUT } }
    : { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.22, ease: EASE_OUT, delay: 0.18 } }
  const photo = isAssemble
    ? { initial: { opacity: 0, scale: 0.8 }, animate: { opacity: 0.7, scale: 1 }, transition: { duration: 0.4, delay: 0.31, ease: EASE_OUT } }
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
        <span data-slide-region="text" data-slide-field="text" style={xf('text')}>
          <p
            className="text-center leading-relaxed"
            style={{
              color: theme.colors.text,
              fontFamily: `'${theme.fonts.body}', 'Inter', sans-serif`,
              fontSize: fitToBox(part.text, { ...QUESTION_BOX, family: theme.fonts.body }),
              fontWeight: 500,
              maxWidth: '80ch',
              textShadow: '0 2px 18px rgba(0,0,0,0.85), 0 1px 4px rgba(0,0,0,0.6)',
            }}
          >
            {part.text}
          </p>
        </span>
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
            style={{ height: 160, maxWidth: '100%', objectFit: 'contain', filter: 'drop-shadow(0 4px 16px rgba(0,0,0,0.5))' }}
          />
        </motion.div>
      )}
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

  const captionBoxRef1 = useRef(null)
  const captionSize1 = useFitToBox(captionBoxRef1, part.text, {
    family: theme.fonts.body,
    floorPx: VISUAL_CAPTION_FLOOR * 16,
    ceilPx: VISUAL_CAPTION_CEIL * 16,
    maxLines: 3, lineHeight: 1.15,
  })
  const captionBoxRef2 = useRef(null)
  const captionSize2 = useFitToBox(captionBoxRef2, part.text, {
    family: theme.fonts.body,
    floorPx: VISUAL_CAPTION_FLOOR * 16,
    ceilPx: VISUAL_CAPTION_CEIL * 16,
    maxLines: 3, lineHeight: 1.15,
  })

  return (
    <div className="w-full h-full relative overflow-hidden" style={{ background: theme.colors.shinyBg }}>
      {/* White flash — Section 20: 1 frame, CSS not JS */}
      {flashVisible && <div className="shiny-flash absolute inset-0 z-50 bg-white" />}

      {/* Gold glow burst — CSS, off main thread */}
      <div
        className="absolute inset-0 pointer-events-none z-10"
        style={{
          background: `radial-gradient(ellipse at center, ${SHINY_GOLD_GLOW}38 0%, transparent 55%)`,
          animation: 'shinyGlow 0.7s ease-out forwards',
        }}
      />

      {/* Series theme + subtitle — top overlay */}
      {data.isSeries && data.seriesTheme && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, duration: 0.22, ease: EASE_OUT }}
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
            transition={{ delay: 0.05, duration: 0.28, ease: EASE_OUT }}
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
            transition={{ delay: 0.18, duration: 0.28, ease: EASE_OUT }}
          >
            <div ref={captionBoxRef1} className="w-full">
              <p
                className="text-center leading-relaxed"
                style={{
                  color: theme.colors.text,
                  fontFamily: `'${theme.fonts.body}', 'Inter', sans-serif`,
                  fontSize: `${captionSize1}px`,
                  fontWeight: 500,
                }}
              >
                {part.text}
              </p>
            </div>
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
            transition={{ delay: 0.05, duration: 0.28, ease: EASE_OUT }}
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
            transition={{ delay: 0.15, duration: 0.22, ease: EASE_OUT }}
          >
            <div ref={captionBoxRef2} className="w-full">
              <p
                className="text-center leading-snug"
                style={{
                  color: '#f5f0e8',
                  fontFamily: `'${theme.fonts.body}', 'Inter', sans-serif`,
                  fontSize: `${captionSize2}px`,
                  fontWeight: 500,
                }}
              >
                {part.text}
              </p>
            </div>
          </motion.div>
        </>
      )}

      {/* ✨ indicator badge — top-left */}
      <div
        className="absolute top-5 left-5 z-20 text-2xl"
        style={{ filter: `drop-shadow(0 0 8px ${SHINY_GOLD_GLOW})` }}
      >
        ✨
      </div>
    </div>
  )
}

// ─── Shiny audio question ─────────────────────────────────────────────────────

function ShinyAudioQuestion({ slide, show, theme }) {
  const { data } = slide
  const part = resolveShinyPart(data)
  const isYoutubeSource = !!part.youtubeId
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

  // A YouTube-sourced clip has no <audio onEnded> equivalent — a plain
  // embed gives us no ended event — so we time the auto-stop ourselves
  // from the configured clip length, same effect the "Preview clip"
  // button gets in the host editor via getCurrentTime() polling.
  useEffect(() => {
    if (!isYoutubeSource || !playing || !part.youtubeEnd) return
    const ms = Math.max(0, (part.youtubeEnd - (part.youtubeStart || 0)) * 1000)
    if (ms <= 0) return
    const t = setTimeout(() => setPlaying(false), ms)
    return () => clearTimeout(t)
  }, [isYoutubeSource, playing, part.youtubeEnd, part.youtubeStart])

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
  // — only meaningful for the real <audio> element; a YouTube-sourced clip
  // has no gain graph to hook into and is driven purely by the on-screen button.
  useEffect(() => {
    if (isYoutubeSource) return
    const ap = show?.audio_playing
    if (ap?.slideId === slide.id && ap?.playing && audioRef.current) {
      playWithGain().catch(() => {})
    }
  }, [show?.audio_playing, slide.id, isYoutubeSource])

  return (
    <div
      className="w-full h-full relative flex flex-col items-center justify-center gap-10 overflow-hidden"
      style={{ background: theme.colors.shinyBg }}
    >
      {/* Background glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse 70% 60% at 50% 50%, ${SHINY_GOLD_GLOW}18 0%, transparent 65%)`,
        }}
      />

      {/* Series theme label */}
      {data.isSeries && data.seriesTheme && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, duration: 0.22, ease: EASE_OUT }}
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
        transition={{ delay: 0.06, duration: 0.22, ease: EASE_OUT }}
        className="relative z-10 text-center"
      >
        <p
          style={{
            fontFamily: `'${theme.fonts.display}', sans-serif`,
            color: theme.colors.text,
            fontSize: 'clamp(3rem, 8cqw, 6rem)',
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
        <WaveformBars playing={playing} />
      </motion.div>

      {/* Play button — shown but host controls audio via Live Mode.
          Underlying playback mechanism branches on source: a real <audio>
          tag for an uploaded file, or a visually-hidden YouTube iframe for
          a clip sourced from a URL. Visible UI (waveform, button, colors)
          is identical either way. */}
      {(isYoutubeSource ? part.youtubeId : part.mediaUrl) && (
        <>
          {isYoutubeSource ? (
            playing && (
              <iframe
                key={`${slide.id}:${data.currentPart ?? 0}`}
                src={youtubeEmbedUrl(part.youtubeId, { start: part.youtubeStart, end: part.youtubeEnd, autoplay: true, controls: false })}
                title="Shiny audio clip"
                allow="autoplay; encrypted-media"
                // Visually hidden but NOT display:none — some browsers pause
                // iframes hidden that way, which would silently kill playback.
                style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none', border: 0 }}
              />
            )
          ) : (
            <audio
              ref={audioRef}
              src={part.mediaUrl}
              onEnded={() => setPlaying(false)}
              preload="auto"
            />
          )}
          <motion.div
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.25, ease: EASE_OUT }}
            className="relative z-10"
          >
            <div
              className="w-24 h-24 rounded-full flex items-center justify-center cursor-pointer"
              onClick={() => {
                if (isYoutubeSource) {
                  setPlaying(p => !p)
                } else if (playing) {
                  audioRef.current?.pause(); setPlaying(false)
                } else {
                  playWithGain()
                }
              }}
              style={{
                background: theme.colors.accent,
                boxShadow: playing ? 'none' : `0 0 40px ${SHINY_GOLD_GLOW}50`,
                animation: playing ? 'none' : 'playPulse 2.4s ease-in-out infinite',
              }}
            >
              <span style={{ color: SHINY_GOLD, fontSize: '2.5rem', marginLeft: playing ? 0 : 4 }}>
                {playing ? '⏸' : '▶'}
              </span>
            </div>
          </motion.div>
        </>
      )}
    </div>
  )
}

// ─── Shiny video question ─────────────────────────────────────────────────────
// Same visual scaffolding as ShinyAudioQuestion (series label, question
// number/label, centered "visualization", ▶/⏸ button) — the waveform +
// <audio> tag are swapped for a video box + YouTube iframe, only mounted
// (and thus only playing) while `playing` is true.

function ShinyVideoQuestion({ slide, theme }) {
  const { data } = slide
  const part = resolveShinyPart(data)
  const reduce = useReducedMotion()
  const [playing, setPlaying] = useState(false)

  // A multi-part series keeps the same slide.id across parts — reset
  // playback state when the host advances to a different clip.
  useEffect(() => {
    setPlaying(false)
  }, [slide.id, data.currentPart])

  // A plain embed has no onEnded event, so time the auto-stop ourselves
  // from the configured clip length (mirrors the host editor's own
  // getCurrentTime() >= end polling for "Preview clip").
  useEffect(() => {
    if (!playing || !part.youtubeEnd) return
    const ms = Math.max(0, (part.youtubeEnd - (part.youtubeStart || 0)) * 1000)
    if (ms <= 0) return
    const t = setTimeout(() => setPlaying(false), ms)
    return () => clearTimeout(t)
  }, [playing, part.youtubeEnd, part.youtubeStart])

  const embedSrc = part.youtubeId
    ? youtubeEmbedUrl(part.youtubeId, { start: part.youtubeStart, end: part.youtubeEnd, autoplay: true, controls: false })
    : null

  return (
    <div
      className="w-full h-full relative flex flex-col items-center justify-center gap-10 overflow-hidden"
      style={{ background: theme.colors.shinyBg }}
    >
      {/* Background glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse 70% 60% at 50% 50%, ${SHINY_GOLD_GLOW}18 0%, transparent 65%)`,
        }}
      />

      {/* Series theme label */}
      {data.isSeries && data.seriesTheme && (
        <motion.div
          initial={{ opacity: 0, y: reduce ? 0 : -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, duration: 0.22, ease: EASE_OUT }}
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
        initial={{ opacity: 0, y: reduce ? 0 : 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.06, duration: 0.22, ease: EASE_OUT }}
        className="relative z-10 text-center"
      >
        <p
          style={{
            fontFamily: `'${theme.fonts.display}', sans-serif`,
            color: theme.colors.text,
            fontSize: 'clamp(3rem, 8cqw, 6rem)',
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

      {/* Video box — replaces the waveform */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15, duration: 0.3 }}
        className="relative z-10 rounded-2xl overflow-hidden"
        style={{
          width: 'min(60vw, 980px)',
          aspectRatio: '16 / 9',
          background: theme.colors.bgDeep,
          boxShadow: `0 0 0 1px ${SHINY_GOLD}30`,
        }}
      >
        {playing && embedSrc ? (
          <iframe
            key={`${slide.id}:${data.currentPart ?? 0}`}
            src={embedSrc}
            title="Shiny video clip"
            className="w-full h-full"
            style={{ border: 0, display: 'block' }}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ background: `linear-gradient(135deg, ${theme.colors.bgDeep}, ${theme.colors.bg})` }}
          >
            <span style={{ fontSize: '3.5rem', opacity: 0.3, filter: `drop-shadow(0 0 12px ${SHINY_GOLD_GLOW}60)` }}>🎬</span>
          </div>
        )}
      </motion.div>

      {/* Play button — same convention as ShinyAudioQuestion */}
      {part.youtubeId && (
        <motion.div
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.25, ease: EASE_OUT }}
          className="relative z-10"
        >
          <div
            className="w-24 h-24 rounded-full flex items-center justify-center cursor-pointer"
            onClick={() => setPlaying(p => !p)}
            style={{
              background: theme.colors.accent,
              boxShadow: playing ? 'none' : `0 0 40px ${SHINY_GOLD_GLOW}50`,
              animation: playing ? 'none' : 'playPulse 2.4s ease-in-out infinite',
            }}
          >
            <span style={{ color: SHINY_GOLD, fontSize: '2.5rem', marginLeft: playing ? 0 : 4 }}>
              {playing ? '⏸' : '▶'}
            </span>
          </div>
        </motion.div>
      )}
    </div>
  )
}

// ─── Shiny list question ───────────────────────────────────────────────────────

function ShinyListQuestion({ slide, theme }) {
  const { data } = slide
  const reduce = useReducedMotion()
  const items = data.listItems ?? []
  const hasPoints = !!data.shinyInputSchema?.hasPoints

  const listBoxRef = useRef(null)
  const rowSize = useFitListToBox(listBoxRef, items.map(it => it.text), {
    family: theme.fonts.body,
    floorPx: LIST_ITEM_FLOOR * 16,
    ceilPx: LIST_ITEM_CEIL * 16,
    gapPx: 18,
    rowInset: hasPoints ? 160 : 96,
    maxLinesPerRow: 2,
    lineHeight: 1.35,
  })

  return (
    <div className="w-full h-full relative overflow-hidden flex flex-col items-center justify-center px-24 py-16" style={{ background: theme.colors.shinyBg }}>
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{ background: `radial-gradient(ellipse 70% 55% at 50% 50%, ${SHINY_GOLD_GLOW}18 0%, transparent 65%)` }}
      />

      {data.text && (
        <motion.p
          initial={{ opacity: 0, y: reduce ? 0 : -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: EASE_OUT }}
          className="relative z-10 text-center mb-8"
          style={{
            color: theme.colors.text,
            fontFamily: `'${theme.fonts.body}', 'Inter', sans-serif`,
            fontSize: 'clamp(1.3rem, 2.8vw, 2.1rem)',
            fontWeight: 500,
            maxWidth: '70ch',
          }}
        >
          {data.text}
        </motion.p>
      )}

      <div ref={listBoxRef} className="relative z-10 w-full max-w-4xl">
        <ol className="space-y-4">
          {items.map((item, i) => (
            <motion.li
              key={i}
              initial={{ opacity: 0, x: reduce ? 0 : -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.08 + i * 0.06, duration: 0.22, ease: EASE_OUT }}
              className="flex gap-5 items-center justify-center"
            >
              <span
                className="shrink-0 flex items-center justify-center rounded-full"
                style={{
                  width: 40, height: 40,
                  background: theme.colors.accent,
                  fontFamily: `'${theme.fonts.display}', sans-serif`,
                  color: theme.colors.highlight,
                  fontSize: '1rem', fontWeight: 700,
                }}
              >
                {i + 1}
              </span>
              <p
                style={{
                  color: theme.colors.text,
                  fontFamily: `'${theme.fonts.body}', 'Inter', sans-serif`,
                  fontSize: `${rowSize}px`,
                  fontWeight: 500,
                  lineHeight: 1.35,
                }}
              >
                {item.text}
              </p>
              {hasPoints && (
                <span
                  className="shrink-0 rounded-full px-3 py-1"
                  style={{
                    background: theme.colors.bgDeep,
                    color: theme.colors.highlight,
                    fontFamily: `'${theme.fonts.display}', sans-serif`,
                    fontSize: '0.95rem', fontWeight: 700,
                    boxShadow: `0 0 0 1px ${theme.colors.highlight}55`,
                  }}
                >
                  +{item.points ?? 0}
                </span>
              )}
            </motion.li>
          ))}
        </ol>
      </div>

      <div className="absolute top-5 left-5 z-20 text-2xl" style={{ filter: `drop-shadow(0 0 8px ${SHINY_GOLD_GLOW})` }}>✨</div>
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
  if (data.isShiny && isVideoShiny(data)) {
    return <ShinyVideoQuestion slide={slide} theme={theme} />
  }
  if (data.isShiny && isListShiny(data)) {
    return <ShinyListQuestion slide={slide} theme={theme} />
  }
  return <StandardQuestion slide={slide} theme={theme} show={show} transitionKey={transitionKey} />
}
