// @vitest-environment jsdom
// Characterization: lockAndScore's Supabase calls for a matching and a wager
// lock are exactly what they were before phase 3 (same tables, columns,
// filters, payloads, order), and its scoreboard_teams read-then-upsert now runs
// on the score chain, so an iPad score.set can't land between the two.
// Supabase is a recording fake: no network, no real rows.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

const calls = []
let responses = {}
function builder(table) {
  const entry = { table, op: null, args: null, filters: [], signal: null }
  const q = {
    abortSignal(sig) { entry.signal = sig; return q },
    select(cols) { entry.op ??= 'select'; entry.args ??= cols; return q },
    upsert(payload) { entry.op = 'upsert'; entry.args = payload; return q },
    update(payload) { entry.op = 'update'; entry.args = payload; return q },
    insert(payload) { entry.op = 'insert'; entry.args = payload; return q },
    eq(k, v) { entry.filters.push([k, v]); return q },
    in(k, v) { entry.filters.push([k, v]); return q },
    order() { return q },
    single() { return q },
    maybeSingle() { return q },
    then(res, rej) {
      calls.push(entry)
      const r = responses[`${table}.${entry.op}`] ?? { data: [], error: null }
      return Promise.resolve(typeof r === 'function' ? r(entry) : r).then(res, rej)
    },
  }
  return q
}
vi.mock('../../lib/supabase.js', () => ({
  supabase: {
    from: t => builder(t),
    channel: () => ({ on() { return this }, subscribe() { return this } }),
    removeChannel() {},
  },
}))
let chain = null
vi.mock('../../lib/scoreCellWrite.js', async orig => {
  const m = await orig()
  // A short call timeout so the hanging-Supabase tests finish quickly.
  return { ...m, SCORE_CALL_TIMEOUT_MS: 80, createScoreChain: deps => (chain = m.createScoreChain(deps)) }
})

const { default: LiveMode } = await import('./LiveMode.jsx')

let host, root
const SHOW = slide => ({
  id: 'show1', title: 'Test', theme: 'midnight-galaxy', audio_playing: null,
  rounds: [{ id: 'r1', number: 1, title: 'Round 1' }],
  slides: [slide],
  showState: { currentSlideIndex: 0, currentSlideId: slide.id, answerReveal: false, scoreboardVisible: false, scoresRevealed: false },
})
const actions = () => ({
  updateSlide: vi.fn(), flushSlides: vi.fn(async () => {}), nextSlide: vi.fn(), prevSlide: vi.fn(),
  setAnswerReveal: vi.fn(), setScoreboardVisible: vi.fn(), setScoresRevealed: vi.fn(), setAudioPlaying: vi.fn(), endShow: vi.fn(),
})
const button = label => [...host.querySelectorAll('button')].find(b => b.textContent.includes(label))
const tick = ms => act(() => new Promise(r => setTimeout(r, ms)))
const plain = c => ({ table: c.table, op: c.op, args: c.args, filters: c.filters })
// A Supabase call that never answers until its AbortSignal fires.
const hang = entry => new Promise(resolve => {
  entry.signal?.addEventListener('abort', () => resolve({ data: null, error: { message: 'AbortError: aborted' } }))
})

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  calls.length = 0
  chain = null
  responses = {
    'phone_answers.select': { data: [{ team_id: 'p1', answer: [{ leftId: 'a', rightId: 'a' }], submitted_at: null }], error: null },
    'teams.select': { data: [{ id: 'p1', name: 'Quizzly Bears' }], error: null },
    'scoreboard_teams.select': { data: [{ id: 't1', show_id: 'show1', name: 'Quizzly Bears', scores: { r_r1: { written: 4, phone: { other: 1 } } }, sort_order: 0 }], error: null },
    'scoreboard_teams.upsert': { error: null },
    'scoreboard_teams.update': { data: [{ id: 't1' }], error: null },
  }
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

const BEFORE = slideId => [
  { table: 'phone_answers', op: 'select', args: 'team_id, answer, submitted_at', filters: [['slide_id', slideId], ['show_id', 'show1']] },
  { table: 'teams', op: 'select', args: 'id, name', filters: [['show_id', 'show1']] },
  { table: 'scoreboard_teams', op: 'select', args: 'id, show_id, name, scores, sort_order', filters: [['show_id', 'show1']] },
]

