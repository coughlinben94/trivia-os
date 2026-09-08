// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from '../../shared/ThemeProvider.jsx'
import CustomSlide from './CustomSlide.jsx'

describe('<CustomSlide>', () => {
  let container, root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    if (!document.fonts) document.fonts = { add() {}, delete() {}, ready: Promise.resolve() }
    // jsdom's 2d context is unimplemented; autoFitText (used for data.body)
    // measures glyph widths through one. Same crude length*size stub
    // QuestionSlide.test.jsx and autoFitText.test.js use.
    HTMLCanvasElement.prototype.getContext = () => ({
      font: '16px sans-serif',
      measureText(s) {
        const px = parseFloat(/^([\d.]+)px/.exec(this.font)?.[1] ?? 16)
        return { width: s.length * px * 0.55 }
      },
    })
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  const render = data => act(() => {
    root.render(
      <ThemeProvider>
        <CustomSlide slide={{ id: 'slide-custom', type: 'custom', data }} />
      </ThemeProvider>
    )
  })

  it('renders title/body with no image or video (default empty state keeps working)', () => {
    render({ title: 'Announcement', body: 'Back in ten minutes' })
    expect(container.textContent).toContain('Announcement')
    expect(container.textContent).toContain('Back in ten minutes')
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('iframe')).toBeNull()
  })

  it('renders each attached image', () => {
    render({ images: [{ url: 'https://example.com/a.png' }, { url: 'https://example.com/b.png' }] })
    const imgs = container.querySelectorAll('img')
    expect(imgs.length).toBe(2)
    expect(imgs[0].src).toBe('https://example.com/a.png')
    expect(imgs[1].src).toBe('https://example.com/b.png')
  })

  it('renders a real visible YouTube iframe embed for data.video, with start/end/autoplay baked into the src', () => {
    render({ video: { videoId: 'abc12345678', start: 30, end: 90, volume: 60 } })
    const iframe = container.querySelector('iframe')
    expect(iframe).not.toBeNull()
    expect(iframe.src).toContain('youtube-nocookie.com/embed/abc12345678')
    expect(iframe.src).toContain('autoplay=1')
    expect(iframe.src).toContain('start=30')
    expect(iframe.src).toContain('end=90')
  })

  it('video takes priority over images when both are set', () => {
    render({
      images: [{ url: 'https://example.com/a.png' }],
      video: { videoId: 'abc12345678' },
    })
    expect(container.querySelector('iframe')).not.toBeNull()
    expect(container.querySelector('img')).toBeNull()
  })
})
