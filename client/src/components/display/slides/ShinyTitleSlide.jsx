import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { EASE_OUT } from '../../../lib/easings.js'
import { useTheme } from '../../shared/ThemeProvider.jsx'
import { warmImages } from '../../../lib/warmImages.js'
import { getShinyExplainer } from '../../../lib/shinyExplainers.js'
import { preloadUsMapData } from '../../../hooks/useUsMapData.js'
import ShinyIntroScreen from '../ShinyIntroScreen.jsx'
import NotSoDifferentExplainer from '../explainers/NotSoDifferentExplainer.jsx'
import ShinyExampleFrame from '../explainers/ShinyExampleFrame.jsx'
import ShinyRulesCard from '../explainers/ShinyRulesCard.jsx'
import BendleExplainer from '../explainers/BendleExplainer.jsx'
import PinItExplainer from '../explainers/PinItExplainer.jsx'
import HuesCuesExplainer from '../explainers/HuesCuesExplainer.jsx'
import WagerExplainer from '../explainers/WagerExplainer.jsx'
import OrderExplainer from '../explainers/OrderExplainer.jsx'
import DropExplainer from '../explainers/DropExplainer.jsx'
import MovieChainExplainer from '../explainers/MovieChainExplainer.jsx'
import ChoiceExplainer from '../explainers/ChoiceExplainer.jsx'
import MatchingExplainer from '../explainers/MatchingExplainer.jsx'

// Renderer keys are defined by the shared format registry; this map has no
// format IDs, so eligibility remains in one place.
const EXPLAINER_RENDERERS = {
  notSoDifferent: NotSoDifferentExplainer,
  bendle: BendleExplainer,
  pinIt: PinItExplainer,
  huesCues: HuesCuesExplainer,
  wager: WagerExplainer,
  order: OrderExplainer,
  drop: DropExplainer,
  movieChain: MovieChainExplainer,
  choice: ChoiceExplainer,
  matching: MatchingExplainer,
}

// The standalone title card that opens every shiny series (type
// 'shiny-title'). It is a PERMANENT slide in the show order — the first
// member of its shinyGroupId — not the transient introDone swap state the
// content renderers used to carry. Visually it IS ShinyIntroScreen (the
// approved spin-land-drop announce card); this wrapper only supplies the
// theme. A title slide always plays its full entrance — there is no
// "already landed" repeat case for a slide that exists exactly once.
//
// data: { isShiny: true, shinyGroupId, seriesTheme, shinyFormatName,
//         shinyFormatId, shinyFormatIcon, shinyInputType?, shinyMultiSelect?,
//         introSubtitle?, hostPhotoUrl?, parts?, currentPart? }
// parts/currentPart exist only when the format has a rules card
// (shinyExplainers.js): beat 0 = announce, beat 1 = explainer.
// shinyMultiSelect is stamped only on choice titles (single- vs multi-pick).
// — see buildShinyTitleSlide in lib/shinySeries.js for the one place that
// stamps this shape.
//
// Beat change is a short opacity crossfade. The announce card stays mounted
// under the explainer (faded out) and always sees currentPart 0, so its
// replayKey never changes: stepping back from the card shows the landed title
// instead of replaying the spin-land entrance. Renderers receive
// { definition, data } (data = slide.data).
//
// The explainer carries its own opaque theme.colors.shinyBg backdrop (the
// same color the shiny question after it paints), so the ambient world fades
// out under the card instead of cutting (SlideRenderer skips its bgDeep lock
// for both beats). The intro fades out faster than the card fades in, so its
// tilted title never ghosts through the half-faded card.
const FADE = { duration: 0.22, ease: EASE_OUT }
const INTRO_OUT = { duration: 0.12, ease: EASE_OUT }

export default function ShinyTitleSlide({ slide, show }) {
  const { theme } = useTheme()
  const definition = getShinyExplainer(slide.data?.shinyFormatId, slide.data?.shinyInputType)
  useEffect(() => {
    if (!definition) return
    warmImages(definition.assets)
    if (definition.preloadMapData) preloadUsMapData()
  }, [definition])
  // The intro keys its entrance on `${slide.id}:${currentPart}`; pinning
  // currentPart to 0 keeps that key stable across beat changes.
  const introSlide = slide.data?.currentPart ? { ...slide, data: { ...slide.data, currentPart: 0 } } : slide
  const Renderer = EXPLAINER_RENDERERS[definition?.rendererKey]
  const showExplainer = (slide.data?.currentPart ?? 0) >= 1 && !!definition && !!Renderer
  // Plain intro (no card): render exactly as before.
  if (!definition || !Renderer) return <ShinyIntroScreen slide={slide} theme={theme} show={show} />
  const data = slide.data ?? {}
  return (
    <>
      <motion.div
        aria-hidden={showExplainer || undefined}
        initial={false}
        animate={{ opacity: showExplainer ? 0 : 1 }}
        transition={showExplainer ? INTRO_OUT : FADE}
        style={{ position: 'absolute', inset: 0, pointerEvents: showExplainer ? 'none' : undefined }}
      >
        <ShinyIntroScreen slide={introSlide} theme={theme} show={show} />
      </motion.div>
      <AnimatePresence initial={false}>
        {showExplainer && (
          <motion.div
            key="explainer"
            data-testid="shiny-explainer"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={FADE}
            style={{ position: 'absolute', inset: 0, background: theme.colors.shinyBg }}
          >
            {definition.mode === 'rules'
              ? <ShinyRulesCard definition={definition} data={data}><Renderer definition={definition} data={data} /></ShinyRulesCard>
              : <ShinyExampleFrame><Renderer definition={definition} data={data} /></ShinyExampleFrame>}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
