// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { ringDom } from './ringPrimitives.js'

// ringDom(prefix, engine).makePrim(...) is the existing public wrapper around
// the module-private makePrim (see ringPrimitives.js's own ringDom export) —
// engine is only consulted by bandY/cornerX/etc, not by the constellation
// render path, so a minimal stand-in is enough here.
function svgFor(variant) {
  const dom = ringDom('', { W: 1920, H: 1080, PANES: 12, SAFE: { x: 0.2, y: 0.28, w: 0.6, h: 0.44 } })
  const node = dom.makePrim('constellation', 200, 200, 210, 0.5, () => 0.5, false, 1, variant)
  return node.querySelector('svg')
}

describe('constellation primitive — dots only, per Ben\'s 2026-09-24 direction', () => {
  it('renders no <line> elements for any of the four variants', () => {
    for (const variant of ['bigDipper', 'orion', 'cassiopeia', 'southernCross']) {
      const svg = svgFor(variant)
      expect(svg.querySelectorAll('line')).toHaveLength(0)
    }
  })

  it('still renders one star (a glow + core circle pair) per point', () => {
    const svg = svgFor('bigDipper')
    // 7 points for Big Dipper -> 7 glow circles + 7 core circles = 14
    expect(svg.querySelectorAll('circle')).toHaveLength(14)
  })

  it('orion has 10 points now (7 original + 3 sword), not 7', () => {
    const svg = svgFor('orion')
    expect(svg.querySelectorAll('circle')).toHaveLength(20) // 10 points * 2 circles each
  })
})
