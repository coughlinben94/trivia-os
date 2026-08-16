import { motion, useReducedMotion } from 'framer-motion'
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
import TeamPreviewSlide from './slides/TeamPreviewSlide.jsx'
import TeamPickerSlide, { REVEAL_S } from './slides/TeamPickerSlide.jsx'
import GridSlide from './slides/GridSlide.jsx'
import OverlayLayer from './OverlayLayer.jsx'
import { EASE_OUT, EASE_DROP, EASE_EXIT, EASE_PANEL } from '../../lib/easings.js'

// Per-slide content animation config — tune these without touching component logic
const SLIDE_ANIMATIONS = {
  'question': {
    initial: { opacity: 0, y: 18 },
    animate: { opacity: 1, y: 0,  transition: { duration: 0.22, ease: EASE_OUT } },
    exit:    { opacity: 0, y: -12, transition: { duration: 0.14, ease: EASE_EXIT } },
  },
  'round-intro': {
    initial: { opacity: 0, scale: 0.92 },
    animate: { opacity: 1, scale: 1, transition: { duration: 0.04 } },
    exit:    { opacity: 0, scale: 0.94, transition: { duration: 0.3, ease: EASE_EXIT } },
  },
  'grading-break': {
    initial: { opacity: 0 },
    animate: { opacity: 1, transition: { duration: 0.4, ease: EASE_OUT } },
    exit:    { opacity: 0, transition: { duration: 0.28, ease: EASE_EXIT } },
  },
  'scoreboard-reveal': {
    initial: { opacity: 0 },
    animate: { opacity: 1, transition: { duration: 0.3, ease: EASE_OUT } },
    exit:    { opacity: 0, scale: 0.98, transition: { duration: 0.25, ease: EASE_EXIT } },
  },
  'winner-reveal': {
    initial: { opacity: 0 },
    animate: { opacity: 1, transition: { duration: 0.6, ease: EASE_OUT } },
    exit:    { opacity: 0, transition: { duration: 0.3, ease: EASE_EXIT } },
  },
  'title': {
    initial: { opacity: 0 },
    animate: { opacity: 1, transition: { duration: 0.5, ease: EASE_OUT } },
    exit:    { opacity: 0, transition: { duration: 0.3, ease: EASE_EXIT } },
  },
  'shiny': {
    initial: { opacity: 0, scale: 1.06 },
    animate: { opacity: 1, scale: 1, transition: { delay: 0.05, duration: 0.28, ease: EASE_OUT } },
    exit:    { opacity: 0, scale: 0.96, transition: { duration: 0.2, ease: EASE_EXIT } },
  },
  // Same timing as 'shiny', scale delta dropped — shiny slides always used
  // this variant regardless of reduce (checked before reduce was ever
  // considered), so a reduced-motion viewer still got the 6% scale-in.
  'shiny-reduced': {
    initial: { opacity: 0 },
    animate: { opacity: 1, transition: { delay: 0.05, duration: 0.28, ease: EASE_OUT } },
    exit:    { opacity: 0, transition: { duration: 0.2, ease: EASE_EXIT } },
  },
}

// ─── Named entrance library ────────────────────────────────────────────────────
// GPU-only (opacity, y, scale). Exits always faster than enters.
const TRANSITIONS = {
  'dissolve': { initial: { opacity: 0 },             animate: { opacity: 1,           transition: { duration: 0.28, ease: EASE_EXIT } }, exit: { opacity: 0,            transition: { duration: 0.16, ease: EASE_EXIT } } },
  'emerge':   { initial: { opacity: 0, scale: 0.92 }, animate: { opacity: 1, scale: 1, transition: { duration: 0.44, ease: EASE_EXIT } }, exit: { opacity: 0, scale: 0.98, transition: { duration: 0.16, ease: EASE_EXIT } } },
  'zoom':     { initial: { opacity: 0, scale: 0.82 }, animate: { opacity: 1, scale: 1, transition: { duration: 0.30, ease: EASE_OUT } }, exit: { opacity: 0, scale: 0.97, transition: { duration: 0.16, ease: EASE_EXIT } } },
  'punch':    { initial: { opacity: 0, scale: 0.62 }, animate: { opacity: 1, scale: 1, transition: { duration: 0.24, ease: EASE_OUT } }, exit: { opacity: 0, scale: 0.90, transition: { duration: 0.14, ease: EASE_EXIT } } },
  'drop':     { initial: { opacity: 0, y: -260 },    animate: { opacity: 1, y: 0,     transition: { duration: 0.36, ease: EASE_DROP } }, exit: { opacity: 0, y: -16,      transition: { duration: 0.16, ease: EASE_EXIT } } },
  'descend':  { initial: { opacity: 0, y: -140 },    animate: { opacity: 1, y: 0,     transition: { duration: 0.52, ease: EASE_EXIT } }, exit: { opacity: 0, y: -12,      transition: { duration: 0.16, ease: EASE_EXIT } } },
  'sink':     { initial: { opacity: 0, y: -60, scale: 1.06 }, animate: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.38, ease: EASE_OUT } }, exit: { opacity: 0, y: -10, transition: { duration: 0.16, ease: EASE_EXIT } } },
  'settle':   { initial: { opacity: 0, scale: 1.07 }, animate: { opacity: 1, scale: 1, transition: { duration: 0.32, ease: EASE_EXIT } }, exit: { opacity: 0, scale: 0.99, transition: { duration: 0.16, ease: EASE_EXIT } } },
  'loom':     { initial: { opacity: 0, scale: 1.14 }, animate: { opacity: 1, scale: 1, transition: { duration: 0.34, ease: EASE_OUT } }, exit: { opacity: 0, scale: 0.98, transition: { duration: 0.16, ease: EASE_EXIT } } },
  'assemble': { initial: { opacity: 1 }, animate: { opacity: 1, transition: { duration: 0 } }, exit: { opacity: 0, transition: { duration: 0.16, ease: EASE_EXIT } } },
}

