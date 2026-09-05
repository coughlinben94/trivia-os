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
}

let songRow = SONG
let answeredCount = 2
let loadFails = new Set()
// When true the bendle_songs fetch never settles — the only way to hold the
// component in its 'loading' beat, since the mocked stem loads resolve inside
// the same act() flush that renders.
let songPending = false

vi.mock('../../../lib/supabase.js', () => ({
  supabase: {
    from: () => ({
      // bendle_songs takes .eq().single(); the teams head-count is awaited
      // straight off .eq(), so the same object has to serve both.
      select: () => ({
        eq: () => ({
          single: () => (songPending ? new Promise(() => {}) : Promise.resolve({ data: songRow })),
          then: resolve => resolve({ count: 5 }),
        }),
      }),
    }),
    // A row ARRAY, matching the real bendle_answer_counts, which is declared
    // `returns table(answered int)` — NOT wager_answer_counts' `returns
    // jsonb`. Mocking it as a bare object hides the exact bug this component
    // shipped with (`counts?.answered` on an array is undefined). `total`
    // dropped from the RPC's shape 2026-09-05 (Fix 3, whole-branch review) —
    // it was never read here.
    rpc: () => Promise.resolve({ data: [{ answered: answeredCount }] }),
  },
}))

const transport = {
  seconds: 0,
  stop: vi.fn(), start: vi.fn(), cancel: vi.fn(), scheduleOnce: vi.fn(),
}

vi.mock('tone', () => ({
  getTransport: () => transport,
  start: () => Promise.resolve(),
  Player: vi.fn().mockImplementation(function () {
    const player = {
      volume: { value: 0, rampTo: vi.fn(), setValueAtTime: vi.fn() },
      toDestination: () => player,
      load: url => (loadFails.has(url)
        ? Promise.reject(new Error(`boom: ${url}`))
        : Promise.resolve(player)),
      sync: () => player,
      start: () => player,
      dispose: vi.fn(),
    }
    return player
  }),
}))

const theme = { colors: { text: '#ffffff' }, fonts: { display: 'Boogaloo', body: 'DM Sans' } }
const show = { id: 'show1' }

const bendleSlide = data => ({
  id: 's1',
  data: { isShiny: true, shinyInputSchema: { type: 'bendle' }, bendleSongId: 'bnd_1', ...data },
})

describe('<ShinyBendleQuestion>', () => {
  let container, root

  beforeEach(() => {
    songRow = SONG
    answeredCount = 2
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

  const render = slide => act(() => {
    root.render(<ShinyBendleQuestion slide={slide} show={show} theme={theme} />)
  })

  // Lets the song fetch, the four stem loads and the count RPC all settle.
  const settle = () => act(async () => { await new Promise(r => setTimeout(r, 0)) })

  it('shows the loading line before the stems have loaded', async () => {
    songPending = true
    await render(bendleSlide({}))
    await settle()
    expect(container.textContent).toContain('Loading song')
    expect(transport.start).not.toHaveBeenCalled()
  })

  it('plays: starts the Transport, schedules the later stems, shows the count', async () => {
    await render(bendleSlide({}))
    await settle()

    expect(transport.start).toHaveBeenCalled()
    // Three steps, four stems: drums is audible from the first frame, bass
    // comes in at 20, and the last step lands `other` AND `vocals` together at
    // 40 — so three fades are scheduled but only two of them are new steps.
    expect(transport.scheduleOnce).toHaveBeenCalledTimes(3)
    expect(transport.scheduleOnce.mock.calls.map(c => c[1])).toEqual([20, 40, 40])
    expect(container.textContent).toContain('2 of 5 teams guessed')
    expect(container.textContent).not.toContain('Loading song')
  })

  it('skips a failed stem instead of failing the whole round', async () => {
    loadFails = new Set(['v.mp3']) // vocals dies
    await render(bendleSlide({}))
    await settle()

    expect(transport.start).toHaveBeenCalled()
    // bass + other still scheduled; the dead vocals layer is simply never faded in.
    expect(transport.scheduleOnce.mock.calls.map(c => c[1])).toEqual([20, 40])
    expect(container.textContent).not.toContain('Couldn')
  })

  it('shows the error line when every stem fails', async () => {
    loadFails = new Set(['d.mp3', 'b.mp3', 'o.mp3', 'v.mp3'])
    await render(bendleSlide({}))
    await settle()

    expect(container.textContent).toContain('load this song')
    expect(transport.start).not.toHaveBeenCalled()
  })

  it('stops the Transport and disposes the players once guesses lock', async () => {
    await render(bendleSlide({}))
    await settle()
    const players = Tone.Player.mock.results.map(r => r.value)
    expect(players).toHaveLength(4)

    await render(bendleSlide({ bendleGuessesLocked: true }))
    await settle()

    expect(transport.stop).toHaveBeenCalled()
    players.forEach(p => expect(p.dispose).toHaveBeenCalled())
    expect(container.textContent).toContain('Answers locked')
    // Never the aggregate count once locked, and never a raw guess.
    expect(container.textContent).not.toContain('teams guessed')
  })

  it('shows only the aggregate count before lock, never a team or a guess', async () => {
    await render(bendleSlide({}))
    await settle()
    expect(container.textContent).toContain('2 of 5 teams guessed')
    expect(container.textContent).not.toContain('Hey Jude') // the answer stays hidden
  })

  it('reveals the song, each tier label and its points', async () => {
    const slide = bendleSlide({
      bendleGuessesLocked: true,
      bendleRevealed: true,
      bendleResults: [
        { teamId: 't1', teamName: 'Alpha', correct: true, tierId: 'drums', points: 30 },
        { teamId: 't2', teamName: 'Beta', correct: true, tierId: 'full', points: 10 },
        { teamId: 't3', teamName: 'Gamma', correct: false, tierId: null, points: 0 },
      ],
    })
    await render(slide)
    await settle()

    expect(container.textContent).toContain('The song was')
    expect(container.textContent).toContain('Hey Jude')
    expect(container.textContent).toContain('Alpha')
    expect(container.textContent).toContain('Drums Only')
    expect(container.textContent).toContain('+30')
    expect(container.textContent).toContain('+ Everything Else')
    expect(container.textContent).toContain('+10')
    // A wrong guess shows a dash and a zero, never the guess itself.
    expect(container.textContent).toContain('Gamma')
    // No audio is ever set up in the reveal beat.
    expect(transport.start).not.toHaveBeenCalled()
  })

  it('never touches audio in the build-mode preview pane', async () => {
    await act(() => {
      root.render(<ShinyBendleQuestion slide={bendleSlide({})} show={show} theme={theme} isPreview />)
    })
    await settle()
    expect(transport.start).not.toHaveBeenCalled()
    expect(Tone.Player).not.toHaveBeenCalled()
    // No un-resolvable "Loading song…" in the host's build-mode editor.
    expect(container.textContent).not.toContain('Loading song')
  })
})
