import { motion, useReducedMotion } from 'framer-motion'
import { useTheme } from '../../shared/ThemeProvider.jsx'
import ShinyIntroScreen from '../ShinyIntroScreen.jsx'
import { EASE_OUT } from '../../../lib/easings.js'
import { SHINY_GOLD, SHINY_GOLD_GLOW } from '../../../lib/shinyGold.js'

function CastPhoto({ person, i, reduce }) {
  const tIn = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.2 } }
    : { initial: { opacity: 0, scale: 0.8 }, animate: { opacity: 1, scale: 1 }, transition: { duration: 0.4, delay: 0.08 * i, ease: EASE_OUT } }
  return (
    <motion.div {...tIn} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <div style={{
        width: 148, height: 148, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
        boxShadow: '0 6px 22px rgba(0,0,0,0.55)', background: 'rgba(255,255,255,0.08)',
        border: '2px solid rgba(255,255,255,0.2)',
      }}>
        {person?.mediaUrl && (
          <img src={person.mediaUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        )}
      </div>
      {person?.name && (
        <span style={{
          fontSize: '1rem', fontWeight: 600, color: '#fff',
          textShadow: '0 2px 8px rgba(0,0,0,0.8)', textAlign: 'center',
        }}>
          {person.name}
        </span>
      )}
    </motion.div>
  )
}

export default function VennDiagramSlide({ slide, show }) {
  const { theme } = useTheme()
  const { data } = slide

  if (data.isShiny && !data.introDone) {
    return <ShinyIntroScreen slide={slide} theme={theme} show={show} />
  }

  return <VennContent slide={slide} theme={theme} />
}

// Two overlapping circles, three cast photos biased toward each circle's own
// OUTER edge (away from the overlap) — the overlap itself stays visually
// empty, same "empty in the middle" Ben built the real question around. No
// crescent clipping on the photos themselves; keeping them simply offset
// away from center reads as a Venn diagram without needing per-photo SVG
// clip-paths for a one-off slide type.
function VennContent({ slide, theme }) {
  const reduce = useReducedMotion()
  const { data } = slide
  const leftCast = (data.leftCast ?? []).slice(0, 3)
  const rightCast = (data.rightCast ?? []).slice(0, 3)

  const CIRCLE = 620
  const OVERLAP = 170 // center-to-center gap = CIRCLE - OVERLAP

  return (
    <div className="w-full h-full relative overflow-hidden" style={{ background: theme.colors.shinyBg }}>
      {/* Gold glow burst — fixed gold, theme-independent, same as GridSlide/other shiny types */}
      <div aria-hidden style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5,
        background: `radial-gradient(ellipse at center, ${SHINY_GOLD_GLOW}55 0%, transparent 58%)`,
        animation: 'shinyGlow 0.75s ease-out forwards',
      }} />
      <div style={{ position: 'absolute', top: 28, left: 30, zIndex: 40, fontSize: 40, filter: `drop-shadow(0 0 12px ${SHINY_GOLD_GLOW})` }}>✨</div>

      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', paddingBottom: 110 }}>
        <div style={{ position: 'relative', width: CIRCLE * 2 - OVERLAP, height: CIRCLE }}>
          <div aria-hidden style={{
            position: 'absolute', left: 0, top: 0, width: CIRCLE, height: CIRCLE, borderRadius: '50%',
            border: `3px solid ${SHINY_GOLD}`, background: `${SHINY_GOLD}0d`,
          }} />
          <div aria-hidden style={{
            position: 'absolute', right: 0, top: 0, width: CIRCLE, height: CIRCLE, borderRadius: '50%',
            border: `3px solid ${SHINY_GOLD}`, background: `${SHINY_GOLD}0d`,
          }} />

          <div style={{
            position: 'absolute', left: CIRCLE * 0.08, top: 0, width: CIRCLE * 0.5, height: CIRCLE,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 28,
          }}>
            {leftCast.map((p, i) => <CastPhoto key={i} person={p} i={i} reduce={reduce} />)}
          </div>

          <div style={{
            position: 'absolute', right: CIRCLE * 0.08, top: 0, width: CIRCLE * 0.5, height: CIRCLE,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 28,
          }}>
            {rightCast.map((p, i) => <CastPhoto key={i} person={p} i={i} reduce={reduce} />)}
          </div>
        </div>
      </div>

      {/* Question — bottom scrim, same convention as GridSlide */}
      {data.text && (
        <motion.div
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15, ease: EASE_OUT }}
          style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 45,
            background: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.4) 55%, transparent 100%)',
            paddingBottom: 42, paddingTop: 110, paddingInline: 80,
          }}
        >
          <p style={{
            textAlign: 'center', color: theme.colors.text, lineHeight: 1.15,
            fontFamily: `'${theme.fonts.body}', sans-serif`,
            fontSize: 'clamp(1.4rem, 2.6vw, 2.2rem)', fontWeight: 500,
            textShadow: '0 2px 16px rgba(0,0,0,0.9)', margin: 0,
          }}>
            {data.text}
          </p>
        </motion.div>
      )}
    </div>
  )
}
