import { useState, useEffect } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { useTheme } from '../../shared/ThemeProvider.jsx'
import { fitToBox, CUSTOM_BODY_BOX } from '../../../lib/autoFitText.js'
import { EASE_OUT } from '../../../lib/easings.js'

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

      {data.mediaUrl && (
        <motion.div
          initial={{ opacity: 0, scale: reduce ? 1 : 1.05 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.35, ease: EASE_OUT }}
          className="relative z-10 mb-10 max-w-2xl"
        >
          <img
            src={data.mediaUrl}
            alt=""
            className="w-full rounded-2xl object-contain"
            style={{ maxHeight: '45vh' }}
          />
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
              fontSize: 'clamp(2.5rem, 6vw, 6rem)',
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
              color: theme.colors.text,
              fontSize: fitToBox(data.body, { ...CUSTOM_BODY_BOX, family: 'system-ui' }),
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
