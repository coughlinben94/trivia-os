// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from '../../shared/ThemeProvider.jsx'
import QuestionSlide from './QuestionSlide.jsx'

// QuestionSlide's shiny branches pull in ShinyWagerQuestion, which imports the
// real Supabase client at module load — createClient() throws on the undefined
// env vars a test run has. Never reached by these cases; only the import is.
vi.mock('../../../lib/supabase.js', () => ({ supabase: {} }))

// A plain question can carry audio without being flipped to Shiny (2026-09-01).
// The gate is worth a test because the failure mode is silent in both
// directions: a wrong gate either hides a clip the host attached (dead air on
// the TV mid-question) or mounts an <audio> element on every ordinary text
// question in the show.
describe('<QuestionSlide> — audio on a plain question', () => {
  let container, root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    globalThis.FontFace = class { load() { return Promise.resolve(this) } }
    if (!document.fonts) document.fonts = { add() {}, delete() {}, ready: Promise.resolve() }
    // jsdom's 2d context is unimplemented; autoFitText measures glyph widths
    // through one. Same crude length*size stub autoFitText.test.js uses.
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

  const slideWith = data => ({
    id: 'slide-1',
    type: 'question',
    roundId: 'round-1',
    data: { questionNumber: 1, text: 'Which lake is biggest?', answer: 'Superior', ...data },
  })

  const render = slide => act(() => {
    root.render(
      <ThemeProvider>
        <QuestionSlide slide={slide} show={{ slides: [slide] }} />
      </ThemeProvider>
    )
  })

  it('renders an audio element and a play control when a clip is attached', () => {
    render(slideWith({ mediaUrl: 'https://example.test/clip.mp3', mediaType: 'audio/mpeg', audioGainDb: 6 }))

    const audio = container.querySelector('audio')
    expect(audio).not.toBe(null)
    expect(audio.getAttribute('src')).toBe('https://example.test/clip.mp3')
    expect(container.querySelector('[role="button"][aria-label="Play audio"]')).not.toBe(null)
    // The question itself still renders — the button is additive, not a
    // different renderer (a plain question must never route through
    // ShinyAudioQuestion, which carries the intro card and waveform).
    expect(container.textContent).toContain('Which lake is biggest?')
  })

  it('renders no audio element on a plain question with no media', () => {
    render(slideWith({}))

    expect(container.querySelector('audio')).toBe(null)
    expect(container.querySelector('[role="button"]')).toBe(null)
    expect(container.textContent).toContain('Which lake is biggest?')
  })

  it('ignores non-audio media — an image on a plain question is not a clip', () => {
    render(slideWith({ mediaUrl: 'https://example.test/pic.png', mediaType: 'image/png' }))

    expect(container.querySelector('audio')).toBe(null)
  })
})
