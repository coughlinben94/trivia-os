// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { ringDom } from './ringPrimitives.js'
import { CANDIDATE_STATIONS } from '../worlds/midnightGalaxy.candidates.js'

// Seam test (2026-09-24 final fix-wave, cheap item #2): CANDIDATE_STATIONS's
// `prim`/`variant` fields are plain strings with no compiler or type check
// tying them to ringPrimitives.js's real branches/CONSTELLATIONS keys. A
// typo in `prim` matches no makePrim branch and silently renders an empty
// frame (no error); a typo in `variant` silently falls back to Big Dipper.
// This walks every real candidate through the real render entry point and
// asserts something (not nothing) actually renders.
const dom = ringDom('', { W: 1920, H: 1080, PANES: 12, SAFE: { x: 0.2, y: 0.28, w: 0.6, h: 0.44 } })

// Expected point count per constellation variant — the drift detector: if
// CONSTELLATIONS in ringPrimitives.js changes a variant's point count
// without this file noticing, that's exactly the class of silent breakage
// this test exists to catch.
const CONSTELLATION_POINT_COUNTS = {
  bigDipper: 7,
  orion: 10, // 7 original + 3 sword (2026-09-24)
  cassiopeia: 5,
  southernCross: 4,
}

describe('CANDIDATE_STATIONS render seam — every candidate actually renders something', () => {
  for (const station of CANDIDATE_STATIONS) {
    it(`"${station.key}" (prim: ${station.prim}${station.variant ? `, variant: ${station.variant}` : ''}) renders an <svg> with content`, () => {
      const node = dom.makePrim(station.prim, 200, 200, station.hue, 0.5, () => 0.5, station.accent, 1, station.variant)
      const svg = node.querySelector('svg')
      expect(svg).toBeTruthy()
      // "renders something" — at least one drawable child, not an empty frame.
      expect(svg.children.length).toBeGreaterThan(0)

      if (station.prim === 'constellation') {
        const expectedPoints = CONSTELLATION_POINT_COUNTS[station.variant]
        expect(expectedPoints).toBeDefined() // this test itself knows every variant used
        // one glow circle + one core circle per point (see
        // ringPrimitives.constellation.test.js) — a typo'd variant that
        // silently falls back to bigDipper (7 points) would mismatch here
        // for orion/cassiopeia/southernCross (10/5/4 points).
        expect(svg.querySelectorAll('circle')).toHaveLength(expectedPoints * 2)
      }
    })
  }
})
