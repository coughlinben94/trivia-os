import { describe, it, expect, vi } from 'vitest'
import { buildSnapshot, buildCard, hostReply, makeSnapshotSender, hostChipText } from './remoteSnapshot.js'

const slides = [
  { id: 'a', type: 'round-intro', data: { roundTitle: 'Movies' } },
  { id: 'b', type: 'question', data: { questionNumber: 1 } },
  { id: 'c', type: 'question', data: { questionLabel: 'Q2' } },
  { id: 'd', type: 'grading-break', data: {} },
]

describe('buildSnapshot', () => {
  it('slide, cue/gate from one object, 2-slide Up Next, toggles, busy, paused', () => {
    const snap = buildSnapshot({ slides, index: 0, showState: { answerReveal: true }, cue: { label: 'Show question 1', gate: 'advance' }, busy: false, paused: true })
    expect(snap).toEqual({
      type: 'state',
      slide: { index: 0, total: 4, id: 'a', label: 'Movies', type: 'round-intro' },
      card: null,
      cue: 'Show question 1', gate: 'advance',
      upNext: [{ label: 'Q1', type: 'question' }, { label: 'Q2', type: 'question' }],
      toggles: { answerReveal: true, scoreboardVisible: false, scoresRevealed: false },
      busy: false, paused: true, jumpBusy: false, fix: null,
      slides: [
        { index: 0, id: 'a', label: 'Movies', type: 'round-intro', round: null, roundTitle: null },
        { index: 1, id: 'b', label: 'Q1', type: 'question', round: null, roundTitle: null },
        { index: 2, id: 'c', label: 'Q2', type: 'question', round: null, roundTitle: null },
        { index: 3, id: 'd', label: 'Grading Break', type: 'grading-break', round: null, roundTitle: null },
      ],
    })
  })
  it('the jump list names each slide with slidePickerLabel and its round number and title', () => {
    const rounds = [{ id: 'r1', number: 1, title: 'Movies' }, { id: 'r2', title: 'Music' }]
    const inRounds = [
      { id: 'x', type: 'title', data: { title: 'Welcome' } },
      { id: 'y', type: 'question', roundId: 'r1', data: { questionNumber: 4 } },
      { id: 'z', type: 'question', roundId: 'r2', data: { isShiny: true, seriesTheme: 'Name that tune' } },
    ]
    expect(buildSnapshot({ slides: inRounds, rounds, index: 0, showState: {}, cue: { label: null, gate: null } }).slides).toEqual([
      { index: 0, id: 'x', label: 'Welcome', type: 'title', round: null, roundTitle: null },
      { index: 1, id: 'y', label: 'Q4', type: 'question', round: 'Round 1', roundTitle: 'Movies' },
      // No stored number: falls back to its place in the rounds list.
      { index: 2, id: 'z', label: 'Name that tune', type: 'question', round: 'Round 2', roundTitle: 'Music' },
    ])
  })
  it('carries jumpBusy and the fix state for the current slide as given', () => {
    const fix = { mechanic: 'matching', canUnlock: true, unlockRefusal: null, canRescore: false, rescoreRefusal: 'already-revealed', rescoreLabel: 'Rescore' }
    const snap = buildSnapshot({ slides, index: 1, showState: {}, cue: { label: null, gate: null }, jumpBusy: true, fix })
    expect(snap.jumpBusy).toBe(true)
    expect(snap.fix).toEqual(fix)
  })
  it('Up Next shrinks at the end; slide is null past the end', () => {
    expect(buildSnapshot({ slides, index: 3, showState: {}, cue: { label: null, gate: null } }).upNext).toEqual([])
    expect(buildSnapshot({ slides: [], index: 0, showState: {}, cue: { label: null, gate: null } }).slide).toBe(null)
  })
})

