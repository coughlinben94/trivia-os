import { useTheme } from '../../shared/ThemeProvider.jsx'
import ShinyIntroScreen from '../ShinyIntroScreen.jsx'

// The standalone title card that opens every shiny series (type
// 'shiny-title'). It is a PERMANENT slide in the show order — the first
// member of its shinyGroupId — not the transient introDone swap state the
// content renderers used to carry. Visually it IS ShinyIntroScreen (the
// approved spin-land-drop announce card); this wrapper only pins isClosing to
// false, since a title slide always plays its full entrance — there is no
// "already landed" repeat case for a slide that exists exactly once.
//
// data: { isShiny: true, shinyGroupId, seriesTheme, shinyFormatName,
//         shinyFormatId, shinyFormatIcon, introSubtitle?, hostPhotoUrl? }
// — see buildShinyTitleSlide in lib/shinySeries.js for the one place that
// stamps this shape.
export default function ShinyTitleSlide({ slide, show }) {
  const { theme } = useTheme()
  return <ShinyIntroScreen slide={slide} theme={theme} show={show} isClosing={false} />
}
