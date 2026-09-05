import { describe, it, expect } from 'vitest'
import { LANE_CAP, assertRing } from './ringDraw.js'

const s = (key, family, prim = key, accent = false) => ({ key, family, prim, accent })

describe('LANE_CAP', () => {
  it('is floor(slots/3) — 4 at 13 slots', () => {
    expect(LANE_CAP(13)).toBe(4)
    expect(LANE_CAP(12)).toBe(4)
    expect(LANE_CAP(9)).toBe(3)
  })
})

describe('assertRing', () => {
  it('passes a ring where every family is >=3 apart cyclically', () => {
    // families A,B,C,D placed at 0,1,2,3 then repeated every 4 — max distance
    // between same-family members is >=3 for a 12-slot ring built this way
    const order = [
      s('a0', 'A'), s('b0', 'B'), s('c0', 'C'), s('d0', 'D'),
      s('a1', 'A'), s('b1', 'B'), s('c1', 'C'), s('d1', 'D'),
      s('a2', 'A'), s('b2', 'B'), s('c2', 'C'), s('d2', 'D'),
    ]
    expect(assertRing(order, { slots: 12 })).toBe(true)
  })

  it('throws when two same-family members are <3 apart', () => {
    const order = [
      s('a0', 'A'), s('a1', 'A'), s('b0', 'B'), s('c0', 'C'),
    ]
    expect(() => assertRing(order, { slots: 4 })).toThrow(/family "A".*need >=3/)
  })

  it('throws when the same prim is adjacent', () => {
    const order = [
      s('x0', 'A', 'ring'), s('x1', 'B', 'ring'), s('x2', 'C', 'dots'), s('x3', 'D', 'lens'),
    ]
    expect(() => assertRing(order, { slots: 4 })).toThrow(/prim "ring" adjacent/)
  })

  it('throws on a duplicate key', () => {
    const order = [s('dup', 'A'), s('dup', 'B'), s('c', 'C'), s('d', 'D')]
    expect(() => assertRing(order, { slots: 4 })).toThrow(/duplicate key "dup"/)
  })

  it('throws when accents exceed the cap', () => {
    const order = [
      s('a', 'A', 'a', true), s('b', 'B', 'b', true), s('c', 'C', 'c', true), s('d', 'D', 'd', true),
    ]
    expect(() => assertRing(order, { slots: 4, maxAccents: 3 })).toThrow(/4 accents, max 3/)
  })

  it('throws when one prim is used more than maxPerPrim times', () => {
    const order = [
      s('a', 'A', 'ring'), s('b', 'B', 'lens'), s('c', 'C', 'ring'),
      s('d', 'D', 'dots'), s('e', 'E', 'ring'), s('f', 'F', 'binary'),
    ]
    expect(() => assertRing(order, { slots: 6, maxPerPrim: 2 })).toThrow(/prim "ring" used 3x, max 2/)
  })

  it('wraps around the cyclic boundary (last slot vs slot 0)', () => {
    const order = [s('a0', 'A'), s('b', 'B'), s('c', 'C'), s('a1', 'A')]
    // slot 3 and slot 0 are cyclically 1 apart (4-slot ring) — same family, must throw
    expect(() => assertRing(order, { slots: 4 })).toThrow(/family "A".*need >=3/)
  })
})