describe('buildCard', () => {
  const q = data => ({ id: 'q', type: 'question', data })
  it('reads text and answer for a plain question', () => {
    expect(buildCard(q({ questionNumber: 4, text: 'Which band?', answer: 'Queen' })))
      .toEqual({ label: 'Q4', text: 'Which band?', answer: 'Queen', subtitle: null, part: null, isShiny: false })
  })
  it('uses the custom question label when there is one', () => {
    expect(buildCard(q({ questionNumber: 4, questionLabel: 'Bonus', text: 't' })).label).toBe('Bonus')
  })
  it('follows the current part of a series, with part x of n', () => {
    const card = buildCard(q({
      questionNumber: 2, isShiny: true, currentPart: 1,
      parts: [{ text: 'first', answer: 'A' }, { text: 'second', answer: 'B', label: 'Part two' }, { text: 'third' }],
    }))
    expect(card).toMatchObject({ text: 'second', answer: 'B', subtitle: 'Part two', part: { i: 1, n: 3 }, isShiny: true })
  })
  it('clamps a stale currentPart into range', () => {
    expect(buildCard(q({ currentPart: 9, parts: [{ text: 'a' }, { text: 'b' }] })).part).toEqual({ i: 1, n: 2 })
  })
  it('has no answer when the slide has none (never invents one)', () => {
    expect(buildCard(q({ text: 't' })).answer).toBeNull()
  })
  it('is null for non-question slides and missing data', () => {
    expect(buildCard({ type: 'round-intro', data: {} })).toBeNull()
    expect(buildCard({ type: 'question' })).toBeNull()
    expect(buildCard(null)).toBeNull()
  })
})

describe('hostReply', () => {
  it('answers relay-beat with laptop time and visibility', () => {
    expect(hostReply({ type: 'relay-beat' }, { run: vi.fn(), now: 42, visibility: 'hidden' }))
      .toEqual({ type: 'beat', laptopNow: 42, visibility: 'hidden' })
  })
  it('runs a cmd as via:remote and reports received or refused', () => {
    const run = vi.fn(() => ({ ok: true }))
    const msg = { type: 'cmd', id: '7', cmd: 'next', args: { expectGate: 'advance' }, expectSlideId: 's', sentAt: 1 }
    expect(hostReply(msg, { run, now: 2, visibility: 'visible' })).toEqual({ type: 'result', id: '7', received: true })
    expect(run).toHaveBeenCalledWith({ cmd: 'next', via: 'remote', args: { expectGate: 'advance' }, expectSlideId: 's', sentAt: 1 })
    expect(hostReply(msg, { run: () => ({ refuse: 'busy' }) })).toEqual({ type: 'result', id: '7', refused: 'busy' })
  })
  it('a throwing command is refused, never crashes the socket handler', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(hostReply({ type: 'cmd', id: '1', cmd: 'next' }, { run: () => { throw new Error('x') } }))
      .toEqual({ type: 'result', id: '1', refused: 'error' })
    spy.mockRestore()
  })
  it('ignores anything else', () => expect(hostReply({ type: 'weird' }, { run: vi.fn() })).toBe(null))
})

describe('makeSnapshotSender', () => {
  it('sends only when changed, at most once per gap, latest body wins', () => {
    vi.useFakeTimers()
    const sent = []
    const s = makeSnapshotSender(b => sent.push(b), { gapMs: 150, now: () => Date.now(), later: setTimeout })
    s.offer('A'); s.offer('A')
    expect(sent).toEqual(['A'])
    s.offer('B'); s.offer('C')
    expect(sent).toEqual(['A'])
    vi.advanceTimersByTime(150)
    expect(sent).toEqual(['A', 'C'])
    vi.useRealTimers()
  })
  it('a transmit that returns false (socket not open yet) is not counted as sent', () => {
    const sent = []
    let open = false
    const s = makeSnapshotSender(b => (open ? sent.push(b) : false), { gapMs: 150, now: () => 0 })
    s.offer('A')
    open = true
    s.offer('A')
    expect(sent).toEqual(['A'])
  })
  it('reset() makes the same body go out again (socket re-open, relay restart)', () => {
    const sent = []
    const s = makeSnapshotSender(b => sent.push(b), { gapMs: 0 })
    s.offer('A'); s.offer('A'); s.reset(); s.offer('A')
    expect(sent).toEqual(['A', 'A'])
  })
})

describe('hostChipText', () => {
  it('plain-English states', () => {
    expect(hostChipText({ enabled: false })).toBe('iPad remote: off')
    expect(hostChipText({ enabled: true, status: 'connecting' })).toBe('iPad remote: connecting…')
    expect(hostChipText({ enabled: true, status: 'down' })).toMatch(/relay not running, or Chrome blocked local network access/)
    expect(hostChipText({ enabled: true, status: 'replaced' })).toBe('Another /host tab took over the iPad remote')
    expect(hostChipText({ enabled: true, status: 'open', remotes: 0 })).toBe('iPad remote: no iPad')
    expect(hostChipText({ enabled: true, status: 'open', remotes: 1 })).toBe('iPad remote: connected')
    expect(hostChipText({ enabled: true, status: 'open', remotes: 1, paused: true })).toBe('iPad remote: paused')
  })
})
