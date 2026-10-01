// @vitest-environment jsdom
// Movie Chain host flows: lock, reveal and score, failed lookup, correction.
// Supabase is a recording fake and Wikidata credits come from a fake lookup.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

const calls = []
let responses = {}
function builder(table) {
  const entry = { table, op: null, args: null, filters: [] }
  const q = {
    abortSignal() { return q },
    select(cols) { entry.op ??= 'select'; entry.args ??= cols; return q },
    upsert(payload) { entry.op = 'upsert'; entry.args = payload; return q },
    update(payload) { entry.op = 'update'; entry.args = payload; return q },
    insert(payload) { entry.op = 'insert'; entry.args = payload; return q },
    eq(k, v) { entry.filters.push([k, v]); return q },
    in(k, v) { entry.filters.push([k, v]); return q },
    order() { return q }, single() { return q }, maybeSingle() { return q },
    then(res, rej) {
      calls.push(entry)
      return Promise.resolve(responses[`${table}.${entry.op}`] ?? { data: [], error: null }).then(res, rej)
    },
  }
  return q
}
vi.mock('../../lib/supabase.js', () => ({
  supabase: { from: t => builder(t), channel: () => ({ on() { return this }, subscribe() { return this } }), removeChannel() {} },
}))

const credits = { Q1: ['Q11', 'Q12'], Q2: ['Q11', 'Q13'], Q3: ['Q13', 'Q14'], Q4: ['Q14', 'Q12'] }
let castImpl
vi.mock('../../lib/movieChainApi.js', () => ({ movieChainRequest: vi.fn((action, params) => castImpl(action, params)) }))

const { default: LiveMode } = await import('./LiveMode.jsx')

let host, root
const LOCKED_AT = '2026-10-01T18:00:00.000Z'
const baseData = {
  isShiny: true, shinyInputSchema: { type: 'movie-chain', slots: 1 },
  movieChainStart: { id: 'Q1', title: 'One' }, movieChainEnd: { id: 'Q4', title: 'Four' }, movieChainCount: 4,
}
const slideOf = data => ({ id: 'mc1', roundId: 'r1', order: 0, type: 'question', data: { ...baseData, ...data } })
const SHOW = slide => ({
  id: 'show1', title: 'Test', theme: 'midnight-galaxy', audio_playing: null,
  rounds: [{ id: 'r1', number: 1, title: 'Round 1' }], slides: [slide],
  showState: { currentSlideIndex: 0, currentSlideId: slide.id, answerReveal: false, scoreboardVisible: false, scoresRevealed: false },
})
const order = []
const actions = () => ({
  updateSlide: vi.fn((id, patch) => order.push(patch.data.movieChainRevealed ? 'verdict' : 'slide')),
  flushSlides: vi.fn(async () => { order.push(`flush@${calls.filter(c => c.op === 'upsert').length}`) }),
  nextSlide: vi.fn(), prevSlide: vi.fn(), setAnswerReveal: vi.fn(), setScoreboardVisible: vi.fn(),
  setScoresRevealed: vi.fn(), setAudioPlaying: vi.fn(), endShow: vi.fn(),
})
const button = label => [...host.querySelectorAll('button')].find(b => b.textContent.includes(label))
const tick = ms => act(() => new Promise(r => setTimeout(r, ms)))
const goodChain = { movies: ['Q1', 'Q2', 'Q3', 'Q4'], performers: ['Q11', 'Q13', 'Q14'] }

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  calls.length = 0; order.length = 0
  castImpl = async (action, { movieId }) => ({
    movie: { id: movieId, title: `Film ${movieId}` },
    performers: credits[movieId].map(id => ({ id, name: `Person ${id}` })),
  })
  responses = {
    'phone_answers.select': { data: [{ team_id: 'p1', answer: goodChain, submitted_at: '2026-10-01T17:59:00.000Z' }], error: null },
    'teams.select': { data: [{ id: 'p1', name: 'Quizzly Bears' }], error: null },
    'scoreboard_teams.select': { data: [{ id: 't1', show_id: 'show1', name: 'Quizzly Bears', scores: { r_r1: { written: 4 } }, sort_order: 0 }], error: null },
    'scoreboard_teams.upsert': { error: null },
  }
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks() })

const render = (slide, a) => act(() => root.render(<LiveMode show={SHOW(slide)} actions={a} scoreboardModalOpen={false} />))
const upserts = () => calls.filter(c => c.table === 'scoreboard_teams' && c.op === 'upsert')

