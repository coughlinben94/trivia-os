// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { ringDom } from './ringPrimitives.js'

// ringDom(prefix, engine).makePrim(...) is the real render entry point this
// file exposes (see ringPrimitives.constellation.test.js, Task 2) — engine is
// only consulted by bandY/cornerX/etc, not by the wormhole render path, so a
// minimal stand-in is enough here.
function svgFor() {
  const dom = ringDom('', { W: 1920, H: 1080, PANES: 12, SAFE: { x: 0.2, y: 0.28, w: 0.6, h: 0.44 } })
  const node = dom.makePrim('wormhole', 200, 130, 230, 0.5, () => 0.5, false, 1)
  return node.querySelector('svg')
}

describe('wormhole primitive', () => {
  it('renders 5 concentric ellipses, no fill, shrinking toward the center', () => {
    const svg = svgFor()
    const ellipses = [...svg.querySelectorAll('ellipse')]
    expect(ellipses).toHaveLength(5)
    ellipses.forEach(e => expect(e.getAttribute('fill')).toBe('none'))
    const radii = ellipses.map(e => parseFloat(e.getAttribute('rx')))
    for (let i = 1; i < radii.length; i++) expect(radii[i]).toBeLessThan(radii[i - 1])
  })

  it('is off-center, not a dead-centered bullseye', () => {
    const svg = svgFor()
    const cx = parseFloat(svg.querySelector('ellipse').getAttribute('cx'))
    expect(cx).not.toBeCloseTo(100, 0) // 200-wide box, dead center would be cx=100
  })
})
