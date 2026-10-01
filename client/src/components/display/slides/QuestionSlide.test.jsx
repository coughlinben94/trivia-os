// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from '../../shared/ThemeProvider.jsx'
import QuestionSlide from './QuestionSlide.jsx'
import { director } from '../../../audio/director.js'

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
    director._internals.reset() // one singleton across the file: start every case clean
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

    // The slide draws no <audio> of its own: the audio director owns playback and
    // only creates the element when the clip is played.
    expect(container.querySelector('audio')).toBe(null)
    expect(container.querySelector('[role="button"][aria-label="Play audio"]')).not.toBe(null)
    act(() => { container.querySelector('[role="button"]').dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(document.querySelector('audio')?.getAttribute('src')).toBe('https://example.test/clip.mp3')
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

      expect(document.querySelector('audio')).not.toBe(null)
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
  // show.audio_playing is the same field ShinyAudioQuestion reacts to (see
  // that component's own tests further below) — this is the plain-question
  // side of it, and must cover a YouTube source too since that's what's
  // actually attached to tonight's slide.
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

    // Every realtime UPDATE hands the TV a fresh audio_playing OBJECT (a flag-only
    // write like the A answer reveal carries the whole small column), so an effect
    // keyed on object identity re-ran on every show update and a finished clip
    // restarted when the host revealed the answer. Keyed on the mark's VALUES now.
    it('does NOT replay when an unrelated update re-delivers the same mark as a new object', () => {
      const slide = slideWith({ mediaUrl: 'https://example.test/clip.mp3', mediaType: 'audio/mpeg' })
      render(slide, { show: { slides: [slide], audio_playing: { slideId: 'slide-1', playing: true } } })
      expect(mediaPlay).toHaveBeenCalledTimes(1)
      render(slide, { show: { slides: [slide], audio_playing: { slideId: 'slide-1', playing: true }, answer_reveal: true } })
      render(slide, { show: { slides: [slide], audio_playing: { slideId: 'slide-1', playing: true }, scoreboard_visible: true } })
      expect(mediaPlay).toHaveBeenCalledTimes(1)
    })

    it('still plays when the mark is cleared and then set again', () => {
      const slide = slideWith({ mediaUrl: 'https://example.test/clip.mp3', mediaType: 'audio/mpeg' })
      render(slide, { show: { slides: [slide], audio_playing: { slideId: 'slide-1', playing: true } } })
      render(slide, { show: { slides: [slide], audio_playing: null } })
      render(slide, { show: { slides: [slide], audio_playing: { slideId: 'slide-1', playing: true } } })
      expect(mediaPlay).toHaveBeenCalledTimes(2)
    })

    it('ignores audio_playing in the host preview pane', () => {
      const slide = slideWith({ mediaUrl: 'https://example.test/clip.mp3', mediaType: 'audio/mpeg' })
      render(slide, { show: { slides: [slide], audio_playing: { slideId: 'slide-1', playing: true } }, isPreview: true })

      expect(mediaPlay).not.toHaveBeenCalled()
    })
  })

  // 2026-09-29 runner-up cause: Chrome blocks UNMUTED playback on a tab with no
  // click/key since load, silently. A clip asked to play that makes no sound
  // must say so ("Click for sound" — a real user gesture, so it can recover) and
  // report to Sentry, instead of leaving the room in dead air.
  describe('a clip that never makes sound shows "Click for sound"', () => {
    const player = state => ({
      setVolume: vi.fn(), unMute: vi.fn(), seekTo: vi.fn(), playVideo: vi.fn(), pauseVideo: vi.fn(),
      getPlayerState: () => state, isMuted: () => false,
    })
    const cue = () => [...container.querySelectorAll('button')].find(b => b.textContent.includes('Click for sound'))
    const playingEl = function () { Object.defineProperty(this, 'paused', { value: false, configurable: true }); return Promise.resolve() }
    const upload = () => slideWith({ mediaUrl: 'https://example.test/clip.mp3', mediaType: 'audio/mpeg' })
    const marked = slide => ({ show: { slides: [slide], audio_playing: { slideId: 'slide-1', playing: true } } })
    const later = ms => act(async () => { await vi.advanceTimersByTimeAsync(ms) })

    beforeEach(() => { vi.useFakeTimers(); mediaPlay.mockReset(); mediaPlay.mockImplementation(playingEl) })
    afterEach(() => { vi.useRealTimers(); mediaPlay.mockReset(); mediaPlay.mockImplementation(() => Promise.resolve()) })

    it('shows the cue when the browser rejects play() (autoplay policy)', async () => {
      mediaPlay.mockImplementationOnce(() => Promise.reject(new DOMException('blocked', 'NotAllowedError')))
      const slide = upload()
      render(slide, marked(slide))
      await later(0)
      expect(cue()).toBeTruthy()
    })

    it('shows no cue when the clip really plays', async () => {
      const slide = upload()
      render(slide, marked(slide))
      await later(3000)
      expect(cue()).toBeFalsy()
    })

    it('shows the cue when a YouTube clip is not playing 2s after play was asked for', async () => {
      yt.claim.mockReturnValue({ whenReady: cb => cb(player(2)), onStateChange: () => {}, destroy: () => {} })
      const slide = slideWith({ mediaSlots: [{ type: 'youtube', videoId: 'abc', start: 0, end: 20 }] })
      render(slide, marked(slide))
      await later(1900)
      expect(cue()).toBeFalsy()
      await later(200)
      expect(cue()).toBeTruthy()
    })

    it('shows no cue when the YouTube clip is playing (or just buffering)', async () => {
      for (const state of [1, 3]) {
        yt.claim.mockReturnValue({ whenReady: cb => cb(player(state)), onStateChange: () => {}, destroy: () => {} })
        const slide = slideWith({ mediaSlots: [{ type: 'youtube', videoId: `v${state}`, start: 0, end: 20 }] })
        render(slide, marked(slide))
        await later(3000)
        expect(cue()).toBeFalsy()
      }
    })

    // Found in a real Chromium run (2026-10-01): with no user gesture, AudioContext
    // .resume() does not reject, it just never settles — so play() hangs before it
    // can throw, and a check that only starts after play() finishes never starts.
    it('shows the cue when the audio context never resumes (resume() hangs, play() never reached)', async () => {
      const Real = globalThis.AudioContext
      globalThis.AudioContext = class {
        state = 'suspended'
        createGain() { return { gain: {}, connect() {} } }
        createMediaElementSource() { return { connect() {} } }
        resume() { return new Promise(() => {}) }
        close() {}
      }
      try {
        const slide = upload()
        render(slide, marked(slide))
        await later(1900)
        expect(cue()).toBeFalsy()
        await later(200)
        expect(cue()).toBeTruthy()
      } finally {
        globalThis.AudioContext = Real
      }
    })

    it('tapping the cue retries the play and clears the cue', async () => {
      mediaPlay.mockImplementationOnce(() => Promise.reject(new DOMException('blocked', 'NotAllowedError')))
      const slide = upload()
      render(slide, marked(slide))
      await later(0)
      expect(mediaPlay).toHaveBeenCalledTimes(1)
      await act(async () => { cue().click() })
      expect(mediaPlay).toHaveBeenCalledTimes(2)
      expect(cue()).toBeFalsy()
    })

    it('the cue is a no-step target (a tap on it must not advance the show)', async () => {
      mediaPlay.mockImplementationOnce(() => Promise.reject(new DOMException('blocked', 'NotAllowedError')))
      const slide = upload()
      render(slide, marked(slide))
      await later(0)
      expect(cue().closest('[data-no-step]')).toBeTruthy()
    })

    it('never shows the cue in the host preview pane (the host is not the room)', async () => {
      yt.claim.mockReturnValue({ whenReady: cb => cb(player(2)), onStateChange: () => {}, destroy: () => {} })
      const slide = slideWith({ mediaSlots: [{ type: 'youtube', videoId: 'abc', start: 0, end: 20 }] })
      render(slide, { show: { slides: [slide], audio_playing: null }, isPreview: true })
      // an explicit PLAY press still works in preview; its clip not sounding must not raise the cue
      await act(async () => { container.querySelector('[role="button"]').click() })
      await later(3000)
      expect(cue()).toBeFalsy()
    })

    // Review of the audio branch (2026-10-01): the cue was only ever cleared when
    // `playing` went false or on a tap, so a SLOW start (player still cued at 2s,
    // then really playing) left "Click for sound" over a clip that was sounding.
    it('clears the cue by itself once the clip is really sounding (a slow start, not a block)', async () => {
      let state = 5
      const p = { setVolume: vi.fn(), unMute: vi.fn(), seekTo: vi.fn(), playVideo: vi.fn(), pauseVideo: vi.fn(), getPlayerState: () => state, isMuted: () => false }
      yt.claim.mockReturnValue({ whenReady: cb => cb(p), onStateChange: () => {}, destroy: () => {} })
      const slide = slideWith({ mediaSlots: [{ type: 'youtube', videoId: 'slow', start: 0, end: 30 }] })
      render(slide, marked(slide))
      await later(2100)
      expect(cue()).toBeTruthy()
      state = 1 // it finally starts
      await later(1100)
      expect(cue()).toBeFalsy()
    })

    it('a YouTube retry that is still silent raises the cue again (not a silent second failure)', async () => {
      const p = { setVolume: vi.fn(), unMute: vi.fn(), seekTo: vi.fn(), playVideo: vi.fn(), pauseVideo: vi.fn(), getPlayerState: () => 2, isMuted: () => false }
      yt.claim.mockReturnValue({ whenReady: cb => cb(p), onStateChange: () => {}, destroy: () => {} })
      const slide = slideWith({ mediaSlots: [{ type: 'youtube', videoId: 'stuck', start: 0, end: 30 }] })
      render(slide, marked(slide))
      await later(2100)
      expect(cue()).toBeTruthy()
      await act(async () => { cue().click() })
      expect(cue()).toBeFalsy() // cleared on the tap...
      await later(2100)
      expect(cue()).toBeTruthy() // ...and back, because it is STILL not sounding
    })

    // Re-review of c754c7c: the retry's 2s check lived on watchRef and was only cancelled by
    // the pause button or unmount, so a clip that ENDED (or auto-stopped) before 2s still got
    // a false cue + false Sentry report.
    it('a clip that ends before the retry check fires raises no false cue', async () => {
      let onState
      let state = 2
      const p = { setVolume: vi.fn(), unMute: vi.fn(), seekTo: vi.fn(), playVideo: vi.fn(), pauseVideo: vi.fn(), getPlayerState: () => state, isMuted: () => false }
      yt.claim.mockReturnValue({ whenReady: cb => cb(p), onStateChange: cb => { onState = cb }, destroy: () => {} })
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      try {
        const slide = slideWith({ mediaSlots: [{ type: 'youtube', videoId: 'short', start: 0, end: 30 }] })
        render(slide, marked(slide))
        await later(2100)
        expect(cue()).toBeTruthy()
        warn.mockClear()
        await act(async () => { cue().click() }) // retry arms a fresh 2s check
        state = 0
        await act(async () => { onState(0) }) // the clip ends right away (ENDED)
        await later(3000)
        expect(cue()).toBeFalsy()
        expect(warn.mock.calls.filter(c => String(c[0]).includes('play blocked'))).toHaveLength(0)
      } finally {
        warn.mockRestore()
      }
    })

    it('the cue is fixed-positioned so it cannot push the question text around', async () => {
      mediaPlay.mockImplementationOnce(() => Promise.reject(new DOMException('blocked', 'NotAllowedError')))
      const slide = upload()
      render(slide, marked(slide))
      await later(0)
      expect(cue().style.position).toBe('fixed')
    })

    it('shows no cue when nothing was asked to play', async () => {
      const slide = upload()
      render(slide, { show: { slides: [slide], audio_playing: null } })
      await later(5000)
      expect(cue()).toBeFalsy()
    })
  })
})

