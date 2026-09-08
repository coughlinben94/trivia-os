import { useState, useEffect } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { useTheme } from '../../shared/ThemeProvider.jsx'
import { fitToBox, CUSTOM_BODY_BOX } from '../../../lib/autoFitText.js'
import { EASE_OUT } from '../../../lib/easings.js'
import { youtubeEmbedUrl } from '../../../lib/youtube.js'

// Visible YouTube video for Custom Slide — Ben wants it playing on the TV,
// not just its audio (every other YouTube integration here, e.g.
// QuestionSlide's hidden warmYoutubeAudio iframe, is audio-only). Mirrors
// QuestionSlide's ShinyVideoQuestion: a plain <iframe> built from
// youtubeEmbedUrl, no IFrame Player API/window.YT needed on /display for
// this. Unlike that question-reveal pattern (host taps Play each time),
// this autoplays the moment the slide mounts — Custom Slide is a freeform
// announcement, not a gated question — riding /display's sticky user
// activation from the show's setup ritual (tap the TV once). controls stay
// on (unlike ShinyVideoQuestion's controls:false) as the fallback if
// autoplay is ever blocked: a plain iframe can't report its own play state
// back to this component, so the simplest honest fallback is leaving
// YouTube's own visible Play button in the embed rather than a silently
// stuck slide. `.volume` (set in the host's YoutubeClipEditor for A/B
// matching by ear) has no equivalent on a plain embed URL — same
// limitation ShinyVideoQuestion already has for visible video.
function CustomSlideVideo({ video, reduce }) {
  const embedSrc = video?.videoId
    ? youtubeEmbedUrl(video.videoId, { start: video.start, end: video.end, autoplay: true, controls: true })
    : null
  if (!embedSrc) return null
  return (
    <motion.div
      initial={{ opacity: 0, scale: reduce ? 1 : 1.05 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.35, ease: EASE_OUT }}
      className="relative z-10 mb-10 rounded-2xl overflow-hidden bg-black"
      style={{ aspectRatio: '16 / 9', width: 'min(94vw, calc(78vh * 16 / 9))' }}
    >
      <iframe
        key={`${video.videoId}:${video.start ?? 0}:${video.end ?? ''}`}
        src={embedSrc}
        title="Slide video"
        className="w-full h-full"
        style={{ border: 0, display: 'block' }}
        allow="autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
      />
    </motion.div>
  )
}

export default function CustomSlide({ slide }) {
  const { theme } = useTheme()
  const { data } = slide
  const reduce = useReducedMotion()

  // fitToBox measures via canvas — a first paint before web fonts load
  // measures fallback-font metrics. This flips once fonts are ready purely
  // to force the re-render that re-runs the inline fitToBox call below with
  // real glyph metrics; the value itself is never read.
  const [fontsReady, setFontsReady] = useState(false)
  useEffect(() => { document.fonts.ready.then(() => setFontsReady(true)) }, [])
  const rt = data._regionTransforms ?? {}
  const xf = id => { const t = rt[id]; return t ? { transform: `translate(${t.dx??0}px,${t.dy??0}px) rotate(${t.rotate??0}deg)`, transformOrigin: 'center', display: 'inline-block' } : {} }

  // data.images is the current shape (host can attach any number); data.mediaUrl
  // is the legacy single-image shape, still read for slides built before this.
  const images = data.images?.length ? data.images.filter(i => i.url) : (data.mediaUrl ? [{ url: data.mediaUrl }] : [])
  const hasVideo = !!data.video?.videoId

  return (
    <div
      className="w-full h-full relative flex flex-col items-center justify-center overflow-hidden px-24 py-20"
      style={{ background: theme.colors.bgDeep }}
    >
      {/* Ambient glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse 70% 50% at 50% 45%, ${theme.colors.accent}25 0%, transparent 70%)`,
        }}
      />

      {/* Video takes priority as the main visual when present — keeps the
          slide clean instead of stacking a video and an image row. */}
      {hasVideo ? (
        <CustomSlideVideo video={data.video} reduce={reduce} />
      ) : images.length > 0 && (
        <motion.div
          initial={{ opacity: 0, scale: reduce ? 1 : 1.05 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.35, ease: EASE_OUT }}
          className="relative z-10 mb-10 flex flex-wrap justify-center gap-6 max-w-5xl"
        >
          {images.map((img, i) => (
            <img
              key={img.url ?? i}
              src={img.url}
              alt=""
              className="rounded-2xl object-contain"
              style={{ maxHeight: '45vh', maxWidth: images.length > 1 ? `${Math.floor(88 / images.length)}vw` : '100%' }}
            />
          ))}
        </motion.div>
      )}

      {data.title && (
        <span data-slide-region="title" data-slide-field="title" style={xf('title')}>
          <motion.h2
            initial={{ opacity: 0, y: reduce ? 0 : 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: data.mediaUrl ? 0.1 : 0, duration: 0.28, ease: EASE_OUT }}
            className="relative z-10 text-center mb-6"
            style={{
              fontFamily: `'${theme.fonts.display}', sans-serif`,
              color: theme.colors.highlight,
              fontSize: rt.title?.fontSizePx ? `${rt.title.fontSizePx}px` : 'clamp(2.5rem, 6vw, 6rem)',
              fontWeight: 700,
              letterSpacing: '-0.01em',
            }}
          >
            {data.title}
          </motion.h2>
        </span>
      )}

      {data.body && (
        <span data-slide-region="body" data-slide-field="body" style={xf('body')}>
          <motion.p
            initial={{ opacity: 0, y: reduce ? 0 : 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.25, ease: EASE_OUT }}
            className="relative z-10 text-center leading-relaxed max-w-4xl"
            style={{
              fontFamily: `'${theme.fonts.body}', 'DM Sans', sans-serif`,
              color: theme.colors.text,
              fontSize: rt.body?.fontSizePx ?? fitToBox(data.body, { ...CUSTOM_BODY_BOX, family: theme.fonts.body }),
              fontWeight: 400,
            }}
          >
            {data.body}
          </motion.p>
        </span>
      )}
    </div>
  )
}
