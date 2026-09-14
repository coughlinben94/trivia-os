import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { useTheme } from '../../shared/ThemeProvider.jsx'
import { EASE_OUT } from '../../../lib/easings.js'
import { SHINY_GOLD, SHINY_GOLD_GLOW } from '../../../lib/shinyGold.js'
import { isFirstOfShinyGroup } from '../../../lib/shinySeries.js'
import { sortSlides } from '../../../lib/slideStepping.js'
import ShinyGroupAnnounce from '../ShinyGroupAnnounce.jsx'

// Alive/eliminated state for one item at the current elimStep. Step 0 = grid
// only, nobody eliminated yet. Steps 1-2 apply hints[0]/hints[1].survivors.
// Step 3 (the spoken-only hint) changes no survivors — same board as step 2.
function isAlive(itemId, data) {
  const step = data.elimStep ?? 0
  if (step === 0) return true
  const hintIndex = Math.min(step, 2) - 1
  const survivors = data.hints?.[hintIndex]?.survivors
  return Array.isArray(survivors) ? survivors.includes(itemId) : true
}

function FaceCard({ item, alive, confirmed, size }) {
  const eliminated = !alive
  return (
    <motion.div
      animate={{
        opacity: eliminated ? 0.25 : 1,
        scale: eliminated ? 0.92 : (confirmed ? 1.04 : 1),
      }}
      transition={{ duration: 0.22, ease: EASE_OUT }}
      style={{
        width: size, height: size, borderRadius: 14, overflow: 'hidden', position: 'relative',
        boxShadow: confirmed ? `0 0 0 3px ${SHINY_GOLD}, 0 8px 28px ${SHINY_GOLD_GLOW}` : '0 6px 22px rgba(0,0,0,0.5)',
        filter: eliminated ? 'grayscale(1)' : 'none',
        background: 'rgba(0,0,0,0.3)',
      }}
    >
      {item.imageUrl && (
        <img src={item.imageUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      )}
      <span style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 1, color: '#fff', fontWeight: 700,
        fontSize: 16, textShadow: '0 2px 8px rgba(0,0,0,0.85)', padding: '6px 8px', textAlign: 'center',
        background: 'linear-gradient(to top, rgba(0,0,0,0.6), transparent)',
      }}>{item.label}</span>
    </motion.div>
  )
}

export default function FlipEmDownSlide({ slide, show }) {
  const { theme } = useTheme()
  const reduce = useReducedMotion()
  const { data } = slide
  const items = Array.isArray(data.items) ? data.items : []
  const step = data.elimStep ?? 0
  const revealedHints = (data.hints ?? []).slice(0, step)
  const size = 190

  return (
    <>
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 28 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 18 }}>
          {items.map(item => (
            <FaceCard
              key={item.id}
              item={item}
              alive={isAlive(item.id, data)}
              confirmed={step >= 2 && isAlive(item.id, data)}
              size={size}
            />
          ))}
        </div>
        <div style={{ minHeight: 90, display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
          <AnimatePresence mode="popLayout">
            {revealedHints.map((hint, i) => (
              <motion.p
                key={i}
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22, ease: EASE_OUT }}
                style={{
                  color: theme.colors.text, fontFamily: `'${theme.fonts.body}', 'DM Sans', sans-serif`,
                  fontSize: '1.4rem', fontWeight: 600, textShadow: '0 2px 8px rgba(0,0,0,0.6)', margin: 0,
                }}
              >{hint.text}</motion.p>
            ))}
          </AnimatePresence>
        </div>
      </div>
      {isFirstOfShinyGroup(sortSlides(show?.slides), slide) && (
        <ShinyGroupAnnounce name={slide.data?.shinyFormatName} icon={slide.data?.shinyFormatIcon} />
      )}
    </>
  )
}