describe('lockAndScore Supabase sequence (characterization)', () => {
  it('matching: reads phone_answers, teams, scoreboard_teams, then one upsert, in that order', async () => {
    const slide = { id: 'm1', roundId: 'r1', order: 0, type: 'question', data: { isShiny: true, shinyInputSchema: { type: 'matching' }, pointsPerMatch: 2 } }
    const a = actions()
    act(() => root.render(<LiveMode show={SHOW(slide)} actions={a} scoreboardModalOpen={false} />))
    act(() => button('Lock Answers & Score').click())
    await tick(900)
    expect(calls.map(plain)).toEqual([
      ...BEFORE('m1'),
      { table: 'scoreboard_teams', op: 'upsert', args: [{ id: 't1', show_id: 'show1', name: 'Quizzly Bears', sort_order: 0, scores: { r_r1: { written: 4, phone: { other: 1, m1: 2 } } } }], filters: [] },
    ])
    expect(a.updateSlide).toHaveBeenCalledTimes(2)
    expect(a.updateSlide.mock.calls[1][1].data).toMatchObject({ matchingLocked: true })
  })

  it('wager guesses: same reads, then one upsert of the wager fold-in', async () => {
    const slide = { id: 'w1', roundId: 'r1', order: 0, type: 'question', data: { isShiny: true, shinyInputSchema: { type: 'wager' }, answer: '100', wagerTiersLocked: true, wagerTiers: { p1: 'safe' } } }
    responses['phone_answers.select'] = { data: [{ team_id: 'p1', answer: { guess: '100' }, submitted_at: null }], error: null }
    const a = actions()
    act(() => root.render(<LiveMode show={SHOW(slide)} actions={a} scoreboardModalOpen={false} />))
    act(() => button('Lock Answers & Score').click())
    await tick(900)
    const seq = calls.map(plain)
    expect(seq.slice(0, 3)).toEqual(BEFORE('w1'))
    expect(seq).toHaveLength(4)
    expect(seq[3]).toMatchObject({ table: 'scoreboard_teams', op: 'upsert', filters: [] })
    expect(seq[3].args).toHaveLength(1)
    expect(seq[3].args[0]).toMatchObject({ id: 't1', show_id: 'show1', name: 'Quizzly Bears', sort_order: 0 })
    expect(seq[3].args[0].scores.r_r1).toMatchObject({ written: 4, phone: { other: 1 } })
    expect(typeof seq[3].args[0].scores.r_r1.phone.w1).toBe('number')
    expect(a.updateSlide.mock.calls.at(-1)[1].data).toMatchObject({ wagerGuessesLocked: true, wagerResults: expect.any(Array) })
  })

  it('the scoreboard_teams read-then-upsert waits on the score chain (phone reads do not)', async () => {
    const slide = { id: 'm1', roundId: 'r1', order: 0, type: 'question', data: { isShiny: true, shinyInputSchema: { type: 'matching' }, pointsPerMatch: 2 } }
    act(() => root.render(<LiveMode show={SHOW(slide)} actions={actions()} scoreboardModalOpen={false} />))
    expect(chain).not.toBe(null)
    let release
    const held = chain.run(() => new Promise(r => { release = r })) // an iPad score.set in flight
    act(() => button('Lock Answers & Score').click())
    await tick(900)
    expect(calls.map(c => c.table)).toEqual(['phone_answers', 'teams'])
    expect(chain.depth()).toBe(2)
    release()
    await held
    await tick(20)
    expect(calls.map(c => `${c.table}.${c.op}`)).toEqual(['phone_answers.select', 'teams.select', 'scoreboard_teams.select', 'scoreboard_teams.upsert'])
    expect(chain.depth()).toBe(0)
  })

  it('an early return inside the segment (unmatched teams) still frees the chain and skips the upsert', async () => {
    const slide = { id: 'm1', roundId: 'r1', order: 0, type: 'question', data: { isShiny: true, shinyInputSchema: { type: 'matching' }, pointsPerMatch: 2 } }
    responses['scoreboard_teams.select'] = { data: [], error: null }
    const a = actions()
    act(() => root.render(<LiveMode show={SHOW(slide)} actions={a} scoreboardModalOpen={false} />))
    act(() => button('Lock Answers & Score').click())
    await tick(900)
    expect(calls.map(c => `${c.table}.${c.op}`)).toEqual(['phone_answers.select', 'teams.select', 'scoreboard_teams.select'])
    expect(host.textContent).toContain('No answers could be matched to the scoreboard')
    expect(a.updateSlide).toHaveBeenCalledTimes(1) // the lock only; no final write
    expect(chain.depth()).toBe(0)
  })

  it('the in-chain scoreboard_teams read and upsert carry an abort signal', async () => {
    const slide = { id: 'm1', roundId: 'r1', order: 0, type: 'question', data: { isShiny: true, shinyInputSchema: { type: 'matching' }, pointsPerMatch: 2 } }
    act(() => root.render(<LiveMode show={SHOW(slide)} actions={actions()} scoreboardModalOpen={false} />))
    act(() => button('Lock Answers & Score').click())
    await tick(900)
    const sb = calls.filter(c => c.table === 'scoreboard_teams')
    expect(sb.map(c => c.op)).toEqual(['select', 'upsert'])
    for (const c of sb) expect(c.signal).toBeInstanceOf(AbortSignal)
  })

  it('a scoreboard_teams read that never answers is aborted: the usual scoring error, the chain frees, Retry works', async () => {
    const slide = { id: 'm1', roundId: 'r1', order: 0, type: 'question', data: { isShiny: true, shinyInputSchema: { type: 'matching' }, pointsPerMatch: 2 } }
    const good = responses['scoreboard_teams.select']
    responses['scoreboard_teams.select'] = hang
    act(() => root.render(<LiveMode show={SHOW(slide)} actions={actions()} scoreboardModalOpen={false} />))
    act(() => button('Lock Answers & Score').click())
    await tick(1000)
    expect(host.textContent).toContain('Scoring failed')
    expect(chain.depth()).toBe(0)
    responses['scoreboard_teams.select'] = good
    const retry = button('Retry') ?? button('Lock Answers & Score')
    act(() => retry.click())
    await tick(900)
    expect(calls.map(c => `${c.table}.${c.op}`).at(-1)).toBe('scoreboard_teams.upsert')
  })

  it('an upsert that never answers is aborted the same way', async () => {
    const slide = { id: 'm1', roundId: 'r1', order: 0, type: 'question', data: { isShiny: true, shinyInputSchema: { type: 'matching' }, pointsPerMatch: 2 } }
    responses['scoreboard_teams.upsert'] = hang
    act(() => root.render(<LiveMode show={SHOW(slide)} actions={actions()} scoreboardModalOpen={false} />))
    act(() => button('Lock Answers & Score').click())
    await tick(1000)
    expect(host.textContent).toContain('Scoring failed')
    expect(chain.depth()).toBe(0)
  })

  it('scoreChainIdleRef: null when the chain is empty, else settles once it drains', async () => {
    const slide = { id: 'q1', roundId: 'r1', order: 0, type: 'question', data: {} }
    const ref = { current: null }
    act(() => root.render(<LiveMode show={SHOW(slide)} actions={actions()} scoreboardModalOpen={false} scoreChainIdleRef={ref} />))
    expect(ref.current()).toBe(null)
    let release
    chain.run(() => new Promise(r => { release = r }))
    let idle = false
    ref.current().then(() => { idle = true })
    await tick(10)
    expect(idle).toBe(false)
    release()
    await tick(10)
    expect(idle).toBe(true)
  })
})

