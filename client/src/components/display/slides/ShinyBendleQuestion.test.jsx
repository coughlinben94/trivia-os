// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import * as Tone from 'tone'
import ShinyBendleQuestion from './ShinyBendleQuestion.jsx'

// No @testing-library/react in this repo — ShinyTitleSlide.test.jsx's
// createRoot + act(...) shape is the house pattern, so this follows it
// rather than pulling in a second testing library.

const SONG = {
  id: 'bnd_1',
  title: 'Hey Jude',
  answer: 'Hey Jude',
  drums_url: 'd.mp3', bass_url: 'b.mp3', other_url: 'o.mp3', vocals_url: 'v.mp3',
  start_offset_seconds: 0,
}

let songRow = SONG
let loadFails = new Set()
// When true the bendle_songs fetch never settles — the only way to hold the
// component in its 'loading' beat, since the mocked stem loads resolve inside
// the same act() flush that renders.
let songPending = false

vi.mock('../../../lib/supabase.js', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => (songPending ? new Promise(() => {}) : Promise.resolve({ data: songRow })),
        }),
      }),
    }),
  },
}))

const transport = {
  seconds: 0,
  stop: vi.fn(), start: vi.fn(), cancel: vi.fn(), scheduleOnce: vi.fn(),
}

// buffer.duration is generous (300s) so clampBendleOffset never engages
// unless a test sets song.start_offset_seconds near/over that on purpose.
vi.mock('tone', () => ({
  getTransport: () => transport,
  start: () => Promise.resolve(),
  Player: vi.fn().mockImplementation(function () {
    const player = {
      volume: { value: 0, rampTo: vi.fn(), setValueAtTime: vi.fn() },
      buffer: { duration: 300 },
      toDestination: () => player,
      load: url => (loadFails.has(url)
        ? Promise.reject(new Error(`boom: ${url}`))
        : Promise.resolve(player)),
      sync: () => player,
      start: vi.fn(() => player),
      dispose: vi.fn(),
    }
    return player
  }),
}))

const theme = { colors: { text: '#ffffff' }, fonts: { display: 'Boogaloo', body: 'DM Sans' } }
const show = { id: 'show1' }

// stepIndex defaults to 0 (the first of the 3 real step-slides). Each test
// slide is standalone — no more guessesLocked/revealed flags on the slide
// itself; "revealed" now comes from the show's generic answer_reveal
// (2026-09-08 rebuild: Bendle is 3 real slides, manually graded, no phone
// lock/score state machine).
const bendleSlide = data => ({
  id: 's1',
  data: { isShiny: true, shinyInputSchema: { type: 'bendle' }, bendleSongId: 'bnd_1', bendleStepIndex: 0, ...data },
})

