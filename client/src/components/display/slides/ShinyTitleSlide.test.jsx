// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from '../../shared/ThemeProvider.jsx'
import ShinyTitleSlide from './ShinyTitleSlide.jsx'

// ShinyIntroScreen pulls the shared host-photo pool from Supabase Storage at
// mount; stub the module so no client is ever created in a test run.
vi.mock('../../../lib/hostPhotos.js', () => ({
  listSharedHostPhotos: () => Promise.resolve([]),
  pickPhotoForSlide: () => null,
  getUsedHostPhotoUrls: () => new Set(),
}))

// SlideRenderer (imported by the opaque-explainer test) reaches supabase.js,
// which throws without VITE_SUPABASE_URL on a clean checkout.
vi.mock('../../../lib/supabase.js', () => ({ supabase: {} }))

const { warmImagesMock } = vi.hoisted(() => ({ warmImagesMock: vi.fn() }))
vi.mock('../../../lib/warmImages.js', () => ({ warmImages: warmImagesMock }))

describe('<ShinyTitleSlide>', () => {
  let container, root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    globalThis.FontFace = class { load() { return Promise.resolve(this) } }
    if (!document.fonts) document.fonts = { add() {}, delete() {}, ready: Promise.resolve() }
    // jsdom has no layout; ShinyIntroScreen's wrap-measure reads a Range's
    // client rects after fonts.ready. One rect = "did not wrap".
    if (!Range.prototype.getClientRects) Range.prototype.getClientRects = () => [{}]
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  const render = slide => act(() => {
    root.render(
      <ThemeProvider>
        <ShinyTitleSlide slide={slide} show={{ slides: [slide] }} />
      </ThemeProvider>
    )
  })

  const titleSlide = data => ({
    id: 'slide-title',
    type: 'shiny-title',
    roundId: 'round-1',
    data: { isShiny: true, shinyGroupId: 'sgrp_x', shinyFormatName: 'Fallback Name', ...data },
  })

  it('shows the series title from seriesTheme', () => {
    render(titleSlide({ seriesTheme: "We're not so different, you and I..." }))
    expect(container.textContent).toContain("We're not so different, you and I...")
  })

  it('falls back to shinyFormatName when seriesTheme is missing', () => {
    render(titleSlide({}))
    expect(container.textContent).toContain('Fallback Name')
  })

  it('never renders introSubtitle even when set (2026-09-08, Ben: "dont want them. at all")', () => {
    render(titleSlide({ seriesTheme: 'Name That Tune', introSubtitle: 'Bluegrass Cover' }))
    expect(container.textContent).not.toContain('Bluegrass Cover')
  })
})

describe('<ShinyTitleSlide> explainer beat', () => {
  let container, root
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    globalThis.FontFace = class { load() { return Promise.resolve(this) } }
    if (!document.fonts) document.fonts = { add() {}, delete() {}, ready: Promise.resolve() }
    if (!Range.prototype.getClientRects) Range.prototype.getClientRects = () => [{}]
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })
  afterEach(() => { act(() => root.unmount()); container.remove() })

  const slideAt = currentPart => ({
    id: 'slide-title', type: 'shiny-title', roundId: 'round-1',
    data: {
      isShiny: true, shinyGroupId: 'sgrp_x', shinyFormatId: 'fmt_not_so_different',
      seriesTheme: "We're not so different, you and I...", parts: [{}, {}], currentPart,
    },
  })
  const render = slide => act(() => {
    root.render(<ThemeProvider><ShinyTitleSlide slide={slide} show={{ slides: [slide] }} /></ThemeProvider>)
  })

  it('beat 0 shows the title, no explainer', () => {
    render(slideAt(0))
    expect(container.querySelector('[data-testid="shiny-explainer"]')).toBeNull()
  })
  it('beat 1 shows the explainer', () => {
    render(slideAt(1))
    expect(container.querySelector('[data-testid="shiny-explainer"]')).not.toBeNull()
  })
  it('beat 1 shows four real headshots and reveals the answer', () => {
    render(slideAt(1))
    const imgs = [...container.querySelectorAll('[data-testid="shiny-explainer"] img')]
    expect(imgs).toHaveLength(4)
    for (const img of imgs) expect(img.getAttribute('src')).toMatch(/^\/explainers\/not-so-different\/[a-z]+\.jpg$/)
    expect(container.textContent).toContain('One Direction')
  })
  it('warms the headshots while the title card (beat 0) is still up', () => {
    warmImagesMock.mockClear()
    render(slideAt(0))
    expect(warmImagesMock).toHaveBeenCalledTimes(1)
    expect(warmImagesMock.mock.calls[0][0]).toHaveLength(4)
  })
  it('the explainer is opaque: skipsLockedBackground is false on beat 1, true on beat 0', async () => {
    const { skipsLockedBackground } = await import('../SlideRenderer.jsx')
    expect(skipsLockedBackground(slideAt(0))).toBe(true)
    expect(skipsLockedBackground(slideAt(1))).toBe(false)
  })
})

