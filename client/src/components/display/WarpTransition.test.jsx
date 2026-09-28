// Covers ONLY WarpTransition's world choice: under theme.colorEvolution it
// must paint from the current duo's recoloured world (what
// EvolvingRingAmbient has on screen), not the authored/drawn palette. The
// canvas ground (GROUND, built from world.sky) is the observable. Static
// render: effects (the canvas loop) never run, so no canvas mocking needed.
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import WarpTransition from './WarpTransition.jsx'
import { ThemeProvider } from '../shared/ThemeProvider.jsx'
import { worldForDuo } from './EvolvingRingAmbient.jsx'
import { resolveArrangement } from '../../lib/ringWorldFor.js'
import { outgoingAndIncomingDuo } from '../../lib/duoTransition.js'
import { DUO_GRAPH } from '../../lib/duoGraph.js'
import { getTheme } from '../../themes/index.js'

const SHOW = 'show_warp_test'

function ground({ themeId = 'midnight-galaxy', overrides, slideIndex }) {
  const html = renderToStaticMarkup(
    <ThemeProvider showThemeId={themeId} overrides={overrides} showId={SHOW}>
      <WarpTransition slideIndex={slideIndex} />
    </ThemeProvider>
  )
  return html.match(/background:([^"]*)"/)[1]
}

describe('WarpTransition world under color evolution', () => {
  it('paints the current duo world, not the authored palette, when colorEvolution is set', () => {
    const plain = ground({ slideIndex: 3 })
    const evolving = ground({ overrides: { colorEvolution: true }, slideIndex: 3 })
    expect(evolving).not.toBe(plain)
    const theme = { ...getTheme('midnight-galaxy'), id: 'midnight-galaxy', colorEvolution: true }
    const { incoming } = outgoingAndIncomingDuo(SHOW, DUO_GRAPH, 3)
    const world = worldForDuo(incoming, resolveArrangement(theme, SHOW))
    expect(evolving).toContain(world.sky[2])
  })

  it('falls back to the plain path when slideIndex is not known', () => {
    expect(ground({ overrides: { colorEvolution: true } })).toBe(ground({}))
  })

  it('ignores colorEvolution on a theme with no ring world', () => {
    expect(ground({ themeId: 'pure-michigan', overrides: { colorEvolution: true }, slideIndex: 3 }))
      .toBe(ground({ themeId: 'pure-michigan', slideIndex: 3 }))
  })
})
