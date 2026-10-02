// client/src/lib/bendleGuessScoring.test.js
import { describe, it, expect } from 'vitest'
import {
  normalizeText, osaDistance, titleMatches, splitArtists, gradeGuess, stepPoints,
  BENDLE_OVERRIDE_POINTS, parseGuess, guessLabel, gradeBendleGroup, applyBendleOverrides,
  computeBendleScoreUpdates, bendleGroupSlides, bendleStepIds, bendleLockSlide, bendleConfigError,
} from './bendleGuessScoring.js'

describe('normalizeText', () => {
  it.each([
    ["Don't Stop Believin'", 'dont stop believin'],
    ['Mr. Brightside', 'mr brightside'],
    ['Beyoncé', 'beyonce'],
    ['Simon & Garfunkel', 'simon and garfunkel'],
    ['Hey Jude (Remastered 2015)', 'hey jude'],
    ['[Live] Africa', 'africa'],
    ['Bohemian Rhapsody - Remastered 2011', 'bohemian rhapsody'],
    ['Lose Yourself – From 8 Mile', 'lose yourself'],
    ['Up-Town', 'uptown'],
    ['Old Town Road (feat. Billy Ray Cyrus)', 'old town road'],
    ['Despacito feat. Justin Bieber', 'despacito'],
    ['Calvin Harris ft. Rihanna', 'calvin harris'],
    ['Featuring Nobody Featuring X', ''],
    ['The Final Countdown', 'final countdown'],
    ['(Live) The Final Countdown', 'final countdown'],
    ['  Sweet   Child o\' Mine  ', 'sweet child o mine'],
    ['The', 'the'],
    ['(Remix)', ''],
    ['', ''],
    [null, ''],
  ])('%j -> %j', (raw, want) => expect(normalizeText(raw)).toBe(want))
})

describe('osaDistance (Damerau, optimal string alignment)', () => {
  it('counts insert, delete, substitute and adjacent swap as one edit each', () => {
    expect(osaDistance('abc', 'abc')).toBe(0)
    expect(osaDistance('abc', 'abxc')).toBe(1)
    expect(osaDistance('abc', 'ac')).toBe(1)
    expect(osaDistance('abc', 'abd')).toBe(1)
    expect(osaDistance('abcd', 'abdc')).toBe(1)
    expect(osaDistance('', 'abc')).toBe(3)
  })
})

describe('titleMatches', () => {
  const song = { title: 'Mr. Brightside', answer: 'Mr. Brightside', aliases: ['Mister Brightside'] }
  it('matches after normalization and through aliases', () => {
    expect(titleMatches('mr brightside', song)).toBe(true)
    expect(titleMatches('MISTER BRIGHTSIDE!', song)).toBe(true)
  })
  it('allows floor(len/5) edits on the spaceless title, capped at 2', () => {
    expect(titleMatches('Mr Brigthside', song)).toBe(true) // swap, len 12 -> 2
    expect(titleMatches('Mr Brgthsde', song)).toBe(false) // 3 edits
    const rhapsody = { title: 'Bohemian Rhapsody', answer: '', aliases: [] } // len 16 -> floor 3 -> cap 2
    expect(titleMatches('Bohemain Rapsody', rhapsody)).toBe(true) // swap + missing h
    expect(titleMatches('Bohemain Rapsodi', rhapsody)).toBe(false) // 3 edits
    const hello = { title: 'Hello', answer: '', aliases: [] } // len 5 -> 1
    expect(titleMatches('Helo', hello)).toBe(true)
    expect(titleMatches('Help', hello)).toBe(false)
  })
  it('titles of 4 characters or fewer must match exactly', () => {
    expect(titleMatches('Jumo', { title: 'Jump', aliases: [] })).toBe(false)
    expect(titleMatches('Hay', { title: 'Hey', aliases: [] })).toBe(false)
    expect(titleMatches('hey', { title: 'Hey', aliases: [] })).toBe(true)
  })
  it('never matches an empty normalized string on either side', () => {
    expect(titleMatches('', song)).toBe(false)
    expect(titleMatches('(Remix)', song)).toBe(false)
    expect(titleMatches('anything', { title: '(Remix)', answer: '', aliases: [] })).toBe(false)
  })
  it('the answer field counts as a title', () => {
    expect(titleMatches('satisfaction', { title: "(I Can't Get No) Satisfaction", answer: 'Satisfaction', aliases: [] })).toBe(true)
  })
})

