import { describe, it, expect } from 'vitest'
import { luma, lumaStats, SAFE_BOX, boxPx, contrastRatio, easeInOut, cubicBezier, composite, diffStats, quantile } from './forestVerifyMath.js'

const frame = (W, H, rgb) => { const a = new Uint8Array(W * H * 4); for (let i = 0; i < a.length; i += 4) { a[i] = rgb[0]; a[i + 1] = rgb[1]; a[i + 2] = rgb[2]; a[i + 3] = 255 } return a }

describe('forestVerifyMath', () => {
  it('luma is Rec.709 on the bytes', () => {
    expect(luma(255, 255, 255)).toBeCloseTo(255)
    expect(luma(0, 255, 0)).toBeCloseTo(182.376)
  })
  it('safe box in pixels at 1920x1080', () => {
    expect(boxPx(SAFE_BOX, 1920, 1080)).toEqual({ x0: 384, y0: 302, x1: 1536, y1: 777 })
  })
  it('lumaStats: flat frame, bright patch moves p99.5 and mean, empty crop throws', () => {
    const W = 100, H = 100, f = frame(W, H, [20, 20, 20])
    const s = lumaStats(f, W, H, SAFE_BOX)
    expect(s.mean).toBeCloseTo(20); expect(s.p995).toBeCloseTo(20)
    // 2% of the box white: p99.5 must read the white, mean rises
    const { x0, y0 } = boxPx(SAFE_BOX, W, H)
    for (let y = y0; y < y0 + 2; y++) for (let x = x0; x < x0 + 30; x++) { const i = (y * W + x) * 4; f[i] = f[i + 1] = f[i + 2] = 255 }
    const b = lumaStats(f, W, H, SAFE_BOX)
    expect(b.p995).toBeCloseTo(255); expect(b.mean).toBeGreaterThan(20)
    expect(() => lumaStats(f, W, H, { left: 0.5, top: 0.5, width: 0, height: 0.1 })).toThrow(/empty crop/)
  })
  it('contrast: white on black 21, mid grey low', () => {
    expect(contrastRatio('#ffffff', 0)).toBeCloseTo(21)
    expect(contrastRatio('#808080', 128)).toBeCloseTo(1)
  })
  it('easing: ease-in-out endpoints, symmetry, linear bezier is identity', () => {
    expect(easeInOut(0)).toBe(0); expect(easeInOut(1)).toBe(1)
    expect(easeInOut(0.5)).toBeCloseTo(0.5, 6)
    expect(easeInOut(0.25) + easeInOut(0.75)).toBeCloseTo(1, 6)
    expect(cubicBezier(0, 0, 1, 1)(0.3)).toBeCloseTo(0.3, 6)
  })
  it('composite + diffStats', () => {
    const S = frame(4, 4, [200, 100, 0]), D = frame(4, 4, [0, 100, 200])
    expect(diffStats(composite(S, D, 1), S).differing).toBe(0)
    expect(diffStats(composite(S, D, 0), D).differing).toBe(0)
    const m = diffStats(composite(S, D, 0.5), frame(4, 4, [100, 100, 100]))
    expect(m.differing).toBe(0)
    const z = diffStats(S, D); expect(z.differing).toBe(16); expect(z.max).toBe(200)
    expect(z.mae).toBeCloseTo(400 / 3)
  })
  it('quantile', () => {
    expect(quantile([5, 1, 3, 2, 4], 0.5)).toBe(3)
    expect(quantile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.95)).toBe(10)
  })
})
