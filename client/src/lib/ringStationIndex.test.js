import { describe, it, expect } from 'vitest'
import { ringVisibleStationIndex } from './ringStationIndex.js'

const visible = () => true
const hidden = () => false

describe('ringVisibleStationIndex', () => {
  it('counts one station per slide when every slide is visible', () => {
    const slides = [{}, {}, {}, {}]
    expect(ringVisibleStationIndex(slides, 3, visible)).toBe(3)
  })

  it('stays flat across a run of hidden slides', () => {
    // visible, hidden, hidden, visible
    const isVisible = i => i % 3 === 0
    const slides = [0, 1, 2, 3].map(i => ({ i }))
    expect(ringVisibleStationIndex(slides, 0, s => isVisible(s.i))).toBe(0)
    expect(ringVisibleStationIndex(slides, 1, s => isVisible(s.i))).toBe(0)
    expect(ringVisibleStationIndex(slides, 2, s => isVisible(s.i))).toBe(0)
    expect(ringVisibleStationIndex(slides, 3, s => isVisible(s.i))).toBe(1)
  })

  it('returns -1 before the first visible slide is reached', () => {
    const slides = [{}, {}, {}]
    expect(ringVisibleStationIndex(slides, 1, hidden)).toBe(-1)
  })
})