describe('splitArtists + gradeGuess', () => {
  const song = { title: 'Mr. Brightside', answer: 'Mr. Brightside', aliases: [], artist: 'The Killers' }
  it('splits on &, comma and "and"; drops featured artists; ignores leading "the"', () => {
    expect(splitArtists('Simon & Garfunkel')).toEqual(['simon', 'garfunkel'])
    expect(splitArtists('Elton John, Kiki Dee')).toEqual(['elton john', 'kiki dee'])
    expect(splitArtists('Calvin Harris feat. Rihanna')).toEqual(['calvin harris'])
    expect(splitArtists('The Killers')).toEqual(['killers'])
    expect(splitArtists(null)).toEqual([])
  })
  it('needs a main artist to match when both sides have one', () => {
    expect(gradeGuess({ title: 'Mr Brightside', artist: 'Killers' }, song)).toBe(true)
    expect(gradeGuess({ title: 'Mr Brightside', artist: 'Brandon Flowers' }, song)).toBe(false)
    expect(gradeGuess({ title: 'Mr Brightside', artist: 'Kilers' }, song)).toBe(true) // len 7 -> 1 edit
    expect(gradeGuess({ title: 'This Is What You Came For', artist: 'Rihanna' },
      { title: 'This Is What You Came For', aliases: [], artist: 'Calvin Harris feat. Rihanna' })).toBe(false)
    expect(gradeGuess({ title: 'Island Girl', artist: 'Kiki Dee' },
      { title: 'Island Girl', aliases: [], artist: 'Elton John, Kiki Dee' })).toBe(true)
    expect(gradeGuess({ title: 'Halo', artist: 'Beyonce' }, { title: 'Halo', aliases: [], artist: 'Beyoncé' })).toBe(true)
  })
  it('a cover with the same title by a different artist misses', () => {
    expect(gradeGuess({ title: 'Hallelujah', artist: 'Jeff Buckley' }, { title: 'Hallelujah', aliases: [], artist: 'Leonard Cohen' })).toBe(false)
  })
  it('grades on the title alone when either side has no artist', () => {
    expect(gradeGuess({ title: 'Mr Brightside', artist: null }, song)).toBe(true)
    expect(gradeGuess({ title: 'Mr Brightside', artist: 'Anyone' }, { ...song, artist: null })).toBe(true)
    expect(gradeGuess({ title: 'Wrong Song', artist: null }, song)).toBe(false)
  })
  it('rejects a missing guess or song', () => {
    expect(gradeGuess(null, song)).toBe(false)
    expect(gradeGuess({ title: 'x' }, null)).toBe(false)
  })
})

describe('step points and guesses', () => {
  it('30/20/10 by step, 0 otherwise', () => {
    expect([0, 1, 2, 3, null, undefined].map(stepPoints)).toEqual([30, 20, 10, 0, 0, 0])
    expect(BENDLE_OVERRIDE_POINTS).toEqual([0, 10, 20, 30])
  })
  it('parseGuess keeps a clean guess and rejects junk', () => {
    expect(parseGuess({ title: ' Africa ', artist: ' Toto ', source: 'catalog', qid: null }))
      .toEqual({ title: 'Africa', artist: 'Toto', source: 'catalog', qid: null })
    expect(parseGuess({ title: 'Uptown Funk', artist: '', source: 'weird' }))
      .toEqual({ title: 'Uptown Funk', artist: null, source: 'typed', qid: null })
    expect(parseGuess({ title: '(Remix)' })).toBe(null)
    expect(parseGuess({ title: 42 })).toBe(null)
    expect(parseGuess(null)).toBe(null)
    expect(parseGuess({ title: 'x'.repeat(500) }).title).toHaveLength(200)
  })
  it('guessLabel', () => {
    expect(guessLabel({ title: 'Africa', artist: 'Toto' })).toBe('Africa - Toto')
    expect(guessLabel({ title: 'Africa', artist: null })).toBe('Africa')
    expect(guessLabel(null)).toBe('No guess')
  })
})

