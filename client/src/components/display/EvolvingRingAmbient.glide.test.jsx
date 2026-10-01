// @vitest-environment jsdom
//
// Real-render check (unmocked RingAmbient) that every ordinary one-slide
// advance — forward AND back — GLIDES on screen, the same as the plain
// RingAmbient path does. "Glides" is read straight off the DOM: turn() adds
// the `go` class to .ring-stage (the CSS transition hangs off it) in the same
// tick it writes the new offsets; a fresh mount, or a jumpTo(), never has it.
// So right after a single-step advance renders, every VISIBLE .ring-stage
// must carry `go`. Anything visible without it is a hard cut.
//
// Bug this guards (2026-09-26): a world change used to remount the visible
// world and snap while everything else glided. Since 2026-10-01 a world
// change is a single continuous ring (panes repainted in place), so there is
// nothing to remount — the tests below also pin that.
//
// Fake timers drain turn()'s busy lock (SURGE_MS + 60) between steps with a
// bounded advanceTimersByTime — never runAllTimers, which would chase the
// shooting-star scheduler forever.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import EvolvingRingAmbient from './EvolvingRingAmbient.jsx'
import { isTransitionSlide } from '../../lib/duoTransition.js'

const FAR_SURGE = 480
const PANES = 13
const SETTLE_MS = 1700 + 60 + 50 // SURGE_MS + turn()'s unlock pad + slack

function onScreenStation(stageEl) {
  const far = stageEl.querySelectorAll('.ring-surge')[1]
  const m = far?.style.transform.match(/translate3d\((-?[\d.]+)px/)
  if (!m) return null
  // Mid-wrap a glide target can equal the cylinder (13 * 480); mod it back.
  return (Math.round(-Number(m[1]) / FAR_SURGE) % PANES + PANES) % PANES
}

function isVisible(el, container) {
  for (let n = el; n && n !== container; n = n.parentElement) {
    if (n.style?.opacity === '0') return false
  }
  return true
}

function visibleStages(container) {
  return [...container.querySelectorAll('.ring-stage')].filter(s => isVisible(s, container))
}

// Bottom world first. DOM order is NOT paint order (layers are kept in a
// fixed duo-id order so React never moves a live node); zIndex is.
function byPaintOrder(stages) {
  return [...stages].sort((a, b) => Number(a.parentElement.style.zIndex || 0) - Number(b.parentElement.style.zIndex || 0))
}

describe('EvolvingRingAmbient — every single-step advance glides on screen', () => {
  let container, root

  beforeEach(() => {
    vi.useFakeTimers()
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    global.ResizeObserver = class { observe() {} disconnect() {} }
    window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => { root.unmount() })
    document.body.removeChild(container)
    vi.useRealTimers()
  })

  async function show(showId, slideIndex) {
    await act(async () => { root.render(<EvolvingRingAmbient showId={showId} slideIndex={slideIndex} />) })
  }

  async function walk(showId, indices) {
    const snaps = []
    await show(showId, indices[0])
    await act(async () => { vi.advanceTimersByTime(SETTLE_MS) })
    for (let k = 1; k < indices.length; k++) {
      const i = indices[k]
      await show(showId, i)
      const stages = visibleStages(container)
      const kind = isTransitionSlide(showId, i) ? 'transition'
        : isTransitionSlide(showId, indices[k] > indices[k - 1] ? i - 1 : i + 1) ? 'settle' : 'plain'
      const snapped = stages.filter(s => !s.classList.contains('go')).length
      if (snapped) snaps.push({ from: indices[k - 1], to: i, kind, snapped, visible: stages.length })
      await act(async () => { vi.advanceTimersByTime(SETTLE_MS) })
      // After the glide lands, every visible world sits on the right station.
      for (const s of visibleStages(container)) expect(onScreenStation(s)).toBe(i % PANES)
    }
    return snaps
  }

  const range = (a, b) => Array.from({ length: Math.abs(b - a) + 1 }, (_, k) => a < b ? a + k : a - k)

  // Seeded color changes now happen every 3-4 slides. Both walks cross the
  // 12 -> 0 station wrap during these ranges. Each real
  // RingAmbient mount costs ~2s in jsdom, hence the short ranges.
  it.each([
    ['show_b', 0, 14], ['show_b', 14, 8],
    ['show_a', 0, 7], ['show_a', 7, 2],
  ])('%s walked %i -> %i: no visible world snaps', async (showId, a, b) => {
    expect(await walk(showId, range(a, b))).toEqual([])
  }, 120_000)

  // Mid-layer elements of one pane, in the first strip copy.
  const paneEls = (pane) => {
    const mid = [...container.querySelectorAll('.ring-surge')].find(n => n.children.length === 2 && n.children[0].querySelector('[data-pane]'))
    return [...mid.children[0].querySelectorAll(`[data-pane="${pane}"]`)]
  }

  it('one ring for the whole walk; the switch slide is an empty pane with a bleed from each side', async () => {
    // show_b: the world changes arriving at slide 3 (and again at 6).
    await show('show_b', 2)
    expect(container.querySelectorAll('.ring-stage')).toHaveLength(1)
    const [stage] = container.querySelectorAll('.ring-stage')
    // pane 3 is the gap: exactly two objects, one poking in from each side
    // (an ordinary pane carries a headline, companion, specks, ...).
    const gap = paneEls(3)
    expect(gap).toHaveLength(2)
    const x0 = 3 * 1920
    const [fromLeft, fromRight] = gap.map(n => parseFloat(n.style.left))
    expect(fromLeft).toBeLessThan(x0) // starts in the previous pane
    expect(fromRight).toBeGreaterThan(x0) // starts inside this pane, runs past its right edge
    expect(paneEls(2).length).toBeGreaterThan(2)
    await act(async () => { vi.advanceTimersByTime(SETTLE_MS) })
    await show('show_b', 3)
    expect(container.querySelectorAll('.ring-stage')).toHaveLength(1)
    expect(container.querySelector('.ring-stage')).toBe(stage) // same DOM node, never remounted
    expect(stage.classList.contains('go')).toBe(true) // and it glided there
    expect(window.__world.station).toBe(3)
  }, 60_000)

  it('repaints a pane in the next world once its old slide is far behind, in both strip copies', async () => {
    // Slide 3 leaves the +-6 window at slide 10; pane 3 then belongs to slide
    // 16. Jump rather than walk — each real mount is slow in jsdom.
    await show('show_b', 2)
    const mid = [...container.querySelectorAll('.ring-surge')].find(n => n.children.length === 2 && n.children[0].querySelector('[data-pane]'))
    expect(mid.children[1].querySelectorAll('[data-pane="3"]')).toHaveLength(2) // gap, both copies
    await act(async () => { vi.advanceTimersByTime(SETTLE_MS) })
    await show('show_b', 10)
    for (const copy of mid.children) {
      const els = [...copy.querySelectorAll('[data-pane="3"]')]
      expect(els.length).toBeGreaterThan(2) // no longer the two-object gap
    }
  }, 60_000)
})
