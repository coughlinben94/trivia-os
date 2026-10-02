// @vitest-environment jsdom
// client/src/components/host/BendleHostPanel.test.jsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

const responses = {
  phone_answers: { data: [{ team_id: 'p1' }, { team_id: 'p2' }, { team_id: 'p1' }], error: null },
  teams: { data: [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }], error: null },
}
const calls = []
const q = table => {
  const b = {
    select: () => b,
    in: (...a) => { calls.push([table, 'in', ...a]); return b },
    eq: (...a) => { calls.push([table, 'eq', ...a]); return b },
    then: (res, rej) => Promise.resolve(responses[table]).then(res, rej),
  }
  return b
}
vi.mock('../../lib/supabase.js', () => ({ supabase: { from: t => q(t) } }))
const { default: BendleHostPanel } = await import('./BendleHostPanel.jsx')

globalThis.IS_REACT_ACT_ENVIRONMENT = true
let root, host
afterEach(() => { act(() => root?.unmount()); host?.remove() })
const step = i => ({ id: `s${i + 1}`, data: { bendleStepIndex: i } })
const results = [
  { teamId: 'p1', teamName: 'Alpha', guess: { title: 'Africa', artist: 'Toto' }, stepIndex: 0, correct: true, autoPoints: 30, points: 30, overridden: false },
  { teamId: 'p2', teamName: 'Bravo', guess: null, stepIndex: null, correct: false, autoPoints: 0, points: 0, overridden: false },
]
async function render(props) {
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  const all = { stepIds: ['s1', 's2', 's3'], showId: 'show1', busy: false, error: null, onLock: vi.fn(), onReveal: vi.fn(), onUnlock: vi.fn(), onOverride: vi.fn(), lockData: {}, ...props }
  await act(async () => root.render(<BendleHostPanel {...all} />))
  await act(async () => { await new Promise(r => setTimeout(r, 0)) })
  return all
}
const button = label => [...host.querySelectorAll('button')].find(b => b.textContent.includes(label))

describe('<BendleHostPanel>', () => {
  it('steps 1-2 show the count and no lock button', async () => {
    await render({ slide: step(0) })
    expect(host.textContent).toContain('2 of 3 teams locked a guess')
    expect(host.textContent).toContain('step 1 of 3')
    expect(button('Lock Guesses')).toBeUndefined()
    expect(button('Unlock')).toBeUndefined()
  })
  it('step 3: Lock, then Reveal, wired to the handlers', async () => {
    const p = await render({ slide: step(2) })
    await act(async () => button('Lock Guesses').click())
    expect(p.onLock).toHaveBeenCalledTimes(1)
    act(() => root.unmount())
    const p2 = await render({ slide: step(2), lockData: { bendleLocked: true } })
    await act(async () => button('Reveal & Score').click())
    expect(p2.onReveal).toHaveBeenCalledTimes(1)
  })
  it('Unlock needs two taps', async () => {
    const p = await render({ slide: step(2), lockData: { bendleLocked: true } })
    await act(async () => button('Unlock').click())
    expect(p.onUnlock).not.toHaveBeenCalled()
    await act(async () => { await new Promise(r => setTimeout(r, 450)) })
    await act(async () => button('Tap again').click())
    expect(p.onUnlock).toHaveBeenCalledTimes(1)
  })
  it('after reveal: per-team table with a 0/10/20/30 dropdown, no count, no main button', async () => {
    const p = await render({ slide: step(2), lockData: { bendleLocked: true, bendleRevealed: true, bendleResults: results } })
    expect(host.textContent).not.toContain('teams locked a guess')
    expect(button('Reveal & Score')).toBeUndefined()
    expect(host.textContent).toContain('Alpha: Africa — Toto · step 1')
    expect(host.textContent).toContain('Bravo: No guess')
    const select = host.querySelector('select[aria-label="Set Bravo points"]')
    expect([...select.options].map(o => o.value)).toEqual(['0', '10', '20', '30'])
    await act(async () => { select.value = '20'; select.dispatchEvent(new Event('change', { bubbles: true })) })
    expect(p.onOverride).toHaveBeenCalledWith('p2', 20)
  })
  it('counts only this show\'s rows (a copied show keeps the slide ids)', async () => {
    calls.length = 0
    await render({ slide: step(0) })
    expect(calls).toContainEqual(['phone_answers', 'eq', 'show_id', 'show1'])
    expect(calls).toContainEqual(['phone_answers', 'in', 'slide_id', ['s1', 's2', 's3']])
  })
  it('status is readable gray and says Quick Entry is not needed', async () => {
    await render({ slide: step(0) })
    expect(host.querySelector('.text-gray-400')).toBeNull()
    expect(host.textContent).toContain('Points go in automatically; don’t use Quick Entry for this round.')
  })
  it('after reveal: the answer line, wrapped guesses and a (changed) tag on overrides', async () => {
    const changed = [{ ...results[0], points: 10, overridden: true }, results[1]]
    await render({ slide: step(2), lockData: { answer: 'Stale Song', bendleAnswer: 'Africa — Toto', bendleLocked: true, bendleRevealed: true, bendleResults: changed } })
    expect(host.textContent).toContain('Answer: Africa — Toto')
    expect(host.textContent).not.toContain('Stale Song')
    expect(host.querySelector('.truncate')).toBeNull()
    expect(host.querySelector('.max-h-72')).toBeNull()
    const rows = [...host.querySelectorAll('[data-bendle-result]')]
    expect(rows[0].textContent).toContain('(changed)')
    expect(rows[1].textContent).not.toContain('(changed)')
  })
  it('no graded label: no Answer line, never the stale slide answer', async () => {
    await render({ slide: step(2), lockData: { answer: 'Stale Song', bendleLocked: true, bendleRevealed: true, bendleResults: results } })
    expect(host.textContent).not.toContain('Answer:')
    expect(host.textContent).not.toContain('Stale Song')
  })
  it('Unlock explains what it does and turns red once armed', async () => {
    await render({ slide: step(2), lockData: { bendleLocked: true } })
    expect(host.textContent).toContain('Clears every team’s guess; new guesses score 10. Use the points menu after the reveal to restore a team.')
    expect(button('Unlock').className).not.toContain('text-red-700')
    await act(async () => button('Unlock').click())
    expect(button('Tap again').className).toContain('text-red-700')
    expect(button('Tap again').className).toContain('bg-red-50')
  })
  it('a revealed slide with an error offers Retry Scoring', async () => {
    await render({ slide: step(2), error: 'Could not finish', lockData: { bendleLocked: true, bendleRevealed: true, bendleResults: results } })
    expect(button('Retry Scoring')).toBeTruthy()
    expect(host.textContent).toContain('Could not finish')
  })
})

