import { useMemo } from 'react'
import { motion, useReducedMotion, cubicBezier } from 'framer-motion'
import { EASE_OUT } from '../../lib/easings.js'
import { SHINY_GOLD, SHINY_GOLD_GLOW } from '../../lib/shinyGold.js'

// Every shiny question/grid gets a standalone beat before its content — a pure
// announcement, no question/answer/media yet, giving the host room to set
// up what's coming. Modeled on the deck's yellow "shiny round title card"
// slides (tilted handwritten-style title, Ben photo lower-left, format icon
// lower-right) but reworked to fit the app's per-show theme system instead
// of a hardcoded color, and to stay ambient rather than full-bleed — the
// ParticleBackground mounted behind every slide (Display.jsx) should still
// read through around the edges, not get covered by a flat color block.
//
// Entrance choreography ported 1:1 from the approved WAAPI prototype
// (shiny-spin-land-drop.html, Ben-approved after two slow-down corrections):
// title spins in through ~1 tame rotation while scaling up, lands at
// LAND_T with a two-oscillation spring "boing", a gold burst ring + 8
// sparks fire at impact, then the format icon stamps in and the host photo
// rockets up from below the frame — sequenced, not simultaneous. All
// keyframe offsets/durations below are the prototype's numbers verbatim
// (WAAPI linear easing across explicit keyframes — the "ease" lives in the
// keyframe spacing, same technique here via Framer's times arrays).
//
// Shared by QuestionSlide.jsx (question type) and GridSlide.jsx (grid type)
// — any isShiny slide type can gate its content on `data.introDone` and
// render this first.

const LAND_T = 1.725 // s — moment of impact; every other element keys off this (prototype's 1725ms, 1.5x slow, Ben's call)
// Prototype burst/spark easing. NOTE: must be a function, not a [x1,y1,x2,y2]
// array — with keyframe values Framer reads an ease array as per-segment
// eases, silently breaking the curve.
const IMPACT_EASE = cubicBezier(0.16, 1, 0.3, 1)

