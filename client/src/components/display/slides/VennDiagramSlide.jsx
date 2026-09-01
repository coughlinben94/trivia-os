import { motion, useReducedMotion } from 'framer-motion'
import { useTheme } from '../../shared/ThemeProvider.jsx'
import ShinyIntroScreen from '../ShinyIntroScreen.jsx'
import { EASE_OUT } from '../../../lib/easings.js'
import { SHINY_GOLD, SHINY_GOLD_GLOW } from '../../../lib/shinyGold.js'

// Circle only renders when this PERSON has a photo (not per-side) — a mixed
// side (some photos, some text-only) shows a circle just for the ones who
// have one, and a fully text-only side (Ben's actual shows) never draws the
// empty placeholder ring the old per-side-agnostic version always did.
function CastPhoto({ person, i, reduce, size, font, maxW }) {
  const tIn = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.2 } }
    : { initial: { opacity: 0, scale: 0.8 }, animate: { opacity: 1, scale: 1 }, transition: { duration: 0.4, delay: 0.08 * i, ease: EASE_OUT } }
  return (
    <motion.div {...tIn} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, maxWidth: maxW }}>
      {person?.mediaUrl && (
        <div style={{
          width: size, height: size, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
          boxShadow: '0 6px 22px rgba(0,0,0,0.55)', background: 'rgba(255,255,255,0.08)',
          border: '2px solid rgba(255,255,255,0.2)',
        }}>
          <img src={person.mediaUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
      )}
      {person?.name && (
        <span style={{
          fontSize: font, fontWeight: 600, color: '#fff',
          textShadow: '0 2px 8px rgba(0,0,0,0.8)', textAlign: 'center',
          // The top/bottom rows of a tall N=6 stack sit on a chord under
          // ~230px inside the 620px circle — an unclamped long name bleeds
          // over the gold ring without this (council devil's-advocate find).
          maxWidth: '100%', overflowWrap: 'anywhere', lineHeight: 1.15,
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

  // outroShown ⇒ this is the closing beat, not the opening announce — same
  // card, quiet arrival instead of the full entrance (see ShinyIntroScreen).
  if (data.isShiny && !data.introDone) {
    return <ShinyIntroScreen slide={slide} theme={theme} show={show} isClosing={!!data.outroShown} />
  }

  return <VennContent slide={slide} theme={theme} />
}

// Two overlapping circles, N cast entries (2-6, host's choice) biased toward
// each circle's own OUTER edge (away from the overlap) — the overlap itself
// stays visually empty, same "empty in the middle" Ben built the real
// question around. No crescent clipping on the photos themselves; keeping
// them simply offset away from center reads as a Venn diagram without
// needing per-photo SVG clip-paths for a one-off slide type.
function VennContent({ slide, theme }) {
  const reduce = useReducedMotion()
  const { data } = slide

  const CIRCLE = 620
  const OVERLAP = 170 // center-to-center gap = CIRCLE - OVERLAP

  // No slice-to-3 (2026-09-01 council fix): the wizard now lets a host pick
  // 2-6 per side, and silently truncating whatever they typed to 3 on the
  // live TV — no error, no warning — was the actual bug, not the count
  // itself. Blank wizard-seeded slots (name '' , no photo) are filtered out
  // here — Join.jsx already did this for phones, the TV never had.
  const has = p => p?.name || p?.mediaUrl
  const leftCast = (data.leftCast ?? []).filter(has)
  const rightCast = (data.rightCast ?? []).filter(has)
  const n = Math.max(leftCast.length, rightCast.length, 1)
  const anyPhoto = [...leftCast, ...rightCast].some(p => p.mediaUrl)
  // ponytail: photo path sized by one linear clamp, only verified at n<=3.
  // Past ~4 photos/side the stack outgrows the 620px ring — redo the layout
  // then. Text-only (Ben's actual shows) has no such ceiling — six name rows
  // fit fine, which is why the font scale below has no clamp against CIRCLE.
  const castSize = Math.min(148, (CIRCLE * 0.78 - 28 * (n - 1)) / n)
  // 2.5 (not 2.9) rem base — tuned so ordinary two-word names ("Chadwick
  // Boseman", "Joaquin Phoenix") land on one line at n=3 instead of
  // wrapping while shorter neighbors ("Mark Ruffalo") don't, which read as
  // a ragged, unformatted list (Ben, 2026-09-01 live screenshot).
  const castFont = anyPhoto ? '1.15rem' : `${Math.max(1.7, 2.7 - 0.15 * n).toFixed(2)}rem`
  const castGap  = anyPhoto ? 28 : 18
  // Narrows with N: a row near the top/bottom of a tall stack sits on a
  // shorter chord of the 620px circle, so the safe text width shrinks as
  // more rows are stacked — kept above the ~230px floor the devil's-
  // advocate review measured for a 6-row stack's outermost rows.
  const castMaxW = Math.max(230, 360 - 12 * (n - 3))

  return (
    <div className="w-full h-full relative overflow-hidden" style={{ background: theme.colors.shinyBg }}>
      {/* Gold glow burst — fixed gold, theme-independent, same as GridSlide/other shiny types */}
      <div aria-hidden style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5,
        background: `radial-gradient(ellipse at center, ${SHINY_GOLD_GLOW}55 0%, transparent 58%)`,
        animation: 'shinyGlow 0.75s ease-out forwards',
      }} />
      <div style={{ position: 'absolute', top: 28, left: 30, zIndex: 40, fontSize: 40, filter: `drop-shadow(0 0 12px ${SHINY_GOLD_GLOW})` }}>✨</div>

      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', paddingBottom: 30 }}>
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
            position: 'absolute', left: CIRCLE * 0.08, top: 0, width: CIRCLE * 0.5 + 70, height: CIRCLE,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: castGap,
          }}>
            {leftCast.map((p, i) => <CastPhoto key={p.name || i} person={p} i={i} reduce={reduce} size={castSize} font={castFont} maxW={castMaxW} />)}
          </div>

          <div style={{
            position: 'absolute', right: CIRCLE * 0.08, top: 0, width: CIRCLE * 0.5 + 70, height: CIRCLE,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: castGap,
          }}>
            {rightCast.map((p, i) => <CastPhoto key={p.name || i} person={p} i={i} reduce={reduce} size={castSize} font={castFont} maxW={castMaxW} />)}
          </div>

          {/* The overlap IS the mystery — a big "?" marks the empty middle so
              it reads as "guess what belongs here," not as unfinished art
              (Ben, 2026-09-01). */}
          <motion.div
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, delay: 0.3, ease: EASE_OUT }}
            style={{
              position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
              fontSize: 120, fontWeight: 800, color: SHINY_GOLD, lineHeight: 1,
              textShadow: `0 0 40px ${SHINY_GOLD_GLOW}, 0 4px 12px rgba(0,0,0,0.5)`,
              pointerEvents: 'none', zIndex: 20,
            }}
          >
            ?
          </motion.div>
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
            fontSize: 'clamp(1.6rem, 2.8vw, 2.4rem)', fontWeight: 500,
            textShadow: '0 2px 16px rgba(0,0,0,0.9)', margin: 0,
          }}>
            {data.text}
          </p>
        </motion.div>
      )}
    </div>
  )
}