describe('iPad score.set through Live Mode (fake socket, fake Supabase)', () => {
  class FakeWS {
    static OPEN = 1
    static all = []
    constructor(url) { this.url = url; this.readyState = 0; this.sent = []; FakeWS.all.push(this) }
    send(s) { this.sent.push(JSON.parse(s)) }
    close() { this.readyState = 3 }
    open() { this.readyState = 1; this.onopen?.() }
    msg(m) { this.onmessage?.({ data: JSON.stringify(m) }) }
  }
  const slide = { id: 'q1', roundId: 'r1', order: 0, type: 'question', data: { questionNumber: 1 } }
  let ws
  beforeEach(() => {
    FakeWS.all = []
    vi.stubGlobal('WebSocket', FakeWS)
    localStorage.setItem('trivia-os:ipad-remote', '1')
    act(() => root.render(<LiveMode show={SHOW(slide)} actions={actions()} scoreboardModalOpen={false} />))
    ws = FakeWS.all[0]
    act(() => ws.open())
  })
  afterEach(() => { vi.unstubAllGlobals(); localStorage.clear() })
  const cmd = (id, c, args) => act(() => ws.msg({ type: 'cmd', id, cmd: c, args, sentAt: Date.now() }))
  const results = id => ws.sent.filter(m => m.type === 'result' && m.id === id)

  it('fresh read, update of that row\'s scores only (phone bucket kept), read back; an unconfirmed save is reported, not claimed', async () => {
    cmd('1', 'score.set', { teamId: 't1', colKey: 'r_r1', value: 9, expectOld: 5 })
    expect(results('1')[0]).toEqual({ type: 'result', id: '1', received: true })
    await tick(30)
    expect(calls.map(plain)).toEqual([
      { table: 'scoreboard_teams', op: 'select', args: 'id, show_id, name, scores, sort_order', filters: [['show_id', 'show1']] },
      { table: 'scoreboard_teams', op: 'update', args: { scores: { r_r1: { written: 8, phone: { other: 1 } } } }, filters: [['id', 't1'], ['show_id', 'show1']] },
      { table: 'scoreboard_teams', op: 'select', args: 'id, show_id, name, scores, sort_order', filters: [['show_id', 'show1']] },
      // after a refusal: one more read-only refresh for the drawer
      { table: 'scoreboard_teams', op: 'select', args: 'id, show_id, name, scores, sort_order', filters: [['show_id', 'show1']] },
    ])
    expect(host.textContent).not.toContain('iPad set')
    // The fake read returns the old row again, so the laptop must NOT claim it saved.
    expect(results('1')[1]).toEqual({ type: 'result', id: '1', refused: 'save-unconfirmed' })
  })

  it('reports the value read back, and the laptop notice names the change', async () => {
    let n = 0
    responses['scoreboard_teams.select'] = () => ({ data: [{ id: 't1', show_id: 'show1', name: 'Quizzly Bears', sort_order: 0, scores: { r_r1: n++ === 0 ? { written: 4, phone: { other: 1 } } : { written: 8, phone: { other: 1 } } } }], error: null })
    cmd('2', 'score.set', { teamId: 't1', colKey: 'r_r1', value: 9, expectOld: 5 })
    await tick(30)
    expect(results('2')[1]).toMatchObject({ done: true, scoreSet: { team: 'Quizzly Bears', col: 'R1', from: 5, to: 9 } })
    expect(host.textContent).toContain('iPad set Quizzly Bears R1: 5 to 9')
  })

  it('refused while the laptop scoreboard modal is open; nothing read', async () => {
    act(() => root.render(<LiveMode show={SHOW(slide)} actions={actions()} scoreboardModalOpen />))
    cmd('3', 'score.set', { teamId: 't1', colKey: 'r_r1', value: 9, expectOld: 5 })
    expect(results('3')).toEqual([{ type: 'result', id: '3', refused: 'modal-open' }])
    await tick(10)
    expect(calls).toEqual([])
  })

  const last = () => ws.sent.filter(m => m.type === 'state').at(-1)
  const winnerShow = () => ({
    ...SHOW(slide),
    slides: [slide, { id: 'wr', roundId: null, order: 1, type: 'winner-reveal', data: {} }],
    showState: { currentSlideIndex: 1, currentSlideId: 'wr', answerReveal: false, scoreboardVisible: false, scoresRevealed: false },
  })
  const savedTo9 = () => {
    let n = 0
    responses['scoreboard_teams.select'] = () => ({ data: [{ id: 't1', show_id: 'show1', name: 'Quizzly Bears', sort_order: 0, scores: { r_r1: n++ === 0 ? { written: 4, phone: { other: 1 } } : { written: 8, phone: { other: 1 } } } }], error: null })
  }

  it('zero rows matched by the update (team deleted meanwhile) is reported as not saved', async () => {
    responses['scoreboard_teams.update'] = { data: [], error: null }
    cmd('z', 'score.set', { teamId: 't1', colKey: 'r_r1', value: 9, expectOld: 5 })
    await tick(30)
    expect(results('z')[1]).toEqual({ type: 'result', id: 'z', refused: 'score-not-saved' })
    expect(calls.some(c => c.op === 'upsert')).toBe(false)
  })

  it('every iPad scoreboard_teams call carries an abort signal; an update that never answers is save-unconfirmed', async () => {
    responses['scoreboard_teams.update'] = hang
    cmd('h', 'score.set', { teamId: 't1', colKey: 'r_r1', value: 9, expectOld: 5 })
    await tick(250)
    expect(results('h')[1]).toEqual({ type: 'result', id: 'h', refused: 'save-unconfirmed' })
    for (const c of calls) expect(c.signal).toBeInstanceOf(AbortSignal)
    expect(chain.depth()).toBe(0)
  })

  it('the score chain counts as busy for the iPad for 12s at most', async () => {
    chain.run(() => new Promise(() => {})) // stuck forever
    act(() => root.render(<LiveMode show={SHOW(slide)} actions={actions()} scoreboardModalOpen={false} />))
    await tick(200)
    expect(last().busy).toBe(true)
    const real = Date.now
    vi.spyOn(Date, 'now').mockImplementation(() => real() + 13000)
    act(() => root.render(<LiveMode show={{ ...SHOW(slide) }} actions={actions()} scoreboardModalOpen={false} />))
    await tick(200)
    expect(last().busy).toBe(false)
    vi.restoreAllMocks()
  })

  it('for 1s after the laptop score table closes, scores.get and score.set are refused in plain words; then the open drawer refreshes', async () => {
    cmd('g', 'scores.get', {})
    await tick(50)
    act(() => root.render(<LiveMode show={SHOW(slide)} actions={actions()} scoreboardModalOpen />))
    act(() => root.render(<LiveMode show={SHOW(slide)} actions={actions()} scoreboardModalOpen={false} />))
    const readsAtClose = calls.length
    cmd('c1', 'score.set', { teamId: 't1', colKey: 'r_r1', value: 9, expectOld: 5 })
    cmd('c2', 'scores.get', {})
    expect(results('c1')).toEqual([{ type: 'result', id: 'c1', refused: 'modal-just-closed' }])
    expect(results('c2')).toEqual([{ type: 'result', id: 'c2', refused: 'modal-just-closed' }])
    await tick(1150)
    expect(calls.length).toBe(readsAtClose + 1) // the refresh for the open drawer
    cmd('c3', 'scores.get', {})
    expect(results('c3')[0]).toEqual({ type: 'result', id: 'c3', received: true })
  })

  it('after lockAndScore\'s chain segment, an open drawer is re-read', async () => {
    cmd('g', 'scores.get', {})
    await tick(50)
    const m1 = { id: 'm1', roundId: 'r1', order: 0, type: 'question', data: { isShiny: true, shinyInputSchema: { type: 'matching' }, pointsPerMatch: 2 } }
    act(() => root.render(<LiveMode show={SHOW(m1)} actions={actions()} scoreboardModalOpen={false} />))
    calls.length = 0
    act(() => button('Lock Answers & Score').click())
    await tick(900)
    expect(calls.map(c => `${c.table}.${c.op}`)).toEqual(['phone_answers.select', 'teams.select', 'scoreboard_teams.select', 'scoreboard_teams.upsert', 'scoreboard_teams.select'])
  })

  it('a score saved on the winner slide re-saves the final results and tells the iPad the TV is stale', async () => {
    const a = actions()
    a.saveResults = vi.fn(async () => {})
    act(() => root.render(<LiveMode show={winnerShow()} actions={a} scoreboardModalOpen={false} />))
    savedTo9()
    cmd('w', 'score.set', { teamId: 't1', colKey: 'r_r1', value: 9, expectOld: 5 })
    await tick(30)
    expect(a.saveResults).toHaveBeenCalledTimes(1)
    expect(results('w')[1]).toMatchObject({ done: true, scoreSet: { to: 9, winnerStale: true } })
  })

  it('before the winner slide: no re-save, no stale note', async () => {
    const a = actions()
    a.saveResults = vi.fn(async () => {})
    act(() => root.render(<LiveMode show={SHOW(slide)} actions={a} scoreboardModalOpen={false} />))
    savedTo9()
    cmd('n', 'score.set', { teamId: 't1', colKey: 'r_r1', value: 9, expectOld: 5 })
    await tick(30)
    expect(a.saveResults).not.toHaveBeenCalled()
    expect(results('n')[1].scoreSet.winnerStale).toBeUndefined()
  })

  it('scores.get attaches the drawer view to the snapshot; scores.hide drops it', async () => {
    cmd('4', 'scores.get', {})
    await tick(200)
    expect(last().scores.teams[0]).toMatchObject({ id: 't1', name: 'Quizzly Bears', total: 5, place: 1 })
    cmd('5', 'scores.hide', {})
    await tick(200)
    expect(last().scores).toBe(null)
  })
})
