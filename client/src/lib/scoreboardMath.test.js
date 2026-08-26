import { describe, it, expect } from 'vitest'
import { normalizeRoundScore, computeTotal, roundScoreTotal, mergeScoreEdit, roundLabel, deriveRoundCols, pickableTeams } from './scoreboardMath.js'

describe('pickableTeams', () => {
  // Bug this guards against: `+ Team` inserts a row with name: '' as a
  // placeholder until the host types a name in. The PYL Picker animations
  // (BoxingRing/ChestDuel/CardPick/BattleshipDuel) pick a random
  // winner from whatever list they're handed and render its name with no
  // fallback — so an un-named row present when the host opens a picker could
  // get picked and "win" with a blank name on the TV.

  it('excludes a team with an empty name', () => {
    const teams = [{ id: 't1', name: 'The Sharks' }, { id: 't2', name: '' }]
    expect(pickableTeams(teams).map(t => t.id)).toEqual(['t1'])
  })

  it('excludes a whitespace-only name', () => {
    const teams = [{ id: 't1', name: 'The Sharks' }, { id: 't2', name: '   ' }]
    expect(pickableTeams(teams).map(t => t.id)).toEqual(['t1'])
  })

  it('keeps every team when all are named', () => {
    const teams = [{ id: 't1', name: 'The Sharks' }, { id: 't2', name: 'Quiz Pistols' }]
    expect(pickableTeams(teams).map(t => t.id)).toEqual(['t1', 't2'])
  })
})

describe('roundLabel', () => {
  // Bug this guards against: display surfaces (QuestionCounter, RoundSidebar)
  // used to derive a round's badge from its live array POSITION instead of
  // calling this shared function — so a Swing/PYL round always showed a
  // bogus "R{position}" badge, and dragging a round to a new spot silently
  // relabeled it, disagreeing with what the scoreboard/Quick Entry already
  // called it via deriveRoundCols.

  it('labels a swing round "SW" regardless of its array position', () => {
    const swing = { id: 'r2', roundType: 'swing', number: null }
    expect(roundLabel(swing, [])).toBe('SW')
  })

  it('labels a PYL round "PYL" regardless of its array position', () => {
    const pyl = { id: 'r3', roundType: 'pyl', number: null }
    expect(roundLabel(pyl, [])).toBe('PYL')
  })

  it('labels a normal round "R{number}" using the stored number, not position', () => {
    const round = { id: 'r1', roundType: 'normal', number: 1 }
    expect(roundLabel(round, [])).toBe('R1')
  })

  it('falls back to slide-type sniffing for legacy rounds with no roundType', () => {
    const legacySwing = { id: 'r2', number: null }
    const slides = [{ roundId: 'r2', type: 'swing-round-intro' }]
    expect(roundLabel(legacySwing, slides)).toBe('SW')
  })

  it('a round keeps its own label after being dragged to a new array position (identity is round.number, not array index)', () => {
    const r1 = { id: 'r1', roundType: 'normal', number: 1 }
    const swing = { id: 'r2', roundType: 'swing', number: null }
    const beforeDrag = { rounds: [r1, swing], slides: [] } // r1 at index 0
    const afterDrag = { rounds: [swing, r1], slides: [] }  // r1 dragged to index 1
    const labelFor = (show, id) => deriveRoundCols(show).find(c => c.key === `r_${id}`).label
    expect(labelFor(beforeDrag, 'r1')).toBe('R1')
    expect(labelFor(afterDrag, 'r1')).toBe('R1') // still R1 even though its array index changed
    expect(labelFor(beforeDrag, 'r2')).toBe('SW')
    expect(labelFor(afterDrag, 'r2')).toBe('SW') // still SW, never "R1" from sitting at index 0
  })
})

