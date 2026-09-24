// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { ringDom } from './ringPrimitives.js'

// ringDom(prefix, engine).makePrim(...) is the real render entry point this
// file exposes (see ringPrimitives.constellation.test.js Task 2, and
// ringPrimitives.wormhole.test.js Task 3) — engine is only consulted by
// bandY/cornerX/etc, not by the darkNebula render path, so a minimal
// stand-in is enough here.
function svgFor(fill = 0.5) {
  const dom = ringDom('', { W: 1920, H: 1080, PANES: 12, SAFE: { x: 0.2, y: 0.28, w: 0.6, h: 0.44 } })
  const node = dom.makePrim('darkNebula', 200, 200, 265, 0.5, () => 0.5, false, fill)
  return node.querySelector('svg')
}

describe('dark nebula primitive', () => {
  it('renders a dark filled blob plus a separate bright rim stroke — the rim is not optional', () => {
    const svg = svgFor()
    const paths = [...svg.querySelectorAll('path')]
    expect(paths).toHaveLength(2)
    const [blob, rim] = paths
    expect(blob.getAttribute('fill')).not.toBe('none') // the dark body
    expect(rim.getAttribute('fill')).toBe('none') // the rim is stroke-only
    expect(rim.getAttribute('stroke')).toBeTruthy()
    expect(parseFloat(rim.getAttribute('stroke-width'))).toBeGreaterThanOrEqual(4) // ART-DIRECTION-SPEC.md rim rule floor
    // rendered width must actually be real px regardless of station box
    // size, not viewBox-relative — see this file's own drawPlanetDisc rim
    // for the established technique.
    expect(rim.getAttribute('vector-effect')).toBe('non-scaling-stroke')
  })

  it('the fill is genuinely dark (low lightness), not a bright/glowing mass', () => {
    const svg = svgFor()
    const fillAttr = svg.querySelector('path').getAttribute('fill')
    // hsla(hue,sat%,lightness%,alpha) — extract lightness, confirm it's low
    const lightness = parseInt(fillAttr.match(/,(\d+)%,(\d+)%,/)?.[2] ?? '999', 10)
    expect(lightness).toBeLessThan(20)
  })

  it('the rim stays bright even at a quiet station (low fill) — presence is not optional', () => {
    const svg = svgFor(0.35) // MIN fill tier used elsewhere in this file's own headline-isolated harness
    const [, rim] = [...svg.querySelectorAll('path')]
    const rimAlpha = parseFloat(rim.getAttribute('stroke').match(/,([\d.]+)\)$/)[1])
    expect(rimAlpha).toBeGreaterThan(0.5)
  })
})
