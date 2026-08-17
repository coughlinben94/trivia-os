import { describe, it, expect, vi, beforeAll } from 'vitest'

// autoFitText.js measures real glyph width via a lazily-created
// `document.createElement('canvas').getContext('2d')` — there's no jsdom in
// this repo's vitest config (plain `node` environment), so a fake DOM/canvas
// stub is set up here rather than pulling in a real canvas implementation.
// The fake measurer is deliberately crude (chars * fontSizePx * a constant)
// — it doesn't need to match real glyph metrics, only to scale predictably
// with string length and font size so fitToBox's binary search has
// something real to converge against.
beforeAll(() => {
  class FakeCtx {
    constructor() { this.font = '16px sans-serif' }
    measureText(s) {
      const m = /^([\d.]+)px/.exec(this.font)
      const px = m ? parseFloat(m[1]) : 16
      return { width: s.length * px * 0.55 }
    }
  }
  globalThis.document = {
    createElement: () => ({ getContext: () => new FakeCtx() }),
  }
})

const { fitToBox, overflowsBox } = await import('./autoFitText.js')

describe('fitToBox', () => {
  it('returns the ceiling for empty/whitespace text', () => {
    expect(fitToBox('', { family: 'F', boxW: 1000, boxH: 200, floorPx: 16, ceilPx: 48 })).toBe(48)
    expect(fitToBox('   ', { family: 'F', boxW: 1000, boxH: 200, floorPx: 16, ceilPx: 48 })).toBe(48)
  })

  it('returns the ceiling when short text already fits at ceiling size', () => {
    const px = fitToBox('Hi there', { family: 'F', boxW: 1000, boxH: 200, floorPx: 16, ceilPx: 48 })
    expect(px).toBe(48)
  })

  it('shrinks within [floor, ceil] when the text does not fit at ceiling', () => {
    const long = 'This is a much longer sentence that will not fit at the ceiling size in a narrow box'
    const px = fitToBox(long, { family: 'F', boxW: 400, boxH: 120, floorPx: 12, ceilPx: 48, maxLines: 3 })
    expect(px).toBeGreaterThanOrEqual(12)
    expect(px).toBeLessThan(48)
  })

  it('is monotonic — a longer string in the same box never gets a bigger size than a shorter one', () => {
    const box = { family: 'F', boxW: 400, boxH: 120, floorPx: 12, ceilPx: 48, maxLines: 3 }
    const short = fitToBox('A short line', box)
    const long = fitToBox('A dramatically longer line with a great deal more text in it than the short one', box)
    expect(long).toBeLessThanOrEqual(short)
  })

  it('falls back to the floor and warns when nothing in range fits — never silently returns a size confirmed to fit', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const unfittable = 'a'.repeat(500) // one unbreakable "word" — no spaces to wrap on
    const px = fitToBox(unfittable, { family: 'F', boxW: 50, boxH: 20, floorPx: 10, ceilPx: 40, maxLines: 1 })
    expect(px).toBe(10)
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })
})

describe('overflowsBox', () => {
  it('is false for empty text and for text that fits at the floor', () => {
    expect(overflowsBox('', { family: 'F', boxW: 1000, boxH: 200, floorPx: 16 })).toBe(false)
    expect(overflowsBox('Hi', { family: 'F', boxW: 1000, boxH: 200, floorPx: 16 })).toBe(false)
  })

  it('is true when even the floor size cannot fit the box', () => {
    const unfittable = 'a'.repeat(500)
    expect(overflowsBox(unfittable, { family: 'F', boxW: 50, boxH: 20, floorPx: 10, maxLines: 1 })).toBe(true)
  })
})
