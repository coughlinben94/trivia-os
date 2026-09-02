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

  it('renders the optional introSubtitle line', () => {
    render(titleSlide({ seriesTheme: 'Name That Tune', introSubtitle: 'Bluegrass Cover' }))
    expect(container.textContent).toContain('Bluegrass Cover')
  })
})