export default function ShinyIntroScreen({ slide, theme }) {
  const { data } = slide
  const reduce = useReducedMotion()
  const title = data.seriesTheme || data.shinyFormatName || 'Shiny Question'
  const icon = data.shinyFormatIcon || '✨'

  // Replay key — same idiom as QuestionSlide.jsx's flash reset: a multi-part
  // series keeps the same slide.id across parts, only currentPart changes as
  // the host advances (Phase 2 will re-show this screen per part). Remounting
  // on the key replays every keyframe track below.
  const replayKey = `${slide.id}:${data.currentPart ?? 0}`

  // Spark geometry — 8 particles radiating from center, random angle jitter
  // and distance per replay (prototype: 90–145px on a ~900px stage; doubled
  // here for the full-size display).
  const sparks = useMemo(
    () =>
      Array.from({ length: 8 }, (_, i) => {
        const angle = (i / 8) * Math.PI * 2 + (Math.random() * 0.5 - 0.25)
        const dist = 180 + Math.random() * 110
        return {
          dx: Math.cos(angle) * dist,
          dy: Math.sin(angle) * dist,
          duration: LAND_T + 0.3 + Math.random() * 0.12,
        }
      }),
    [replayKey] // eslint-disable-line react-hooks/exhaustive-deps
  )

  return (
    <div key={replayKey} className="w-full h-full relative overflow-hidden flex items-center justify-center">
      {/* Sunrise glow — theme-colored wash, not a full-screen fill, so the
          ambient background still shows through around the edges. Punches in
          at the landing instant (prototype's glow beat); final look matches
          the always-on wash this screen shipped with. */}
      <motion.div
        aria-hidden
        initial={{ opacity: 0 }}
        animate={reduce ? { opacity: 1 } : { opacity: [0, 0, 1, 1] }}
        transition={reduce ? { duration: 0.3 } : { duration: LAND_T + 0.26, times: [0, 0.68, 0.8, 1], ease: 'easeOut' }}
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse 85% 65% at 50% 62%, ${SHINY_GOLD_GLOW}4d 0%, ${SHINY_GOLD_GLOW}22 38%, transparent 72%)`,
        }}
      />

      {/* Impact burst + sparks — pure decoration, skipped under reduced motion */}
      {!reduce && (
        <>
          <motion.div
            aria-hidden
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: [0, 0, 1, 9], opacity: [0, 0, 0.9, 0] }}
            transition={{ duration: LAND_T + 0.35, times: [0, 0.62, 0.68, 1], ease: IMPACT_EASE }}
            className="absolute z-10 pointer-events-none rounded-full"
            style={{
              left: '50%', top: '50%', width: 20, height: 20, marginLeft: -10, marginTop: -10,
              background: `radial-gradient(circle, #fff6dd 0%, ${SHINY_GOLD} 30%, ${SHINY_GOLD_GLOW}66 60%, transparent 72%)`,
            }}
          />
          {sparks.map((s, i) => (
            <motion.div
              key={i}
              aria-hidden
              initial={{ x: 0, y: 0, scale: 1, opacity: 0 }}
              animate={{
                x: [0, 0, s.dx * 0.25, s.dx],
                y: [0, 0, s.dy * 0.25, s.dy],
                scale: [1, 1, 1.4, 0.2],
                opacity: [0, 0, 1, 0],
              }}
              transition={{ duration: s.duration, times: [0, 0.64, 0.72, 1], ease: IMPACT_EASE }}
              className="absolute z-10 pointer-events-none rounded-full"
              style={{
                left: '50%', top: '50%', width: 10, height: 10, marginLeft: -5, marginTop: -5,
                background: SHINY_GOLD,
                boxShadow: `0 0 16px 4px ${SHINY_GOLD_GLOW}`,
              }}
            />
          ))}
        </>
      )}

      {/* Host photo — lower-left, rockets up from below the frame AFTER the
          title lands, overshoots with a rotate wobble (prototype "ben" track) */}
      {data.hostPhotoUrl && (
        <motion.img
          src={data.hostPhotoUrl}
          alt=""
          initial={reduce ? { opacity: 0, y: '0%', rotate: 0 } : { opacity: 0, y: '85%', rotate: -6 }}
          animate={
            reduce
              ? { opacity: 1, y: '0%', rotate: 0 }
              : {
                  opacity: [0, 0, 1, 1, 1],
                  y: ['85%', '85%', '-18%', '6%', '0%'],
                  rotate: [-6, -6, 4, -2, 0],
                }
          }
          transition={
            reduce
              ? { delay: 0.15, duration: 0.4, ease: EASE_OUT }
              : { duration: LAND_T + 0.65, times: [0, 0.68, 0.82, 0.91, 1], ease: 'linear' }
          }
          className="absolute bottom-0 left-0 z-10 pointer-events-none"
          style={{ height: '56%', maxWidth: '100%', objectFit: 'contain', filter: 'drop-shadow(0 8px 20px rgba(0,0,0,0.4))' }}
        />
      )}

      {/* Format icon badge — lower-right, stamps in hard right after landing
          with its own overshoot wobble (prototype "iconBadge" track) */}
      <motion.div
        initial={reduce ? { opacity: 0, scale: 1, rotate: 0 } : { opacity: 0, scale: 0.4, rotate: -24 }}
        animate={
          reduce
            ? { opacity: 1, scale: 1, rotate: 0 }
            : {
                opacity: [0, 0, 1, 1, 1, 1],
                scale: [0.4, 0.4, 1.35, 0.92, 1.06, 1],
                rotate: [-24, -24, 10, -4, 2, 0],
              }
        }
        transition={
          reduce
            ? { delay: 0.3, duration: 0.4, ease: EASE_OUT }
            : { duration: LAND_T + 0.5, times: [0, 0.72, 0.82, 0.9, 0.96, 1], ease: 'linear' }
        }
        className="absolute bottom-10 right-10 z-10 flex items-center justify-center rounded-2xl"
        style={{
          width: 128, height: 128,
          background: theme.colors.bgDeep,
          boxShadow: `0 10px 30px rgba(0,0,0,0.4), 0 0 0 2px ${theme.colors.highlight}55`,
        }}
      >
        <span style={{ fontSize: '3.5rem' }}>{icon}</span>
      </motion.div>

      {/* Title — big, tilted, marker-style. Spins in through one tame
          controlled turn while scaling up, lands with a two-oscillation
          spring "boing". Final rest angle is 354deg ≡ exactly -6deg (360-6),
          matching this file's tilt convention — not a leftover spin remainder. */}
      <motion.p
        initial={reduce ? { opacity: 0, scale: 1, rotate: -6 } : { opacity: 0, scale: 0.05, rotate: 0 }}
        animate={
          reduce
            ? { opacity: 1, scale: 1, rotate: -6 }
            : {
                opacity: [0, 1, 1, 1, 1, 1, 1, 1],
                scale: [0.05, 0.05, 0.42, 0.85, 1.22, 0.9, 1.08, 1],
                rotate: [0, 0, 196, 336, 366, 350, 358, 354],
              }
        }
        transition={
          reduce
            ? { duration: 0.3, ease: EASE_OUT }
            : { duration: LAND_T, times: [0, 0.03, 0.42, 0.68, 0.8, 0.9, 0.96, 1], ease: 'linear' }
        }
        className="relative z-10 text-center px-20"
        style={{
          fontFamily: `'${theme.fonts.display}', sans-serif`,
          color: SHINY_GOLD,
          fontSize: 'clamp(2.75rem, 6.5cqw, 6rem)',
          fontWeight: 700,
          lineHeight: 1.08,
          textShadow: `0 3px 0 rgba(0,0,0,0.25), 0 2px 21.6px ${SHINY_GOLD_GLOW}80`,
        }}
      >
        {title}
      </motion.p>

      {/* Subtitle — optional per-instance line ("Dog Edition", "Bluegrass Cover").
          Delayed past the landing instant so it doesn't precede the title. */}
      {data.introSubtitle && (
        <motion.p
          initial={{ opacity: 0, y: reduce ? 0 : 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: reduce ? 0.35 : 1.45, duration: 0.35, ease: EASE_OUT }}
          className="absolute z-10 text-center px-20"
          style={{
            top: 'calc(50% + 5.5rem)',
            fontFamily: `'${theme.fonts.ui}', 'Inter', sans-serif`,
            color: theme.colors.text,
            fontSize: 'clamp(1.1rem, 2.2cqw, 1.6rem)',
            fontWeight: 600,
            letterSpacing: '0.04em',
            textShadow: '0 2px 12px rgba(0,0,0,0.6)',
          }}
        >
          {data.introSubtitle}
        </motion.p>
      )}
    </div>
  )
}
