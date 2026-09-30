// @vitest-environment jsdom
// Covers ONLY WarpTransition's world choice: under theme.colorEvolution it
// must paint from the current duo's recoloured world (what
// EvolvingRingAmbient has on screen), not the authored/drawn palette. The
// canvas ground (GROUND, built from world.sky) is the observable. Mostly
// static renders (effects never run); the frozen-slideIndex test mounts for
// real, with getContext stubbed to null so the canvas loop bails at once.
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import WarpTransition from './WarpTransition.jsx'
import { ThemeProvider } from '../shared/ThemeProvider.jsx'
import { worldForDuo } from './EvolvingRingAmbient.jsx'
import { resolveArrangement } from '../../lib/ringWorldFor.js'
import { outgoingAndIncomingDuo, isTransitionSlide } from '../../lib/duoTransition.js'
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

  // Final-review finding 4: the canvas trails (BANDS) are read once at
  // mount, so the ground must not follow a slideIndex that changes mid-warp
  // (a host CAN advance during a warp) — else ground and trails split duos.
  it('freezes slideIndex at mount: a mid-warp advance across a duo boundary does not repaint the ground', () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    const ctxSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    const incomingAt = i => JSON.stringify(outgoingAndIncomingDuo(SHOW, DUO_GRAPH, i).incoming)
    const start = Array.from({ length: 60 }, (_, i) => i).find(i => isTransitionSlide(SHOW, i))
    const later = Array.from({ length: 60 }, (_, i) => i + start + 1).find(i => incomingAt(i) !== incomingAt(start))
    expect(later).toBeDefined()
    // Sanity: the two indices really paint different grounds when mounted fresh.
    expect(ground({ overrides: { colorEvolution: true }, slideIndex: later }))
      .not.toBe(ground({ overrides: { colorEvolution: true }, slideIndex: start }))

    const el = document.createElement('div')
    const root = createRoot(el)
    const tree = idx => (
      <ThemeProvider showThemeId="midnight-galaxy" overrides={{ colorEvolution: true }} showId={SHOW}>
        <WarpTransition slideIndex={idx} onDone={() => {}} />
      </ThemeProvider>
    )
    const bg = () => [...el.querySelectorAll('*')].map(n => n.style.background).find(Boolean)
    act(() => root.render(tree(start)))
    const before = bg()
    act(() => root.render(tree(later)))
    expect(bg()).toBe(before)
    act(() => root.unmount())
    ctxSpy.mockRestore()
  })

  it('ignores colorEvolution on a theme with no ring world', () => {
    expect(ground({ themeId: 'pure-michigan', overrides: { colorEvolution: true }, slideIndex: 3 }))
      .toBe(ground({ themeId: 'pure-michigan', slideIndex: 3 }))
  })
})
