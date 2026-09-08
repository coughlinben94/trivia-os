import { describe, it, expect } from 'vitest'
import {
  BENDLE_TIERS, DEFAULT_STEP_ORDER, buildBendleTiers,
  MIN_PLAYABLE_SECONDS, clampBendleOffset,
} from './bendleScoring.js'

describe('buildBendleTiers', () => {
  it('is exactly three steps covering drums/bass/other once each in the default order', () => {
    expect(BENDLE_TIERS).toHaveLength(3)
    expect(BENDLE_TIERS.map(t => t.stems[0])).toEqual(DEFAULT_STEP_ORDER)
  })

  // Earlier layers must pay strictly more, or the format trains everyone to
  // wait for the last step. (2026-09-08, Ben retuned 30/15/10 -> 20/15/10 —
  // his call, see the file's own comment.) Monotonic decline is the
  // invariant that still has to hold, reference-only now — points aren't
  // auto-scored, Ben grades manually and this table is what he grades
  // against.
  it('pays out strictly less at each later step', () => {
    for (let i = 1; i < BENDLE_TIERS.length; i++) {
      expect(BENDLE_TIERS[i].points).toBeLessThan(BENDLE_TIERS[i - 1].points)
    }
  })

  it('labels the first step "X Only" and later steps "+ X"', () => {
    const tiers = buildBendleTiers(['bass', 'drums', 'other'])
    expect(tiers[0].label).toBe('Bass Only')
    expect(tiers[1].label).toBe('+ Drums')
    expect(tiers[2].label).toBe('+ Everything Else')
  })

  it('falls back to the default order for a malformed stepOrder', () => {
    expect(buildBendleTiers(undefined).map(t => t.stems[0])).toEqual(DEFAULT_STEP_ORDER)
    expect(buildBendleTiers(['bass']).map(t => t.stems[0])).toEqual(DEFAULT_STEP_ORDER)
    expect(buildBendleTiers(['bass', 'drums', 'other', 'vocals']).map(t => t.stems[0])).toEqual(DEFAULT_STEP_ORDER)
  })
})

describe('clampBendleOffset', () => {
  it('passes through an offset that leaves runway', () => {
    expect(clampBendleOffset(30, 200)).toBe(30)
  })

  it('clamps an offset that would run past the end of the stem', () => {
    // duration 100, needs MIN_PLAYABLE_SECONDS (5) left -> latest legal offset is 95
    expect(clampBendleOffset(98, 100)).toBe(100 - MIN_PLAYABLE_SECONDS)
  })

  it('never goes negative', () => {
    expect(clampBendleOffset(-5, 200)).toBe(0)
  })

  it('collapses to 0 when the stem is shorter than the minimum playable length', () => {
    expect(clampBendleOffset(3, 4)).toBe(0)
  })

  it('treats a missing offset as 0', () => {
    expect(clampBendleOffset(undefined, 200)).toBe(0)
  })
})
