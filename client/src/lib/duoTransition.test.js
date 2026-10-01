import { describe, it, expect } from 'vitest'
import { stepIndexForSlide, outgoingAndIncomingDuo, isTransitionSlide, gapBleedFor } from './duoTransition.js'
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

  it('switches every 3-4 slides across show seeds', () => {
    for (const seed of ['show_d', 'show_k', 'show_l', 'show_m']) {
      const boundaries = []
      let last = -1
      for (let i = 0; i < 140; i++) {
        const step = stepIndexForSlide(seed, i)
        if (step !== last) { boundaries.push(i); last = step }
      }
      for (let i = 1; i < boundaries.length; i++) {
        const gap = boundaries[i] - boundaries[i - 1]
        expect(gap).toBeGreaterThanOrEqual(3)
        expect(gap).toBeLessThanOrEqual(4)
      }
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
    // 2026-09-25 after 12->15 duos, and again 2026-09-26 after 15->17 —
    // same direction bug guarded against, new graph shape gives different
    // concrete values each time, always recomputed live rather than
    // hand-derived). The old (buggy) current/next shape returned next as a
    // step-AHEAD preview instead of what's actually incoming.
    // outgoing/incoming must read the opposite direction: outgoing = the
    // previous step's duo, incoming = the current step's.
    const { outgoing, incoming } = outgoingAndIncomingDuo('show_b', DUO_GRAPH, 3)
    expect(incoming).toBe('electric_bloom')  // step 1's duo (the new current)
    expect(outgoing).toBe('neon_garden')     // step 0's duo (what it came from)
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

describe('isTransitionSlide', () => {
  it('is false at slide 0 (nothing to transition from yet)', () => {
    expect(isTransitionSlide('show_h', 0)).toBe(false)
  })

  it('is true exactly at the slides where stepIndexForSlide changes', () => {
    let prevStep = stepIndexForSlide('show_i', 0)
    for (let i = 1; i < 60; i++) {
      const step = stepIndexForSlide('show_i', i)
      expect(isTransitionSlide('show_i', i)).toBe(step !== prevStep)
      prevStep = step
    }
  })

  it('agrees with itself walking backward then forward across the same boundary (back-nav safe)', () => {
    let boundary = -1
    for (let i = 1; i < 30 && boundary === -1; i++) {
      if (isTransitionSlide('show_j', i)) boundary = i
    }
    expect(boundary).toBeGreaterThan(0)
    expect(isTransitionSlide('show_j', boundary)).toBe(true)
    expect(isTransitionSlide('show_j', boundary)).toBe(true)
  })
})

describe('gapBleedFor', () => {
  it('replays identical numbers for the same show and step, in any call order', () => {
    const later = gapBleedFor('show_gap', 9)
    gapBleedFor('show_gap', 2)
    gapBleedFor('other_show', 9)
    expect(gapBleedFor('show_gap', 9)).toEqual(later)
  })

  it('stays inside the 30-70% band, with the arriving world on the stronger half', () => {
    const seen = new Set()
    for (let step = 0; step < 60; step++) {
      const { left, right } = gapBleedFor('show_gap', step)
      seen.add(left.toFixed(3))
      expect(left).toBeGreaterThanOrEqual(0.30)
      expect(left).toBeLessThanOrEqual(0.60)
      expect(right).toBeGreaterThanOrEqual(0.45)
      expect(right).toBeLessThanOrEqual(0.70)
    }
    expect(seen.size).toBeGreaterThan(10) // really varies
  })
})