describe('<BendleHostPanel> unlock guard', () => {
  const base = { stepIds: ['s1', 's2', 's3'], showId: 'show1', busy: false, error: null, slide: step(2), lockData: { bendleLocked: true } }
  let p
  const draw = extra => { p = { ...base, onLock: vi.fn(), onReveal: vi.fn(), onUnlock: vi.fn(), onOverride: vi.fn(), ...p, ...extra }; return act(async () => root.render(<BendleHostPanel {...p} />)) }
  const tap = label => act(async () => button(label).click())
  const wait = ms => act(async () => { await vi.advanceTimersByTimeAsync(ms) })
  async function mount() {
    vi.useFakeTimers()
    p = undefined
    host = document.createElement('div'); document.body.append(host); root = createRoot(host)
    await draw()
  }
  afterEach(() => { vi.useRealTimers() })

  it('first tap arms and shows the confirm text', async () => {
    await mount()
    await tap('Unlock')
    expect(host.textContent).toContain('Tap again')
    expect(p.onUnlock).not.toHaveBeenCalled()
  })
  it('a double-click does not unlock', async () => {
    await mount()
    await tap('Unlock')
    await wait(100)
    await tap('Tap again')
    expect(p.onUnlock).not.toHaveBeenCalled()
  })
  it('a deliberate second tap after the window unlocks once', async () => {
    await mount()
    await tap('Unlock')
    await wait(600)
    await tap('Tap again')
    expect(p.onUnlock).toHaveBeenCalledTimes(1)
  })
  it('the armed state expires after the timeout', async () => {
    await mount()
    await tap('Unlock')
    await wait(4100)
    expect(host.textContent).not.toContain('Tap again')
    await tap('Unlock')
    expect(p.onUnlock).not.toHaveBeenCalled()
  })
  it('unlock then re-lock while armed needs a fresh arm', async () => {
    await mount()
    await tap('Unlock')
    await wait(600)
    await draw({ lockData: {} })
    await draw({ lockData: { bendleLocked: true } })
    await tap('Unlock')
    expect(p.onUnlock).not.toHaveBeenCalled()
    expect(host.textContent).toContain('Tap again')
  })
  it('busy while armed disarms', async () => {
    await mount()
    await tap('Unlock')
    await wait(600)
    await draw({ busy: true })
    await draw({ busy: false })
    await tap('Unlock')
    expect(p.onUnlock).not.toHaveBeenCalled()
  })
})
