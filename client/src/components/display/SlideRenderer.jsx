import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
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
import WinnerRevealSlide from './slides/WinnerRevealSlide.jsx'

const EASE_QUINT     = [0.22, 1, 0.36, 1]   // standard ease-out
const EASE_QUART     = [0.25, 1, 0.25, 1]   // weighted hard land (drop)
const EASE_CUBIC     = [0.33, 1, 0.68, 1]   // gentle

// Per-slide content animation config — tune these without touching component logic
const SLIDE_ANIMATIONS = {
  'question': {
    initial: { opacity: 0, y: 18 },
    animate: { opacity: 1, y: 0,  transition: { duration: 0.22, ease: EASE_QUINT } },
    exit:    { opacity: 0, y: -12, transition: { duration: 0.14, ease: EASE_CUBIC } },
  },
  'round-intro': {
    initial: { opacity: 0, scale: 0.92 },
    animate: { opacity: 1, scale: 1, transition: { duration: 0.04 } },
    exit:    { opacity: 0, scale: 0.94, transition: { duration: 0.3, ease: EASE_CUBIC } },
  },
  'grading-break': {
    initial: { opacity: 0 },
    animate: { opacity: 1, transition: { duration: 0.4, ease: EASE_QUINT } },
    exit:    { opacity: 0, transition: { duration: 0.28, ease: EASE_CUBIC } },
  },
  'scoreboard-reveal': {
    initial: { opacity: 0 },
    animate: { opacity: 1, transition: { duration: 0.3, ease: EASE_QUINT } },
    exit:    { opacity: 0, scale: 0.98, transition: { duration: 0.25, ease: EASE_CUBIC } },
  },
  'winner-reveal': {
    initial: { opacity: 0 },
    animate: { opacity: 1, transition: { duration: 0.6, ease: EASE_QUINT } },
    exit:    { opacity: 0, transition: { duration: 0.3, ease: EASE_CUBIC } },
  },
  'title': {
    initial: { opacity: 0 },
    animate: { opacity: 1, transition: { duration: 0.5, ease: EASE_QUINT } },
    exit:    { opacity: 0, transition: { duration: 0.3, ease: EASE_CUBIC } },
  },
  'state-of-union': {
    initial: { opacity: 0 },
    animate: { opacity: 1, transition: { duration: 0.5, ease: EASE_QUINT } },
    exit:    { opacity: 0, transition: { duration: 0.3, ease: EASE_CUBIC } },
  },
  'shiny': {
    initial: { opacity: 0, scale: 1.06 },
    animate: { opacity: 1, scale: 1, transition: { delay: 0.05, duration: 0.28, ease: EASE_QUINT } },
    exit:    { opacity: 0, scale: 0.96, transition: { duration: 0.2, ease: EASE_CUBIC } },
  },
}

// ─── Named entrance library ────────────────────────────────────────────────────
// GPU-only (opacity, y, scale). Exits always faster than enters.
const TRANSITIONS = {
  'dissolve': { initial: { opacity: 0 },             animate: { opacity: 1,           transition: { duration: 0.28, ease: EASE_CUBIC } }, exit: { opacity: 0,            transition: { duration: 0.16, ease: EASE_CUBIC } } },
  'emerge':   { initial: { opacity: 0, scale: 0.92 }, animate: { opacity: 1, scale: 1, transition: { duration: 0.44, ease: EASE_CUBIC } }, exit: { opacity: 0, scale: 0.98, transition: { duration: 0.16, ease: EASE_CUBIC } } },
  'zoom':     { initial: { opacity: 0, scale: 0.82 }, animate: { opacity: 1, scale: 1, transition: { duration: 0.30, ease: EASE_QUINT } }, exit: { opacity: 0, scale: 0.97, transition: { duration: 0.16, ease: EASE_CUBIC } } },
  'punch':    { initial: { opacity: 0, scale: 0.62 }, animate: { opacity: 1, scale: 1, transition: { duration: 0.24, ease: EASE_QUINT } }, exit: { opacity: 0, scale: 0.90, transition: { duration: 0.14, ease: EASE_CUBIC } } },
  'drop':     { initial: { opacity: 0, y: -260 },    animate: { opacity: 1, y: 0,     transition: { duration: 0.36, ease: EASE_QUART } }, exit: { opacity: 0, y: -16,      transition: { duration: 0.16, ease: EASE_CUBIC } } },
  'descend':  { initial: { opacity: 0, y: -140 },    animate: { opacity: 1, y: 0,     transition: { duration: 0.52, ease: EASE_CUBIC } }, exit: { opacity: 0, y: -12,      transition: { duration: 0.16, ease: EASE_CUBIC } } },
  'sink':     { initial: { opacity: 0, y: -60, scale: 1.06 }, animate: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.38, ease: EASE_QUINT } }, exit: { opacity: 0, y: -10, transition: { duration: 0.16, ease: EASE_CUBIC } } },
  'settle':   { initial: { opacity: 0, scale: 1.07 }, animate: { opacity: 1, scale: 1, transition: { duration: 0.32, ease: EASE_CUBIC } }, exit: { opacity: 0, scale: 0.99, transition: { duration: 0.16, ease: EASE_CUBIC } } },
  'loom':     { initial: { opacity: 0, scale: 1.14 }, animate: { opacity: 1, scale: 1, transition: { duration: 0.34, ease: EASE_QUINT } }, exit: { opacity: 0, scale: 0.98, transition: { duration: 0.16, ease: EASE_CUBIC } } },
  'assemble': { initial: { opacity: 1 }, animate: { opacity: 1, transition: { duration: 0 } }, exit: { opacity: 0, transition: { duration: 0.16, ease: EASE_CUBIC } } },
}

const TRANSITION_KEYS = Object.keys(TRANSITIONS).filter(k => k !== 'assemble')
let lastRandomKey = null

function resolveTransition(slide) {
  const key = slide?.data?.transition
  if (!key) return null
  if (key === 'random') {
    const pool = TRANSITION_KEYS.filter(k => k !== lastRandomKey)
    const picked = pool[Math.floor(Math.random() * pool.length)]
    lastRandomKey = picked
    return { key: picked, variants: TRANSITIONS[picked] }
  }
  const variants = TRANSITIONS[key]
  return variants ? { key, variants } : null
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
  'winner-reveal':     WinnerRevealSlide,
}

export default function SlideRenderer({ slide, show, direction, isPreview = false }) {
  const { theme } = useTheme()
  const reduce = useReducedMotion()
  const isShiny = slide?.data?.isShiny

  let transitionKey = null
  let variants
  if (reduce && !isShiny) {
    variants = TRANSITIONS.dissolve
  } else if (isShiny) {
    variants = SLIDE_ANIMATIONS['shiny']
  } else {
    const resolved = resolveTransition(slide)
    if (resolved) {
      transitionKey = resolved.key
      variants = resolved.variants
    } else {
      variants = SLIDE_ANIMATIONS[slide?.type] ?? SLIDE_ANIMATIONS['question']
    }
  }

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
        style={{ zIndex: 2 }}
        variants={variants}
        initial="initial"
        animate="animate"
        exit="exit"
      >
        <SlideComponent slide={slide} show={show} transitionKey={transitionKey} isPreview={isPreview} />
      </motion.div>
    </>
  )
}
