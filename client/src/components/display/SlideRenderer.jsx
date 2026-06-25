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

function getVariants(slide) {
  const type = slide?.type
  const isShiny = slide?.data?.isShiny
  if (isShiny) return SLIDE_ANIMATIONS['shiny']
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
