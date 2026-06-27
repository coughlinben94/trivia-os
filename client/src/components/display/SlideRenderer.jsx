import { AnimatePresence, motion } from 'framer-motion'
import { useTheme } from '../shared/ThemeProvider.jsx'
import TitleSlide from './slides/TitleSlide.jsx'
import RoundIntroSlide from './slides/RoundIntroSlide.jsx'
import QuestionSlide from './slides/QuestionSlide.jsx'
import GradingBreakSlide from './slides/GradingBreakSlide.jsx'
import ScoreboardRevealSlide from './slides/ScoreboardRevealSlide.jsx'
import CustomSlide from './slides/CustomSlide.jsx'
import PixelateSeriesSlide from './slides/PixelateSeriesSlide.jsx'
import MultiQuestionSlide from './slides/MultiQuestionSlide.jsx'
import PylRevealSlide from './slides/PylRevealSlide.jsx'
import StateOfUnionSlide from './slides/StateOfUnionSlide.jsx'

const EASE_SNAP      = [0.23, 1, 0.32, 1]
const EASE_OVERSHOOT = [0.34, 1.56, 0.64, 1]
const EASE_SMOOTH    = [0.4, 0, 0.2, 1]
const EASE_WEIGHT    = [0.25, 1, 0.25, 1]        // ease-out-quart: heavy landing, no bounce
const EASE_FLOAT     = [0.25, 0.46, 0.45, 0.94]  // ease-out-sine: soft slow settle

// Per-slide content animation config — tune these without touching component logic
const SLIDE_ANIMATIONS = {
  'question': {
    initial: { opacity: 0, y: 18 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.22, ease: EASE_SNAP } },
    exit:    { opacity: 0, y: -12, transition: { duration: 0.14, ease: EASE_SMOOTH } },
  },
  'round-intro': {
    initial: { opacity: 0, scale: 0.92 },
    animate: { opacity: 1, scale: 1, transition: { duration: 0.04 } },
    exit:    { opacity: 0, scale: 0.94, transition: { duration: 0.3, ease: EASE_SMOOTH } },
  },
  'grading-break': {
    initial: { opacity: 0 },
    animate: { opacity: 1, transition: { duration: 0.4, ease: EASE_SNAP } },
    exit:    { opacity: 0, transition: { duration: 0.28, ease: EASE_SMOOTH } },
  },
  'scoreboard-reveal': {
    initial: { opacity: 0 },
    animate: { opacity: 1, transition: { duration: 0.3, ease: EASE_SNAP } },
    exit:    { opacity: 0, scale: 0.98, transition: { duration: 0.25, ease: EASE_SMOOTH } },
  },
  'title': {
    initial: { opacity: 0 },
    animate: { opacity: 1, transition: { duration: 0.5, ease: EASE_SNAP } },
    exit:    { opacity: 0, transition: { duration: 0.3, ease: EASE_SMOOTH } },
  },
  'state-of-union': {
    initial: { opacity: 0 },
    animate: { opacity: 1, transition: { duration: 0.5, ease: EASE_SNAP } },
    exit:    { opacity: 0, transition: { duration: 0.3, ease: EASE_SMOOTH } },
  },
  'shiny': {
    initial: { opacity: 0, scale: 1.06 },
    animate: { opacity: 1, scale: 1, transition: { delay: 0.05, duration: 0.28, ease: EASE_SNAP } },
    exit:    { opacity: 0, scale: 0.96, transition: { duration: 0.2, ease: EASE_SMOOTH } },
  },
}

