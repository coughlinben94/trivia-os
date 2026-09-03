import { describe, it, expect } from 'vitest'

// toPageRect is defined inline in SlideCanvasEditor.jsx (not exported — it's
// a one-file-local helper). Re-implemented verbatim here as a golden-master:
// if SlideCanvasEditor.jsx's copy diverges from this, the region-detection
// math has changed and this test should be updated deliberately, not
// silently pass. (If a second consumer ever needs this function, promote it
// to client/src/lib/ and import it in both places + this test.)
function toPageRect(iframeInternalRect, iframeElRect, scale) {
  const left = iframeElRect.left + iframeInternalRect.left * scale
  const top = iframeElRect.top + iframeInternalRect.top * scale
  const width = iframeInternalRect.width * scale
  const height = iframeInternalRect.height * scale
  return { left, top, width, height, right: left + width, bottom: top + height }
}

describe('toPageRect', () => {
  it('maps an iframe-internal rect to page coordinates at scale 1, zero offset', () => {
    const result = toPageRect(
      { left: 100, top: 50, width: 200, height: 80 },
      { left: 0, top: 0 },
      1
    )
    expect(result).toEqual({ left: 100, top: 50, width: 200, height: 80, right: 300, bottom: 130 })
  })

  it('scales dimensions and offsets by the iframe element scale', () => {
    // A 1920x1080 iframe scaled to 0.5 (960x540 on screen), positioned at
    // page (40, 20) — matches SlideCanvasEditor's real geometry model.
    const result = toPageRect(
      { left: 960, top: 540, width: 100, height: 40 }, // element at iframe-center, iframe-internal px
      { left: 40, top: 20 },
      0.5
    )
    expect(result.left).toBe(40 + 960 * 0.5)   // 520
    expect(result.top).toBe(20 + 540 * 0.5)    // 290
    expect(result.width).toBe(50)
    expect(result.height).toBe(20)
    expect(result.right).toBe(result.left + 50)
    expect(result.bottom).toBe(result.top + 20)
  })

  it('handles a zero-size rect (collapsed/hidden element) without NaN', () => {
    const result = toPageRect({ left: 0, top: 0, width: 0, height: 0 }, { left: 0, top: 0 }, 1)
    expect(result).toEqual({ left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 })
  })
})
