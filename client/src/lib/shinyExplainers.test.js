import { describe, it, expect } from 'vitest'
import { hasExplainer, EXPLAINER_BEAT_PARTS } from './shinyExplainers.js'

describe('shinyExplainers registry', () => {
  it('knows "Not So Different" by its format id', () => {
    expect(hasExplainer('fmt_not_so_different')).toBe(true)
  })
  it('has no explainer for any other format, or for a missing id', () => {
    expect(hasExplainer('fmt_venn')).toBe(false)
    expect(hasExplainer(undefined)).toBe(false)
  })
  it('the beat list is two entries: title beat then explainer beat', () => {
    expect(EXPLAINER_BEAT_PARTS).toHaveLength(2)
  })
})