describe('<ShinyBendleQuestion>', () => {
  let container, root

  beforeEach(() => {
    songRow = SONG
    loadFails = new Set()
    songPending = false
    transport.seconds = 0
    vi.clearAllMocks()
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  const render = (slide, showOverride = show) => act(() => {
    root.render(<ShinyBendleQuestion slide={slide} show={showOverride} theme={theme} />)
  })

  // Lets the song fetch and the stem loads settle.
  const settle = () => act(async () => { await new Promise(r => setTimeout(r, 0)) })

  it('shows the loading line before the stems have loaded', async () => {
    songPending = true
    await render(bendleSlide({}))
    await settle()
    expect(container.textContent).toContain('Loading song')
    expect(transport.start).not.toHaveBeenCalled()
  })

  it('step 0 loads just the first stem and shows its label/points', async () => {
    await render(bendleSlide({ bendleStepIndex: 0 }))
    await settle()

    expect(transport.start).toHaveBeenCalled()
    const players = Tone.Player.mock.results.map(r => r.value)
    expect(players).toHaveLength(1) // default order: drums only at step 0
    expect(container.textContent).toContain('Drums Only · 20 pts')
    expect(container.textContent).not.toContain('Loading song')
  })

  it('step 1 loads the first two stems (cumulative)', async () => {
    await render(bendleSlide({ bendleStepIndex: 1 }))
    await settle()

    const players = Tone.Player.mock.results.map(r => r.value)
    expect(players).toHaveLength(2) // drums + bass
    expect(container.textContent).toContain('+ Bass · 15 pts')
  })

  it('step 2 loads all three round stems (cumulative), never vocals', async () => {
    await render(bendleSlide({ bendleStepIndex: 2 }))
    await settle()

    const players = Tone.Player.mock.results.map(r => r.value)
    expect(players).toHaveLength(3) // drums + bass + other
    expect(container.textContent).toContain('+ Everything Else · 10 pts')
  })

  it('respects a custom bendleTierOrder — bass first changes which stem step 0 loads', async () => {
    await render(bendleSlide({ bendleStepIndex: 0, bendleTierOrder: ['bass', 'drums', 'other'] }))
    await settle()

    expect(container.textContent).toContain('Bass Only · 20 pts')
  })

  it('starts every loaded stem player at the song\'s start_offset_seconds', async () => {
    songRow = { ...SONG, start_offset_seconds: 45 }
    await render(bendleSlide({ bendleStepIndex: 2 }))
    await settle()

    const players = Tone.Player.mock.results.map(r => r.value)
    expect(players).toHaveLength(3)
    players.forEach(p => expect(p.start).toHaveBeenCalledWith(0, 45))
  })

  it('clamps an offset that would leave less than the minimum playable length', async () => {
    // buffer.duration is mocked at 300, MIN_PLAYABLE_SECONDS is 5 -> latest legal offset is 295
    songRow = { ...SONG, start_offset_seconds: 299 }
    await render(bendleSlide({ bendleStepIndex: 0 }))
    await settle()

    const players = Tone.Player.mock.results.map(r => r.value)
    players.forEach(p => expect(p.start).toHaveBeenCalledWith(0, 295))
  })

  it('skips a failed stem instead of failing the whole beat', async () => {
    loadFails = new Set(['b.mp3']) // bass dies
    await render(bendleSlide({ bendleStepIndex: 1 })) // drums + bass
    await settle()

    expect(transport.start).toHaveBeenCalled()
    const players = Tone.Player.mock.results.map(r => r.value)
    expect(players).toHaveLength(2) // both constructed, bass's own load rejected
    const failed = players.find(p => p.dispose.mock.calls.length > 0)
    expect(failed).toBeTruthy()
    expect(container.textContent).not.toContain('Couldn')
  })

  it('shows the error line when every stem for this step fails', async () => {
    loadFails = new Set(['d.mp3'])
    await render(bendleSlide({ bendleStepIndex: 0 })) // drums only, and it fails
    await settle()

    expect(container.textContent).toContain('load this song')
    expect(transport.start).not.toHaveBeenCalled()
  })

  it('stops the Transport and disposes the players on unmount', async () => {
    await render(bendleSlide({ bendleStepIndex: 2 }))
    await settle()
    const players = Tone.Player.mock.results.map(r => r.value)
    expect(players).toHaveLength(3)

    act(() => root.unmount())

    expect(transport.stop).toHaveBeenCalled()
    players.forEach(p => expect(p.dispose).toHaveBeenCalled())
  })

  it('reveals: loads all four stems including vocals when show.answer_reveal is true', async () => {
    await render(bendleSlide({ bendleStepIndex: 2 }), { ...show, answer_reveal: true })
    await settle()

    expect(transport.start).toHaveBeenCalled()
    const players = Tone.Player.mock.results.map(r => r.value)
    expect(players).toHaveLength(4) // drums, bass, other, vocals
  })

  it('reveal also works off show.showState.answerReveal (the other place the flag can live)', async () => {
    await render(bendleSlide({ bendleStepIndex: 2 }), { ...show, showState: { answerReveal: true } })
    await settle()

    const players = Tone.Player.mock.results.map(r => r.value)
    expect(players).toHaveLength(4)
  })

  it('schedules a fade-out and stop at end_offset_seconds only on the revealed beat', async () => {
    songRow = { ...SONG, start_offset_seconds: 0, end_offset_seconds: 50 }
    await render(bendleSlide({ bendleStepIndex: 2 }), { ...show, answer_reveal: true })
    await settle()

    // buffer.duration is mocked at 300, so end_offset_seconds (50) is well
    // within it. Fade starts FADE_SECONDS (1.5s) before the stop point, then
    // the stop itself.
    expect(transport.scheduleOnce.mock.calls.map(c => c[1])).toEqual([48.5, 50])
    const [fadeCallback] = transport.scheduleOnce.mock.calls[0]
    fadeCallback(0)
    const players = Tone.Player.mock.results.map(r => r.value)
    players.forEach(p => expect(p.volume.rampTo).toHaveBeenCalledWith(-Infinity, 1.5, 0))
    const [stopCallback] = transport.scheduleOnce.mock.calls[1]
    transport.stop.mockClear()
    stopCallback()
    expect(transport.stop).toHaveBeenCalled()
  })

  it('does not schedule an end-offset stop on a plain (not revealed) step beat', async () => {
    songRow = { ...SONG, start_offset_seconds: 0, end_offset_seconds: 50 }
    await render(bendleSlide({ bendleStepIndex: 0 }))
    await settle()

    expect(transport.scheduleOnce).not.toHaveBeenCalled()
  })

  it('never touches audio in the build-mode preview pane, even revealed', async () => {
    await act(() => {
      root.render(<ShinyBendleQuestion slide={bendleSlide({})} show={show} theme={theme} isPreview />)
    })
    await settle()
    expect(transport.start).not.toHaveBeenCalled()
    expect(Tone.Player).not.toHaveBeenCalled()
    // No un-resolvable "Loading song…" in the host's build-mode editor.
    expect(container.textContent).not.toContain('Loading song')

    await act(() => {
      root.render(<ShinyBendleQuestion
        slide={bendleSlide({ bendleStepIndex: 2 })}
        show={{ ...show, answer_reveal: true }} theme={theme} isPreview
      />)
    })
    await settle()
    expect(transport.start).not.toHaveBeenCalled()
    expect(Tone.Player).not.toHaveBeenCalled()
  })
})