describe('gradeBendleGroup', () => {
  const song = { title: 'Mr. Brightside', answer: 'Mr. Brightside', aliases: ['Mister Brightside'], artist: 'The Killers' }
  const stepIds = ['s1', 's2', 's3']
  const teams = [
    { id: 'p1', name: 'Alpha' }, { id: 'p2', name: 'Bravo' }, { id: 'p3', name: 'Charlie' },
    { id: 'p4', name: 'Delta' }, { id: 'p5', name: 'Echo' },
  ]
  const rows = [
    { team_id: 'p2', slide_id: 's2', answer: { title: 'Mr Brightside', artist: 'Brandon Flowers', source: 'typed', qid: null } },
    { team_id: 'p1', slide_id: 's1', answer: { title: 'Mr. Brightside', artist: 'The Killers', source: 'catalog', qid: null } },
    { team_id: 'p3', slide_id: 's3', answer: { title: 'mister brightside', artist: null, source: 'typed', qid: null } },
    { team_id: 'p5', slide_id: 'other-slide', answer: { title: 'Mr. Brightside', artist: null } },
  ]
  it('scores the step each row was saved on and lists every team in reveal order', () => {
    const results = gradeBendleGroup({ rows, stepIds, song, teams })
    expect(results.map(r => [r.teamId, r.points, r.stepIndex, r.correct])).toEqual([
      ['p1', 30, 0, true], ['p3', 10, 2, true], ['p2', 0, 1, false], ['p4', 0, null, false], ['p5', 0, null, false],
    ])
    expect(results[0]).toMatchObject({ teamName: 'Alpha', autoPoints: 30, overridden: false, guess: { title: 'Mr. Brightside', artist: 'The Killers' } })
    expect(results[3].guess).toBe(null)
  })
  it('keeps the earliest step if a team somehow has two rows', () => {
    const dup = [...rows, { team_id: 'p1', slide_id: 's3', answer: { title: 'Wrong', artist: null } }]
    expect(gradeBendleGroup({ rows: dup, stepIds, song, teams })[0]).toMatchObject({ teamId: 'p1', points: 30 })
  })
  it('applies valid overrides, ignores invalid ones, and re-sorts', () => {
    const results = gradeBendleGroup({ rows, stepIds, song, teams, overrides: { p4: 20, p2: 99 } })
    expect(results.map(r => [r.teamId, r.points, r.overridden])).toEqual([
      ['p1', 30, false], ['p4', 20, true], ['p3', 10, false], ['p2', 0, false], ['p5', 0, false],
    ])
    const back = applyBendleOverrides(results, { p4: 0, p1: 10 })
    expect(back.map(r => [r.teamId, r.points])).toEqual([['p1', 10], ['p3', 10], ['p2', 0], ['p4', 0], ['p5', 0]])
  })
})

