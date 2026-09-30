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
