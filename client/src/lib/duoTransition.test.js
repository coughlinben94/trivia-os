import { describe, it, expect } from 'vitest'
import { stepIndexForSlide, outgoingAndIncomingDuo, isTransitionSlide, transitionWipeFor } from './duoTransition.js'
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

describe('transitionWipeFor', () => {
  it('replays identical geometry for the same show and transition step', () => {
    expect(transitionWipeFor('show_wipe', 4)).toEqual(transitionWipeFor('show_wipe', 4))
  })

  it('varies angle, position, direction, and curve across transition steps', () => {
    const wipes = Array.from({ length: 8 }, (_, step) => transitionWipeFor('show_wipe', step))
    expect(new Set(wipes.map(w => w.angleDeg)).size).toBeGreaterThan(1)
    expect(new Set(wipes.map(w => w.centerY)).size).toBeGreaterThan(1)
    expect(new Set(wipes.map(w => w.direction)).size).toBeGreaterThan(1)
    expect(new Set(wipes.map(w => w.bulge)).size).toBeGreaterThan(1)
    for (const wipe of wipes) {
      expect(Number.isFinite(wipe.angleDeg)).toBe(true)
      expect(wipe.angleDeg).toBeGreaterThanOrEqual(-12)
      expect(wipe.angleDeg).toBeLessThanOrEqual(12)
      expect(wipe.centerY).toBeGreaterThanOrEqual(25)
      expect(wipe.centerY).toBeLessThanOrEqual(75)
      expect([-1, 1]).toContain(wipe.direction)
      expect(wipe.bulge).toBeGreaterThanOrEqual(12)
      expect(wipe.bulge).toBeLessThanOrEqual(36)
      expect(wipe.warp).toBeGreaterThanOrEqual(2)
      expect(wipe.warp).toBeLessThanOrEqual(10)
      expect(wipe.feather).toBeGreaterThanOrEqual(1.5)
      expect(wipe.feather).toBeLessThanOrEqual(4)
    }
  })

  it('does not depend on the order other transition steps are requested', () => {
    const later = transitionWipeFor('show_order', 9)
    transitionWipeFor('show_order', 2)
    transitionWipeFor('another_show', 9)
    expect(transitionWipeFor('show_order', 9)).toEqual(later)
  })
})
