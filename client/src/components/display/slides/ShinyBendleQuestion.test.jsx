// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import * as Tone from 'tone'
import { director } from '../../../audio/director.js'
import * as Sentry from '@sentry/react'
import ShinyBendleQuestion from './ShinyBendleQuestion.jsx'

// No @testing-library/react in this repo — createRoot + act(...) is the house
// pattern (see ShinyTitleSlide.test.jsx).
//
// The component loads only a ~32 s clip of each stem: a 4 KB Range probe
// reads the MP3 header, then a Range request fetches the clip bytes, which
// Tone's context decodes. The fake network below serves a CBR 320 kb/s,
// 48 kHz file: 44 B ID3 + one 960 B "Info" frame, then 40 000 B per second.

const H = vi.hoisted(() => ({
  songs: new Map(),
  log: [], // every fetch: { url, stem, range, aborted, done }
  mode: {}, // stem -> 'fail' | 'stall' | 'ignoreRange' | 'vbr' | 'probeFail'
  gates: {}, // stem -> Promise that must settle before that stem's clip body is served
  songLen: 240, // seconds of audio in every fake file
  durations: new WeakMap(), // ArrayBuffer -> decoded seconds
  songPending: false,
  songFetchCount: 0,
  ctxState: undefined, // 'running' | 'suspended' | undefined
}))

vi.mock('@sentry/react', () => ({ captureMessage: vi.fn() }))

vi.mock('../../../lib/supabase.js', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: (_col, id) => ({
          abortSignal: signal => ({
            single: () => (H.songFetchCount++, H.songPending
              ? new Promise((_, rej) => signal.addEventListener('abort', () => rej(new Error('aborted'))))
              : Promise.resolve({ data: H.songs.get(id) ?? null, error: null })),
          }),
        }),
      }),
    }),
  },
}))

const transport = vi.hoisted(() => ({ seconds: 0 }))
vi.mock('tone', () => ({
  getTransport: () => transport,
  setContext: vi.fn(),
  getContext: () => ({
    get state() { return H.ctxState },
    decodeAudioData: vi.fn(async ab => ({ duration: H.durations.get(ab) })),
  }),
  start: vi.fn(() => Promise.resolve()),
  Player: vi.fn(function (buffer) {
    const player = {
      buffer,
      fetchesAtCreate: H.log.length,
      volume: { rampTo: vi.fn() },
      toDestination: () => player,
      sync: () => player,
      start: vi.fn(() => player),
      dispose: vi.fn(),
    }
    return player
  }),
}))

const BPS = 40000
const AUDIO_START = 44 + 960 // ID3 + Info frame

function header(tag = 'Info') {
  const b = new Uint8Array(4096)
  b.set([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 34]) // ID3v2, 34 B body -> 44 B
  b.set([0xff, 0xfb, 0xe4, 0xc4], 44) // MPEG-1 L3, 320 kb/s, 48 kHz
  b.set([...tag].map(c => c.charCodeAt(0)), 44 + 36)
  return b.buffer
}

const body = (bytes, seconds) => { const ab = new ArrayBuffer(bytes); H.durations.set(ab, seconds); return ab }
const reply = (status, ab) => ({ ok: status >= 200 && status < 300, status, arrayBuffer: async () => ab })