describe('normalizeRoundScore', () => {
  it('treats a legacy plain number as written-only', () => {
    expect(normalizeRoundScore(12)).toEqual({ written: 12, phone: 0, phoneBySlide: {} })
  })
  it('treats null/undefined as zero/zero', () => {
    expect(normalizeRoundScore(null)).toEqual({ written: 0, phone: 0, phoneBySlide: {} })
    expect(normalizeRoundScore(undefined)).toEqual({ written: 0, phone: 0, phoneBySlide: {} })
  })
  it('passes through an already-split value, defaulting missing halves to 0', () => {
    expect(normalizeRoundScore({ written: 8, phone: 6 })).toEqual({ written: 8, phone: 6, phoneBySlide: { __legacy: 6 } })
    expect(normalizeRoundScore({ written: 8 })).toEqual({ written: 8, phone: 0, phoneBySlide: {} })
    expect(normalizeRoundScore({ phone: 6 })).toEqual({ written: 0, phone: 6, phoneBySlide: { __legacy: 6 } })
  })
  it('treats a non-numeric legacy value as zero', () => {
    expect(normalizeRoundScore('')).toEqual({ written: 0, phone: 0, phoneBySlide: {} })
  })
  it('sums a per-slide phone bucket rather than treating it as legacy', () => {
    expect(normalizeRoundScore({ written: 5, phone: { slide_a: 8, slide_b: 20 } }))
      .toEqual({ written: 5, phone: 28, phoneBySlide: { slide_a: 8, slide_b: 20 } })
  })
})

describe('computeTotal', () => {
  const cols = [{ key: 'r_1', label: 'R1' }, { key: 'r_2', label: 'R2' }, { key: 'bonus', label: '?' }]

  it('sums legacy plain-number rounds same as before', () => {
    expect(computeTotal({ r_1: 10, r_2: 5, bonus: 2 }, cols)).toBe(17)
  })
  it('sums written+phone for split rounds', () => {
    expect(computeTotal({ r_1: { written: 10, phone: 0 }, r_2: { written: 8, phone: 6 }, bonus: 2 }, cols)).toBe(26)
  })
  it('sums a mixed show — some rounds legacy, some split', () => {
    expect(computeTotal({ r_1: 10, r_2: { written: 8, phone: 6 }, bonus: null }, cols)).toBe(24)
  })
  it('ignores keys not present in cols', () => {
    expect(computeTotal({ r_1: 10, r_99: 1000 }, [{ key: 'r_1', label: 'R1' }])).toBe(10)
  })
  it('returns 0 for missing/invalid scores object', () => {
    expect(computeTotal(null, cols)).toBe(0)
    expect(computeTotal(undefined, cols)).toBe(0)
  })
})

describe('roundScoreTotal', () => {
  it('returns a legacy plain number unchanged', () => {
    expect(roundScoreTotal(10)).toBe(10)
  })
  it('sums written+phone for a split round instead of NaN', () => {
    expect(roundScoreTotal({ written: 8, phone: 6 })).toBe(14)
  })
  it('returns 0 for null/undefined', () => {
    expect(roundScoreTotal(null)).toBe(0)
    expect(roundScoreTotal(undefined)).toBe(0)
  })
})

describe('mergeScoreEdit', () => {
  // Bug this guards against: ScoreboardModal's debounced save used to upsert
  // the client's whole (possibly stale) local scores object, clobbering a
  // concurrent write to a DIFFERENT round key made elsewhere (e.g. LiveMode's
  // phone-answer fold-in writing r_2 while the host edits r_1 in this modal).

  it('takes the edited key from local, everything else from the fresh DB row', () => {
    const fresh = { r_1: { written: 5, phone: 0 }, r_2: { written: 3, phone: 6 } } // r_2.phone landed after this client's snapshot
    const local = { r_1: { written: 9, phone: 0 }, r_2: { written: 3, phone: 0 } } // stale on r_2.phone
    expect(mergeScoreEdit(fresh, local, 'r_1')).toEqual({
      r_1: { written: 9, phone: 0 }, // the edit
      r_2: { written: 3, phone: 6 }, // preserved from fresh, not clobbered by stale local
    })
  })

  it('falls back to local scores whole when the fresh fetch failed, rather than dropping other keys', () => {
    const local = { r_1: { written: 9, phone: 0 }, r_2: { written: 3, phone: 6 } }
    expect(mergeScoreEdit(null, local, 'r_1')).toBe(local)
    expect(mergeScoreEdit(undefined, local, 'r_1')).toBe(local)
  })

  it('edited key wins even if fresh also has a value for it', () => {
    const fresh = { r_1: { written: 1, phone: 0 } }
    const local = { r_1: { written: 9, phone: 0 } }
    expect(mergeScoreEdit(fresh, local, 'r_1')).toEqual({ r_1: { written: 9, phone: 0 } })
  })
})
