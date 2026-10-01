import { useEffect } from 'react'
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
//         shinyFormatId, shinyFormatIcon, shinyInputType?, introSubtitle?,
//         hostPhotoUrl?, parts?, currentPart? }
// parts/currentPart exist only when the format has a rules card
// (shinyExplainers.js): beat 0 = announce, beat 1 = explainer.
// — see buildShinyTitleSlide in lib/shinySeries.js for the one place that
// stamps this shape.
export default function ShinyTitleSlide({ slide, show }) {
  const { theme } = useTheme()
  const definition = getShinyExplainer(slide.data?.shinyFormatId, slide.data?.shinyInputType)
  useEffect(() => {
    if (!definition) return
    warmImages(definition.assets)
    if (definition.preloadMapData) preloadUsMapData()
  }, [definition])
  const Renderer = EXPLAINER_RENDERERS[definition?.rendererKey]
  if ((slide.data?.currentPart ?? 0) >= 1 && definition && Renderer) {
    const example = <Renderer definition={definition} />
    return (
      <div data-testid="shiny-explainer">
        {definition.mode === 'rules'
          ? <ShinyRulesCard definition={definition}>{example}</ShinyRulesCard>
          : <ShinyExampleFrame>{example}</ShinyExampleFrame>}
      </div>
    )
  }
  return <ShinyIntroScreen slide={slide} theme={theme} show={show} />
}
