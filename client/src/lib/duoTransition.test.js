import { describe, it, expect } from 'vitest'
import { stepIndexForSlide, currentAndNextDuo } from './duoTransition.js'
import { DUO_GRAPH } from './duoGraph.js'

describe('stepIndexForSlide', () => {
  it('is deterministic for the same seed and index', () => {
    expect(stepIndexForSlide('show_a', 10)).toBe(stepIndexForSlide('show_a', 10))
  })

  it('starts at step 0 for the first few slides', () => {
    expect(stepIndexForSlide('show_b', 0)).toBe(0)
  })

  it('never decreases as the slide index rises', () => {
    let prev = -1
    for (let i = 0; i < 60; i++) {
      const step = stepIndexForSlide('show_c', i)
      expect(step).toBeGreaterThanOrEqual(prev)
      prev = step
    }
  })

  it('steps roughly every 2-3 slides, never less than 2 or more than 3 apart', () => {
    const boundaries = []
    let last = -1
    for (let i = 0; i < 100; i++) {
      const step = stepIndexForSlide('show_d', i)
      if (step !== last) { boundaries.push(i); last = step }
    }
    for (let i = 1; i < boundaries.length; i++) {
      const gap = boundaries[i] - boundaries[i - 1]
      expect(gap).toBeGreaterThanOrEqual(2)
      expect(gap).toBeLessThanOrEqual(3)
    }
  })
})

describe('currentAndNextDuo', () => {
  it('current and next are always adjacent in the graph', () => {
    for (let i = 0; i < 60; i += 3) {
      const { current, next } = currentAndNextDuo('show_e', DUO_GRAPH, i)
      expect(DUO_GRAPH[current], `at slide ${i}`).toContain(next)
    }
  })

  it('agrees with itself when called twice for the same slide (Host/Display never disagree)', () => {
    const a = currentAndNextDuo('show_f', DUO_GRAPH, 17)
    const b = currentAndNextDuo('show_f', DUO_GRAPH, 17)
    expect(a).toEqual(b)
  })
})