// ─── Named entrance library ────────────────────────────────────────────────────
// GPU-only (opacity, y, scale, rotate). Exits always faster than enters.
const TRANSITIONS = {
  'dissolve': {
    initial: { opacity: 0 },
    animate: { opacity: 1, transition: { duration: 0.26, ease: EASE_SMOOTH } },
    exit:    { opacity: 0, transition: { duration: 0.14, ease: EASE_SMOOTH } },
  },
  'drop': {
    initial: { opacity: 0, y: -280 },
    animate: { opacity: 1, y: 0,    transition: { duration: 0.34, ease: EASE_WEIGHT } },
    exit:    { opacity: 0, y: -16,  transition: { duration: 0.16, ease: EASE_SMOOTH } },
  },
  'rise': {
    initial: { opacity: 0, y: 70 },
    animate: { opacity: 1, y: 0,   transition: { duration: 0.26, ease: EASE_SNAP } },
    exit:    { opacity: 0, y: -12, transition: { duration: 0.14, ease: EASE_SMOOTH } },
  },
  'zoom': {
    initial: { opacity: 0, scale: 0.8 },
    animate: { opacity: 1, scale: 1,    transition: { duration: 0.28, ease: EASE_SNAP } },
    exit:    { opacity: 0, scale: 0.96, transition: { duration: 0.16, ease: EASE_SMOOTH } },
  },
  'settle': {
    initial: { opacity: 0, scale: 1.08 },
    animate: { opacity: 1, scale: 1,    transition: { duration: 0.30, ease: EASE_SMOOTH } },
    exit:    { opacity: 0, scale: 0.98, transition: { duration: 0.16, ease: EASE_SMOOTH } },
  },
  'punch': {
    initial: { opacity: 0, scale: 0.6 },
    animate: { opacity: 1, scale: 1,   transition: { duration: 0.22, ease: EASE_SNAP } },
    exit:    { opacity: 0, scale: 0.9, transition: { duration: 0.14, ease: EASE_SMOOTH } },
  },
  'swoop': {
    initial: { opacity: 0, y: -180, scale: 0.9 },
    animate: { opacity: 1, y: 0,   scale: 1, transition: { duration: 0.34, ease: EASE_SNAP } },
    exit:    { opacity: 0, y: -14,           transition: { duration: 0.16, ease: EASE_SMOOTH } },
  },
  'tilt': {
    initial: { opacity: 0, y: 24, rotate: -4 },
    animate: { opacity: 1, y: 0,  rotate: 0, transition: { duration: 0.30, ease: EASE_SNAP } },
    exit:    { opacity: 0, rotate: 2,         transition: { duration: 0.16, ease: EASE_SMOOTH } },
  },
  'floatin': {
    initial: { opacity: 0, y: 40, scale: 0.96 },
    animate: { opacity: 1, y: 0,  scale: 1,   transition: { duration: 0.46, ease: EASE_FLOAT } },
    exit:    { opacity: 0, y: -10,             transition: { duration: 0.18, ease: EASE_SMOOTH } },
  },
  // TODO: staggerChildren only fires when direct children use Framer Motion variants;
  //       until slide components adopt variant-driven children, this behaves like 'rise'
  'stagger': {
    initial: { opacity: 0, y: 70 },
    animate: { opacity: 1, y: 0,   transition: { duration: 0.26, ease: EASE_SNAP, staggerChildren: 0.05 } },
    exit:    { opacity: 0, y: -12, transition: { duration: 0.14, ease: EASE_SMOOTH } },
  },
}

const TRANSITION_KEYS = Object.keys(TRANSITIONS)
let lastRandomKey = null

function resolveTransition(slide) {
  const key = slide?.data?.transition
  if (!key) return null
  if (key === 'random') {
    const pool = TRANSITION_KEYS.filter(k => k !== lastRandomKey)
    const picked = pool[Math.floor(Math.random() * pool.length)]
    lastRandomKey = picked
    return TRANSITIONS[picked]
  }
  return TRANSITIONS[key] ?? null
}

function getVariants(slide) {
  const type = slide?.type
  const isShiny = slide?.data?.isShiny
  if (isShiny) return SLIDE_ANIMATIONS['shiny']
  const resolved = resolveTransition(slide)
  if (resolved) return resolved
  return SLIDE_ANIMATIONS[type] ?? SLIDE_ANIMATIONS['question']
}

const SLIDE_COMPONENTS = {
  'title':             TitleSlide,
  'round-intro':       RoundIntroSlide,
  'swing-round-intro': RoundIntroSlide,
  'question':          QuestionSlide,
  'grading-break':     GradingBreakSlide,
  'scoreboard-reveal': ScoreboardRevealSlide,
  'custom':            CustomSlide,
  'pixelate-series':   PixelateSeriesSlide,
  'multi-question':    MultiQuestionSlide,
  'pyl-reveal':        PylRevealSlide,
  'state-of-union':    StateOfUnionSlide,
}

export default function SlideRenderer({ slide, show, direction }) {
  const { theme } = useTheme()
  const variants = getVariants(slide)
  const SlideComponent = SLIDE_COMPONENTS[slide.type] ?? CustomSlide

  return (
    <>
      {/* Background — locked, never animates, instant color update */}
      <div
        className="absolute inset-0"
        style={{ background: theme.colors.bgDeep, zIndex: 0 }}
      />

      {/* Content — animates in/out over the locked background */}
      <motion.div
        key={slide.id}
        className="absolute inset-0"
        style={{ zIndex: 1 }}
        variants={variants}
        initial="initial"
        animate="animate"
        exit="exit"
      >
        <SlideComponent slide={slide} show={show} />
      </motion.div>
    </>
  )
}
