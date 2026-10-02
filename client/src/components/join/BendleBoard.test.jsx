// @vitest-environment jsdom
// client/src/components/join/BendleBoard.test.jsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

const db = { rows: [], insertError: null, inserts: [], readGate: null }
vi.mock('../../lib/supabase.js', () => ({ supabase: { from: () => ({
  select: () => ({ eq: () => ({ in: (_c, ids) => {
    const res = { data: db.rows.filter(r => ids.includes(r.slide_id)), error: null } // snapshot at call time
    return db.readGate ? db.readGate.then(() => res) : Promise.resolve(res)
  } }) }),
  insert: async payload => { db.inserts.push(payload); if (db.insertError) return { error: db.insertError }; db.rows.push({ slide_id: payload.slide_id, answer: payload.answer }); return { error: null } },
}) } }))
const { default: BendleBoard, saveErrorKind } = await import('./BendleBoard.jsx')

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const ROWS = [['Mr. Brightside', 'The Killers', 60], ['Africa', 'Toto', 50], ['Africa', 'Weezer', 8]]
let urlN = 0
const theme = { colors: { text: '#fff', highlight: '#f5c842' }, fonts: { body: 'DM Sans' } }
const step = (i, extra = {}) => ({ id: `s${i + 1}`, showId: 'show1', type: 'question',
  data: { isShiny: true, shinyInputSchema: { type: 'bendle' }, shinyGroupId: 'g1', bendleStepIndex: i, text: 'Name that song', ...extra } })
const team = { id: 'p1', showId: 'show1' }
let root, host, lastProps
beforeEach(() => {
  db.rows = []; db.insertError = null; db.inserts = []; db.readGate = null
  globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ rows: ROWS }) }))
})
afterEach(() => { act(() => root?.unmount()); host?.remove(); vi.useRealTimers() })
const tick = (ms = 0) => act(() => new Promise(r => setTimeout(r, ms)))
async function render(slide, { slides = [step(0), step(1), step(2)], onAnswered = vi.fn(), catalogUrl = `/cat-${++urlN}.json` } = {}) {
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  lastProps = { slides, onAnswered, catalogUrl }
  await act(async () => root.render(<BendleBoard slide={slide} slides={slides.map(s => s.id === slide.id ? slide : s)} team={team} theme={theme} onAnswered={onAnswered} catalogUrl={catalogUrl} />))
  await tick()
  return onAnswered
}
async function rerender(slide) {
  const { slides, onAnswered, catalogUrl } = lastProps
  await act(async () => root.render(<BendleBoard slide={slide} slides={slides.map(s => s.id === slide.id ? slide : s)} team={team} theme={theme} onAnswered={onAnswered} catalogUrl={catalogUrl} />))
  await tick()
}
async function type(label, value) {
  const input = host.querySelector(`input[aria-label="${label}"]`)
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await tick(150) // past the 100 ms debounce
}
const button = text => [...host.querySelectorAll('button')].find(b => b.textContent.includes(text))

