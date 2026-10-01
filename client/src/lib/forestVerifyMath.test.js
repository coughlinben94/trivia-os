import { describe, it, expect } from 'vitest'
import { luma, lumaStats, SAFE_BOX, boxPx, contrastRatio, easeInOut, cubicBezier, composite, compositeStack, diffStats, quantile, edgeSpeeds, michelson, strobeVerdict, layerContrast, STROBE_SPEED_PX, STROBE_CONTRAST } from './forestVerifyMath.js'

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
  it('compositeStack: single layer equals composite; stacked layers are source-over in order', () => {
    const D = frame(2, 2, [0, 0, 0]), A = frame(2, 2, [200, 200, 200]), B = frame(2, 2, [100, 100, 100])
    expect(diffStats(compositeStack(D, [{ rgba: A, a: 0.3 }]), composite(A, D, 0.3)).differing).toBe(0)
    // B at 0.5 over D gives 50, then A at 0.5 over that gives 125
    expect(compositeStack(D, [{ rgba: B, a: 0.5 }, { rgba: A, a: 0.5 }])[0]).toBe(125)
    expect(compositeStack(D, [])[0]).toBe(0)
  })
  it('diffStats over-threshold counts', () => {
    const A = frame(3, 1, [0, 0, 0]), B = frame(3, 1, [0, 0, 0]); B[0] = 8; B[4] = 12; B[9] = 20
    const d = diffStats(A, B); expect([d.ge8, d.ge12, d.ge16, d.max]).toEqual([3, 2, 1, 20])
  })
  it('strobe: lock constants and the four spec fixtures', () => {
    expect([STROBE_SPEED_PX, STROBE_CONTRAST]).toEqual([8, 0.10])
    expect(strobeVerdict(7.5, 0.09)).toBe(true)
    expect(strobeVerdict(8.5, 0.11)).toBe(false)
    expect(strobeVerdict(8.5, 0.09)).toBe(true)
    expect(strobeVerdict(7.5, 0.11)).toBe(true)
  })
  it('strobe: edge speeds take the fastest edge; off-screen gives null', () => {
    expect(edgeSpeeds([[0, 0, 10, 10], [2, 0, 19, 10], null, [0, 0, 1, 1]])).toEqual([9, null, null])
  })
  it('strobe: michelson + layerContrast', () => {
    expect(michelson(30, 10)).toBeCloseTo(0.5); expect(michelson(0, 0)).toBe(0)
    const A = frame(10, 10, [20, 20, 20]), B = frame(10, 10, [20, 20, 20])
    for (let i = 0; i < 30 * 4; i += 4) { A[i] = A[i + 1] = A[i + 2] = 60 }
    const c = layerContrast(A, B); expect(c.n).toBe(30); expect(c.contrast).toBeCloseTo(0.5)
    expect(layerContrast(A, B, 31).visible).toBe(false)
  })
  it('quantile', () => {
    expect(quantile([5, 1, 3, 2, 4], 0.5)).toBe(3)
    expect(quantile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.95)).toBe(10)
  })
})
