// @vitest-environment jsdom
// client/src/components/join/BendleBoard.test.jsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

const db = { rows: [], insertError: null, inserts: [], readGate: null, extras: [], extrasError: null }
vi.mock('../../lib/supabase.js', () => ({ supabase: {
  rpc: async fn => { db.extrasCalls += fn === 'list_bendle_song_extras' ? 1 : 0; return db.extrasError ? { data: null, error: db.extrasError } : { data: db.extras, error: null } },
  from: () => ({
  select: () => ({ eq: () => ({ in: (_c, ids) => {
    const res = { data: db.rows.filter(r => ids.includes(r.slide_id)), error: null } // snapshot at call time
    return db.readGate ? db.readGate.then(() => res) : Promise.resolve(res)
  } }) }),
  insert: async payload => { db.inserts.push(payload); if (db.insertError) return { error: db.insertError }; db.rows.push({ slide_id: payload.slide_id, answer: payload.answer }); return { error: null } },
}) } }))
const { default: BendleBoard, saveErrorKind } = await import('./BendleBoard.jsx')
const { clearExtrasCache } = await import('../../lib/bendleSongExtras.js')

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const ROWS = [['Mr. Brightside', 'The Killers', 60], ['Africa', 'Toto', 50], ['Africa', 'Weezer', 8]]
let urlN = 0
const theme = { colors: { text: '#fff', highlight: '#f5c842' }, fonts: { body: 'DM Sans' } }
const step = (i, extra = {}) => ({ id: `s${i + 1}`, showId: 'show1', type: 'question',
  data: { isShiny: true, shinyInputSchema: { type: 'bendle' }, shinyGroupId: 'g1', bendleStepIndex: i, text: 'Name that song', ...extra } })
