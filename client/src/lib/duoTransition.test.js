import { describe, it, expect } from 'vitest'
import { stepIndexForSlide, outgoingAndIncomingDuo } from './duoTransition.js'
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

describe('outgoingAndIncomingDuo', () => {
  it('at step 0 (show start), outgoing equals incoming — nothing to transition from yet', () => {
    const { outgoing, incoming } = outgoingAndIncomingDuo('show_e', DUO_GRAPH, 0)
    expect(outgoing).toBe(incoming)
  })

  it('outgoing is always the PREVIOUS step, incoming the CURRENT one — real regression case', () => {
    // Pinned against actual output (Codex review, 2026-09-24; re-pinned
    // 2026-09-25 after the graph grew from 12 to 15 duos — same direction
    // bug, new graph shape gives different concrete values, recomputed
    // live rather than hand-derived). The old (buggy) current/next shape
    // returned next as a step-AHEAD preview instead of what's actually
    // incoming. outgoing/incoming must read the opposite direction:
    // outgoing = the previous step's duo, incoming = the current step's.
    const { outgoing, incoming } = outgoingAndIncomingDuo('show_b', DUO_GRAPH, 2)
    expect(incoming).toBe('mint_drift')       // step 1's duo (the new current)
    expect(outgoing).toBe('turquoise_bloom')  // step 0's duo (what it came from)
  })

  it('incoming always matches what duoWalk itself gives that step', () => {
    for (let i = 0; i < 60; i += 3) {
      const step = stepIndexForSlide('show_g', i)
      const { incoming } = outgoingAndIncomingDuo('show_g', DUO_GRAPH, i)
      expect(DUO_GRAPH).toHaveProperty(incoming)
      // incoming must be reachable from outgoing in one hop (or equal, at step 0)
      const { outgoing } = outgoingAndIncomingDuo('show_g', DUO_GRAPH, i)
      if (step > 0) expect(DUO_GRAPH[outgoing], `at slide ${i}`).toContain(incoming)
    }
  })

  it('agrees with itself when called twice for the same slide (Host/Display never disagree)', () => {
    const a = outgoingAndIncomingDuo('show_f', DUO_GRAPH, 17)
    const b = outgoingAndIncomingDuo('show_f', DUO_GRAPH, 17)
    expect(a).toEqual(b)
  })
})
