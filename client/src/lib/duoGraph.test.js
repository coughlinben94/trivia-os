import { describe, it, expect } from 'vitest'
import { DUO_PALETTES, DUO_GRAPH } from './duoGraph.js'
import { validateDuoGraph, duoWalk } from './duoWalk.js'

describe('DUO_GRAPH', () => {
  it('is structurally valid — no dead ends, no self-loops, strongly connected', () => {
    expect(validateDuoGraph(DUO_GRAPH)).toEqual([])
  })

  it('has 10-12 duos, per the design doc', () => {
    const count = Object.keys(DUO_PALETTES).length
    expect(count).toBeGreaterThanOrEqual(10)
    expect(count).toBeLessThanOrEqual(12)
  })

  it('every graph node has a matching palette, and vice versa', () => {
    const graphIds = Object.keys(DUO_GRAPH).sort()
    const paletteIds = Object.keys(DUO_PALETTES).sort()
    expect(graphIds).toEqual(paletteIds)
  })

  it('every edge target is a real node (no typo\'d id)', () => {
    for (const [id, edges] of Object.entries(DUO_GRAPH)) {
      for (const target of edges) {
        expect(DUO_GRAPH, `"${id}" -> "${target}"`).toHaveProperty(target)
      }
    }
  })

  it('every palette has exactly 2 colors (a duo, not a trio) with weights summing to 1', () => {
    for (const [id, { colors, weights }] of Object.entries(DUO_PALETTES)) {
      expect(colors, id).toHaveLength(2)
      expect(weights, id).toHaveLength(2)
      expect(weights[0] + weights[1]).toBeCloseTo(1, 2)
    }
  })

  it('every palette carries its own certified drift arc — never falls back to the wrong, uncertified 0', () => {
    // Real bug (Codex review, 2026-09-24): the first version of this file
    // omitted drift entirely. ring_palettes certifies colors+weights+drift
    // together, and recolorWorld() silently defaults missing drift to
    // { arc: 0 } — rendering any of these duos without it would show a
    // DIFFERENT visual state than what actually passed the gate.
    for (const [id, { drift }] of Object.entries(DUO_PALETTES)) {
      expect(drift, id).toBeTruthy()
      expect(typeof drift.arc, id).toBe('number')
    }
  })

  it('a real walk stays on real duos for a long stretch (smoke test)', () => {
    for (let step = 0; step < 40; step++) {
      const id = duoWalk('show_smoke_test', DUO_GRAPH, step)
      expect(DUO_PALETTES, `step ${step}`).toHaveProperty(id)
    }
  })
})