describe('Movie Chain host flows', () => {
  it('lock stamps the cutoff, saves, and touches no scores', async () => {
    const a = actions()
    render(slideOf({}), a)
    await act(async () => button('Lock Chains').click())
    expect(a.updateSlide).toHaveBeenCalledTimes(1)
    const data = a.updateSlide.mock.calls[0][1].data
    expect(data.movieChainLocked).toBe(true)
    expect(Number.isFinite(Date.parse(data.movieChainLockedAt))).toBe(true)
    expect(data.movieChainRevealed).toBeUndefined()
    expect(a.flushSlides).toHaveBeenCalled()
    expect(calls).toEqual([])
  })

  it('an incomplete setup blocks the lock with a useful message', async () => {
    const a = actions()
    render(slideOf({ movieChainEnd: null }), a)
    await act(async () => button('Lock Chains').click())
    expect(a.updateSlide).not.toHaveBeenCalled()
    expect(host.textContent).toContain('Choose an ending movie first')
  })

  it('reveal publishes verdicts before writing the scoreboard, once, with 15 points', async () => {
    const a = actions()
    render(slideOf({ movieChainLocked: true, movieChainLockedAt: LOCKED_AT }), a)
    await act(async () => button('Reveal & Score').click())
    await tick(20)
    const published = a.updateSlide.mock.calls.find(([, p]) => p.data.movieChainRevealed)[1].data
    expect(published.movieChainResults).toMatchObject([{ teamId: 'p1', teamName: 'Quizzly Bears', points: 15, valid: true }])
    expect(order).toEqual(['verdict', 'flush@0'])
    expect(upserts()).toHaveLength(1)
    expect(upserts()[0].args[0].scores.r_r1.phone.mc1).toBe(15)
    expect(upserts()[0].args[0].scores.r_r1.written).toBe(4)
  })

  it('an answer saved after the lock time scores nothing and is not listed', async () => {
    responses['phone_answers.select'] = { data: [{ team_id: 'p1', answer: goodChain, submitted_at: '2026-10-01T18:00:05.000Z' }], error: null }
    const a = actions()
    render(slideOf({ movieChainLocked: true, movieChainLockedAt: LOCKED_AT }), a)
    await act(async () => button('Reveal & Score').click())
    await tick(20)
    const published = a.updateSlide.mock.calls.find(([, p]) => p.data.movieChainRevealed)[1].data
    expect(published.movieChainResults).toEqual([])
    expect(upserts()).toHaveLength(0)
  })

  it('a Wikidata outage keeps the reveal pending: no verdict, no points, retry message', async () => {
    castImpl = async () => { throw new Error('Wikidata unavailable') }
    const a = actions()
    render(slideOf({ movieChainLocked: true, movieChainLockedAt: LOCKED_AT }), a)
    await act(async () => button('Reveal & Score').click())
    await tick(1700) // 3 tries with backoff per film
    expect(a.updateSlide).not.toHaveBeenCalled()
    expect(upserts()).toHaveLength(0)
    expect(host.textContent).toContain('Could not finish reveal or scoring')
  }, 10000)

  it('a failed scoreboard write after the verdict is retried from stored verdicts, no new lookups, no second verdict', async () => {
    responses['scoreboard_teams.upsert'] = { error: { message: 'boom' } }
    const a = actions()
    const locked = slideOf({ movieChainLocked: true, movieChainLockedAt: LOCKED_AT })
    render(locked, a)
    await act(async () => button('Reveal & Score').click())
    await tick(20)
    expect(host.textContent).toContain('Could not finish reveal or scoring')
    const published = a.updateSlide.mock.calls.find(([, p]) => p.data.movieChainRevealed)[1].data
    // Realtime hands the revealed slide back; the host presses Retry.
    responses['scoreboard_teams.upsert'] = { error: null }
    calls.length = 0; a.updateSlide.mockClear()
    render(slideOf(published), a)
    await act(async () => button('Retry Scoring').click())
    await tick(20)
    expect(calls.some(c => c.table === 'phone_answers')).toBe(false)
    expect(a.updateSlide).not.toHaveBeenCalled()
    expect(upserts()).toHaveLength(1)
    expect(upserts()[0].args[0].scores.r_r1.phone.mc1).toBe(15)
  })

  it('a host correction updates the scoreboard and the stored verdict together', async () => {
    responses['scoreboard_teams.select'] = { data: [{ id: 't1', show_id: 'show1', name: 'Quizzly Bears', scores: { r_r1: { written: 4, phone: { mc1: 15 } } }, sort_order: 0 }], error: null }
    const a = actions()
    const results = [{ teamId: 'p1', teamName: 'Quizzly Bears', points: 15, valid: true, movieCount: 4 }]
    render(slideOf({ movieChainLocked: true, movieChainLockedAt: LOCKED_AT, movieChainRevealed: true, movieChainResults: results }), a)
    const select = host.querySelector('select[aria-label="Correct Quizzly Bears score"]')
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, '0')
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await tick(20)
    expect(upserts()).toHaveLength(1)
    expect(upserts()[0].args[0].scores.r_r1.phone.mc1).toBe(0)
    const stored = a.updateSlide.mock.calls.at(-1)[1].data.movieChainResults[0]
    expect(stored).toMatchObject({ points: 0, valid: false, corrected: true })
  })
})
