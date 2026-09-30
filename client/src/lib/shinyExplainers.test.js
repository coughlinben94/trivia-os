import { describe, it, expect } from 'vitest'
import { hasExplainer, explainerImageUrls, EXPLAINER_BEAT_PARTS } from './shinyExplainers.js'

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

describe('explainerImageUrls', () => {
  it('"Not So Different" has four headshots under /explainers/not-so-different/', () => {
    const urls = explainerImageUrls('fmt_not_so_different')
    expect(urls).toHaveLength(4)
    for (const u of urls) expect(u).toMatch(/^\/explainers\/not-so-different\/[a-z]+\.jpg$/)
  })
  it('other formats and a missing id have none', () => {
    expect(explainerImageUrls('fmt_venn')).toEqual([])
    expect(explainerImageUrls(undefined)).toEqual([])
  })
})