// state-of-union defaults to the zoom burst-from-center instead of a plain
// fade — the show's patriotic-address beat deserves a deliberate entrance,
// not the same bland fade a generic 'title' slide gets. (Its opacity gets
// neutralized to a constant 1 further down, regardless of this or any other
// transition assigned to it — see the comment there for why.)
SLIDE_ANIMATIONS['state-of-union'] = TRANSITIONS.zoom
// team-picker's entrance is its own exit reveal, run backwards. At the end of
// that slide the black canvas lifts off the TOP of the stage (translateY
// 0% -> -100%, REVEAL_S, EASE_PANEL — see REVEAL_VARIANTS in
// TeamPickerSlide.jsx) to reveal the ring world that has been running behind
// the stage all along. Entering, the same sheet drops in from that same top
// edge to COVER it: same axis, same edge, same duration, same curve,
// opposite direction and opposite job. One mechanic with two halves, not two
// separately-tuned ideas that happen to rhyme.
//
// translateY only, no opacity: an arriving sheet is opaque for every frame
// of its travel, so the world behind it is either covered or not — never
// seen through it. (The exit's tail-only opacity fade has no counterpart
// here for the same reason it exists there: a half-transparent black panel
// over the ring world is the exact thing that read badly.) The canvas is
// created with `{ alpha: false }`, so the sheet is opaque black from its
// first painted frame — nothing shows through the leading edge.
SLIDE_ANIMATIONS['team-picker'] = {
  initial: { transform: 'translateY(-100%)' },
  animate: { transform: 'translateY(0%)', transition: { duration: REVEAL_S, ease: EASE_PANEL } },
  // Nothing to slide out: by the time this slide is left, its black sheet has
  // already wiped away and what's on screen is the Round 1 beat over the bare
  // ring world. Sliding THAT off would be a third, unrelated motion, so the
  // slide just yields (its opacity is locked to 1 below, which is why the old
  // dissolve exit here was a 160ms wait with nothing visibly happening).
  exit: { transform: 'translateY(0%)', transition: { duration: 0 } },
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
  'team-preview':      TeamPreviewSlide,
  'team-picker':       TeamPickerSlide,
  'grid':              GridSlide,
}

export default function SlideRenderer({ slide, show, direction, isPreview = false }) {
  const { theme } = useTheme()
  const reduce = useReducedMotion()
  const isShiny = slide?.data?.isShiny

  let transitionKey = null
  let variants
  if (isShiny) {
    variants = reduce ? SLIDE_ANIMATIONS['shiny-reduced'] : SLIDE_ANIMATIONS['shiny']
  } else if (reduce) {
    variants = TRANSITIONS.dissolve
  } else {
    const resolved = resolveTransition(slide)
    if (resolved) {
      transitionKey = resolved.key
      variants = resolved.variants
    } else {
      variants = SLIDE_ANIMATIONS[slide?.type] ?? SLIDE_ANIMATIONS['question']
    }
  }

  // These three are fixed, theme-independent designs that must never be
  // caught half-transparent. ANY transition that fades this content's own
  // opacity from/to 0 — the default assigned above, a transition manually
  // picked from the editor's dropdown, even the reduced-motion dissolve
  // fallback — would show whatever sits behind the slide straight through
  // it. Neutralize opacity here regardless of which branch produced
  // `variants`, keeping whatever transform/scale/timing it chose.
  //
  // state-of-union and grid sit on this component's permanently-opaque
  // locked background (theme.colors.bgDeep, rendered below), so a fade
  // exposes the real theme color and reads as "shows the theme, then snaps
  // to the fixed design."
  //
  // team-picker no longer has that locked background at all (see the
  // exclusion below), so for it the thing showing through is the ring-world
  // ambient — which its exit wipe reveals deliberately, and which its
  // entrance wipe exists to cover. A fade would leak the world through a
  // half-transparent black sheet at both ends, the exact read the exit's
  // tail-only opacity fade was shaped to avoid. Its own entrance/exit
  // (assigned above) are translateY-only and so are unaffected by this
  // lock; what the lock still catches is a dropdown-picked transition or
  // the reduced-motion dissolve, which for this slide become a hard cut to
  // black instead of a fade-up through the world.
  if (slide?.type === 'team-picker' || slide?.type === 'state-of-union' || slide?.type === 'grid') {
    variants = {
      initial: { ...variants.initial, opacity: 1 },
      animate: { ...variants.animate, opacity: 1 },
      exit:    { ...variants.exit,    opacity: 1 },
    }
  }

  const SlideComponent = SLIDE_COMPONENTS[slide.type] ?? CustomSlide

  return (
    <>
      {/* Background — locked, never animates, instant color update.
          team-picker is the one exception: it paints its own opaque black
          canvas over the whole stage, and that canvas is what covers the
          ambient world on the way in and slides away to reveal it again on
          the way out. An opaque layer here would sit between the two — it,
          not the world, is what the reveal would uncover, and it would make
          the entrance wipe cover something already covered. So this slide
          type gets no locked background; nothing else about the ambient
          mount changes. */}
      {slide?.type !== 'team-picker' && (
        <div
          className="absolute inset-0"
          style={{ background: theme.colors.bgDeep, zIndex: 0 }}
        />
      )}

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
        {/* Type-agnostic — every slide type gets this, no per-type branch.
            Rides this motion.div's enter/exit transition for free. */}
        <OverlayLayer overlays={slide.data?.overlays} theme={theme} />
      </motion.div>
    </>
  )
}