const team = { id: 'p1', showId: 'show1' }
let root, host, lastProps
beforeEach(() => {
  db.rows = []; db.insertError = null; db.inserts = []; db.readGate = null; db.extras = []; db.extrasError = null; db.extrasCalls = 0
  clearExtrasCache()
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
    expect(host.textContent).toContain('Your guess: Mr. Brightside — The Killers')
    await act(async () => button('Lock In').click())
    expect(db.inserts[0]).toEqual({ show_id: 'show1', slide_id: 's1', team_id: 'p1', answer: { title: 'Mr. Brightside', artist: 'The Killers', source: 'catalog', qid: null } })
    expect(host.textContent).toContain('Locked in at step 1')
    expect(host.textContent).not.toMatch(/[✓✗]/)
    expect(host.querySelector('[role="status"] svg[data-mark="right"]')).not.toBeNull()
    expect(onAnswered).toHaveBeenLastCalledWith(true)
    expect(host.textContent).not.toMatch(/correct|wrong/i)
  })
  it('a song the host added (extras) is searchable on the phone', async () => {
    db.extras = [{ title: 'Uptown Funk', artist: 'Mark Ronson', norm_key: 'uptown funk|mark ronson' }]
    await render(step(0))
    await type('Search for the song', 'uptown')
    await act(async () => button('Uptown Funk').click())
    expect(host.textContent).toContain('Your guess: Uptown Funk — Mark Ronson')
  })
  it('an extras load failure leaves catalog search working', async () => {
    db.extrasError = { message: 'boom' }
    await render(step(0))
    await type('Search for the song', 'mr bright')
    expect(button('Mr. Brightside')).toBeTruthy()
    expect(host.textContent).not.toContain('Song list did not load')
  })
  it('extras load once per page; after a failure the next mount tries again', async () => {
    db.extrasError = { message: 'boom' }
    await render(step(0))
    act(() => root.unmount()); host.remove()
    db.extrasError = null
    db.extras = [{ title: 'Uptown Funk', artist: 'Mark Ronson', norm_key: 'uptown funk|mark ronson' }]
    await render(step(1))
    await type('Search for the song', 'uptown')
    expect(button('Uptown Funk')).toBeTruthy()
    act(() => root.unmount()); host.remove()
    await render(step(2))
    expect(db.extrasCalls).toBe(2)
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
    expect(host.textContent).toContain('Africa — Toto')
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
  it('picking a song scrolls Lock In into view (it sits below the fold on a phone)', async () => {
    const spy = vi.fn()
    Element.prototype.scrollIntoView = spy
    try {
      await render(step(0))
      await type('Search for the song', 'africa')
      await act(async () => button('Toto').click())
      expect(host.textContent).not.toMatch(/[✓✗]/)
      expect(button('Toto').querySelector('svg[data-mark="right"]')).not.toBeNull()
      expect(spy).toHaveBeenCalledWith({ block: 'nearest' })
      expect(spy.mock.contexts.at(-1)).toBe(button('Lock In'))
      // Leaves room above the phone's home bar instead of sitting flush.
      expect(button('Lock In').style.scrollMarginBottom).toBe('1rem')
      spy.mockClear()
      await act(async () => button('Use what I typed').click())
      expect(host.textContent).not.toMatch(/[✓✗]/)
      expect(button('Use what I typed').querySelector('svg[data-mark="right"]')).not.toBeNull()
      expect(spy).toHaveBeenCalledWith({ block: 'nearest' })
    } finally { delete Element.prototype.scrollIntoView }
  })
  it('countdown with no pick yet asks for a pick, in the same status line', async () => {
    // Own group id: drafts survive remounts (module Map), so g1 may hold an earlier test's pick.
    await render(step(2, { shinyGroupId: 'g-countdown', lockCountdownStartedAt: Date.now() }))
    const statuses = () => [...host.querySelectorAll('[role="status"]')]
    expect(statuses()).toHaveLength(1)
    expect(statuses()[0].textContent).toBe('Pick a song — guesses lock soon')
    await type('Search for the song', 'Africa')
    await act(async () => button('Use what I typed').click())
    expect(statuses()).toHaveLength(1)
    expect(statuses()[0].textContent).toContain('Lock in now')
  })
  it('the artist box has a visible label', async () => {
    await render(step(0))
    await type('Search for the song', 'Uptown Funk')
    await act(async () => button('Use what I typed').click())
    const label = [...host.querySelectorAll('label')].find(l => l.textContent.includes('Artist (optional)'))
    expect(label).toBeTruthy()
    expect(label.querySelector('input')).toBe(host.querySelector('input[aria-label="Artist (optional)"]'))
  })
  it('typed-only (no song list built): asks for the title and points the artist to the next box', async () => {
    await render(step(0), { catalogUrl: null })
    expect(host.querySelector('input[aria-label="Search for the song"]').placeholder).toBe('Song title')
    expect(host.textContent).toContain('The artist goes in the next box.')
    act(() => root.unmount())
    await render(step(0))
    expect(host.querySelector('input[aria-label="Search for the song"]').placeholder).toBe('Song title or artist')
    expect(host.textContent).not.toContain('The artist goes in the next box.')
  })
  it('reveal shows the answer and a right/wrong mark before the points', async () => {
    const res = (points, guess = { title: 'Africa', artist: 'Toto' }) => ({ teamId: 'p1', teamName: 'Alpha', guess, stepIndex: guess ? 0 : null, correct: points > 0, autoPoints: points, points, overridden: false })
    await render(step(2, { answer: 'Stale Song', bendleAnswer: 'Africa — Toto', bendleLocked: true, bendleRevealed: true, bendleResults: [res(30)] }))
    expect(host.textContent).toContain('Answer: Africa — Toto')
    expect(host.textContent).not.toContain('Stale Song')
    expect(host.querySelector('[role="status"] svg[data-mark="right"]')).not.toBeNull()
    act(() => root.unmount())
    await render(step(2, { answer: 'Stale Song', bendleLocked: true, bendleRevealed: true, bendleResults: [res(0, { title: 'Rosanna', artist: 'Toto' })] }))
    expect(host.textContent).not.toContain('Answer:')
    expect(host.textContent).not.toContain('Stale Song')
    expect(host.querySelector('[role="status"] svg[data-mark="wrong"]')).not.toBeNull()
    expect(host.textContent).toContain('0 points')
  })
  it('the answer never shows before the reveal', async () => {
    await render(step(2, { answer: 'Africa – Toto', bendleAnswer: 'Africa — Toto', bendleLocked: true }))
    expect(host.textContent).not.toContain('Africa')
  })
  it('after "Guesses are locked" Lock In stays disabled; "step moved on" can retry', async () => {
    await render(step(2))
    db.insertError = { message: 'bendle_locked' }
    await type('Search for the song', 'Africa')
    await act(async () => button('Use what I typed').click())
    await act(async () => button('Lock In').click())
    expect(host.querySelector('[role="alert"]').textContent).toContain('Guesses are locked')
    expect(button('Lock In').disabled).toBe(true)
    await act(async () => button('Lock In').click())
    expect(db.inserts).toHaveLength(1)
    // Host Unlock (lock on then off) reopens it.
    await rerender(step(2, { bendleLocked: true }))
    await rerender(step(2, { bendleLocked: false }))
    db.insertError = null
    await type('Search for the song', 'Africa')
    await act(async () => button('Use what I typed').click())
    expect(button('Lock In').disabled).toBe(false)
  })
  it('a save in flight disables Lock In', async () => {
    await render(step(0))
    let release
    const gate = new Promise(r => { release = r })
    const { supabase } = await import('../../lib/supabase.js')
    const from = supabase.from
    supabase.from = () => ({ ...from(), insert: async () => { await gate; return { error: { message: 'bendle_not_live' } } } })
    try {
      await type('Search for the song', 'Africa')
      await act(async () => button('Use what I typed').click())
      await act(async () => button('Lock In').click())
      expect(button('Saving').disabled).toBe(true)
      await act(async () => { release(); await gate })
      await tick()
      expect(button('Lock In').disabled).toBe(false)
    } finally { supabase.from = from }
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