describe('<ShinyTitleSlide> rules cards', () => {
  let container, root
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    globalThis.FontFace = class { load() { return Promise.resolve(this) } }
    if (!document.fonts) document.fonts = { add() {}, delete() {}, ready: Promise.resolve() }
    if (!Range.prototype.getClientRects) Range.prototype.getClientRects = () => [{}]
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })
  afterEach(() => { act(() => root.unmount()); container.remove() })

  const cardFor = inputType => ({
    id: 'slide-title', type: 'shiny-title', roundId: 'round-1',
    data: { isShiny: true, shinyGroupId: 'sgrp_x', shinyFormatId: 'fmt_generated_x', shinyInputType: inputType, seriesTheme: 'X', parts: [{}, {}], currentPart: 1 },
  })
  const render = slide => act(() => {
    root.render(<ThemeProvider><ShinyTitleSlide slide={slide} show={{ slides: [slide] }} /></ThemeProvider>)
  })

  it('wager card shows action, scoring and the scored sample room', async () => {
    const { SAMPLE_WAGER_RESULTS } = await import('../explainers/WagerExplainer.jsx')
    render(cardFor('wager'))
    const el = container.querySelector('[data-testid="shiny-explainer"]')
    expect(el.textContent).toContain('Pick a wager before you see the question')
    expect(el.textContent).toContain('Example')
    expect(el.textContent).toContain('Beat 2 of 4 teams to win')
    expect(SAMPLE_WAGER_RESULTS.map(r => r.points)).toEqual([20, 0, 10, 0, 0])
    expect(el.textContent).toContain('B beat 3 of 4 but wagered Fly Close To The Sun, which needs 4.')
  })

  it('order card shows one scoring answer and one zero', async () => {
    const { SAMPLE_ORDER_ANSWERS } = await import('../explainers/OrderExplainer.jsx')
    render(cardFor('order'))
    const el = container.querySelector('[data-testid="shiny-explainer"]')
    expect(el.textContent).toContain('Tap the pictures on your phone in order')
    expect(SAMPLE_ORDER_ANSWERS[0].points).toBeGreaterThan(0)
    expect(SAMPLE_ORDER_ANSWERS[1].points).toBe(0)
    expect(el.textContent).toContain('Scores')
    expect(el.textContent).toContain('Cat and Horse swapped')
  })

  it('hues-cues sample points come from the real scorer (distance-1 band)', async () => {
    const { SAMPLE_GUESS_POINTS } = await import('../explainers/HuesCuesExplainer.jsx')
    const { HUES_CUES_SCORE_BANDS } = await import('../../../lib/huesCuesScoring.js')
    expect(SAMPLE_GUESS_POINTS).toBe(HUES_CUES_SCORE_BANDS[1].points)
    render(cardFor('hues-cues'))
    expect(container.textContent).toContain(`+${HUES_CUES_SCORE_BANDS[1].points} points`)
  })
})
