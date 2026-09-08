// @vitest-environment jsdom
// CustomEditor lives inline inside SlideEditor.jsx (named-exported alongside
// the default SlideEditor for this test). Importing that module pulls in
// lib/supabase.js at the top, which calls createClient() at import time and
// throws with no real Supabase URL/key — same fix AddSlideWizard.test.jsx
// already uses: stub the client module itself.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { useState } from 'react'

vi.mock('../../lib/supabase.js', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => Promise.resolve({ data: [] }), order: () => Promise.resolve({ data: [] }) }) }) },
}))

const { CustomEditor } = await import('./SlideEditor.jsx')

function fileInputChange(input, file) {
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

describe('<CustomEditor>', () => {
  let container, root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  // Mirrors real usage: SlideEditor owns `data` and passes onChange(key, value)
  // down; this harness does the same so CustomEditor's writes are checked via
  // the round-trip re-render, not by inspecting a spy's call args.
  function Harness({ initial = {}, uploadMedia }) {
    const [data, setData] = useState(initial)
    return <CustomEditor data={data} uploadMedia={uploadMedia} onChange={(key, value) => setData(d => ({ ...d, [key]: value }))} />
  }

  it('uploads through the trailing add-image slot into data.images', async () => {
    const uploadMedia = vi.fn(() => Promise.resolve({ url: 'https://example.com/uploaded.png' }))
    act(() => { root.render(<Harness uploadMedia={uploadMedia} />) })

    // No images yet — only the trailing "+ Add image" slot's file input exists.
    const fileInputs = container.querySelectorAll('input[type="file"]')
    expect(fileInputs.length).toBe(1)

    const file = new File(['x'], 'photo.png', { type: 'image/png' })
    await act(async () => { fileInputChange(fileInputs[0], file) })

    expect(uploadMedia).toHaveBeenCalledWith(file)
    const imgs = container.querySelectorAll('img[alt="Uploaded media"]')
    expect(imgs.length).toBe(1)
    expect(imgs[0].src).toBe('https://example.com/uploaded.png')
  })

  it('removes an image from data.images', async () => {
    act(() => {
      root.render(<Harness initial={{ images: [{ url: 'https://example.com/a.png' }] }} uploadMedia={vi.fn()} />)
    })
    expect(container.querySelectorAll('img[alt="Uploaded media"]').length).toBe(1)

    const removeBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent === '✕')
    await act(async () => { removeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })) })

    expect(container.querySelectorAll('img[alt="Uploaded media"]').length).toBe(0)
  })

  it('setting a YouTube clip lands in data.video', async () => {
    act(() => { root.render(<Harness uploadMedia={vi.fn()} />) })

    const urlInput = container.querySelector('input[placeholder="Paste a YouTube URL…"]')
    expect(urlInput).not.toBeNull()

    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    act(() => {
      nativeSetter.call(urlInput, 'dQw4w9WgXcQ')
      urlInput.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      urlInput.closest('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })

    // Once data.video.videoId is set, YoutubeClipEditor swaps its empty
    // URL-paste form for the loaded-clip view (starts on "Loading player…"
    // since the real YT IFrame API never loads in this test environment) —
    // proof the clip round-tripped through onChange('video', clip) into data.
    expect(container.querySelector('input[placeholder="Paste a YouTube URL…"]')).toBeNull()
    expect(container.textContent).toContain('Loading player')
  })

  it('nothing breaks with no images/video (default empty state)', () => {
    act(() => { root.render(<Harness uploadMedia={vi.fn()} />) })
    expect(container.querySelectorAll('img[alt="Uploaded media"]').length).toBe(0)
    expect(container.querySelector('input[placeholder="Paste a YouTube URL…"]')).not.toBeNull()
  })
})