describe('computeBendleScoreUpdates', () => {
  const teams = [{ id: 'p1', name: 'Quizzly Bears' }, { id: 'p2', name: 'Trivia Newton John' }]
  const scoreboardTeams = [
    { id: 't1', show_id: 'show1', name: 'Quizzly Bears', scores: { r_r1: { written: 4, phone: { other: 15 } } }, sort_order: 0 },
    { id: 't2', show_id: 'show1', name: 'Trivia Newton John', scores: {}, sort_order: 1 },
  ]
  const results = [{ teamId: 'p1', points: 30 }, { teamId: 'p2', points: 0 }]
  it('writes into the step-3 slide bucket, keeps written and other slides, and is idempotent', () => {
    const once = computeBendleScoreUpdates({ results, teams, scoreboardTeams, roundKey: 'r_r1', lockSlideId: 's3' })
    expect(once.find(u => u.id === 't1').scores.r_r1).toEqual({ written: 4, phone: { other: 15, s3: 30 } })
    expect(once.find(u => u.id === 't2').scores.r_r1).toEqual({ written: 0, phone: { s3: 0 } })
    const after = scoreboardTeams.map(t => once.find(u => u.id === t.id) ?? t)
    expect(computeBendleScoreUpdates({ results, teams, scoreboardTeams: after, roundKey: 'r_r1', lockSlideId: 's3' })).toEqual(once)
    expect(Object.keys(once[0].scores.r_r1.phone)).not.toContain('s1')
  })
})

describe('group helpers', () => {
  const q = (id, step, group = 'g1', type = 'question') => ({ id, type, data: { isShiny: true, shinyInputSchema: { type: 'bendle' }, shinyGroupId: group, bendleStepIndex: step, bendleSongId: 'bnd_1' } })
  const slides = [
    { id: 't', type: 'shiny-title', data: { isShiny: true, shinyGroupId: 'g1', shinyInputType: 'bendle' } },
    q('s3', 2), q('s1', 0), q('s2', 1), q('x1', 0, 'g2'),
    { id: 'm', type: 'question', data: { isShiny: true, shinyInputSchema: { type: 'matching' }, shinyGroupId: 'g1' } },
  ]
  it('finds the three steps of the same group in step order', () => {
    expect(bendleGroupSlides(slides, slides[2]).map(s => s.id)).toEqual(['s1', 's2', 's3'])
    expect(bendleStepIds(slides, slides[3])).toEqual(['s1', 's2', 's3'])
    expect(bendleLockSlide(slides, slides[2]).id).toBe('s3')
  })
  it('returns nothing for a non-Bendle slide or one with no group', () => {
    expect(bendleGroupSlides(slides, slides[5])).toEqual([])
    const loose = { id: 'l', type: 'question', data: { isShiny: true, shinyInputSchema: { type: 'bendle' }, bendleStepIndex: 2 } }
    expect(bendleGroupSlides([loose], loose)).toEqual([])
    expect(bendleLockSlide([loose], loose)).toBe(null)
    expect(bendleStepIds([loose], loose)).toEqual([])
  })
  it('bendleConfigError names what blocks the lock', () => {
    expect(bendleConfigError({ shinyGroupId: 'g1', bendleSongId: 'bnd_1' })).toBe(null)
    expect(bendleConfigError({ bendleSongId: 'bnd_1' })).toMatch(/Recreate this Bendle/)
    expect(bendleConfigError({ shinyGroupId: 'g1' })).toMatch(/Pick a song/)
  })
})

describe('non-Latin titles', () => {
  it('keeps letters and digits from any script', () => {
    expect(normalizeText('千と千尋')).not.toBe('')
    expect(normalizeText('Кино')).not.toBe('')
  })
  it('grades Cyrillic and CJK guesses against the same title', () => {
    const kino = { title: 'Кино', answer: '', aliases: [], artist: null }
    const sen = { title: '千と千尋', answer: '', aliases: [], artist: null }
    expect(gradeGuess({ title: 'кино', artist: null }, kino)).toBe(true)
    expect(gradeGuess({ title: '千と千尋', artist: null }, sen)).toBe(true)
    expect(gradeGuess({ title: 'Кино', artist: null }, sen)).toBe(false)
    expect(parseGuess({ title: '千と千尋' })).not.toBe(null)
  })
  it('a punctuation-only guess still normalizes to empty and never matches', () => {
    expect(normalizeText('?!...')).toBe('')
    expect(gradeGuess({ title: '?!...', artist: null }, { title: '!!!', answer: '', aliases: [] })).toBe(false)
    expect(parseGuess({ title: '?!...' })).toBe(null)
  })
})