describe('<BendleBoard>', () => {
  it('searches the song list, picks a row, and locks it at the live step', async () => {
    const onAnswered = await render(step(0))
    await type('Search for the song', 'mr bright')
    await act(async () => button('Mr. Brightside').click())
    expect(host.textContent).toContain('Your guess: Mr. Brightside - The Killers')
    await act(async () => button('Lock In').click())
    expect(db.inserts[0]).toEqual({ show_id: 'show1', slide_id: 's1', team_id: 'p1', answer: { title: 'Mr. Brightside', artist: 'The Killers', source: 'catalog', qid: null } })
    expect(host.textContent).toContain('Locked in at step 1')
    expect(onAnswered).toHaveBeenLastCalledWith(true)
    expect(host.textContent).not.toMatch(/correct|wrong/i)
  })
  it('"Use what I typed" with an optional artist', async () => {
    await render(step(1))
    await type('Search for the song', 'Uptown Funk')
    await act(async () => button('Use what I typed').click())
    await type('Artist (optional)', 'Mark Ronson')
    await act(async () => button('Lock In').click())
    expect(db.inserts[0].answer).toEqual({ title: 'Uptown Funk', artist: 'Mark Ronson', source: 'typed', qid: null })
    expect(host.textContent).toContain('Locked in at step 2')
  })
  it('a guess locked on step 1 shows as locked on step 3 and releases the phone', async () => {
    db.rows = [{ slide_id: 's1', answer: { title: 'Africa', artist: 'Toto', source: 'catalog', qid: null } }]
    const onAnswered = await render(step(2))
    expect(host.textContent).toContain('Locked in at step 1')
    expect(host.textContent).toContain('Africa - Toto')
    expect(host.querySelector('input')).toBeNull()
    expect(onAnswered).toHaveBeenLastCalledWith(true)
  })
  it('works typed-only when the song list fails to load', async () => {
    globalThis.fetch = vi.fn(async () => { throw new TypeError('offline') })
    await render(step(0))
    expect(host.textContent).toContain('Song list did not load')
    await type('Search for the song', 'Africa')
    await act(async () => button('Use what I typed').click())
    await act(async () => button('Lock In').click())
    expect(db.inserts[0].answer.source).toBe('typed')
  })
  it('a rejected second write reads back the saved row and shows locked, no error', async () => {
    await render(step(0))
    db.insertError = { message: 'bendle_already_guessed', code: '23505' }
    db.rows = [{ slide_id: 's1', answer: { title: 'Africa', artist: null, source: 'typed', qid: null } }]
    await type('Search for the song', 'Africa')
    await act(async () => button('Use what I typed').click())
    await act(async () => button('Lock In').click())
    await tick()
    expect(host.textContent).toContain('Locked in at step 1')
    expect(host.querySelector('[role="alert"]')).toBeNull()
  })
  it('the step moved on: says so and keeps the pick', async () => {
    await render(step(0))
    db.insertError = { message: 'bendle_not_live' }
    await type('Search for the song', 'Africa')
    await act(async () => button('Use what I typed').click())
    await act(async () => button('Lock In').click())
    expect(host.querySelector('[role="alert"]').textContent).toContain('The step moved on')
    expect(host.textContent).toContain('Your guess: Africa')
  })
  it('countdown nudges a picked guess; a locked group without a guess says so', async () => {
    await render(step(2, { lockCountdownStartedAt: Date.now() }))
    await type('Search for the song', 'Africa')
    await act(async () => button('Use what I typed').click())
    expect(host.textContent).toContain('Lock in now')
    act(() => root.unmount())
    await render(step(2, { bendleLocked: true }))
    expect(host.textContent).toContain('Guesses are locked')
  })
  it("after the reveal shows this team's result only", async () => {
    db.rows = [{ slide_id: 's1', answer: { title: 'Africa', artist: 'Toto' } }]
    await render(step(2, { bendleLocked: true, bendleRevealed: true, bendleResults: [
      { teamId: 'p1', teamName: 'Alpha', guess: { title: 'Africa', artist: 'Toto' }, stepIndex: 0, correct: true, autoPoints: 30, points: 30, overridden: false },
      { teamId: 'p2', teamName: 'Bravo', guess: null, stepIndex: null, correct: false, autoPoints: 0, points: 0, overridden: false },
    ] }))
    expect(host.textContent).toContain('+30 points')
    expect(host.textContent).not.toContain('Bravo')
  })
  it('saveErrorKind', () => {
    expect(saveErrorKind({ message: 'bendle_not_live' })).toBe('moved')
    expect(saveErrorKind({ message: 'bendle_locked' })).toBe('locked')
    expect(saveErrorKind({ message: 'bendle_no_update' })).toBe('duplicate')
    expect(saveErrorKind({ code: '23505', message: 'duplicate key' })).toBe('duplicate')
    expect(saveErrorKind({ message: 'bendle_no_group' })).toBe('config')
    expect(saveErrorKind(new Error('timeout'))).toBe('network')
  })
  it('host Unlock reopens the board even while the old row still reads back', async () => {
    db.rows = [{ slide_id: 's1', answer: { title: 'Africa', artist: 'Toto', source: 'catalog', qid: null } }]
    const onAnswered = await render(step(2, { bendleLocked: true }))
    expect(host.textContent).toContain('Locked in at step 1')
    await rerender(step(2, { bendleLocked: false })) // RPC delete not committed yet: row still there
    await tick()
    expect(host.textContent).not.toContain('Locked in')
    expect(host.querySelector('input[aria-label="Search for the song"]')).not.toBeNull()
    expect(onAnswered).toHaveBeenLastCalledWith(false)
  })
  it('a stale read that lands after Unlock does not restore "Locked in"', async () => {
    db.rows = [{ slide_id: 's1', answer: { title: 'Africa', artist: 'Toto', source: 'catalog', qid: null } }]
    let release
    db.readGate = new Promise(r => { release = r })
    const onAnswered = await render(step(2, { bendleLocked: true })) // mount read in flight
    await rerender(step(2, { bendleLocked: false }))
    db.readGate = null
    await act(async () => { release(); await Promise.resolve() })
    await tick()
    expect(host.textContent).not.toContain('Locked in')
    expect(host.querySelector('input[aria-label="Search for the song"]')).not.toBeNull()
    expect(onAnswered).toHaveBeenLastCalledWith(false)
  })
  it('a duplicate whose read-back finds nothing tells the team to reload', async () => {
    await render(step(0))
    db.insertError = { message: 'bendle_already_guessed', code: '23505' }
    await type('Search for the song', 'Africa')
    await act(async () => button('Use what I typed').click())
    await act(async () => button('Lock In').click())
    await tick()
    expect(host.querySelector('[role="alert"]').textContent).toContain('Already locked in. Reload to see your guess.')
  })
  it('no song list built yet: no load error, typed path works', async () => {
    await render(step(0), { catalogUrl: null })
    expect(host.textContent).not.toContain('Song list did not load')
    expect(globalThis.fetch).not.toHaveBeenCalled()
    await type('Search for the song', 'Africa')
    await act(async () => button('Use what I typed').click())
    await act(async () => button('Lock In').click())
    expect(db.inserts[0].answer.source).toBe('typed')
  })
  it('a double tap on Lock In writes once', async () => {
    await render(step(0))
    await type('Search for the song', 'Africa')
    await act(async () => button('Use what I typed').click())
    await act(async () => { const b = button('Lock In'); b.click(); b.click() })
    expect(db.inserts).toHaveLength(1)
  })
  it('a Bendle with no group id tells the host, not the team connection', async () => {
    await render(step(0))
    db.insertError = { message: 'bendle_no_group' }
    await type('Search for the song', 'Africa')
    await act(async () => button('Use what I typed').click())
    await act(async () => button('Lock In').click())
    expect(host.querySelector('[role="alert"]').textContent).toContain('Ask the host')
  })
})
