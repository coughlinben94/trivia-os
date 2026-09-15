import { describe, it, expect } from 'vitest';
import { regionTransformCSS, regionFontSizeCSS, REGION_CANVAS_W, REGION_CANVAS_H } from './regionTransform.js';

describe('regionTransformCSS', () => {
  it('returns an empty string for no override', () => {
    expect(regionTransformCSS(undefined)).toBe('');
    expect(regionTransformCSS(null)).toBe('');
  });

  it('expresses dx/dy as a fraction of the reference canvas via cqw/cqh, not raw px', () => {
    const css = regionTransformCSS({ dx: 96, dy: 54, rotate: 0, scale: 1 });
    // 96/1920 = 5% of width, 54/1080 = 5% of height — same fraction, so this
    // is a real regression guard: if someone reverts to raw px (`96px`),
    // this fails immediately.
    expect(css).toContain(`96 / ${REGION_CANVAS_W} * 100cqw`);
    expect(css).toContain(`54 / ${REGION_CANVAS_H} * 100cqh`);
    expect(css).not.toMatch(/translate\(\d+px/);
  });

  it('defaults missing dx/dy/rotate/scale to identity', () => {
    const css = regionTransformCSS({});
    expect(css).toContain('0 / 1920 * 100cqw');
    expect(css).toContain('0 / 1080 * 100cqh');
    expect(css).toContain('rotate(0deg)');
    expect(css).toContain('scale(1)');
  });
});

describe('regionFontSizeCSS', () => {
  it('returns undefined for no override, so callers can ?? a fallback', () => {
    expect(regionFontSizeCSS(undefined)).toBeUndefined();
    expect(regionFontSizeCSS(null)).toBeUndefined();
  });

  it('expresses a font-size override as a fraction of canvas height via cqh, not raw px', () => {
    const css = regionFontSizeCSS(54);
    // 54/1080 = 5% of height.
    expect(css).toBe(`calc(54 / ${REGION_CANVAS_H} * 100cqh)`);
    expect(css).not.toMatch(/^\d+px$/);
  });
});