// P1, live, Round 2: "One Hit Unwonder" — a shiny audio question. "hitting
// next skips to next question, doesnt play audio." LiveMode's Next-plays-
// audio gate (maybeStartAudioPlay) now covers shiny audio questions too
// once their intro is dismissed, same show.audio_playing field the plain-
// question path above uses — but ShinyAudioQuestion's own listener for it
// used to be gated `if (isYoutubeSource) return`, so it never actually fired
// for a YouTube-sourced clip, which is what tonight's slide actually has.
describe('<QuestionSlide> — shiny audio question, remote play via show.audio_playing', () => {
  let container, root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    globalThis.FontFace = class { load() { return Promise.resolve(this) } }
    if (!document.fonts) document.fonts = { add() {}, delete() {}, ready: Promise.resolve() }
    HTMLCanvasElement.prototype.getContext = () => ({
      font: '16px sans-serif',
      measureText(s) { return { width: s.length * 8 } },
    })
    HTMLMediaElement.prototype.play = mediaPlay
    globalThis.AudioContext = class {
      state = 'running'
      createGain() { return { gain: {}, connect() {} } }
      createMediaElementSource() { return { connect() {} } }
      resume() { return Promise.resolve() }
      close() {}
    }
    mediaPlay.mockClear()
    director._internals.reset()
    yt.warm.mockClear()
    yt.claim.mockClear()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  const shinySlide = data => ({
    id: 'shiny-1',
    type: 'question',
    roundId: 'round-2',
    data: { isShiny: true, shinyType: 'audio', introDone: true, questionNumber: 6, ...data },
  })

  const render = (slide, show) => act(() => {
    root.render(
      <ThemeProvider>
        <QuestionSlide slide={slide} show={show ?? { slides: [slide] }} />
      </ThemeProvider>
    )
  })

  it('plays an uploaded clip when show.audio_playing matches this slide', () => {
    const slide = shinySlide({ mediaUrl: 'https://example.test/clip.mp3', mediaType: 'audio/mpeg' })
    render(slide, { slides: [slide], audio_playing: { slideId: 'shiny-1', playing: true } })

    expect(mediaPlay).toHaveBeenCalled()
  })

  it('claims and starts a YouTube clip when show.audio_playing matches this slide', () => {
    const p = { setVolume: vi.fn(), unMute: vi.fn(), seekTo: vi.fn(), playVideo: vi.fn(), pauseVideo: vi.fn() }
    yt.claim.mockReturnValue({ whenReady: cb => cb(p), onStateChange: () => {}, destroy: () => {} })
    const slide = shinySlide({ mediaSlots: [{ type: 'youtube', videoId: 'kryV3E4QKGk', start: 29.5, end: 57.4, volume: 100 }] })
    render(slide, { slides: [slide], audio_playing: { slideId: 'shiny-1', playing: true } })

    expect(yt.claim).toHaveBeenCalledWith('kryV3E4QKGk', 29.5, 57.4)
    expect(p.playVideo).toHaveBeenCalled()
  })

  // 2026-09-01: the announce card is its own 'shiny-title' slide now. A
  // shiny content slide must render its content regardless of introDone —
  // the old `!introDone -> <ShinyIntroScreen>` swap is gone.
  it('renders content, not the intro card, even when introDone is false or missing', () => {
    const stale = shinySlide({ mediaUrl: 'https://example.test/clip.mp3', mediaType: 'audio/mpeg', introDone: false })
    render(stale, { slides: [stale] })
    expect(container.textContent).toContain('▶')

    const { introDone, ...noFlag } = shinySlide({ mediaUrl: 'https://example.test/clip.mp3', mediaType: 'audio/mpeg' }).data
    render({ id: 'shiny-1', type: 'question', roundId: 'round-2', data: noFlag })
    expect(container.textContent).toContain('▶')
  })

  it('does not play on mount without a matching audio_playing signal', () => {
    const slide = shinySlide({ mediaUrl: 'https://example.test/clip.mp3', mediaType: 'audio/mpeg' })
    render(slide, { slides: [slide], audio_playing: null })

    expect(mediaPlay).not.toHaveBeenCalled()
  })

  // Multi-part series: one slide.id for every part, so the mark names the part.
  describe('multi-part series — the mark names the part it plays', () => {
    const part = n => ({ text: `p${n}`, mediaSlots: [{ type: 'audio/mpeg', url: `https://example.test/p${n}.mp3` }] })
    const series = currentPart => shinySlide({ parts: [part(0), part(1), part(2)], currentPart })

    it('plays the current part when the mark names that part', () => {
      const slide = series(1)
      render(slide, { slides: [slide], audio_playing: { slideId: 'shiny-1', playing: true, part: 1 } })
      expect(mediaPlay).toHaveBeenCalled()
    })

    it('does NOT autoplay on arrival when the mark is for a different part', () => {
      const slide = series(0)
      render(slide, { slides: [slide], audio_playing: { slideId: 'shiny-1', playing: true, part: 1 } })
      expect(mediaPlay).not.toHaveBeenCalled()
    })

    it('a mark without a part (older writers) still plays part 0', () => {
      const slide = series(0)
      render(slide, { slides: [slide], audio_playing: { slideId: 'shiny-1', playing: true } })
      expect(mediaPlay).toHaveBeenCalled()
    })

    it('does NOT replay when an unrelated update re-delivers the same mark as a new object', () => {
      const slide = series(0)
      render(slide, { slides: [slide], audio_playing: { slideId: 'shiny-1', playing: true, part: 0 } })
      expect(mediaPlay).toHaveBeenCalledTimes(1)
      render(slide, { slides: [slide], audio_playing: { slideId: 'shiny-1', playing: true, part: 0 }, answer_reveal: true })
      expect(mediaPlay).toHaveBeenCalledTimes(1)
    })

    // Re-review of c754c7c. Series p0 audio / p1 silent / p2 audio: play p0, Next to p1 (no
    // mark), Prev back to p0 writes the SAME {part:0} values again. A nonce (`at`) makes it a
    // new request; an echo of the SAME write (same `at`) must still not replay.
    it('the same slide+part with a NEW nonce plays again; the same nonce re-delivered does not', () => {
      const slide = series(0)
      render(slide, { slides: [slide], audio_playing: { slideId: 'shiny-1', playing: true, part: 0, at: 1 } })
      expect(mediaPlay).toHaveBeenCalledTimes(1)
      render(slide, { slides: [slide], audio_playing: { slideId: 'shiny-1', playing: true, part: 0, at: 1 } }) // echo
      expect(mediaPlay).toHaveBeenCalledTimes(1)
      render(slide, { slides: [slide], audio_playing: { slideId: 'shiny-1', playing: true, part: 0, at: 2 } }) // a real new request
      expect(mediaPlay).toHaveBeenCalledTimes(2)
    })

    // The real write lands the part change and the new mark in ONE render (one UPDATE
    // carries both). The earlier tests deliver them in two renders; this pins the real
    // shape, which only works because the partKey pause effect runs before the play effect.
    it('plays the new part when the part change and its mark arrive in the SAME render', () => {
      const s0 = series(0)
      render(s0, { slides: [s0], audio_playing: { slideId: 'shiny-1', playing: true, part: 0, at: 1 } })
      expect(mediaPlay).toHaveBeenCalledTimes(1)
      const s1 = series(1)
      render(s1, { slides: [s1], audio_playing: { slideId: 'shiny-1', playing: true, part: 1, at: 2 } })
      expect(mediaPlay).toHaveBeenCalledTimes(2)
      expect(document.querySelector('audio').getAttribute('src')).toContain('p1.mp3') // part 0's element was released
    })

    it('a new mark for the next part plays it without remounting', () => {
      const s0 = series(0)
      render(s0, { slides: [s0], audio_playing: { slideId: 'shiny-1', playing: true, part: 0 } })
      expect(mediaPlay).toHaveBeenCalledTimes(1)
      const s1 = series(1)
      render(s1, { slides: [s1], audio_playing: { slideId: 'shiny-1', playing: true, part: 0 } })
      expect(mediaPlay).toHaveBeenCalledTimes(1) // the part step alone must not replay
      render(s1, { slides: [s1], audio_playing: { slideId: 'shiny-1', playing: true, part: 1 } })
      expect(mediaPlay).toHaveBeenCalledTimes(2)
    })
  })

  describe('a clip that never makes sound shows "Click for sound"', () => {
    const player = state => ({
      setVolume: vi.fn(), unMute: vi.fn(), seekTo: vi.fn(), playVideo: vi.fn(), pauseVideo: vi.fn(),
      getPlayerState: () => state, isMuted: () => false,
    })
    const cue = () => [...container.querySelectorAll('button')].find(b => b.textContent.includes('Click for sound'))
    const later = ms => act(async () => { await vi.advanceTimersByTimeAsync(ms) })
    const marked = { slideId: 'shiny-1', playing: true }

    beforeEach(() => { vi.useFakeTimers() })
    afterEach(() => { vi.useRealTimers(); mediaPlay.mockReset(); mediaPlay.mockImplementation(() => Promise.resolve()) })

    it('shows the cue when the browser rejects play() on an uploaded shiny clip', async () => {
      mediaPlay.mockImplementationOnce(() => Promise.reject(new DOMException('blocked', 'NotAllowedError')))
      const slide = shinySlide({ mediaUrl: 'https://example.test/clip.mp3', mediaType: 'audio/mpeg' })
      render(slide, { slides: [slide], audio_playing: marked })
      await later(0)
      expect(cue()).toBeTruthy()
    })

    it('shows the cue when a YouTube shiny clip is not playing 2s after play was asked for', async () => {
      yt.claim.mockReturnValue({ whenReady: cb => cb(player(2)), onStateChange: () => {}, destroy: () => {} })
      const slide = shinySlide({ mediaSlots: [{ type: 'youtube', videoId: 'kryV3E4QKGk', start: 0, end: 30, volume: 100 }] })
      render(slide, { slides: [slide], audio_playing: marked })
      await later(2100)
      expect(cue()).toBeTruthy()
    })

    it('shows no cue when the YouTube clip is playing', async () => {
      yt.claim.mockReturnValue({ whenReady: cb => cb(player(1)), onStateChange: () => {}, destroy: () => {} })
      const slide = shinySlide({ mediaSlots: [{ type: 'youtube', videoId: 'kryV3E4QKGk', start: 0, end: 30, volume: 100 }] })
      render(slide, { slides: [slide], audio_playing: marked })
      await later(3000)
      expect(cue()).toBeFalsy()
    })

    it('shows the cue when the audio context never resumes on an uploaded shiny clip', async () => {
      const Real = globalThis.AudioContext
      globalThis.AudioContext = class {
        state = 'suspended'
        createGain() { return { gain: {}, connect() {} } }
        createMediaElementSource() { return { connect() {} } }
        resume() { return new Promise(() => {}) }
        close() {}
      }
      try {
        const slide = shinySlide({ mediaUrl: 'https://example.test/clip.mp3', mediaType: 'audio/mpeg' })
        render(slide, { slides: [slide], audio_playing: marked })
        await later(2100)
        expect(cue()).toBeTruthy()
      } finally {
        globalThis.AudioContext = Real
      }
    })

    it('a part step cancels the old part\'s 2s check (no false cue for a clip nobody asked to play)', async () => {
      const part = n => ({ text: `p${n}`, mediaSlots: [{ type: 'audio/mpeg', url: `https://example.test/p${n}.mp3` }] })
      const mk = cp => shinySlide({ parts: [part(0), part(1)], currentPart: cp })
      mediaPlay.mockImplementation(function () { Object.defineProperty(this, 'paused', { value: false, configurable: true }); return Promise.resolve() })
      const realPause = HTMLMediaElement.prototype.pause
      // the real element reads paused after pause(); the component pauses on a part change
      HTMLMediaElement.prototype.pause = function () { Object.defineProperty(this, 'paused', { value: true, configurable: true }) }
      try {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const s0 = mk(0)
        render(s0, { slides: [s0], audio_playing: { slideId: 'shiny-1', playing: true, part: 0 } })
        await later(500)
        const s1 = mk(1) // stepped to part 1 with the mark still naming part 0: nothing is asked to play
        render(s1, { slides: [s1], audio_playing: { slideId: 'shiny-1', playing: true, part: 0 } })
        await later(3000)
        expect(cue()).toBeFalsy()
        expect(warn.mock.calls.filter(c => String(c[0]).includes('play blocked'))).toHaveLength(0) // and no false Sentry report
        warn.mockRestore()
      } finally {
        HTMLMediaElement.prototype.pause = realPause
      }
    })

    it('tapping the cue on an uploaded shiny clip retries and clears it', async () => {
      mediaPlay.mockImplementationOnce(() => Promise.reject(new DOMException('blocked', 'NotAllowedError')))
      const slide = shinySlide({ mediaUrl: 'https://example.test/clip.mp3', mediaType: 'audio/mpeg' })
      render(slide, { slides: [slide], audio_playing: marked })
      await later(0)
      await act(async () => { cue().click() })
      expect(mediaPlay).toHaveBeenCalledTimes(2)
      expect(cue()).toBeFalsy()
    })
  })
})
