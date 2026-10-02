// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

vi.mock('../../lib/supabase.js', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => Promise.resolve({ data: [] }), order: () => Promise.resolve({ data: [] }) }) }) },
}))
vi.mock('../../lib/jukeboxSupabase.js', () => ({ fetchJukeboxLibraries: () => Promise.resolve(null) }))

const { default: SlideEditor } = await import('./SlideEditor.jsx')
const { ThemeProvider } = await import('../shared/ThemeProvider.jsx')

// A host uploads a photo into a question builder; the real uploadMedia resolves to
// { url, type, filename }. The photo must land on the slide. Regression: the Matching,
// Order and Choice wrappers handed their builders a bare URL string, the builders read
// `.url` off it, and every upload silently did nothing.
const UPLOADED = 'https://example.test/uploaded-photo.png'
const slideFor = type => ({
  id: 's1', type: 'question', order: 1, roundId: 'r1',
  data: { questionNumber: 1, questionLabel: 'Q1', questionMode: 'shiny', isShiny: true, shinyFormatId: 'fmt_test', shinyFormatName: 'Test', shinyInputSchema: { type, slots: 1, seriesEnabled: false }, text: 'Q?', answer: '', mediaSlots: [] },
})

describe('<SlideEditor> photo upload in the question builders', () => {
  let container, root, updates

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
    globalThis.FontFace = class { load() { return Promise.resolve(this) } }
    if (!document.fonts) document.fonts = { add() {}, delete() {}, ready: Promise.resolve() }
    // autoFitText measures glyph widths through a 2d canvas; jsdom has none
    HTMLCanvasElement.prototype.getContext = () => ({ font: '16px sans-serif', measureText: t => ({ width: t.length * 9 }) })
    updates = []
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container)
  })
  afterEach(() => { act(() => root.unmount()); container.remove() })

  async function uploadInto(type) {
    const uploadMedia = vi.fn(async file => ({ url: UPLOADED, type: file.type, filename: file.name })) // the real shape
    await act(async () => {
      root.render(
        <ThemeProvider>
          <SlideEditor slide={slideFor(type)} show={{ id: 'h', slides: [], rounds: [] }}
            onUpdateSlide={(id, u) => { updates.push(u) }} onDeleteSlide={() => {}}
            uploadMedia={uploadMedia} getHostPhotos={async () => []} />
        </ThemeProvider>
      )
    })
    // MediaUpload's own file input (accepts .jpg...); the design toolbar's image button accepts image/*
    const inputs = [...container.querySelectorAll('input[type="file"]')]
    const builderInput = inputs.find(i => i.accept.includes('.jpg'))
    expect(builderInput, `${type}: a builder photo input exists`).toBeTruthy()
    const file = new File([new Uint8Array([1, 2, 3])], 'photo.png', { type: 'image/png' })
    Object.defineProperty(builderInput, 'files', { value: [file], configurable: true })
    await act(async () => { builderInput.dispatchEvent(new Event('change', { bubbles: true })) })
    await act(async () => { await new Promise(r => setTimeout(r, 900)) }) // the editor saves on a 600ms debounce
    expect(uploadMedia).toHaveBeenCalledTimes(1)
    return JSON.stringify(updates)
  }

  for (const type of ['matching', 'order', 'choice', 'drop']) {
    it(`${type}: the uploaded photo lands on the slide`, async () => {
      expect(await uploadInto(type)).toContain(UPLOADED)
    })
  }
})
