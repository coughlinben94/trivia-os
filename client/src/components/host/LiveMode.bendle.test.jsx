// @vitest-environment jsdom
// Bendle host flows: lock on step 3, reveal + score across all three steps,
// per-team points, Unlock through the host RPC. Supabase is a recording fake.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

const calls = []
let responses = {}
// A response may be a pending promise (a stalled request); it rejects once the
// caller's AbortSignal fires, like fetch does.
const settle = (entry, key) => {
  const p = Promise.resolve(responses[key] ?? { data: entry.table === 'rpc' ? 0 : [], error: null })
  if (!entry.signal) return p
  return Promise.race([p, new Promise((_, rej) => entry.signal.addEventListener('abort', () => rej(new Error('aborted'))))])
}
function builder(table) {
  const entry = { table, op: null, args: null, filters: [] }
  const q = {
    abortSignal(signal) { entry.signal = signal; return q },
    select(cols) { entry.op ??= 'select'; entry.args ??= cols; return q },
    upsert(payload) { entry.op = 'upsert'; entry.args = payload; return q },
    update(payload) { entry.op = 'update'; entry.args = payload; return q },
    insert(payload) { entry.op = 'insert'; entry.args = payload; return q },
    eq(k, v) { entry.filters.push([k, v]); return q },
    in(k, v) { entry.filters.push([k, v]); return q },
    order() { return q }, single() { return q }, maybeSingle() { return q },
    then(res, rej) { calls.push(entry); return settle(entry, `${table}.${entry.op}`).then(res, rej) },
  }
  return q
}
vi.mock('../../lib/supabase.js', () => ({
  supabase: {
    from: t => builder(t),
    rpc: (name, args) => {
      const entry = { table: 'rpc', op: name, args }
      const q = { abortSignal(signal) { entry.signal = signal; return q }, then(res, rej) { calls.push(entry); return settle(entry, `rpc.${name}`).then(res, rej) } }
      return q
    },
    channel: () => ({ on() { return this }, subscribe() { return this } }), removeChannel() {},
  },
}))
const { default: LiveMode } = await import('./LiveMode.jsx')

const step = (i, extra = {}) => ({ id: `s${i + 1}`, roundId: 'r1', order: i, type: 'question',
  data: { isShiny: true, shinyInputSchema: { type: 'bendle' }, shinyGroupId: 'g1', bendleStepIndex: i, bendleSongId: 'bnd_1', ...extra } })
const SHOW = (slides, idx, audio = null) => ({
  id: 'show1', title: 'Test', theme: 'midnight-galaxy', audio_playing: audio,
  rounds: [{ id: 'r1', number: 1, title: 'Round 1' }], slides,
  showState: { currentSlideIndex: idx, currentSlideId: slides[idx].id, answerReveal: false, scoreboardVisible: false, scoresRevealed: false },
})
const actions = () => ({
  updateSlide: vi.fn(), flushSlides: vi.fn(async () => {}), nextSlide: vi.fn(), prevSlide: vi.fn(), setAnswerReveal: vi.fn(),
  setScoreboardVisible: vi.fn(), setScoresRevealed: vi.fn(), setAudioPlaying: vi.fn(), endShow: vi.fn(),
})
let host, root
const button = label => [...host.querySelectorAll('button')].find(b => b.textContent.includes(label))
const tick = ms => act(() => new Promise(r => setTimeout(r, ms)))
const render = (slides, idx, a, audio) => act(() => root.render(<LiveMode show={SHOW(slides, idx, audio)} actions={a} scoreboardModalOpen={false} onOpenScoreboard={() => {}} />))
const upserts = () => calls.filter(c => c.table === 'scoreboard_teams' && c.op === 'upsert')
const pressA = () => act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA', key: 'a' })))
const pressNext = () => act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight', key: 'ArrowRight' })))
// BendleHostPanel ignores a second click inside 400ms (double-click guard)
const unlockTwice = async () => { await act(async () => button('Unlock').click()); await tick(450); await act(async () => button('Tap again').click()) }
const LOCKED = { bendleLocked: true, bendleLockedAt: '2026-10-02T20:00:00.000Z' }

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  calls.length = 0
  responses = {
    'phone_answers.select': { data: [
      { team_id: 'p1', slide_id: 's1', answer: { title: 'Mr. Brightside', artist: 'The Killers', source: 'catalog', qid: null } },
      { team_id: 'p2', slide_id: 's3', answer: { title: 'Somebody Told Me', artist: 'The Killers', source: 'catalog', qid: null } },
    ], error: null },
    'teams.select': { data: [{ id: 'p1', name: 'Quizzly Bears' }, { id: 'p2', name: 'Trivia Newton John' }, { id: 'p3', name: 'No Phone' }], error: null },
    'bendle_songs.select': { data: { title: 'Mr. Brightside', answer: 'Mr. Brightside', aliases: [], artist: 'The Killers' }, error: null },
    'scoreboard_teams.select': { data: [
      { id: 't1', show_id: 'show1', name: 'Quizzly Bears', scores: { r_r1: { written: 4 } }, sort_order: 0 },
      { id: 't2', show_id: 'show1', name: 'Trivia Newton John', scores: {}, sort_order: 1 },
      { id: 't3', show_id: 'show1', name: 'No Phone', scores: {}, sort_order: 2 },
    ], error: null },
    'scoreboard_teams.upsert': { error: null },
  }
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks() })