function fakeFetch(url, { headers = {}, signal } = {}) {
  const stem = url.split('/').pop().replace('.mp3', '')
  const call = { url, stem, range: headers.Range ?? null, aborted: false, done: false }
  H.log.push(call)
  const mode = H.mode[stem]
  const size = AUDIO_START + H.songLen * BPS
  return new Promise((resolve, reject) => {
    signal?.addEventListener('abort', () => { call.aborted = true; reject(new DOMException('aborted', 'AbortError')) })
    const finish = r => { call.done = true; resolve(r) }
    if (mode === 'stall') return
    if (mode === 'fail') { call.done = true; reject(new TypeError('Failed to fetch')); return }
    const isProbe = call.range === 'bytes=0-4095'
    if (isProbe && mode === 'probeFailOnce') { H.mode[stem] = undefined; call.done = true; reject(new TypeError('probe died')); return }
    const full = () => {
      const ab = body(size, H.songLen)
      new Uint8Array(ab).set(new Uint8Array(header(mode === 'vbr' ? 'Xing' : 'Info')))
      return reply(200, ab)
    }
    if (!call.range || mode === 'ignoreRange') return finish(full())
    if (isProbe) return finish(reply(206, mode === 'vbr' ? header('Xing') : header()))
    const [s, e] = call.range.replace('bytes=', '').split('-').map(Number)
    if (s >= size) return finish(reply(416, new ArrayBuffer(0)))
    const end = Math.min(e, size - 1)
    Promise.resolve(H.gates[stem]).then(() => finish(reply(206, body(end - s + 1, (end - s + 1) / BPS))))
  })
}

const theme = { colors: { text: '#ffffff' }, fonts: { display: 'Boogaloo', body: 'DM Sans' } }
let songN = 0
// Fresh id per test: the clip cache and the Sentry once-set live at module
// level, keyed by song, so a new id is a clean slate.
function mkSong(extra = {}) {
  const id = `bnd_t${++songN}`
  const song = {
    id, title: 'Crazy On You', artist: 'Heart',
    drums_url: `https://s/${id}/drums.mp3`, bass_url: `https://s/${id}/bass.mp3`,
    other_url: `https://s/${id}/other.mp3`, vocals_url: `https://s/${id}/vocals.mp3`,
    start_offset_seconds: 95, end_offset_seconds: 122, // bnd_7EINGDQX's real marks
    ...extra,
  }
  H.songs.set(id, song)
  return song
}
const slideFor = (song, data = {}, id = 's1') => ({
  id, data: { isShiny: true, shinyInputSchema: { type: 'bendle' }, bendleSongId: song.id, bendleStepIndex: 0, ...data },
})
const playing = slideId => ({ id: 'show1', audio_playing: { slideId, playing: true } })
const REVEAL = { id: 'show1', answer_reveal: true }
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }

const players = () => Tone.Player.mock.results.map(r => r.value)
const byStem = () => H.log.reduce((m, c) => ({ ...m, [c.stem]: (m[c.stem] ?? 0) + 1 }), {})
const schedTimes = () => transport.scheduleOnce.mock.calls.map(c => c[1])

