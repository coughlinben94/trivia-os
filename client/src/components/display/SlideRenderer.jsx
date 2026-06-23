import { motion } from 'framer-motion'
import TitleSlide from './slides/TitleSlide.jsx'
import RoundIntroSlide from './slides/RoundIntroSlide.jsx'
import QuestionSlide from './slides/QuestionSlide.jsx'
import GradingBreakSlide from './slides/GradingBreakSlide.jsx'
import ScoreboardRevealSlide from './slides/ScoreboardRevealSlide.jsx'
import CustomSlide from './slides/CustomSlide.jsx'
import PixelateSeriesSlide from './slides/PixelateSeriesSlide.jsx'
import MultiQuestionSlide from './slides/MultiQuestionSlide.jsx'
import PylRevealSlide from './slides/PylRevealSlide.jsx'

const EASE_SNAP   = [0.23, 1, 0.32, 1]
const EASE_SMOOTH = [0.4, 0, 0.2, 1]

function getVariants(slide, dir) {
  const type = slide?.type
  const isShiny = slide?.data?.isShiny

  if (type === 'round-intro' || type === 'swing-round-intro') {
    return {
      initial: { opacity: 0 },
      animate: { opacity: 1, transition: { duration: 0.04 } },
      exit:    { opacity: 0, scale: 0.94, transition: { duration: 0.3, ease: EASE_SMOOTH } },
    }
  }

  if (type === 'grading-break') {
    return {
      initial: { opacity: 0 },
      animate: { opacity: 1, transition: { duration: 0.28, ease: EASE_SNAP } },
      exit:    { opacity: 0, transition: { duration: 0.22, ease: 'easeIn' } },
    }
  }

  if (type === 'scoreboard-reveal') {
    return {
      initial: { opacity: 0 },
      animate: { opacity: 1, transition: { duration: 0.28, ease: EASE_SNAP } },
      exit:    { opacity: 0, scale: 0.98, transition: { duration: 0.25, ease: EASE_SMOOTH } },
    }
  }

  if (type === 'title') {
    return {
      initial: { opacity: 0 },
      animate: { opacity: 1, transition: { duration: 0.5, ease: EASE_SNAP } },
      exit:    { opacity: 0, transition: { duration: 0.3, ease: 'easeIn' } },
    }
  }

  if (isShiny) {
    // Scale from center — Section 20 shiny entry
    return {
      initial: (d) => ({ x: d >= 0 ? '6%' : '-6%', scale: 1.06, opacity: 0 }),
      animate: { x: 0, scale: 1, opacity: 1, transition: { delay: 0.05, duration: 0.28, ease: EASE_SNAP } },
      exit:    (d) => ({ x: d >= 0 ? '-8%' : '8%', scale: 0.96, opacity: 0, transition: { duration: 0.2, ease: EASE_SMOOTH } }),
    }
  }

  // Default: direction-based slide — never from scale(0), starts with visible shape
  return {
    initial: (d) => ({ x: d >= 0 ? '100%' : '-100%', scale: 0.97, opacity: 0 }),
    animate: { x: 0, scale: 1, opacity: 1, transition: { duration: 0.18, ease: EASE_SNAP } },
    exit:    (d) => ({ x: d >= 0 ? '-100%' : '100%', scale: 0.97, opacity: 0, transition: { duration: 0.18, ease: EASE_SNAP } }),
  }
}

const SLIDE_COMPONENTS = {
  'title':              TitleSlide,
  'round-intro':        RoundIntroSlide,
  'swing-round-intro':  RoundIntroSlide,
  'question':           QuestionSlide,
  'grading-break':      GradingBreakSlide,
  'scoreboard-reveal':  ScoreboardRevealSlide,
  'custom':             CustomSlide,
  'pixelate-series':    PixelateSeriesSlide,
  'multi-question':     MultiQuestionSlide,
  'pyl-reveal':         PylRevealSlide,
}

export default function SlideRenderer({ slide, show, direction }) {
  const variants = getVariants(slide, direction)
  const SlideComponent = SLIDE_COMPONENTS[slide.type] ?? CustomSlide

  return (
    <motion.div
      className="absolute inset-0"
      custom={direction}
      variants={variants}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      <SlideComponent slide={slide} show={show} />
    </motion.div>
  )
}