describe('Bendle host flows', () => {
  it('step 1 shows the count, no lock button, and leaves the scoreboard button usable', async () => {
    render([step(0), step(1), step(2)], 0, actions())
    await tick(10)
    expect(host.textContent).toContain('step 1 of 3')
    expect(host.textContent).toContain('2 of 3 teams locked a guess')
    expect(button('Lock Guesses')).toBeUndefined()
    expect(button('Unlock')).toBeUndefined()
    expect(button('Scores').disabled).toBe(false)
  })
  it('step 1 warns when step 3 still holds a lock from an earlier run', async () => {
    render([step(0), step(1), step(2, LOCKED)], 0, actions())
    expect(host.textContent).toContain('Step 3 is still locked')
  })
  it('step 3 before the reveal blocks the scoreboard button', async () => {
    render([step(0), step(1), step(2)], 2, actions())
    expect(button('Scores').disabled).toBe(true)
  })
  it('lock on step 3 writes only the lock and touches no scores', async () => {
    const a = actions()
    render([step(0), step(1), step(2)], 2, a)
    await act(async () => button('Lock Guesses').click())
    const data = a.updateSlide.mock.calls[0][1].data
    expect(a.updateSlide.mock.calls[0][0]).toBe('s3')
    expect(data.bendleLocked).toBe(true)
    expect(Number.isFinite(Date.parse(data.bendleLockedAt))).toBe(true)
    expect(data.bendleRevealed).toBeUndefined()
    expect(data.bendleResults).toBeUndefined()
    expect(calls.some(c => c.table === 'scoreboard_teams')).toBe(false)
  })
  it('a second Lock before the lock lands on the slide does nothing', async () => {
    const a = actions()
    render([step(0), step(1), step(2)], 2, a)
    await act(async () => button('Lock Guesses').click())
    await act(async () => button('Lock Guesses').click())
    expect(a.updateSlide).toHaveBeenCalledTimes(1)
  })
  it('the Next countdown finishing on step 3 runs the Bendle lock (lockHandlersRef)', async () => {
    const a = actions()
    render([step(0), step(1), step(2, { lockCountdownPhase: 'bendle', lockCountdownStartedAt: Date.now() - 60_000 })], 2, a)
    await tick(10)
    const lock = a.updateSlide.mock.calls.find(([, p]) => p.data.bendleLocked)
    expect(lock[0]).toBe('s3')
    expect(lock[1].data).toMatchObject({ lockCountdownPhase: null, lockCountdownStartedAt: null })
    expect(lock[1].data.bendleResults).toBeUndefined()
  })
  it('Next on step 3 with no song says why on the laptop', async () => {
    const a = actions()
    // the clip already played, so this Next is the lock press
    render([step(0), step(1), step(2, { bendleSongId: null })], 2, a, { slideId: 's3', playing: true, part: 0 })
    await pressNext()
    expect(host.textContent).toContain('Pick a song for this Bendle first.')
    expect(a.updateSlide).not.toHaveBeenCalled()
  })
  it('reveal grades across all three steps, publishes with the reveal flag, scores into the step-3 bucket', async () => {
    const a = actions()
    render([step(0), step(1), step(2, LOCKED)], 2, a)
    await act(async () => button('Reveal & Score').click())
    await tick(20)
    const answersQuery = calls.find(c => c.table === 'phone_answers' && c.filters.some(([k]) => k === 'show_id'))
    expect(answersQuery.filters).toContainEqual(['show_id', 'show1'])
    expect(answersQuery.filters).toContainEqual(['slide_id', ['s1', 's2', 's3']])
    const writes = a.updateSlide.mock.calls
    expect(writes).toHaveLength(1)
    expect(writes[0][0]).toBe('s3')
    const published = writes[0][1].data
    expect(published.bendleRevealed).toBe(true)
    // The Answer label comes from the song row that was graded, in the same write.
    expect(published.bendleAnswer).toBe('Mr. Brightside — The Killers')
    expect(published.bendleResults.map(r => [r.teamId, r.points])).toEqual([['p1', 30], ['p2', 0], ['p3', 0]])
    const up = upserts()[0].args
    expect(up.find(u => u.id === 't1').scores.r_r1).toEqual({ written: 4, phone: { s3: 30 } })
    expect(up.every(u => !('s1' in (u.scores.r_r1?.phone ?? {})))).toBe(true)
  })
  it('A on step 1 is refused with a visible hint; A on locked step 3 reveals', async () => {
    const a = actions()
    render([step(0), step(1), step(2)], 0, a)
    await pressA()
    expect(a.setAnswerReveal).not.toHaveBeenCalled()
    expect(host.textContent).toContain('after step 3 is locked')
    render([step(0), step(1), step(2, LOCKED)], 2, a)
    await pressA()
    await tick(20)
    expect(a.updateSlide.mock.calls.some(([, p]) => p.data.bendleRevealed)).toBe(true)
  })
  it('A after the reveal toggles the answer as usual', async () => {
    const a = actions()
    render([step(0), step(1), step(2, { ...LOCKED, bendleRevealed: true, bendleResults: [] })], 2, a)
    await pressA()
    expect(a.setAnswerReveal).toHaveBeenCalledWith(true)
  })
  it('override sets one team, republishes results, rescores the step-3 bucket and saves bendleOverrides', async () => {
    const a = actions()
    const results = [
      { teamId: 'p1', teamName: 'Quizzly Bears', guess: { title: 'Mr. Brightside', artist: 'The Killers' }, stepIndex: 0, correct: true, autoPoints: 30, points: 30, overridden: false },
      { teamId: 'p3', teamName: 'No Phone', guess: null, stepIndex: null, correct: false, autoPoints: 0, points: 0, overridden: false },
    ]
    render([step(0), step(1), step(2, { ...LOCKED, bendleRevealed: true, bendleResults: results })], 2, a)
    const select = host.querySelector('select[aria-label="Set No Phone points"]')
    await act(async () => { select.value = '20'; select.dispatchEvent(new Event('change', { bubbles: true })) })
    await tick(20)
    expect(upserts()[0].args.find(u => u.id === 't3').scores.r_r1.phone).toEqual({ s3: 20 })
    const [id, { data: saved }] = a.updateSlide.mock.calls.at(-1)
    expect(id).toBe('s3')
    expect(saved.bendleOverrides).toEqual({ p3: 20 })
    expect(saved.bendleRevealed).toBe(true)
    expect(saved.bendleResults.find(r => r.teamId === 'p3')).toMatchObject({ points: 20, overridden: true })
  })
  it('unlock clears the group rows through the host RPC before reopening, and keeps overrides', async () => {
    const a = actions()
    a.updateSlide = vi.fn(() => calls.push({ table: 'slide-write' }))
    render([step(0), step(1), step(2, { ...LOCKED, bendleRevealed: true, bendleResults: [], bendleOverrides: { p3: 20 } })], 2, a)
    await unlockTwice()
    await tick(10)
    const rpcAt = calls.findIndex(c => c.table === 'rpc')
    expect(calls[rpcAt]).toMatchObject({ op: 'clear_bendle_group_answers', args: { p_show_id: 'show1', p_group_id: 'g1' } })
    expect(rpcAt).toBeLessThan(calls.findIndex(c => c.table === 'slide-write'))
    expect(a.updateSlide).toHaveBeenCalledTimes(1)
    const [id, { data }] = a.updateSlide.mock.calls.at(-1)
    expect(id).toBe('s3')
    expect(data).toMatchObject({ bendleLocked: false, bendleRevealed: false, bendleResults: null, bendleLockedAt: null, bendleAnswer: null, bendleOverrides: { p3: 20 } })
  })
  it('A after the reveal still toggles the answer after Prev back to step 1', async () => {
    const a = actions()
    render([step(0), step(1), step(2, { ...LOCKED, bendleRevealed: true, bendleResults: [] })], 0, a)
    await pressA()
    expect(a.setAnswerReveal).toHaveBeenCalledWith(true)
    expect(host.textContent).not.toContain('after step 3 is locked')
  })
  describe('stalled wifi: Bendle reads time out and free the buttons', () => {
    const NEVER = new Promise(() => {})
    afterEach(() => { vi.useRealTimers() })
    const stall = async () => { await act(async () => { await vi.advanceTimersByTimeAsync(10_500) }) }
    it('reveal: a hung teams read gives up with an error and the button works again', async () => {
      responses['teams.select'] = NEVER
      const a = actions()
      render([step(0), step(1), step(2, LOCKED)], 2, a)
      vi.useFakeTimers()
      await act(async () => button('Reveal & Score').click())
      expect(button('Working')).toBeTruthy()
      await stall()
      expect(host.textContent).toContain('Could not finish reveal or scoring')
      expect(button('Reveal & Score').disabled).toBe(false)
      const read = calls.find(c => c.table === 'teams' && c.signal)
      expect(read.signal.aborted).toBe(true)
    })
    it('reveal: a hung song read gives up too', async () => {
      responses['bendle_songs.select'] = NEVER
      const a = actions()
      render([step(0), step(1), step(2, LOCKED)], 2, a)
      vi.useFakeTimers()
      await act(async () => button('Reveal & Score').click())
      await stall()
      expect(host.textContent).toContain('Could not finish reveal or scoring')
      expect(a.updateSlide).not.toHaveBeenCalled()
    })
    it('override: a hung teams read gives up with an error', async () => {
      const results = [{ teamId: 'p3', teamName: 'No Phone', guess: null, stepIndex: null, correct: false, autoPoints: 0, points: 0, overridden: false }]
      responses['teams.select'] = NEVER
      const a = actions()
      render([step(0), step(1), step(2, { ...LOCKED, bendleRevealed: true, bendleResults: results })], 2, a)
      vi.useFakeTimers()
      const select = host.querySelector('select[aria-label="Set No Phone points"]')
      await act(async () => { select.value = '20'; select.dispatchEvent(new Event('change', { bubbles: true })) })
      await stall()
      expect(host.textContent).toContain('Could not save the change')
      expect(host.querySelector('select[aria-label="Set No Phone points"]').disabled).toBe(false)
    })
    it('unlock: a hung RPC gives up with an error and the slide stays locked', async () => {
      responses['rpc.clear_bendle_group_answers'] = NEVER
      const a = actions()
      render([step(0), step(1), step(2, LOCKED)], 2, a)
      vi.useFakeTimers()
      await act(async () => button('Unlock').click())
      await act(async () => { await vi.advanceTimersByTimeAsync(450) })
      await act(async () => button('Tap again').click())
      await stall()
      expect(host.textContent).toContain('Could not unlock')
      expect(host.textContent).toContain('Retry Unlock before you reveal')
      expect(a.updateSlide).not.toHaveBeenCalled()
      expect(button('Unlock').disabled).toBe(false)
    })
  })
  it('override merges onto the latest step-3 data, not the data at click time', async () => {
    let release
    const results = [{ teamId: 'p3', teamName: 'No Phone', guess: null, stepIndex: null, correct: false, autoPoints: 0, points: 0, overridden: false }]
    const teamsRes = responses['teams.select']
    responses['teams.select'] = new Promise(r => { release = () => r(teamsRes) })
    const a = actions()
    const s3 = { ...LOCKED, bendleRevealed: true, bendleResults: results }
    render([step(0), step(1), step(2, s3)], 2, a)
    const select = host.querySelector('select[aria-label="Set No Phone points"]')
    await act(async () => { select.value = '20'; select.dispatchEvent(new Event('change', { bubbles: true })) })
    // Another write lands on the step-3 slide while the override is in flight.
    render([step(0), step(1), step(2, { ...s3, lockCountdownPhase: null, laterField: 'kept' })], 2, a)
    await act(async () => { release(); await Promise.resolve() })
    await tick(20)
    const [, { data: saved }] = a.updateSlide.mock.calls.at(-1)
    expect(saved.laterField).toBe('kept')
    expect(saved.bendleOverrides).toEqual({ p3: 20 })
  })
  it('a failed RPC leaves the slide locked and says so', async () => {
    responses['rpc.clear_bendle_group_answers'] = { data: null, error: { message: 'not authorized' } }
    const a = actions()
    render([step(0), step(1), step(2, LOCKED)], 2, a)
    await unlockTwice()
    await tick(10)
    expect(a.updateSlide).not.toHaveBeenCalled()
    expect(host.textContent).toContain('Could not unlock')
  })
})