describe('<ShinyBendleQuestion>', () => {
  let container, root

  beforeEach(() => {
    H.log = []; H.mode = {}; H.gates = {}; H.songLen = 240; H.songPending = false; H.songFetchCount = 0; H.ctxState = undefined
    Object.assign(transport, { seconds: 0, stop: vi.fn(), start: vi.fn(), cancel: vi.fn(), scheduleOnce: vi.fn() })
    vi.clearAllMocks()
    globalThis.fetch = vi.fn(fakeFetch)
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  const render = (slide, show = { id: 'show1' }, isPreview = false) => act(() => {
    root.render(<ShinyBendleQuestion slide={slide} show={show} theme={theme} isPreview={isPreview} />)
  })
  const settle = () => act(async () => { for (let i = 0; i < 30; i++) await new Promise(r => setTimeout(r, 0)) })

  // (k) Heart: start 95 -> clip starts at 94 (1 s pre-roll), players start 1 s in.
  it('fetches only the Heart clip bytes and starts the player at the right song time', async () => {
    const song = mkSong()
    await render(slideFor(song))
    await settle()
    const drums = H.log.filter(c => c.stem === 'drums')
    expect(drums.map(c => c.range)).toEqual([
      'bytes=0-4095',
      `bytes=${AUDIO_START + 94 * BPS}-${AUDIO_START + 126 * BPS}`, // 94 s .. 95 + 30 + 1 s
    ])
    const [p] = players()
    expect(p.start).toHaveBeenCalledWith(0, 1)
    expect(container.textContent).toContain('Drums Only · 30 pts')
    expect(container.textContent).not.toContain('Loading song')
  })

  it('start offset 0 clips from the file start with no negative offset', async () => {
    const song = mkSong({ start_offset_seconds: 0, end_offset_seconds: null })
    await render(slideFor(song))
    await settle()
    expect(H.log[1].range).toBe(`bytes=${AUDIO_START}-${AUDIO_START + 31 * BPS}`)
    expect(players()[0].start).toHaveBeenCalledWith(0, 0)
  })

  it("runs Tone on the audio director's shared context, bound before any Tone node exists", async () => {
    const shared = { state: 'running' }
    const spy = vi.spyOn(director, 'getContext').mockReturnValue(shared)
    try {
      await render(slideFor(mkSong()))
      await settle()
      expect(Tone.setContext).toHaveBeenCalledWith(shared)
      expect(Tone.setContext).toHaveBeenCalledTimes(1) // bound once, not per call
      expect(Tone.setContext.mock.invocationCallOrder[0]).toBeLessThan(Tone.Player.mock.invocationCallOrder[0])
    } finally { spy.mockRestore() }
  })

  describe('(a) plays exactly once, whichever comes first: ready or the host press', () => {
    it('host press BEFORE the beat is ready', async () => {
      const song = mkSong()
      const gate = deferred(); H.gates.drums = gate.promise
      await render(slideFor(song), playing('s1'))
      await settle()
      expect(container.textContent).toContain('Loading song')
      expect(transport.start).not.toHaveBeenCalled()
      gate.resolve()
      await settle()
      expect(transport.start).toHaveBeenCalledTimes(1)
      expect(Tone.start).toHaveBeenCalledTimes(1)
      await render(slideFor(song), playing('s1')) // same press re-delivered
      await settle()
      expect(transport.start).toHaveBeenCalledTimes(1)
    })

    it('host press AFTER the beat is ready', async () => {
      const song = mkSong()
      await render(slideFor(song))
      await settle()
      expect(players()).toHaveLength(1)
      expect(transport.start).not.toHaveBeenCalled()
      await render(slideFor(song), playing('s1'))
      await settle()
      expect(transport.start).toHaveBeenCalledTimes(1)
      await render(slideFor(song), playing('s1')) // double Next
      await settle()
      expect(transport.start).toHaveBeenCalledTimes(1)
    })

    it('ignores a press for a different slide', async () => {
      const song = mkSong()
      await render(slideFor(song), playing('other-slide'))
      await settle()
      expect(transport.start).not.toHaveBeenCalled()
    })
  })

  // (b) 2026-09-22: realtime payloads carrying `slides` hand over equal-but-new objects.
  it('an equal-but-new slide/show object mid-beat does not stop, reload or restart audio', async () => {
    const song = mkSong()
    const slide = slideFor(song, { bendleStepIndex: 1, bendleTierOrder: ['drums', 'bass', 'other'] })
    await render(slide, playing('s1'))
    await settle()
    expect(transport.start).toHaveBeenCalledTimes(1)
    const before = { stops: transport.stop.mock.calls.length, players: players().length, fetches: H.log.length }
    await render(JSON.parse(JSON.stringify(slide)), JSON.parse(JSON.stringify(playing('s1'))))
    await settle()
    expect(transport.stop.mock.calls.length).toBe(before.stops)
    expect(transport.cancel.mock.calls.length).toBe(1) // only the initial setup's
    expect(players()).toHaveLength(before.players)
    players().forEach(p => expect(p.dispose).not.toHaveBeenCalled())
    expect(H.log.length).toBe(before.fetches)
    expect(transport.start).toHaveBeenCalledTimes(1)
  })

  // (c)
  it('loads only the current tier\'s stems first, then prefetches the rest one at a time', async () => {
    const song = mkSong({ guitar_url: `https://s/x/guitar.mp3` })
    await render(slideFor(song))
    await settle()
    const [drums] = players()
    expect(new Set(H.log.slice(0, drums.fetchesAtCreate).map(c => c.stem))).toEqual(new Set(['drums']))
    // Prefetch order = next tiers first, then guitar/vocals; each stem's probe+body
    // finishes before the next stem starts.
    const after = H.log.slice(2)
    expect(after.map(c => c.stem)).toEqual(['bass', 'bass', 'other', 'other', 'guitar', 'guitar', 'vocals', 'vocals'])
    expect(after.every(c => c.done)).toBe(true)

    // Step 1 (a separate slide, so a remount) finds both its stems cached.
    act(() => root.unmount()); root = createRoot(container)
    const n = H.log.length
    await render(slideFor(song, { bendleStepIndex: 1 }, 's2'))
    await settle()
    expect(H.log.length).toBe(n)
    expect(players().slice(1)).toHaveLength(2)
  })

  it('prefetch really is serial: the next stem waits for the previous one', async () => {
    const song = mkSong()
    const g = deferred(); H.gates.bass = g.promise
    await render(slideFor(song))
    await settle()
    expect(H.log.map(c => c.stem)).toEqual(['drums', 'drums', 'bass', 'bass']) // other not started yet
    g.resolve()
    await settle()
    expect(H.log.map(c => c.stem)).toEqual(['drums', 'drums', 'bass', 'bass', 'other', 'other', 'vocals', 'vocals'])
  })

  it('respects a custom tier order (bass first)', async () => {
    const song = mkSong()
    await render(slideFor(song, { bendleTierOrder: ['bass', 'drums', 'other'] }))
    await settle()
    expect(container.textContent).toContain('Bass Only · 30 pts')
    expect(H.log[0].stem).toBe('bass')
  })

  describe('(d) reveal', () => {
    it('after the prefetch finished, reveal fetches nothing and plays all stems', async () => {
      const song = mkSong({ guitar_url: `https://s/x/guitar.mp3` })
      await render(slideFor(song, { bendleStepIndex: 2 }), playing('s1'))
      await settle()
      const n = H.log.length
      await render(slideFor(song, { bendleStepIndex: 2 }), { ...playing('s1'), answer_reveal: true })
      await settle()
      expect(H.log.length).toBe(n)
      expect(players().slice(3).map(p => p.buffer.duration)).toHaveLength(5) // drums bass other guitar vocals
      expect(transport.start).toHaveBeenCalledTimes(2) // step beat, then the reveal
      expect(container.textContent).toContain('Crazy On You — Heart')
    })

    it('reveal pressed mid-load shares the in-flight stem and fetches each stem once', async () => {
      const song = mkSong()
      const g = deferred(); H.gates.drums = g.promise
      await render(slideFor(song), playing('s1'))
      await settle()
      await render(slideFor(song), { ...playing('s1'), answer_reveal: true })
      await settle()
      g.resolve()
      await settle()
      expect(byStem()).toEqual({ drums: 2, bass: 2, other: 2, vocals: 2 }) // probe + clip each
      expect(players()).toHaveLength(4)
      expect(transport.start).toHaveBeenCalledTimes(1)
    })

    it('reveal without guitar_url plays four stems; works off showState.answerReveal too', async () => {
      const song = mkSong()
      await render(slideFor(song, { bendleStepIndex: 2 }), { id: 'show1', showState: { answerReveal: true } })
      await settle()
      expect(players()).toHaveLength(4)
      expect(transport.start).toHaveBeenCalledTimes(1) // reveal needs no separate press
    })
    it('reveals on bendleRevealed alone (no answer_reveal) and lists every team', async () => {
      const song = mkSong()
      const results = [
        { teamId: 'p1', teamName: 'Alpha', guess: { title: 'Barracuda', artist: 'Heart' }, stepIndex: 0, correct: true, autoPoints: 30, points: 30, overridden: false },
        { teamId: 'p2', teamName: 'Bravo', guess: null, stepIndex: null, correct: false, autoPoints: 0, points: 0, overridden: false },
      ]
      await render(slideFor(song, { bendleStepIndex: 2, text: 'Name it', bendleLocked: true, bendleRevealed: true, bendleResults: results }), playing('s1'))
      await settle()
      expect(players()).toHaveLength(4) // drums bass other vocals
      expect(container.textContent).toContain('Crazy On You — Heart')
      const items = container.querySelectorAll('[role="listitem"]')
      expect(items).toHaveLength(2)
      expect(items[0].textContent).toContain('Barracuda — Heart')
      expect(items[1].textContent).toContain('No guess')
      expect(container.textContent).not.toContain('Name it')
      expect(container.textContent).not.toContain('pts')
    })
    it('bendleRevealed with an empty bendleResults keeps the old layout', async () => {
      const song = mkSong()
      await render(slideFor(song, { bendleStepIndex: 2, text: 'Name it', bendleRevealed: true, bendleResults: [] }), playing('s1'))
      await settle()
      expect(container.textContent).toContain('Name it')
      expect(container.textContent).toContain('pts')
      expect(container.querySelectorAll('[role="list"]')).toHaveLength(0)
    })
    it('a locked but unrevealed step 3 stays on the step mix', async () => {
      const song = mkSong()
      await render(slideFor(song, { bendleStepIndex: 2, bendleLocked: true }), playing('s1'))
      await settle()
      expect(players()).toHaveLength(3)
      expect(container.querySelectorAll('[role="listitem"]')).toHaveLength(0)
    })
    it('bendleRevealed without bendleResults keeps the old layout (text and steps, no list)', async () => {
      const song = mkSong()
      await render(slideFor(song, { bendleStepIndex: 2, text: 'Name it', bendleRevealed: true }), playing('s1'))
      await settle()
      expect(players()).toHaveLength(4)
      expect(container.textContent).toContain('Name it')
      expect(container.textContent).toContain('pts')
      expect(container.querySelectorAll('[role="listitem"]')).toHaveLength(0)
    })
  })

  describe('(e) nothing plays past 30 s', () => {
    const fadeStop = async (extra, show) => {
      const song = mkSong(extra)
      await render(slideFor(song, { bendleStepIndex: 2 }), show)
      await settle()
      return schedTimes()
    }
    it('step beat: fade at 28.5, stop at 30, even with an end mark', async () => {
      expect(await fadeStop({}, playing('s1'))).toEqual([28.5, 30])
    })
    it('reveal honours an end mark under 30 s (Heart 95 -> 122)', async () => {
      expect(await fadeStop({}, REVEAL)).toEqual([25.5, 27])
    })
    it('reveal caps an end mark past 30 s', async () => {
      expect(await fadeStop({ end_offset_seconds: 200 }, REVEAL)).toEqual([28.5, 30])
    })
    it('reveal with no end mark stops at 30', async () => {
      expect(await fadeStop({ end_offset_seconds: null }, REVEAL)).toEqual([28.5, 30])
    })
    it('reveal with an end mark at/before the start ignores it and stops at 30', async () => {
      expect(await fadeStop({ end_offset_seconds: 90 }, REVEAL)).toEqual([28.5, 30])
    })
    it('a song that ends inside the window stops where the audio runs out', async () => {
      H.songLen = 110
      expect(await fadeStop({ end_offset_seconds: null }, playing('s1'))).toEqual([13.5, 15])
    })
    it('the scheduled callbacks fade every player and stop the Transport', async () => {
      await fadeStop({}, playing('s1'))
      const [[fade], [stop]] = transport.scheduleOnce.mock.calls
      fade(7)
      players().forEach(p => expect(p.volume.rampTo).toHaveBeenCalledWith(-Infinity, 1.5, 7))
      transport.stop.mockClear()
      stop(9)
      expect(transport.stop).toHaveBeenCalledWith(9)
    })
  })

  describe('(f) fallbacks', () => {
    it('server ignores Range: uses the probe\'s whole file (one download), plays from song time', async () => {
      const song = mkSong()
      H.mode.drums = 'ignoreRange'
      await render(slideFor(song), playing('s1'))
      await settle()
      expect(H.log.filter(c => c.stem === 'drums')).toHaveLength(1)
      expect(players()[0].start).toHaveBeenCalledWith(0, 95)
      expect(schedTimes()).toEqual([28.5, 30])
      expect(transport.start).toHaveBeenCalledTimes(1)
      expect(Sentry.captureMessage).toHaveBeenCalledWith('bendle: stem fell back to full file', expect.objectContaining({ level: 'warning' }))
    })
    it('non-CBR (Xing) file: full-file fetch without Range', async () => {
      const song = mkSong()
      H.mode.drums = 'vbr'
      await render(slideFor(song))
      await settle()
      expect(H.log.filter(c => c.stem === 'drums').map(c => c.range)).toEqual(['bytes=0-4095', null])
      expect(players()[0].start).toHaveBeenCalledWith(0, 95)
    })
    it('probe fails on the network: retries the small probe, not a full-file download', async () => {
      const song = mkSong()
      H.mode.drums = 'probeFailOnce'
      await render(slideFor(song))
      await settle()
      expect(H.log.filter(c => c.stem === 'drums').map(c => c.range)).toEqual([
        'bytes=0-4095', 'bytes=0-4095', `bytes=${AUDIO_START + 94 * BPS}-${AUDIO_START + 126 * BPS}`,
      ])
      expect(players()[0].start).toHaveBeenCalledWith(0, 1)
      expect(container.textContent).not.toContain('Couldn')
    })
  })

  describe('(g) failures', () => {
    it('a failed stem is skipped (after a retry), the rest still play', async () => {
      const song = mkSong()
      H.mode.bass = 'fail'
      await render(slideFor(song, { bendleStepIndex: 1 }), playing('s1'))
      await settle()
      expect(H.log.filter(c => c.stem === 'bass' && c.range === 'bytes=0-4095').length).toBeGreaterThanOrEqual(2)
      expect(players().map(p => p.fetchesAtCreate)).toHaveLength(1)
      expect(transport.start).toHaveBeenCalledTimes(1)
      expect(container.textContent).not.toContain('Couldn')
    })
    it('all stems failed: error line, no sound, one Sentry error per stem per beat', async () => {
      const song = mkSong()
      H.mode.drums = 'fail'
      await render(slideFor(song), playing('s1'))
      await settle()
      expect(container.textContent).toContain('load this song')
      expect(transport.start).not.toHaveBeenCalled()
      const failed = () => Sentry.captureMessage.mock.calls.filter(c => c[0] === 'bendle: stem load failed')
      expect(failed()).toHaveLength(1)
      expect(failed()[0][1]).toMatchObject({ level: 'error', tags: { area: 'audio' } })
      // Remount of the same beat retries but does not re-report.
      act(() => root.unmount()); root = createRoot(container)
      await render(slideFor(song), playing('s1'))
      await settle()
      expect(failed()).toHaveLength(1)
    })
    it('a stalled stem times out (aborted) and shows the error instead of loading forever', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      const song = mkSong()
      H.mode.drums = 'stall'
      await render(slideFor(song))
      await act(async () => { await vi.advanceTimersByTimeAsync(29000) })
      expect(container.textContent).toContain('Loading song')
      await act(async () => { await vi.advanceTimersByTimeAsync(1500) }) // 2 attempts x 15 s probe timeout
      expect(container.textContent).toContain('load this song')
      // (the background prefetch then tries drums once more — harmless, off the beat's path)
      expect(H.log.filter(c => c.stem === 'drums').slice(0, 2).map(c => [c.range, c.aborted])).toEqual([['bytes=0-4095', true], ['bytes=0-4095', true]])
    })
    it('a stalled song-row fetch times out to the error line', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      const song = mkSong()
      H.songPending = true
      await render(slideFor(song))
      await act(async () => { await vi.advanceTimersByTimeAsync(20000) })
      expect(container.textContent).toContain('load this song')
    })
  })

  // (h)
  it('a beat slower than 3 s reports one warning per song per beat', async () => {
    let now = 0
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    const song = mkSong()
    const g = deferred(); H.gates.drums = g.promise
    await render(slideFor(song))
    await settle()
    now = 4200
    g.resolve()
    await settle()
    const slow = () => Sentry.captureMessage.mock.calls.filter(c => c[0] === 'bendle: beat slow to load')
    expect(slow()).toHaveLength(1)
    expect(slow()[0][1]).toMatchObject({ level: 'warning', tags: { area: 'audio' }, extra: { ms: 4200 } })
    act(() => root.unmount()); root = createRoot(container)
    H.gates.drums = undefined
    await render(slideFor(song))
    await settle()
    expect(slow()).toHaveLength(1)
  })

  // (i)
  it('build-mode preview touches no audio, even revealed', async () => {
    const song = mkSong()
    await render(slideFor(song, { bendleStepIndex: 2 }), REVEAL, true)
    await settle()
    expect(fetch).not.toHaveBeenCalled()
    expect(Tone.Player).not.toHaveBeenCalled()
    expect(transport.start).not.toHaveBeenCalled()
    expect(container.textContent).not.toContain('Loading song')
  })

  // (j) Each step is its own slide (Display keys by slide.id), so in-flight
  // fetches are deliberately NOT aborted on unmount: the next step reuses them.
  it('unmount stops the Transport, disposes players and launches no further prefetch', async () => {
    const song = mkSong()
    const g = deferred(); H.gates.bass = g.promise
    await render(slideFor(song, {}), playing('s1'))
    await settle()
    const ps = players()
    expect(ps).toHaveLength(1)
    transport.stop.mockClear(); transport.cancel.mockClear()
    act(() => root.unmount()); root = createRoot(container)
    expect(transport.stop).toHaveBeenCalled()
    expect(transport.cancel).toHaveBeenCalledWith(0)
    ps.forEach(p => expect(p.dispose).toHaveBeenCalled())
    g.resolve()
    await settle()
    expect(H.log.map(c => c.stem)).toEqual(['drums', 'drums', 'bass', 'bass']) // in-flight bass finished; other/vocals never started
    // The finished bass clip is reused by the next step: no refetch.
    await render(slideFor(song, { bendleStepIndex: 1 }, 's2'))
    await settle()
    expect(byStem().bass).toBe(2)
  })

  // ── Codex review 2026-09-30 ────────────────────────────────────────────────
  // A start mark at/after the real end of the file: the range request is
  // unsatisfiable (HTTP 416). That used to fail every retry and show the error
  // line; Tone.Player also plays NOTHING (silently) if started past a buffer's
  // end. The beat must fall back to the whole file and clamp the start.
  it('a start mark past the end of the file falls back to the full file and still plays', async () => {
    H.songLen = 60
    const song = mkSong({ start_offset_seconds: 300, end_offset_seconds: 320 })
    await render(slideFor(song), playing('s1'))
    await settle()
    expect(container.textContent).not.toContain('Couldn')
    const drums = H.log.filter(c => c.stem === 'drums')
    expect(drums.some(c => c.range == null)).toBe(true) // whole-file request happened
    const [p] = players()
    expect(p).toBeDefined()
    // clamped to (60 s file) - MIN_PLAYABLE (5 s) = 55 s, never past the end
    expect(p.start).toHaveBeenCalledWith(0, 55)
    expect(transport.start).toHaveBeenCalledTimes(1)
  })

  // The host's build-mode preview must not even ask the database for the row.
  it('preview does not query the song row', async () => {
    const song = mkSong()
    await render(slideFor(song), { id: 'show1' }, true)
    await settle()
    expect(H.songFetchCount).toBe(0)
  })

  // Marks edited between slides must reach the TV without a reload, and a
  // failed refresh must keep serving the last good row.
  it('re-reads the song row after its cache window, so edited marks reach the TV', async () => {
    const song = mkSong()
    const realNow = Date.now()
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(realNow)
    await render(slideFor(song, {}, 's1'))
    await settle()
    expect(H.songFetchCount).toBe(1)
    act(() => root.unmount()); root = createRoot(container) // each slide is its own mount in the app (keyed by slide.id)
    await render(slideFor(song, { bendleStepIndex: 1 }, 's2')) // within the window: cached
    await settle()
    expect(H.songFetchCount).toBe(1)
    H.songs.set(song.id, { ...song, start_offset_seconds: 60, end_offset_seconds: 90 }) // host edits the marks
    nowSpy.mockReturnValue(realNow + 60_000)
    act(() => root.unmount()); root = createRoot(container) // each slide is its own mount in the app (keyed by slide.id)
    await render(slideFor(song, { bendleStepIndex: 2 }, 's3'))
    await settle()
    expect(H.songFetchCount).toBe(2)
    expect(H.log.some(c => c.range?.startsWith(`bytes=${AUDIO_START + 59 * BPS}-`))).toBe(true)
  })

  it('a failed row refresh falls back to the last good row instead of erroring', async () => {
    const song = mkSong()
    const realNow = Date.now()
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(realNow)
    await render(slideFor(song, {}, 's1'))
    await settle()
    H.songs.delete(song.id) // the refresh now fails (row missing)
    nowSpy.mockReturnValue(realNow + 60_000)
    act(() => root.unmount()); root = createRoot(container) // each slide is its own mount in the app (keyed by slide.id)
    await render(slideFor(song, { bendleStepIndex: 1 }, 's2'), playing('s2'))
    await settle()
    expect(container.textContent).not.toContain('Couldn')
    expect(transport.start).toHaveBeenCalled()
  })

  // A context that stays suspended (no click on the TV tab) plays silence with
  // no error. It cannot be fixed from here, but it must show up in Sentry.
  it('reports to Sentry when the audio context is not running at start', async () => {
    H.ctxState = 'suspended'
    const song = mkSong()
    await render(slideFor(song), playing('s1'))
    await settle()
    await act(async () => { await new Promise(r => setTimeout(r, 1800)) })
    const msgs = Sentry.captureMessage.mock.calls.map(c => c[0])
    expect(msgs.some(m => m.includes('audio context'))).toBe(true)
  })

  // Codex round 2: a start mark a few seconds before the END of the file gets a
  // short PARTIAL clip (206, truncated at EOF). Clamping the start against that
  // clip's end must never put it before the clip's own first sample: the player
  // would start at offset 0 while the stop time was still measured from the
  // earlier start, so the fade could land after the audio had ended.
  it('a start mark within 5 s of the file end keeps playback and stop timing inside the partial clip', async () => {
    const song = mkSong({ start_offset_seconds: 237, end_offset_seconds: 239 }) // songLen 240
    await render(slideFor(song), playing('s1'))
    await settle()
    const [p] = players()
    expect(p).toBeDefined()
    expect(p.start).toHaveBeenCalledWith(0, 0) // clip begins at 236 s; effective start is 236, not 235
    const stop = Math.max(...schedTimes())
    expect(stop).toBeGreaterThan(0)
    expect(stop).toBeLessThanOrEqual(4) // the 236..240 clip holds 4 s of audio
  })
})
