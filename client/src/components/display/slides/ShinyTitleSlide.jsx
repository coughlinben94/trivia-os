import { useTheme } from '../../shared/ThemeProvider.jsx'
import ShinyIntroScreen from '../ShinyIntroScreen.jsx'
import NotSoDifferentExplainer from '../explainers/NotSoDifferentExplainer.jsx'

// Format id → "how it works" animation. Keep in sync with lib/shinyExplainers.js.
const EXPLAINERS = { fmt_not_so_different: NotSoDifferentExplainer }

// The standalone title card that opens every shiny series (type
// 'shiny-title'). It is a PERMANENT slide in the show order — the first
// member of its shinyGroupId — not the transient introDone swap state the
// content renderers used to carry. Visually it IS ShinyIntroScreen (the
// approved spin-land-drop announce card); this wrapper only supplies the
// theme. A title slide always plays its full entrance — there is no
// "already landed" repeat case for a slide that exists exactly once.
//
// data: { isShiny: true, shinyGroupId, seriesTheme, shinyFormatName,
//         shinyFormatId, shinyFormatIcon, introSubtitle?, hostPhotoUrl? }
// — see buildShinyTitleSlide in lib/shinySeries.js for the one place that
// stamps this shape.
export default function ShinyTitleSlide({ slide, show }) {
  const { theme } = useTheme()
  const Explainer = (slide.data?.currentPart ?? 0) >= 1 ? EXPLAINERS[slide.data?.shinyFormatId] : null
  if (Explainer) return <div data-testid="shiny-explainer"><Explainer /></div>
  return <ShinyIntroScreen slide={slide} theme={theme} show={show} />
}
