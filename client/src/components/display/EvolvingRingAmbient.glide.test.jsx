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
// Bug this guards (2026-09-26): the settle slide right after a color
// transition used to remount the whole visible world (the "incoming" half
// lived under a different parent than the "current" slot, so React could not
// carry it over), and the incoming half of the transition slide itself was a
// fresh mount too — both snapped while everything else glided.
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
    if (n.style?.visibility === 'hidden') return false
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

  it('at settle the incoming world carries over as the current one — same DOM node, debug handle follows it', async () => {
    // show_b: transition at 3 (outgoing -> incoming), settles at 4.
    await show('show_b', 2)
    await act(async () => { vi.advanceTimersByTime(SETTLE_MS) })
    await show('show_b', 3)
    const [under, over] = byPaintOrder(visibleStages(container))
    expect(over.parentElement.style.maskImage).toMatch(/duo-wipe-/)
    await act(async () => { vi.advanceTimersByTime(SETTLE_MS) })
    await show('show_b', 4)
    const after = visibleStages(container)
    expect(after).toEqual([over])
    // The outgoing world stays mounted, hidden, so a Prev back onto the
    // transition slide can glide it back in.
    expect(container.contains(under)).toBe(true)
    expect(isVisible(under, container)).toBe(false)
    expect(over.parentElement.style.maskImage).toBe('')
    expect(over.classList.contains('go')).toBe(true)
    // window.__world belongs to the world now on screen, not the unmounted
    // outgoing one or a hidden neighbor. Matched by backdrop color (the
    // stage's background is its world's last sky stop).
    expect(window.__world.station).toBe(4)
    const probe = document.createElement('div')
    probe.style.background = window.__world.WORLD.sky.at(-1)
    expect(probe.style.background).toBe(over.style.background)
  }, 60_000)
})

describe('EvolvingRingAmbient — prefers-reduced-motion', () => {
  it('shows the incoming world whole (no drifting mask) and clears it at settle', async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    global.ResizeObserver = class { observe() {} disconnect() {} }
    window.matchMedia = (q) => ({ matches: q.includes('reduce'), addEventListener() {}, removeEventListener() {} })
    const raf = vi.spyOn(window, 'requestAnimationFrame')
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => { root.render(<EvolvingRingAmbient showId="show_b" slideIndex={2} />) })
    await act(async () => { root.render(<EvolvingRingAmbient showId="show_b" slideIndex={3} />) })
    const [, over] = byPaintOrder(visibleStages(container))
    expect(over.parentElement.style.maskImage).toMatch(/duo-wipe-/)
    expect(over.parentElement.querySelector('mask path').getAttribute('d'))
      .toBe('M -300 -300 H 1300 V 1300 H -300 Z')
    expect(raf).not.toHaveBeenCalled()
    await act(async () => { root.render(<EvolvingRingAmbient showId="show_b" slideIndex={4} />) })
    expect(visibleStages(container)).toEqual([over])
    expect(over.parentElement.style.maskImage).toBe('')
    await act(async () => { root.unmount() })
    document.body.removeChild(container)
    raf.mockRestore()
  }, 60_000)
})
