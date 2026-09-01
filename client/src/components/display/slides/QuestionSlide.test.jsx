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

// The warm-audio pool builds a real hidden YouTube iframe — nothing jsdom can
// run. Stubbed so the YouTube-clip cases assert the calls the display makes
// into it (warm at mount, claim + drive on the PLAY press) instead.
const yt = vi.hoisted(() => ({ warm: vi.fn(), claim: vi.fn() }))
vi.mock('../../../lib/youtubeWarmAudio.js', () => ({
  warmYoutubeAudio: yt.warm,
  claimYoutubeAudio: yt.claim,
}))

// A plain question can carry audio without being flipped to Shiny (2026-09-01).
// The gate is worth a test because the failure mode is silent in both
// directions: a wrong gate either hides a clip the host attached (dead air on
// the TV mid-question) or mounts an <audio> element on every ordinary text
// question in the show.
const mediaPlay = vi.fn(() => Promise.resolve())

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
    // jsdom implements neither of these; the 'advance' (autoplay) path calls
    // both the moment the slide mounts.
    HTMLMediaElement.prototype.play = mediaPlay
    globalThis.AudioContext = class {
      state = 'running'
      createGain() { return { gain: {}, connect() {} } }
      createMediaElementSource() { return { connect() {} } }
      resume() { return Promise.resolve() }
      close() {}
    }
    mediaPlay.mockClear()
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

  const render = (slide, props = {}) => act(() => {
    root.render(
      <ThemeProvider>
        <QuestionSlide slide={slide} show={{ slides: [slide] }} {...props} />
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

  // A YouTube-sourced clip is stored the way every other clip in this app is —
  // mediaSlots[0] as {type:'youtube',...} — and resolveShinyPart flattens it.
  // Storing it flat on `data` instead would render nothing at all, silently.
  describe('YouTube-sourced clip', () => {
    const ytSlide = () => slideWith({
      mediaSlots: [{ type: 'youtube', videoId: 'dQw4w9WgXcQ', start: 10, end: 25, volume: 80 }],
    })

    beforeEach(() => {
      yt.warm.mockClear()
      yt.claim.mockClear()
    })

    it('renders a play control and warms the clip, with no <audio> element', () => {
      render(ytSlide())

      expect(container.querySelector('[role="button"][aria-label="Play audio"]')).not.toBe(null)
      expect(container.querySelector('audio')).toBe(null)
      expect(container.textContent).toContain('Which lake is biggest?')
      expect(yt.warm).toHaveBeenCalledWith('dQw4w9WgXcQ', 10, 25)
    })

    it('claims the warm player and starts it at the trim point at the clip volume', () => {
      const player = {
        setVolume: vi.fn(), unMute: vi.fn(), seekTo: vi.fn(),
        playVideo: vi.fn(), pauseVideo: vi.fn(),
      }
      yt.claim.mockReturnValue({
        whenReady: cb => cb(player),
        onStateChange: () => {},
        destroy: () => {},
      })
      render(ytSlide())

      const btn = container.querySelector('[role="button"]')
      act(() => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })) })

      expect(yt.claim).toHaveBeenCalledWith('dQw4w9WgXcQ', 10, 25)
      expect(player.setVolume).toHaveBeenCalledWith(80)
      expect(player.seekTo).toHaveBeenCalledWith(10, true)
      expect(player.playVideo).toHaveBeenCalled()
      expect(container.querySelector('[role="button"][aria-label="Pause audio"]')).not.toBe(null)
    })

    it('does not warm a clip in the host preview pane', () => {
      render(ytSlide(), { isPreview: true })

      expect(yt.warm).not.toHaveBeenCalled()
      expect(container.querySelector('[role="button"][aria-label="Play audio"]')).not.toBe(null)
    })
  })

  // audioTrigger: 'advance' — the walkout song's "▶️ On Advance" mode ported to
  // question audio (Ben, 2026-09-01: "i just dont want the play icon" / "i
  // click next"). 'click' (default, covered above) keeps the button.
  describe("audioTrigger: 'advance'", () => {
    const player = () => ({
      setVolume: vi.fn(), unMute: vi.fn(), seekTo: vi.fn(),
      playVideo: vi.fn(), pauseVideo: vi.fn(),
    })

    beforeEach(() => {
      yt.warm.mockClear()
      yt.claim.mockClear()
    })

    it('auto-plays an uploaded clip on mount, with no play button', () => {
      render(slideWith({
        mediaUrl: 'https://example.test/clip.mp3', mediaType: 'audio/mpeg',
        audioGainDb: 6, audioTrigger: 'advance',
      }))

      expect(container.querySelector('audio')).not.toBe(null)
      expect(container.querySelector('[role="button"]')).toBe(null)
      expect(mediaPlay).toHaveBeenCalled()
    })

    it('claims and starts a YouTube clip on mount, with no play button', () => {
      const p = player()
      yt.claim.mockReturnValue({
        whenReady: cb => cb(p), onStateChange: () => {}, destroy: () => {},
      })
      render(slideWith({
        mediaSlots: [{ type: 'youtube', videoId: 'dQw4w9WgXcQ', start: 10, end: 25, volume: 80 }],
        audioTrigger: 'advance',
      }))

      expect(container.querySelector('[role="button"]')).toBe(null)
      expect(yt.claim).toHaveBeenCalledWith('dQw4w9WgXcQ', 10, 25)
      expect(p.setVolume).toHaveBeenCalledWith(80)
      expect(p.seekTo).toHaveBeenCalledWith(10, true)
      expect(p.playVideo).toHaveBeenCalled()
    })

    it('never auto-plays in the host preview pane', () => {
      yt.claim.mockReturnValue({
        whenReady: cb => cb(player()), onStateChange: () => {}, destroy: () => {},
      })
      render(slideWith({
        mediaSlots: [{ type: 'youtube', videoId: 'dQw4w9WgXcQ', start: 10, end: 25 }],
        audioTrigger: 'advance',
      }), { isPreview: true })
      expect(yt.claim).not.toHaveBeenCalled()

      render(slideWith({
        mediaUrl: 'https://example.test/clip.mp3', mediaType: 'audio/mpeg',
        audioTrigger: 'advance',
      }), { isPreview: true })
      expect(mediaPlay).not.toHaveBeenCalled()
    })
  })

  // Click-mode audio, fired remotely: LiveMode's "Next plays audio" (Ben,
  // 2026-09-01, live: wants to read the question to the room first, THEN have
  // his own next press — not a literal tap on the TV — start the clip).
  // show.audio_playing is the same field ShinyAudioQuestion already reacts to
  // (wired 2026-08-?? for shiny, upload-only there); this is the plain-question
  // side of it, and unlike the shiny path it must also cover a YouTube source
  // since that's what's actually attached to tonight's slide.
  describe("audioTrigger: 'click' — remote play via show.audio_playing", () => {
    const player = () => ({
      setVolume: vi.fn(), unMute: vi.fn(), seekTo: vi.fn(),
      playVideo: vi.fn(), pauseVideo: vi.fn(),
    })

    beforeEach(() => {
      yt.warm.mockClear()
      yt.claim.mockClear()
    })

    it('plays an uploaded clip when show.audio_playing matches this slide', () => {
      const slide = slideWith({ mediaUrl: 'https://example.test/clip.mp3', mediaType: 'audio/mpeg', audioGainDb: 6 })
      render(slide, { show: { slides: [slide], audio_playing: { slideId: 'slide-1', playing: true } } })

      expect(mediaPlay).toHaveBeenCalled()
    })

    it('claims and starts a YouTube clip when show.audio_playing matches this slide', () => {
      const p = player()
      yt.claim.mockReturnValue({ whenReady: cb => cb(p), onStateChange: () => {}, destroy: () => {} })
      const slide = slideWith({ mediaSlots: [{ type: 'youtube', videoId: 'dQw4w9WgXcQ', start: 10, end: 25, volume: 80 }] })
      render(slide, { show: { slides: [slide], audio_playing: { slideId: 'slide-1', playing: true } } })

      expect(yt.claim).toHaveBeenCalledWith('dQw4w9WgXcQ', 10, 25)
      expect(p.playVideo).toHaveBeenCalled()
    })

    it('does not play on mount without a matching audio_playing signal', () => {
      const slide = slideWith({ mediaUrl: 'https://example.test/clip.mp3', mediaType: 'audio/mpeg' })
      render(slide, { show: { slides: [slide], audio_playing: null } })

      expect(mediaPlay).not.toHaveBeenCalled()
    })

    it('ignores an audio_playing signal for a different slide', () => {
      const slide = slideWith({ mediaUrl: 'https://example.test/clip.mp3', mediaType: 'audio/mpeg' })
      render(slide, { show: { slides: [slide], audio_playing: { slideId: 'some-other-slide', playing: true } } })

      expect(mediaPlay).not.toHaveBeenCalled()
    })

    it('ignores audio_playing in the host preview pane', () => {
      const slide = slideWith({ mediaUrl: 'https://example.test/clip.mp3', mediaType: 'audio/mpeg' })
      render(slide, { show: { slides: [slide], audio_playing: { slideId: 'slide-1', playing: true } }, isPreview: true })

      expect(mediaPlay).not.toHaveBeenCalled()
    })
  })
})
