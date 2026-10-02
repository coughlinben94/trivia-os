# Bendle Phone Guess Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teams search or type the Bendle song on their phones, lock one guess for the whole three-step Bendle, and the app grades it, scores it, and shows every team's guess on the reveal.

**Architecture:** Bendle joins `PHONE_MECHANICS` with a new per-mechanic `lockHere` (true only on the step-3 slide), so the lock, the reveal and the results all live on the step-3 slide while the guard stays true on all three steps. Pure modules grade guesses (`bendleGuessScoring.js`) and search a static Wikidata song list (`bendleCatalog.js`, file built once by `scripts/build-bendle-catalog.mjs`). A database trigger enforces live-step-only, one-row-per-team-per-group, no-write-after-lock and no-update; a host-gated RPC clears a group's rows on Unlock.

**Tech Stack:** React 18, Vite, Vitest (jsdom via docblock), Supabase JS + Postgres (plpgsql trigger, SECURITY DEFINER RPC), Node 20 script (fetch, zlib, crypto), Framer Motion, Wikidata SPARQL (CC0).

**Spec:** `docs/superpowers/specs/2026-10-02-bendle-phone-guess-design.md` (v2). Precedent: `docs/superpowers/specs/2026-09-30-movie-chain-shiny-design.md` and `docs/superpowers/plans/2026-09-30-movie-chain-shiny.md`.

## Global Constraints

- Points by step: `BENDLE_STEP_POINTS` = 30 / 20 / 10 (`client/src/lib/bendleScoring.js:38`). Wrong or missing guess = 0. Host override values: 0 / 10 / 20 / 30.
- A guess is `{ title, artist|null, source: 'catalog'|'typed', qid|null }`.
- Grading: title must match (normalized title, `answer`, or any `aliases[]`; Damerau-Levenshtein on the title with spaces removed; tolerance `min(2, floor(len/5))`, so 4 characters or fewer must match exactly; never match an empty normalized string). If both sides have an artist, a main artist must also match (split on `&`, `,`, `and`; `feat./ft./featuring …` dropped; same tolerance; leading "the" ignored). Otherwise title alone.
- Normalization order: NFKD + strip accents; lowercase; `&` to "and"; drop bracketed text; drop a trailing spaced ` - …` tag; drop `feat./ft./featuring …`; drop leading "the "; drop punctuation; squash spaces.
- No outside music service at show time. The song list is a static file from Wikidata (CC0). The host's Spotify song picker and the jukebox are not touched.
- No correctness feedback on phones or TV before the host's A on step 3.
- Press order on step 3: play the clip, then lock, then A (reveal), then Next.
- A refuses on steps 1-2 (and on step 3 before the lock).
- Scores upsert idempotently into the phone bucket keyed by the **step-3 slide id** (`applyPhoneScoreUpdates`, `client/src/lib/scoreboardMath.js:110-122`), never a row's own slide id.
- Never touch the production database. DB tests run against a throwaway database (see Task 2).
- Fonts: Boogaloo + DM Sans only. Respect reduced motion. Phone inputs use a 16px font so iOS does not zoom.
- Tests run from the repo root: `VITE_SUPABASE_URL=http://127.0.0.1:9 VITE_SUPABASE_ANON_KEY=dummy npx vitest run <paths>`.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (shown as a second `-m` below).
- Static files live in the repo-root `public/` folder (`vite.config.js`: `root: 'client'`, `publicDir: '../public'`). The spec's `client/public/` path is wrong; this plan uses `public/`.

## Shared Types (every task uses these names exactly)

```js
// A team's stored guess (phone_answers.answer for a Bendle step slide)
Guess = { title: string, artist: string|null, source: 'catalog'|'typed', qid: string|null }

// Step-3 slide data fields (the "lock slide"); steps 1-2 never carry them
data.bendleLocked     // boolean  — host locked the group (lockFields[0])
data.bendleLockedAt   // ISO string — when (clearFields)
data.bendleRevealed   // boolean  — A pressed, results public (revealField)
data.bendleResults    // BendleResult[] | null (clearFields)
data.bendleOverrides  // { [teamId]: 0|10|20|30 } (freshClearFields — survives Unlock, cleared on fresh entry)
// Existing fields every step slide already has (shinyWizardKinds.jsx:281-305, AddSlideWizard.jsx:315-318)
data.bendleStepIndex  // 0 | 1 | 2
data.shinyGroupId     // 'sgrp_xxxxxxxx' shared by the 3 steps (+ the shiny-title slide, which is type 'shiny-title')
data.bendleSongId     // bendle_songs.id

BendleResult = {
  teamId: string, teamName: string,
  guess: Guess|null,          // null = no guess (or an unreadable row)
  stepIndex: 0|1|2|null,      // step the row was saved on
  correct: boolean,           // automatic grade
  autoPoints: 0|10|20|30,     // correct ? BENDLE_STEP_POINTS[stepIndex] : 0
  points: 0|10|20|30,         // overrides[teamId] ?? autoPoints
  overridden: boolean,
}
// Sort: points desc, then teams with a guess before teams without, then teamName.

// Catalog file (public/bendle-catalog.<version>.json)
{ version: string, source: 'Wikidata (CC0)', built: 'YYYY-MM-DD', rows: [title, artist, rank][] }  // rows sorted rank desc
CatalogIndexRow = { title: string, artist: string|null, rank: number, words: string[] }
```

Database error messages raised by the trigger (Task 2), read by the phone (Task 10): `bendle_not_live`, `bendle_locked`, `bendle_already_guessed` (errcode 23505), `bendle_no_update`, `bendle_no_group`. RPC: `clear_bendle_group_answers(p_show_id text, p_group_id text) returns integer`.

## Dependency graph

```
Wave 1 (parallel, no deps)
  T1  bendleGuessScoring.js (normalize, match, grade, overrides, score updates, group helpers)
  T2  DB migration (trigger + host delete RPC + drop bendle_answer_counts) + SQL test script
  T5  BendleAdmin alias prompt
Wave 2 (needs T1; parallel)
  T3  BendleRevealList.jsx (TV list)
  T4  BendleHostPanel.jsx (host pane)
  T6  bendleCatalog.js + bendleCatalogVersion.js
  T7  scripts/build-bendle-catalog.mjs (script only; RUNNING it is owner-only)
  T8  slideStepping.js: bendle mechanic, lockHere, group-aware entry/protect, phone helpers
Wave 3 (parallel)
  T9  hostCommands.js + nextPressCue.js + lockRefusal.js + remoteProtocol.js (needs T1, T8)
  T10 BendleBoard.jsx (needs T1, T6)
  T11 ShinyBendleQuestion.jsx reveal + list (needs T3)
Wave 4 (parallel)
  T12 LiveMode.jsx wiring (needs T1, T2 names, T4, T8, T9)
  T13 Join.jsx wiring (needs T6, T8, T10)
Wave 5
  T14 Rules card copy + visual — BLOCKED-ON PR #33 merge
  T15 Docs and stale comments (after T12/T13)
  T16 Verification (last)
```

File ownership (no two tasks edit one file):

| Task | Files |
|---|---|
| T1 | `client/src/lib/bendleGuessScoring.js`, `client/src/lib/bendleGuessScoring.test.js` |
| T2 | `supabase/migrations/20261002120000_bendle_phone_guess_guard.sql`, `supabase/tests/bendle_phone_guess_guard.sql` |
| T3 | `client/src/components/display/slides/BendleRevealList.jsx`, `.test.jsx` |
| T4 | `client/src/components/host/BendleHostPanel.jsx`, `.test.jsx` |
| T5 | `client/src/components/host/BendleAdmin.jsx`, `BendleAdmin.test.jsx` |
| T6 | `client/src/lib/bendleCatalog.js`, `bendleCatalog.test.js`, `client/src/lib/bendleCatalogVersion.js` |
| T7 | `scripts/build-bendle-catalog.mjs`, `scripts/build-bendle-catalog.test.mjs` |
| T8 | `client/src/lib/slideStepping.js`, `client/src/lib/slideStepping.bendle.test.js` |
| T9 | `client/src/lib/hostCommands.js`, `nextPressCue.js`, `lockRefusal.js`, `remoteProtocol.js`, `client/src/lib/bendlePressOrder.test.js` |
| T10 | `client/src/components/join/BendleBoard.jsx`, `BendleBoard.test.jsx` |
| T11 | `client/src/components/display/slides/ShinyBendleQuestion.jsx`, `ShinyBendleQuestion.test.jsx` |
| T12 | `client/src/components/host/LiveMode.jsx`, `client/src/components/host/LiveMode.bendle.test.jsx` |
| T13 | `client/src/views/Join.jsx` |
| T14 | `client/src/lib/shinyExplainers.js`, `shinyExplainers.test.js`, `client/src/components/display/explainers/BendleExplainer.jsx`, `references/shiny-rules-card.md` |
| T15 | `client/src/lib/bendleScoring.js` (comment), `client/src/lib/shinyWizardKinds.jsx` (comment), `client/src/components/host/SlideEditor.jsx` (comment), `SKILL.md` |

---

### Task 1: Guess grading module

**Files:**
- Create: `client/src/lib/bendleGuessScoring.js`
- Test: `client/src/lib/bendleGuessScoring.test.js`

**Interfaces:**
- Consumes: `BENDLE_STEP_POINTS` (`bendleScoring.js:38`), `applyPhoneScoreUpdates` (`scoreboardMath.js:110`), `isBendleShiny` (`shinySeries.js:129`).
- Produces:
  - `stripAccents(s): string`, `normalizeText(s): string`, `osaDistance(a, b): number`
  - `titleMatches(guessTitle, song): boolean`, `splitArtists(raw): string[]`, `gradeGuess(guess, song): boolean`
  - `stepPoints(stepIndex): number`, `BENDLE_OVERRIDE_POINTS = [0, 10, 20, 30]`
  - `parseGuess(answer): Guess|null`, `guessLabel(guess): string` ("Title - Artist", "Title", or "No guess")
  - `gradeBendleGroup({ rows, stepIds, song, teams, overrides }): BendleResult[]`
  - `applyBendleOverrides(results, overrides): BendleResult[]`
  - `computeBendleScoreUpdates({ results, teams, scoreboardTeams, roundKey, lockSlideId }): ScoreboardRow[]`
  - `bendleGroupSlides(slides, slide): Slide[]` (the 3 question slides, by step), `bendleStepIds(slides, slide): string[]` (index = step), `bendleLockSlide(slides, slide): Slide|null` (step 3)
  - `bendleConfigError(data): string|null`

- [ ] **Step 1: Write the failing test**

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `VITE_SUPABASE_URL=http://127.0.0.1:9 VITE_SUPABASE_ANON_KEY=dummy npx vitest run client/src/lib/bendleGuessScoring.test.js`
Expected: FAIL, "Failed to resolve import ./bendleGuessScoring.js".

- [ ] **Step 3: Write the implementation**

```js
// client/src/lib/bendleGuessScoring.js
// Bendle phone guess (spec 2026-10-02): grading a team's one locked guess,
// scoring it, and finding the three step slides of one Bendle. Pure — no
// network. The lock, results and overrides live on the step-3 slide
// (bendleLockSlide); scores are keyed to that slide id, never a row's own.
import { BENDLE_STEP_POINTS } from './bendleScoring.js'
import { applyPhoneScoreUpdates } from './scoreboardMath.js'
import { isBendleShiny } from './shinySeries.js'

export const BENDLE_OVERRIDE_POINTS = Object.freeze([0, ...[...BENDLE_STEP_POINTS].sort((a, b) => a - b)])

const FEAT_RE = /(^|\s)(?:feat|ft|featuring)\b\.?.*$/
const MAX_FIELD = 200

export function stripAccents(s) {
  return String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '')
}

// Spec order: accents, lowercase, & -> and, brackets, trailing " - tag",
// feat., leading "the", punctuation, spaces.
export function normalizeText(raw) {
  return stripAccents(raw)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .replace(/\s+[-–—]\s+.*$/, '')
    .replace(FEAT_RE, '')
    .replace(/^\s*the\s+/, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const compact = s => s.replace(/ /g, '')

// Damerau-Levenshtein, optimal string alignment variant (adjacent swap = 1).
export function osaDistance(a, b) {
  const m = a.length, n = b.length
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...new Array(n).fill(0)])
  for (let j = 0; j <= n; j++) d[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
    }
  }
  return d[m][n]
}

// `target` is the song side; its length sets the tolerance, so a title of 4
// characters or fewer must match exactly.
function withinTolerance(guess, target) {
  if (!guess || !target) return false
  const tol = Math.min(2, Math.floor(target.length / 5))
  if (tol === 0) return guess === target
  return Math.abs(guess.length - target.length) <= tol && osaDistance(guess, target) <= tol
}

export function titleMatches(guessTitle, song) {
  const g = compact(normalizeText(guessTitle))
  if (!g || !song) return false
  return [song.title, song.answer, ...(song.aliases ?? [])]
    .some(c => withinTolerance(g, compact(normalizeText(c))))
}

// Main artists only: featured artists are dropped before the split.
export function splitArtists(raw) {
  return stripAccents(raw).toLowerCase().replace(FEAT_RE, '')
    .split(/&|,|\band\b/)
    .map(normalizeText)
    .filter(Boolean)
}

export function gradeGuess(guess, song) {
  if (!guess || !song) return false
  if (!titleMatches(guess.title, song)) return false
  const g = splitArtists(guess.artist)
  const s = splitArtists(song.artist)
  if (g.length === 0 || s.length === 0) return true
  return g.some(a => s.some(b => withinTolerance(compact(a), compact(b))))
}

export function stepPoints(stepIndex) {
  return BENDLE_STEP_POINTS[stepIndex] ?? 0
}

export function parseGuess(answer) {
  if (!answer || typeof answer !== 'object' || typeof answer.title !== 'string') return null
  const title = answer.title.trim().slice(0, MAX_FIELD)
  if (!normalizeText(title)) return null
  const artist = typeof answer.artist === 'string' && answer.artist.trim() ? answer.artist.trim().slice(0, MAX_FIELD) : null
  return { title, artist, source: answer.source === 'catalog' ? 'catalog' : 'typed', qid: typeof answer.qid === 'string' ? answer.qid : null }
}

export function guessLabel(guess) {
  if (!guess) return 'No guess'
  return guess.artist ? `${guess.title} - ${guess.artist}` : guess.title
}

const byReveal = (a, b) => b.points - a.points
  || (b.guess ? 1 : 0) - (a.guess ? 1 : 0)
  || String(a.teamName).localeCompare(String(b.teamName))

export function applyBendleOverrides(results, overrides = {}) {
  return (results ?? []).map(r => {
    const o = overrides?.[r.teamId]
    const overridden = BENDLE_OVERRIDE_POINTS.includes(o)
    return { ...r, points: overridden ? o : r.autoPoints, overridden }
  }).sort(byReveal)
}

// rows: phone_answers { team_id, slide_id, answer }; stepIds[i] = step i's slide id.
export function gradeBendleGroup({ rows, stepIds, song, teams, overrides = {} }) {
  const stepOf = new Map((stepIds ?? []).map((id, i) => [id, i]).filter(([id]) => id))
  const byTeam = new Map()
  for (const row of rows ?? []) {
    const step = stepOf.get(row.slide_id)
    if (step === undefined) continue
    const prev = byTeam.get(row.team_id)
    if (!prev || step < prev.step) byTeam.set(row.team_id, { step, guess: parseGuess(row.answer) })
  }
  const results = (teams ?? []).map(team => {
    const hit = byTeam.get(team.id)
    const guess = hit?.guess ?? null
    const correct = !!guess && gradeGuess(guess, song)
    return { teamId: team.id, teamName: team.name, guess, stepIndex: hit ? hit.step : null, correct, autoPoints: correct ? stepPoints(hit.step) : 0 }
  })
  return applyBendleOverrides(results, overrides)
}

export function computeBendleScoreUpdates({ results, teams, scoreboardTeams, roundKey, lockSlideId }) {
  return applyPhoneScoreUpdates({ results, teams, scoreboardTeams, roundKey, slideId: lockSlideId })
}

export function bendleGroupSlides(slides, slide) {
  const gid = slide?.data?.shinyGroupId
  if (!gid || !slide.data || !isBendleShiny(slide.data)) return []
  return (slides ?? [])
    .filter(s => s?.type === 'question' && s.data && isBendleShiny(s.data) && s.data.shinyGroupId === gid)
    .sort((a, b) => (a.data.bendleStepIndex ?? 0) - (b.data.bendleStepIndex ?? 0))
}

export function bendleStepIds(slides, slide) {
  const ids = []
  for (const s of bendleGroupSlides(slides, slide)) ids[s.data.bendleStepIndex ?? 0] = s.id
  return ids
}

export function bendleLockSlide(slides, slide) {
  return bendleGroupSlides(slides, slide).find(s => s.data.bendleStepIndex === 2) ?? null
}

export function bendleConfigError(data) {
  if (!data?.shinyGroupId) return 'This Bendle has no group id. Recreate this Bendle from Add Shiny.'
  if (!data.bendleSongId) return 'Pick a song for this Bendle first.'
  return null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `VITE_SUPABASE_URL=http://127.0.0.1:9 VITE_SUPABASE_ANON_KEY=dummy npx vitest run client/src/lib/bendleGuessScoring.test.js`
Expected: PASS. If a normalization case fails, fix the code, not the expectation; each row is copied from the spec.

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/bendleGuessScoring.js client/src/lib/bendleGuessScoring.test.js
git commit -m "feat(bendle): grade phone guesses (title+artist, typo tolerance, step points)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Database guard (trigger, host delete RPC, drop dead count function)

**Files:**
- Create: `supabase/migrations/20261002120000_bendle_phone_guess_guard.sql`
- Create: `supabase/tests/bendle_phone_guess_guard.sql`

**Interfaces:**
- Consumes: `public.shows` (`id`, `slides jsonb`, `current_slide_id`), `public.phone_answers` (`20260728120000_phone_answers_table.sql`), `public.teams`.
- Produces: trigger `phone_answers_guard_bendle` raising `bendle_not_live` / `bendle_locked` / `bendle_already_guessed` (23505) / `bendle_no_update` / `bendle_no_group`; RPC `public.clear_bendle_group_answers(p_show_id text, p_group_id text) returns integer` (host_verified only); drops `public.bendle_answer_counts(text)`.

Notes from the code:
- `bendle_answer_counts` is a SECURITY DEFINER **function**, not a view (`supabase/migrations/20260905150156_bendle_answer_counts_drop_total.sql:10`). Nothing in `client/` calls it (grep for `answer_counts` finds only `wager_answer_counts`). Drop it. The host's "N of M" count reads `phone_answers` directly (host_verified can SELECT, `20260817171310_lock_down_phone_answers_select.sql:30-38`).
- `phone_answers_set_submitted_at` (`20260826170000`) restamps on UPDATE; refusing UPDATE here makes the first lock final.
- Postgres fires BEFORE INSERT row triggers before the unique check and before ON CONFLICT, so a second tap is refused by this trigger with a readable message.

- [ ] **Step 1: Write the SQL test script first (it fails until the migration exists)**

```sql
-- supabase/tests/bendle_phone_guess_guard.sql
-- Run ONLY against a throwaway database that has the production schema, never production:
--   psql "$THROWAWAY_DB_URL" -v I_AM_NOT_PRODUCTION=1 -v ON_ERROR_STOP=1 -f supabase/tests/bendle_phone_guess_guard.sql
-- Everything runs in one transaction and is rolled back.
\if :{?I_AM_NOT_PRODUCTION}
\else
  \echo 'Refusing to run: pass -v I_AM_NOT_PRODUCTION=1 and point at a throwaway database.'
  \quit
\endif

begin;

create function pg_temp.expect_error(p_sql text, p_msg text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm = p_msg then return; end if;
    raise exception 'expected %, got %', p_msg, sqlerrm;
  end;
  raise exception 'expected %, but the statement succeeded', p_msg;
end $$;

-- Fixture: one show, a Bendle group g1 (steps s1/s2/s3) plus a matching slide q1.
-- If this insert (or the teams insert below) fails on a NOT NULL column, add
-- that column with a dummy value (\d public.shows and \d public.teams list them;
-- Join.jsx:2510 shows the columns a real team insert sends).
insert into public.shows (id, title, is_live, current_slide_index, current_slide_id, slides)
values ('bg_show', 'Bendle guard test', true, 1, 's1', jsonb_build_array(
  jsonb_build_object('id', 't1', 'type', 'shiny-title', 'order', 0, 'data', jsonb_build_object('isShiny', true, 'shinyGroupId', 'g1')),
  jsonb_build_object('id', 's1', 'type', 'question', 'order', 1, 'data', jsonb_build_object('isShiny', true, 'shinyGroupId', 'g1', 'bendleStepIndex', 0, 'shinyInputSchema', jsonb_build_object('type', 'bendle'))),
  jsonb_build_object('id', 's2', 'type', 'question', 'order', 2, 'data', jsonb_build_object('isShiny', true, 'shinyGroupId', 'g1', 'bendleStepIndex', 1, 'shinyInputSchema', jsonb_build_object('type', 'bendle'))),
  jsonb_build_object('id', 's3', 'type', 'question', 'order', 3, 'data', jsonb_build_object('isShiny', true, 'shinyGroupId', 'g1', 'bendleStepIndex', 2, 'shinyInputSchema', jsonb_build_object('type', 'bendle'))),
  jsonb_build_object('id', 'q1', 'type', 'question', 'order', 4, 'data', jsonb_build_object('isShiny', true, 'shinyInputSchema', jsonb_build_object('type', 'matching')))
));
insert into public.teams (id, show_id, name) values ('bg_a', 'bg_show', 'A'), ('bg_b', 'bg_show', 'B'), ('bg_c', 'bg_show', 'C');

-- Live step only, first write wins, no second row, no update.
insert into public.phone_answers (show_id, slide_id, team_id, answer) values ('bg_show', 's1', 'bg_a', '{"title":"Africa"}');
select pg_temp.expect_error($$insert into public.phone_answers (show_id, slide_id, team_id, answer) values ('bg_show', 's1', 'bg_a', '{"title":"Other"}')$$, 'bendle_already_guessed');
select pg_temp.expect_error($$update public.phone_answers set answer = '{"title":"Other"}' where slide_id = 's1' and team_id = 'bg_a'$$, 'bendle_no_update');
select pg_temp.expect_error($$insert into public.phone_answers (show_id, slide_id, team_id, answer) values ('bg_show', 's2', 'bg_b', '{"title":"Africa"}')$$, 'bendle_not_live');

-- Step 2 live: team A (already locked on step 1) is refused; team B is accepted.
update public.shows set current_slide_id = 's2' where id = 'bg_show';
select pg_temp.expect_error($$insert into public.phone_answers (show_id, slide_id, team_id, answer) values ('bg_show', 's2', 'bg_a', '{"title":"Other"}')$$, 'bendle_already_guessed');
insert into public.phone_answers (show_id, slide_id, team_id, answer) values ('bg_show', 's2', 'bg_b', '{"title":"Africa"}');
-- Back-dating to step 1 while step 2 is live is refused.
select pg_temp.expect_error($$insert into public.phone_answers (show_id, slide_id, team_id, answer) values ('bg_show', 's1', 'bg_c', '{"title":"Africa"}')$$, 'bendle_not_live');

-- Step 3 live and locked: nobody can write.
update public.shows set current_slide_id = 's3',
  slides = jsonb_set(slides, '{3,data,bendleLocked}', 'true'::jsonb) where id = 'bg_show';
select pg_temp.expect_error($$insert into public.phone_answers (show_id, slide_id, team_id, answer) values ('bg_show', 's3', 'bg_c', '{"title":"Africa"}')$$, 'bendle_locked');

-- Other boards are untouched (insert and update on a non-Bendle slide work).
insert into public.phone_answers (show_id, slide_id, team_id, answer) values ('bg_show', 'q1', 'bg_c', '[]');
update public.phone_answers set answer = '[1]' where slide_id = 'q1' and team_id = 'bg_c';

-- RPC: refused without the host claim.
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","app_metadata":{}}';
do $$ begin
  begin
    perform public.clear_bendle_group_answers('bg_show', 'g1');
    raise exception 'expected not authorized';
  exception when others then
    if sqlerrm <> 'not authorized' then raise; end if;
  end;
end $$;

-- RPC: a verified host clears exactly the group's two rows; q1 survives.
set local request.jwt.claims = '{"role":"authenticated","app_metadata":{"host_verified":true}}';
do $$ declare n int; begin
  n := public.clear_bendle_group_answers('bg_show', 'g1');
  if n <> 2 then raise exception 'expected 2 rows cleared, got %', n; end if;
end $$;
reset role;
do $$ begin
  if (select count(*) from public.phone_answers where show_id = 'bg_show' and slide_id in ('s1','s2','s3')) <> 0 then raise exception 'group rows remain'; end if;
  if (select count(*) from public.phone_answers where show_id = 'bg_show' and slide_id = 'q1') <> 1 then raise exception 'q1 row was touched'; end if;
  if exists (select 1 from pg_proc where proname = 'bendle_answer_counts') then raise exception 'bendle_answer_counts still exists'; end if;
end $$;

\echo 'bendle_phone_guess_guard: all checks passed'
rollback;
```

- [ ] **Step 2: Run it against the throwaway database to verify it fails**

Run: `psql "$THROWAWAY_DB_URL" -v I_AM_NOT_PRODUCTION=1 -v ON_ERROR_STOP=1 -f supabase/tests/bendle_phone_guess_guard.sql`
Expected: FAIL at the first `expect_error` ("expected bendle_already_guessed, got duplicate key value violates unique constraint ..."). Where the throwaway database comes from is an owner decision (see Open questions): this repo's migrations do not create `shows`, so a local `supabase start` cannot build the schema from migrations alone. Options: a scratch Supabase project loaded with `supabase db dump --schema public` output from production (schema only, no data), or a Supabase branch. Never production.

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20261002120000_bendle_phone_guess_guard.sql
-- Bendle phone guess (docs/superpowers/specs/2026-10-02-bendle-phone-guess-design.md).
-- phone_answers is unique on (slide_id, team_id), but a Bendle is three step
-- slides with different ids, RLS only checks that the team owns the row, and
-- slide ids are public in shows.slides — the UI alone cannot hold a team to
-- one guess at the live step. This trigger does, for Bendle step slides only:
--   1. only the slide on screen right now (no back-dating to step 1, no stale render)
--   2. nothing once the group is locked (bendleLocked on the step-3 slide)
--   3. one row per team per Bendle group (shinyGroupId)
--   4. no UPDATE: the first lock is final
-- Every other phone board is untouched. Host Unlock clears the group's rows
-- through clear_bendle_group_answers (phone_answers has no DELETE policy).
--
-- Rollback:
--   drop trigger if exists phone_answers_guard_bendle on public.phone_answers;
--   drop function if exists public.guard_bendle_phone_answers();
--   drop function if exists public.clear_bendle_group_answers(text, text);
--   then re-run the create function block of
--   20260905150156_bendle_answer_counts_drop_total.sql to restore bendle_answer_counts.

create or replace function public.guard_bendle_phone_answers()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current text;
  v_slides  jsonb;
  v_slide   jsonb;
  v_group   text;
  v_ids     text[];
begin
  select s.current_slide_id::text, s.slides into v_current, v_slides
  from public.shows s
  where s.id::text = new.show_id;

  select sl into v_slide
  from jsonb_array_elements(coalesce(v_slides, '[]'::jsonb)) sl
  where sl->>'id' = new.slide_id;

  if v_slide is null
     or v_slide->>'type' is distinct from 'question'
     or v_slide->'data'->'shinyInputSchema'->>'type' is distinct from 'bendle' then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    raise exception 'bendle_no_update' using errcode = '55000';
  end if;

  v_group := v_slide->'data'->>'shinyGroupId';
  if v_group is null then
    raise exception 'bendle_no_group' using errcode = '55000';
  end if;

  if v_current is distinct from new.slide_id then
    raise exception 'bendle_not_live' using errcode = '55000';
  end if;

  select array_agg(sl->>'id') into v_ids
  from jsonb_array_elements(v_slides) sl
  where sl->>'type' = 'question'
    and sl->'data'->'shinyInputSchema'->>'type' = 'bendle'
    and sl->'data'->>'shinyGroupId' = v_group;

  if exists (
    select 1 from jsonb_array_elements(v_slides) sl
    where sl->>'id' = any(v_ids) and sl->'data'->>'bendleLocked' = 'true'
  ) then
    raise exception 'bendle_locked' using errcode = '55000';
  end if;

  -- Serialise two taps from the same team on the same group.
  perform pg_advisory_xact_lock(hashtext('bendle:' || new.team_id || ':' || v_group));
  if exists (
    select 1 from public.phone_answers pa
    where pa.team_id = new.team_id and pa.slide_id = any(v_ids)
  ) then
    raise exception 'bendle_already_guessed' using errcode = '23505';
  end if;

  return new;
end;
$$;

create trigger phone_answers_guard_bendle
  before insert or update on public.phone_answers
  for each row
  execute function public.guard_bendle_phone_answers();

-- Host Unlock: delete every team's guess for one Bendle group so phones can
-- guess again. Same host_verified gate as create_reauth_token (20260817173635).
create or replace function public.clear_bendle_group_answers(p_show_id text, p_group_id text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids   text[];
  v_count integer;
begin
  if not coalesce((((select auth.jwt()) -> 'app_metadata') ->> 'host_verified')::boolean, false) then
    raise exception 'not authorized';
  end if;

  select array_agg(sl->>'id') into v_ids
  from public.shows s, jsonb_array_elements(s.slides) sl
  where s.id::text = p_show_id
    and sl->>'type' = 'question'
    and sl->'data'->'shinyInputSchema'->>'type' = 'bendle'
    and sl->'data'->>'shinyGroupId' = p_group_id;

  if v_ids is null then
    return 0;
  end if;

  delete from public.phone_answers where show_id = p_show_id and slide_id = any(v_ids);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.clear_bendle_group_answers(text, text) from public;
grant execute on function public.clear_bendle_group_answers(text, text) to authenticated;

-- Dead since the 2026-09-08 manual-grading rebuild: no client calls it.
drop function if exists public.bendle_answer_counts(text);
```

- [ ] **Step 4: Apply to the throwaway database and run the test**

Run: `psql "$THROWAWAY_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20261002120000_bendle_phone_guess_guard.sql && psql "$THROWAWAY_DB_URL" -v I_AM_NOT_PRODUCTION=1 -v ON_ERROR_STOP=1 -f supabase/tests/bendle_phone_guess_guard.sql`
Expected: `bendle_phone_guess_guard: all checks passed`. Also run `select pg_get_functiondef('public.guard_bendle_phone_answers'::regproc)` and confirm `security definer` and `search_path=public`.

Applying to production is a separate, owner-approved step after Task 16 passes (`supabase db push` or the MCP `apply_migration` against project `qwtbgusqfoypvehnungr`). Ship the migration before the client code that relies on it.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261002120000_bendle_phone_guess_guard.sql supabase/tests/bendle_phone_guess_guard.sql
git commit -m "feat(bendle): DB guard for one live-step guess per team, host clear RPC" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: TV reveal list

**Files:**
- Create: `client/src/components/display/slides/BendleRevealList.jsx`
- Test: `client/src/components/display/slides/BendleRevealList.test.jsx`

**Interfaces:**
- Consumes: `BendleResult[]` (Shared Types), `guessLabel` (T1), `SHINY_GOLD` (`client/src/lib/shinyGold.js`), `EASE_OUT` (`client/src/lib/easings.js`).
- Produces: `default function BendleRevealList({ results, theme })`. One column up to 10 teams, two columns above 10 (filled down column 1, then column 2). Font `2.2vmin` in two-column mode, `2.8vmin` otherwise. The list carries `data-columns="1|2"`; rows carry `data-correct="true|false"` and `aria-label`.

- [ ] **Step 1: Write the failing test**

```jsx
// @vitest-environment jsdom
// client/src/components/display/slides/BendleRevealList.test.jsx
import { describe, it, expect, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import BendleRevealList from './BendleRevealList.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const theme = { colors: { text: '#ffffff' }, fonts: { display: 'Boogaloo', body: 'DM Sans' } }
const team = (i, points, guess = { title: `Song ${i}`, artist: `Artist ${i}` }, stepIndex = 0) =>
  ({ teamId: `p${i}`, teamName: `Team ${i}`, guess, stepIndex: guess ? stepIndex : null, correct: points > 0, autoPoints: points, points, overridden: false })
let root, host
afterEach(() => { act(() => root?.unmount()); host?.remove() })
const render = results => {
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  act(() => root.render(<BendleRevealList results={results} theme={theme} />))
}

describe('<BendleRevealList>', () => {
  it('lists every team in the given order with guess, step, mark and points', () => {
    render([team(1, 30), team(2, 0, { title: 'Africa', artist: null }, 1), team(3, 0, null)])
    const rows = [...host.querySelectorAll('[role="listitem"]')]
    expect(rows.map(r => r.dataset.correct)).toEqual(['true', 'false', 'false'])
    expect(rows[0].textContent).toContain('Team 1')
    expect(rows[0].textContent).toContain('Song 1 - Artist 1')
    expect(rows[0].textContent).toContain('Step 1')
    expect(rows[0].textContent).toContain('+30')
    expect(rows[1].textContent).toContain('Africa')
    expect(rows[1].textContent).toContain('Step 2')
    expect(rows[2].textContent).toContain('No guess')
    expect(rows[2].textContent).not.toContain('Step')
  })
  // jsdom's style object drops grid properties, so columns are read from data-columns.
  it('one column at 10 teams, two columns (2.2vmin) above 10', () => {
    render(Array.from({ length: 10 }, (_, i) => team(i, 0)))
    const list = host.querySelector('[role="list"]')
    expect(list.dataset.columns).toBe('1')
    expect(list.style.fontSize).toBe('2.8vmin')
    act(() => root.render(<BendleRevealList results={Array.from({ length: 20 }, (_, i) => team(i, 0))} theme={theme} />))
    expect(list.dataset.columns).toBe('2')
    expect(list.style.fontSize).toBe('2.2vmin')
  })
  it('renders nothing harmful for an empty list', () => {
    render([])
    expect(host.querySelectorAll('[role="listitem"]')).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `VITE_SUPABASE_URL=http://127.0.0.1:9 VITE_SUPABASE_ANON_KEY=dummy npx vitest run client/src/components/display/slides/BendleRevealList.test.jsx`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the component**

```jsx
// client/src/components/display/slides/BendleRevealList.jsx
// Every team's Bendle guess on the TV after the host's A on step 3. Drawn
// from bendleResults on the step-3 slide (already sorted: points, then
// teams with a guess, then name). One column up to 10 teams, then two; text
// never below 2.2vmin (~16px at 1280x720).
import { motion, useReducedMotion } from 'framer-motion'
import { EASE_OUT } from '../../../lib/easings.js'
import { SHINY_GOLD } from '../../../lib/shinyGold.js'
import { guessLabel } from '../../../lib/bendleGuessScoring.js'

const ONE_COLUMN_MAX = 10

export default function BendleRevealList({ results, theme }) {
  const reduce = useReducedMotion()
  const rows = Array.isArray(results) ? results : []
  const twoCol = rows.length > ONE_COLUMN_MAX
  const perCol = Math.max(twoCol ? Math.ceil(rows.length / 2) : rows.length, 1)
  const text = theme?.colors?.text ?? '#ffffff'
  const bodyFont = `'${theme?.fonts?.body ?? 'DM Sans'}', 'DM Sans', sans-serif`
  return (
    <div
      role="list"
      aria-label="Every team's guess"
      data-columns={twoCol ? 2 : 1}
      style={{
        width: 'min(100%, 1700px)', display: 'grid', gridAutoFlow: 'column',
        gridTemplateRows: `repeat(${perCol}, auto)`,
        gridTemplateColumns: twoCol ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)',
        columnGap: '3vmin', rowGap: '0.6vmin',
        fontFamily: bodyFont, fontSize: twoCol ? '2.2vmin' : '2.8vmin',
        fontVariantNumeric: 'tabular-nums', lineHeight: 1.25,
      }}
    >
      {rows.map((r, i) => {
        const scored = r.points > 0
        const label = guessLabel(r.guess)
        return (
          <motion.div
            role="listitem"
            key={r.teamId}
            data-correct={scored ? 'true' : 'false'}
            aria-label={`${r.teamName}: ${label}, ${r.points} points`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.25, delay: reduce ? 0 : Math.min(i * 0.04, 0.6), ease: EASE_OUT }}
            style={{
              display: 'grid', gridTemplateColumns: '1.4em minmax(0, 1fr) minmax(0, 1.5fr) 4.2em 2.6em',
              alignItems: 'baseline', columnGap: '1.2vmin', color: scored ? text : `${text}b3`,
            }}
          >
            <span aria-hidden="true" style={{ color: scored ? SHINY_GOLD : `${text}80` }}>{scored ? '✓' : '✗'}</span>
            <span style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.teamName}</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontStyle: r.guess ? 'normal' : 'italic' }}>{label}</span>
            <span style={{ opacity: 0.8 }}>{r.guess && r.stepIndex != null ? `Step ${r.stepIndex + 1}` : ''}</span>
            <span style={{ color: scored ? SHINY_GOLD : `${text}80`, fontWeight: 700, textAlign: 'right' }}>{scored ? `+${r.points}` : '0'}</span>
          </motion.div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `VITE_SUPABASE_URL=http://127.0.0.1:9 VITE_SUPABASE_ANON_KEY=dummy npx vitest run client/src/components/display/slides/BendleRevealList.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/display/slides/BendleRevealList.jsx client/src/components/display/slides/BendleRevealList.test.jsx
git commit -m "feat(bendle): TV reveal list of every team's guess" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Host pane (N of M locked, lock/reveal buttons, per-team override, Unlock)

**Files:**
- Create: `client/src/components/host/BendleHostPanel.jsx`
- Test: `client/src/components/host/BendleHostPanel.test.jsx`

**Interfaces:**
- Consumes: `BENDLE_OVERRIDE_POINTS`, `guessLabel` (T1); `supabase` (`client/src/lib/supabase.js`).
- Produces: `default function BendleHostPanel({ slide, lockData, stepIds, showId, busy, error, onLock, onReveal, onUnlock, onOverride })`.
  - `slide`: the current step slide. `lockData`: the step-3 slide's `data` (or `{}`). `stepIds`: `string[]` from `bendleStepIds`.
  - `onOverride(teamId: string, points: 0|10|20|30)`.
  - Polls `phone_answers` (`select('team_id').in('slide_id', stepIds)`) and `teams` (`select('id').eq('show_id', showId)`) every 3 s until revealed; shows "`N` of `M` teams locked a guess".
  - Buttons only on step 3: "🔒 Lock Guesses" (not locked), "Reveal & Score (A)" (locked, not revealed), "🔁 Retry Scoring" (revealed with error). Unlock is two-tap (4 s window) because it deletes every team's guess.

- [ ] **Step 1: Write the failing test**

```jsx
// @vitest-environment jsdom
// client/src/components/host/BendleHostPanel.test.jsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

const responses = {
  phone_answers: { data: [{ team_id: 'p1' }, { team_id: 'p2' }, { team_id: 'p1' }], error: null },
  teams: { data: [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }], error: null },
}
const q = table => {
  const b = { select: () => b, in: () => b, eq: () => b, then: (res, rej) => Promise.resolve(responses[table]).then(res, rej) }
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
    await act(async () => button('Tap again').click())
    expect(p.onUnlock).toHaveBeenCalledTimes(1)
  })
  it('after reveal: per-team table with a 0/10/20/30 dropdown, no count, no main button', async () => {
    const p = await render({ slide: step(2), lockData: { bendleLocked: true, bendleRevealed: true, bendleResults: results } })
    expect(host.textContent).not.toContain('teams locked a guess')
    expect(button('Reveal & Score')).toBeUndefined()
    expect(host.textContent).toContain('Alpha: Africa - Toto · step 1')
    expect(host.textContent).toContain('Bravo: No guess')
    const select = host.querySelector('select[aria-label="Set Bravo points"]')
    expect([...select.options].map(o => o.value)).toEqual(['0', '10', '20', '30'])
    await act(async () => { select.value = '20'; select.dispatchEvent(new Event('change', { bubbles: true })) })
    expect(p.onOverride).toHaveBeenCalledWith('p2', 20)
  })
  it('a revealed slide with an error offers Retry Scoring', async () => {
    await render({ slide: step(2), error: 'Could not finish', lockData: { bendleLocked: true, bendleRevealed: true, bendleResults: results } })
    expect(button('Retry Scoring')).toBeTruthy()
    expect(host.textContent).toContain('Could not finish')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `VITE_SUPABASE_URL=http://127.0.0.1:9 VITE_SUPABASE_ANON_KEY=dummy npx vitest run client/src/components/host/BendleHostPanel.test.jsx`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the component**

```jsx
// client/src/components/host/BendleHostPanel.jsx
// LiveMode's lock/score pane for Bendle. The lock, results and overrides live
// on the step-3 slide (lockData); steps 1-2 only show how many teams have
// locked. Unlock deletes every team's guess, so it takes two taps.
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { BENDLE_OVERRIDE_POINTS, guessLabel } from '../../lib/bendleGuessScoring.js'

const POLL_MS = 3000
const CONFIRM_MS = 4000

export default function BendleHostPanel({ slide, lockData = {}, stepIds = [], showId, busy = false, error = null, onLock, onReveal, onUnlock, onOverride }) {
  const step = (slide?.data?.bendleStepIndex ?? 0) + 1
  const isLockStep = step === 3
  const locked = !!lockData.bendleLocked
  const revealed = !!lockData.bendleRevealed
  const results = Array.isArray(lockData.bendleResults) ? lockData.bendleResults : null
  const [counts, setCounts] = useState(null)
  const [confirmUnlock, setConfirmUnlock] = useState(false)
  const idsKey = stepIds.filter(Boolean).join('|')

  useEffect(() => {
    if (!showId || !idsKey || revealed) return undefined
    let dead = false
    async function poll() {
      try {
        const [answers, teams] = await Promise.all([
          supabase.from('phone_answers').select('team_id').in('slide_id', idsKey.split('|')),
          supabase.from('teams').select('id').eq('show_id', showId),
        ])
        if (dead || answers.error || teams.error) return
        setCounts({ locked: new Set((answers.data ?? []).map(r => r.team_id)).size, total: (teams.data ?? []).length })
      } catch { /* the next poll retries */ }
    }
    poll()
    const t = setInterval(poll, POLL_MS)
    return () => { dead = true; clearInterval(t) }
  }, [showId, idsKey, revealed])

  useEffect(() => {
    if (!confirmUnlock) return undefined
    const t = setTimeout(() => setConfirmUnlock(false), CONFIRM_MS)
    return () => clearTimeout(t)
  }, [confirmUnlock])

  const status = !isLockStep
    ? `Bendle step ${step} of 3. Phones are open; the lock happens on step 3.`
    : revealed
      ? 'Results are on the TV. Change a team’s points below if needed.'
      : locked
        ? 'Guesses locked. Press A to reveal and score.'
        : 'Step 3. Next plays the clip; the next Next locks guesses.'
  const mainLabel = busy ? 'Working…' : revealed ? '🔁 Retry Scoring' : locked ? 'Reveal & Score (A)' : '🔒 Lock Guesses'

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-5 shrink-0">
      <p className="text-xs text-gray-400 mb-1">{status}</p>
      {counts && !revealed && (
        <p className="text-sm font-semibold text-gray-700 mb-3">{counts.locked} of {counts.total} teams locked a guess</p>
      )}
      {isLockStep && (!revealed || error) && (
        <button
          onClick={locked ? onReveal : onLock}
          disabled={busy}
          className={`w-full py-3 rounded-xl border-2 font-semibold text-sm transition-[color,background-color,border-color,transform] duration-[120ms] active:scale-[0.97] ${
            busy ? 'border-gray-100 text-gray-300 cursor-not-allowed' : 'border-[#1a6b4a] text-[#1a6b4a] hover:bg-green-50'
          }`}
        >
          {mainLabel}
        </button>
      )}
      {error && <p className="text-xs text-red-600 mt-2 text-center">{error}</p>}
      {isLockStep && revealed && results && (
        <div className="mt-3 max-h-72 overflow-y-auto space-y-1.5">
          <p className="text-xs font-semibold text-gray-600">Team results · set points by hand</p>
          {results.map(r => (
            <div key={r.teamId} className="flex items-center justify-between gap-2 text-xs text-gray-700">
              <span className="truncate">
                {r.points > 0 ? '✓' : '✗'} {r.teamName}: {guessLabel(r.guess)}{r.guess && r.stepIndex != null ? ` · step ${r.stepIndex + 1}` : ''}
              </span>
              <select
                aria-label={`Set ${r.teamName} points`}
                value={r.points}
                disabled={busy}
                onChange={e => onOverride(r.teamId, Number(e.target.value))}
                className="rounded-lg border border-gray-200 px-2 py-1 text-gray-900"
              >
                {BENDLE_OVERRIDE_POINTS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          ))}
        </div>
      )}
      {isLockStep && locked && (
        <button
          onClick={() => {
            if (!confirmUnlock) { setConfirmUnlock(true); return }
            setConfirmUnlock(false)
            onUnlock()
          }}
          disabled={busy}
          className="w-full mt-2 py-2 rounded-lg border border-gray-200 text-gray-500 text-xs font-semibold hover:bg-gray-50 disabled:opacity-40"
        >
          {confirmUnlock ? 'Tap again: clears every team’s guess' : '🔓 Unlock — clear every guess and reopen phones'}
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `VITE_SUPABASE_URL=http://127.0.0.1:9 VITE_SUPABASE_ANON_KEY=dummy npx vitest run client/src/components/host/BendleHostPanel.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/host/BendleHostPanel.jsx client/src/components/host/BendleHostPanel.test.jsx
git commit -m "feat(bendle): host pane with locked count, lock/reveal, overrides, two-tap unlock" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Song editor prompts for aliases

**Files:**
- Modify: `client/src/components/host/BendleAdmin.jsx:16` (columns), `:200-245` (song row)
- Test: `client/src/components/host/BendleAdmin.test.jsx`

**Interfaces:**
- Consumes: `bendle_songs.aliases text[]`, `bendle_songs.answer`.
- Produces: an "＋ Add aliases" prompt (amber) on each ready song whose `aliases` is empty, and an "Aliases" editor on every ready song. Save writes `supabase.from('bendle_songs').update({ aliases }).eq('id', id)`.

- [ ] **Step 1: Write the failing test**

Extend the mock at `BendleAdmin.test.jsx:14-23` so `from()` also supports `update`, then add the test:

```jsx
let lastUpdate = null
vi.mock('../../lib/supabase.js', () => ({
  supabase: {
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: () => {},
    from: () => ({
      select: columns => { lastSelectColumns = columns; return { order: () => Promise.resolve({ data: songsFixture }) } },
      update: payload => ({ eq: (col, id) => { lastUpdate = { payload, col, id }; return Promise.resolve({ error: null }) } }),
    }),
  },
}))
```

```jsx
describe('<BendleAdmin> aliases', () => {
  const settle = () => act(async () => { await new Promise(r => setTimeout(r, 0)) })
  it('prompts for aliases on a ready song with none, and saves a comma list', async () => {
    songsFixture = [
      { id: 'bnd_1', title: 'Mr. Brightside', answer: 'Mr. Brightside', aliases: [], status: 'ready', artist: 'The Killers', drums_url: 'd', bass_url: 'b', other_url: 'o', start_offset_seconds: 0 },
      { id: 'bnd_2', title: 'Africa', answer: 'Africa', aliases: ['Africa (Toto)'], status: 'ready', artist: 'Toto', drums_url: 'd', bass_url: 'b', other_url: 'o', start_offset_seconds: 0 },
    ]
    const container = document.createElement('div'); document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => { root.render(<BendleAdmin onClose={() => {}} />) })
    await settle()
    expect(lastSelectColumns).toContain('aliases')
    const prompts = [...container.querySelectorAll('button')].filter(b => b.textContent.includes('Add aliases'))
    expect(prompts).toHaveLength(1)
    await act(async () => prompts[0].click())
    const input = container.querySelector('input[aria-label="Aliases for Mr. Brightside"]')
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Mister Brightside, Brightside')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => [...container.querySelectorAll('button')].find(b => b.textContent === 'Save aliases').click())
    expect(lastUpdate).toEqual({ payload: { aliases: ['Mister Brightside', 'Brightside'] }, col: 'id', id: 'bnd_1' })
    expect([...container.querySelectorAll('button')].filter(b => b.textContent.includes('Add aliases'))).toHaveLength(0)
    act(() => root.unmount()); container.remove()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `VITE_SUPABASE_URL=http://127.0.0.1:9 VITE_SUPABASE_ANON_KEY=dummy npx vitest run client/src/components/host/BendleAdmin.test.jsx`
Expected: FAIL (`lastSelectColumns` lacks `aliases`; no "Add aliases" button).

- [ ] **Step 3: Implement**

Change line 16 to add `answer, aliases`:

```js
const SONG_LIST_COLUMNS = 'id, title, answer, aliases, created_at, status, artist, error_text, drums_url, bass_url, other_url, guitar_url, guitar_status, guitar_error, start_offset_seconds, end_offset_seconds'
```

Add state next to `expandedId` (line 50): `const [aliasEditId, setAliasEditId] = useState(null)`.

Add above `export default function BendleAdmin`:

```jsx
// Phone guesses are graded against title, answer and aliases (bendleGuessScoring.js),
// so a song with alternate names ("Mr. Brightside" / "Mister Brightside") needs them listed.
function AliasEditor({ song, onSaved }) {
  const [text, setText] = useState((song.aliases ?? []).join(', '))
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)
  async function save() {
    setSaving(true); setErr(null)
    const aliases = text.split(',').map(a => a.trim()).filter(Boolean)
    const { error } = await supabase.from('bendle_songs').update({ aliases }).eq('id', song.id)
    setSaving(false)
    if (error) { setErr(error.message ?? 'Save failed'); return }
    onSaved(aliases)
  }
  return (
    <div className="flex flex-col gap-1.5 pl-1">
      <input aria-label={`Aliases for ${song.title}`} value={text} onChange={e => setText(e.target.value)}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="Other titles teams might type, comma-separated" />
      <div className="flex items-center gap-2">
        <button onClick={save} disabled={saving} className="text-xs font-semibold text-[#1a6b4a] disabled:opacity-40">{saving ? 'Saving…' : 'Save aliases'}</button>
        {err && <span className="text-xs text-red-600">{err}</span>}
      </div>
    </div>
  )
}
```

In the row (after the Scrub button block, before the failed-delete button, ~line 239) add:

```jsx
                    {s.status === 'ready' && (
                      <button
                        onClick={() => setAliasEditId(id => id === s.id ? null : s.id)}
                        className={`text-xs shrink-0 ${(s.aliases?.length ?? 0) === 0 ? 'text-amber-600 font-semibold' : 'text-gray-400 hover:text-gray-700'}`}
                        title="Phone guesses also match these titles"
                      >
                        {(s.aliases?.length ?? 0) === 0 ? '＋ Add aliases' : 'Aliases'}
                      </button>
                    )}
```

After `{expandedId === s.id && <BendleOffsetScrubber song={s} />}` (line 244) add:

```jsx
                  {aliasEditId === s.id && (
                    <AliasEditor song={s} onSaved={aliases => {
                      setSongs(prev => prev.map(x => x.id === s.id ? { ...x, aliases } : x))
                      setAliasEditId(null)
                    }} />
                  )}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `VITE_SUPABASE_URL=http://127.0.0.1:9 VITE_SUPABASE_ANON_KEY=dummy npx vitest run client/src/components/host/BendleAdmin.test.jsx`
Expected: PASS (old tests too).

- [ ] **Step 5: Commit**

```bash
git add client/src/components/host/BendleAdmin.jsx client/src/components/host/BendleAdmin.test.jsx
git commit -m "feat(bendle): song editor prompts for aliases used by phone grading" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Song list loader and search

**Files:**
- Create: `client/src/lib/bendleCatalog.js`
- Create: `client/src/lib/bendleCatalogVersion.js`
- Test: `client/src/lib/bendleCatalog.test.js`

**Interfaces:**
- Consumes: `normalizeText` (T1).
- Produces:
  - `BENDLE_CATALOG_URL: string|null` (in `bendleCatalogVersion.js`; `null` until the owner runs Task 7's script; T7's script rewrites the file).
  - `buildCatalogIndex(rows): CatalogIndexRow[]` (sorted rank desc)
  - `loadBendleCatalog(url = BENDLE_CATALOG_URL, fetcher = globalThis.fetch): Promise<CatalogIndexRow[]>` (cached per url; a failure is not cached; `null` url rejects)
  - `searchCatalog(index, query, limit = 8): { title, artist }[]` (every query word is a prefix of a word in the normalized title+artist; first `limit` by rank)

No `fuse.js` (already installed): fuzzy matching over ~55k rows on a phone is slower and ranks by score, not article count; word-prefix plus rank is the spec's rule.

- [ ] **Step 1: Write the failing test**

```js
// client/src/lib/bendleCatalog.test.js
import { describe, it, expect, vi } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { buildCatalogIndex, loadBendleCatalog, searchCatalog } from './bendleCatalog.js'
import { BENDLE_CATALOG_URL } from './bendleCatalogVersion.js'

const ROWS = [
  ['Mr. Brightside', 'The Killers', 60], ['Mr. Blue Sky', 'Electric Light Orchestra', 40], ['Mr. Blue', 'Catherine Feeny', 3],
  ['Bohemian Rhapsody', 'Queen', 90], ["Don't Stop Believin'", 'Journey', 55], ['Africa', 'Toto', 50], ['Africa', 'Weezer', 8],
  ['Hey Jude', 'The Beatles', 80], ['Hey Ya!', 'Outkast', 70], ["Sweet Child o' Mine", "Guns N' Roses", 65],
  ['Sweet Dreams (Are Made of This)', 'Eurythmics', 75], ['Billie Jean', 'Michael Jackson', 85], ["Livin' on a Prayer", 'Bon Jovi', 50],
  ['Wonderwall', 'Oasis', 60], ['Hotel California', 'Eagles', 70], ['Smells Like Teen Spirit', 'Nirvana', 80],
  ['Rolling in the Deep', 'Adele', 75], ['Sweet Caroline', 'Neil Diamond', 40], ['Shake It Off', 'Taylor Swift', 60],
  ['I Wanna Dance with Somebody (Who Loves Me)', 'Whitney Houston', 55], ['Dancing Queen', 'ABBA', 88], ['Halo', 'Beyoncé', 45],
]
const index = buildCatalogIndex(ROWS)

describe('searchCatalog: the 15 typed queries from the spec', () => {
  it.each([
    ['mr bright', 'Mr. Brightside'], ['bohemian rhaps', 'Bohemian Rhapsody'], ['dont stop believ', "Don't Stop Believin'"],
    ['africa toto', 'Africa|Toto'], ['mr blue sky', 'Mr. Blue Sky'], ['hey jude', 'Hey Jude'], ['sweet child', "Sweet Child o' Mine"],
    ['billie jean', 'Billie Jean'], ['livin on a prayer', "Livin' on a Prayer"], ['wonderwall', 'Wonderwall'],
    ['hotel california', 'Hotel California'], ['smells like teen', 'Smells Like Teen Spirit'], ['rolling in the deep', 'Rolling in the Deep'],
    ['sweet caroline', 'Sweet Caroline'], ['shake it off', 'Shake It Off'],
  ])('%s', (query, want) => {
    const [title, artist] = want.split('|')
    const [first] = searchCatalog(index, query)
    expect(first.title).toBe(title)
    if (artist) expect(first.artist).toBe(artist)
  })
  it('also finds accented and bracketed titles', () => {
    expect(searchCatalog(index, 'beyonce')[0].title).toBe('Halo')
    expect(searchCatalog(index, 'i wanna dance with')[0].title).toBe('I Wanna Dance with Somebody (Who Loves Me)')
  })
})

describe('ranking and limits', () => {
  it('orders matches by article count', () => {
    expect(searchCatalog(index, 'sweet').map(r => r.title)).toEqual(['Sweet Dreams (Are Made of This)', "Sweet Child o' Mine", 'Sweet Caroline'])
    expect(searchCatalog(index, 'africa').map(r => r.artist)).toEqual(['Toto', 'Weezer'])
    expect(searchCatalog(index, 'queen').map(r => r.title)).toEqual(['Bohemian Rhapsody', 'Dancing Queen'])
  })
  it('caps at the limit (8 by default) and ignores empty queries', () => {
    // 's' matches exactly 8 fixture rows (sky, stop, sweet x3, spirit, swift, somebody)
    expect(searchCatalog(index, 's')).toHaveLength(8)
    expect(searchCatalog(index, 's', 3)).toHaveLength(3)
    expect(searchCatalog(index, '   ')).toEqual([])
    expect(searchCatalog(index, '!!!')).toEqual([])
  })
  it('returns only title and artist', () => {
    expect(searchCatalog(index, 'wonderwall')[0]).toEqual({ title: 'Wonderwall', artist: 'Oasis' })
  })
})

describe('loadBendleCatalog', () => {
  it('fetches once per url and builds the index', async () => {
    const fetcher = vi.fn(async () => ({ ok: true, json: async () => ({ version: 'v1', rows: ROWS }) }))
    const a = await loadBendleCatalog('/bendle-catalog.test1.json', fetcher)
    const b = await loadBendleCatalog('/bendle-catalog.test1.json', fetcher)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(a).toBe(b)
    expect(a[0].title).toBe('Bohemian Rhapsody')
  })
  it('does not cache a failure', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ rows: ROWS }) })
    await expect(loadBendleCatalog('/bendle-catalog.test2.json', fetcher)).rejects.toThrow('HTTP 500')
    await expect(loadBendleCatalog('/bendle-catalog.test2.json', fetcher)).resolves.toHaveLength(ROWS.length)
  })
  it('rejects when no catalog has been built yet', async () => {
    await expect(loadBendleCatalog(null)).rejects.toThrow(/no song list/)
  })
})

// Runs only once the owner has built and committed the real file (Task 7).
const realPath = BENDLE_CATALOG_URL ? new URL(`../../../public${BENDLE_CATALOG_URL}`, import.meta.url) : null
describe.skipIf(!realPath || !existsSync(realPath))('real catalog', () => {
  it('finds the spec queries in the top 8', () => {
    const real = buildCatalogIndex(JSON.parse(readFileSync(realPath, 'utf8')).rows)
    for (const [q, title] of [['mr bright', 'Mr. Brightside'], ['bohemian rhaps', 'Bohemian Rhapsody'], ['africa toto', 'Africa'], ['mr blue sky', 'Mr. Blue Sky'], ['hey jude', 'Hey Jude']]) {
      expect(searchCatalog(real, q).map(r => r.title), q).toContain(title)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `VITE_SUPABASE_URL=http://127.0.0.1:9 VITE_SUPABASE_ANON_KEY=dummy npx vitest run client/src/lib/bendleCatalog.test.js`
Expected: FAIL, modules not found.

- [ ] **Step 3: Write the modules**

```js
// client/src/lib/bendleCatalogVersion.js
// GENERATED by scripts/build-bendle-catalog.mjs — do not edit by hand.
// null until the owner builds the song list: phones then offer only "Use what I typed".
export const BENDLE_CATALOG_URL = null
```

```js
// client/src/lib/bendleCatalog.js
// The Bendle song list on the phone: one static file built from Wikidata
// (CC0) by scripts/build-bendle-catalog.mjs, loaded once per page and
// searched locally. No music service is called at show time.
import { normalizeText } from './bendleGuessScoring.js'
import { BENDLE_CATALOG_URL } from './bendleCatalogVersion.js'

const cache = new Map() // url -> Promise<CatalogIndexRow[]>

export function buildCatalogIndex(rows) {
  return (rows ?? [])
    .filter(r => Array.isArray(r) && typeof r[0] === 'string')
    .map(([title, artist, rank]) => ({
      title,
      artist: typeof artist === 'string' && artist ? artist : null,
      rank: Number(rank) || 0,
      words: `${normalizeText(title)} ${normalizeText(artist)}`.split(' ').filter(Boolean),
    }))
    .sort((a, b) => b.rank - a.rank)
}

export function loadBendleCatalog(url = BENDLE_CATALOG_URL, fetcher = globalThis.fetch) {
  if (!url) return Promise.reject(new Error('no song list built yet'))
  if (!cache.has(url)) {
    const p = Promise.resolve()
      .then(() => fetcher(url))
      .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json() })
      .then(body => buildCatalogIndex(body?.rows))
    p.catch(() => cache.delete(url))
    cache.set(url, p)
  }
  return cache.get(url)
}

// ponytail: linear scan of ~55k rows per keystroke (a few ms on a phone,
// behind a 100 ms debounce); add a first-letter bucket if it ever lags.
export function searchCatalog(index, query, limit = 8) {
  const terms = normalizeText(query).split(' ').filter(Boolean)
  if (terms.length === 0) return []
  const out = []
  for (const row of index ?? []) {
    if (terms.every(t => row.words.some(w => w.startsWith(t)))) {
      out.push({ title: row.title, artist: row.artist })
      if (out.length >= limit) break
    }
  }
  return out
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `VITE_SUPABASE_URL=http://127.0.0.1:9 VITE_SUPABASE_ANON_KEY=dummy npx vitest run client/src/lib/bendleCatalog.test.js`
Expected: PASS ("real catalog" skipped).

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/bendleCatalog.js client/src/lib/bendleCatalogVersion.js client/src/lib/bendleCatalog.test.js
git commit -m "feat(bendle): phone song list loader and word-prefix search" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Song list build script (writing it; running it is owner-only)

**Files:**
- Create: `scripts/build-bendle-catalog.mjs`
- Test: `scripts/build-bendle-catalog.test.mjs` (picked up by `vitest.config.js:11`, `scripts/*.test.mjs`)

**Interfaces:**
- Consumes: `normalizeText` (T1). The query shape from the spike (`scratchpad/all.rq`: `?s wdt:P31 ?t ; wdt:P175 ?p ; wikibase:sitelinks ?l . FILTER(?l >= 3)` + English labels), split to one item type per request.
- Produces: `sparqlFor(type)`, `userAgent(contact)`, `buildRows(bindings)`, `catalogFile(rows, built)`, `checkCatalog({ rows, gzipBytes })`, `versionModule(name)`, `main({ argv, env, fetcher })`; when run (not dry): writes `public/bendle-catalog.<10-hex>.json`, deletes older `public/bendle-catalog.*.json`, rewrites `client/src/lib/bendleCatalogVersion.js`.

**Running it against live Wikidata and committing the generated file are a separate step the owner runs** (it sends his contact info to Wikidata and changes what phones download). The implementer writes and tests the script with fake fetchers only.

- [ ] **Step 1: Write the failing test**

```js
// scripts/build-bendle-catalog.test.mjs
import { describe, it, expect, vi } from 'vitest'
import { gunzipSync, gzipSync } from 'node:zlib'
import { sparqlFor, userAgent, buildRows, catalogFile, checkCatalog, versionModule, main, ITEM_TYPES, MIN_ROWS } from './build-bendle-catalog.mjs'

const b = (qid, title, artist, l) => ({ s: { value: `http://www.wikidata.org/entity/${qid}` }, title: { value: title }, artist: { value: artist }, l: { value: String(l) } })

describe('build-bendle-catalog', () => {
  it('one item type per query, performer and 3+ sitelinks, English labels', () => {
    const q = sparqlFor('Q7366')
    expect(q).toContain('wdt:P31 wd:Q7366')
    expect(q).toContain('wdt:P175 ?p')
    expect(q).toContain('FILTER(?l >= 3)')
    expect(q).toContain('LANG(?title) = "en"')
    expect(ITEM_TYPES).toEqual(['Q7366', 'Q134556', 'Q105543609', 'Q55850593'])
  })
  it('refuses to run without contact info for the User-Agent', () => {
    expect(() => userAgent('')).toThrow(/BENDLE_CATALOG_CONTACT/)
    expect(userAgent('me@example.com')).toBe('TriviaOS-BendleCatalog/1.0 (me@example.com)')
  })
  it('joins performers per item, dedupes on normalized title+artist keeping the higher rank, sorts by rank', () => {
    const rows = buildRows([
      b('Q1', 'Under Pressure', 'Queen', 30), b('Q1', 'Under Pressure', 'David Bowie', 30),
      b('Q2', 'Africa', 'Toto', 50), b('Q3', 'Africa', 'Toto', 12), // duplicate song, lower rank
      b('Q4', 'Africa', 'Weezer', 8), b('Q5', '(Remix)', 'Nobody', 99), b('Q6', '', 'Nobody', 99),
    ])
    expect(rows).toEqual([['Africa', 'Toto', 50], ['Under Pressure', 'David Bowie & Queen', 30], ['Africa', 'Weezer', 8]])
  })
  it('names the file by a content hash and measures the gzip size', () => {
    const file = catalogFile([['Africa', 'Toto', 50]], '2026-10-02')
    expect(file.name).toMatch(/^bendle-catalog\.[0-9a-f]{10}\.json$/)
    expect(JSON.parse(file.json)).toEqual({ version: file.version, source: 'Wikidata (CC0)', built: '2026-10-02', rows: [['Africa', 'Toto', 50]] })
    expect(gunzipSync(gzipSync(file.json)).toString()).toBe(file.json)
    expect(file.gzipBytes).toBeGreaterThan(0)
    expect(catalogFile([['Africa', 'Toto', 50]], '2026-11-01').version).toBe(file.version) // date does not change the hash
  })
  it('size and row-count checks', () => {
    expect(checkCatalog({ rows: new Array(MIN_ROWS).fill(0), gzipBytes: 600_000 })).toEqual([])
    expect(checkCatalog({ rows: [], gzipBytes: 2_000_000 })).toHaveLength(2)
  })
  it('version module points at the file', () => {
    expect(versionModule('bendle-catalog.abc.json')).toContain("export const BENDLE_CATALOG_URL = '/bendle-catalog.abc.json'")
  })
  it('--dry-run queries each type one at a time and writes nothing', async () => {
    let inFlight = 0, maxInFlight = 0
    const many = Array.from({ length: MIN_ROWS }, (_, i) => b(`Q${i + 10}`, `Song ${i}`, `Artist ${i}`, 3 + (i % 50)))
    const fetcher = vi.fn(async (url, init) => {
      inFlight++; maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise(r => setTimeout(r, 1)); inFlight--
      expect(init.headers['User-Agent']).toBe('TriviaOS-BendleCatalog/1.0 (me@example.com)')
      const type = new URLSearchParams(init.body).get('query').match(/wd:(Q\d+)/)[1]
      return { ok: true, json: async () => ({ results: { bindings: type === 'Q7366' ? many : [] } }) }
    })
    const file = await main({ argv: ['--dry-run'], env: { BENDLE_CATALOG_CONTACT: 'me@example.com' }, fetcher })
    expect(fetcher).toHaveBeenCalledTimes(4)
    expect(maxInFlight).toBe(1)
    expect(JSON.parse(file.json).rows).toHaveLength(MIN_ROWS)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `VITE_SUPABASE_URL=http://127.0.0.1:9 VITE_SUPABASE_ANON_KEY=dummy npx vitest run scripts/build-bendle-catalog.test.mjs`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the script**

```js
// scripts/build-bendle-catalog.mjs
// Builds the Bendle phone song list from Wikidata (CC0): songs, singles,
// musical works and recordings with a performer (P175) and 3+ sitelinks.
// OWNER-RUN ONLY (sends contact info to Wikidata, changes what phones load):
//   BENDLE_CATALOG_CONTACT='you@example.com' node scripts/build-bendle-catalog.mjs --dry-run
//   BENDLE_CATALOG_CONTACT='you@example.com' node scripts/build-bendle-catalog.mjs
// Writes public/bendle-catalog.<hash>.json, deletes older ones, and points
// client/src/lib/bendleCatalogVersion.js at the new file. Rerun a few times a year.
import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { normalizeText } from '../client/src/lib/bendleGuessScoring.js'

export const ITEM_TYPES = ['Q7366', 'Q134556', 'Q105543609', 'Q55850593'] // song, single, musical work, recording
export const MIN_SITELINKS = 3
export const MIN_ROWS = 20_000
export const MAX_GZIP_BYTES = 1_200_000
const ENDPOINT = 'https://query.wikidata.org/sparql'
const PUBLIC_DIR = new URL('../public/', import.meta.url)
const VERSION_FILE = new URL('../client/src/lib/bendleCatalogVersion.js', import.meta.url)

export function sparqlFor(type) {
  return `SELECT ?s ?title ?artist ?l WHERE {
  ?s wdt:P31 wd:${type} ; wdt:P175 ?p ; wikibase:sitelinks ?l . FILTER(?l >= ${MIN_SITELINKS})
  ?s rdfs:label ?title . FILTER(LANG(?title) = "en")
  ?p rdfs:label ?artist . FILTER(LANG(?artist) = "en")
}`
}

export function userAgent(contact) {
  const c = String(contact ?? '').trim()
  if (!c) throw new Error('Set BENDLE_CATALOG_CONTACT (an email or URL where Wikidata can reach you); their User-Agent policy requires it.')
  return `TriviaOS-BendleCatalog/1.0 (${c})`
}

// bindings: SPARQL JSON rows from every type query. One row per performer;
// rank = sitelinks (Wikipedia article count).
export function buildRows(bindings) {
  const byItem = new Map()
  for (const b of bindings ?? []) {
    const qid = b.s?.value?.split('/').pop()
    const title = b.title?.value?.trim()
    const artist = b.artist?.value?.trim()
    if (!qid || !title || !artist) continue
    const item = byItem.get(qid) ?? { title, artists: new Set(), rank: 0 }
    item.artists.add(artist)
    item.rank = Math.max(item.rank, Number(b.l?.value) || 0)
    byItem.set(qid, item)
  }
  const byKey = new Map()
  for (const item of byItem.values()) {
    if (!normalizeText(item.title)) continue
    const artist = [...item.artists].sort().join(' & ')
    const key = `${normalizeText(item.title)}|${normalizeText(artist)}`
    const prev = byKey.get(key)
    if (!prev || item.rank > prev[2]) byKey.set(key, [item.title, artist, item.rank])
  }
  return [...byKey.values()].sort((a, b) => b[2] - a[2] || a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]))
}

export function catalogFile(rows, built = new Date().toISOString().slice(0, 10)) {
  const version = createHash('sha256').update(JSON.stringify(rows)).digest('hex').slice(0, 10)
  const json = JSON.stringify({ version, source: 'Wikidata (CC0)', built, rows })
  return { version, name: `bendle-catalog.${version}.json`, json, gzipBytes: gzipSync(json).length }
}

export function checkCatalog({ rows, gzipBytes }) {
  const problems = []
  if (rows.length < MIN_ROWS) problems.push(`only ${rows.length} rows (expected at least ${MIN_ROWS})`)
  if (gzipBytes > MAX_GZIP_BYTES) problems.push(`gzipped size ${gzipBytes} B is over ${MAX_GZIP_BYTES} B`)
  return problems
}

export function versionModule(name) {
  return `// GENERATED by scripts/build-bendle-catalog.mjs — do not edit by hand.\n// null until the owner builds the song list: phones then offer only "Use what I typed".\nexport const BENDLE_CATALOG_URL = ${name ? `'/${name}'` : 'null'}\n`
}

async function runQuery(type, ua, fetcher) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetcher(ENDPOINT, {
      method: 'POST',
      headers: { 'User-Agent': ua, Accept: 'application/sparql-results+json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ query: sparqlFor(type) }).toString(),
      signal: AbortSignal.timeout(90_000),
    })
    if (res.ok) return (await res.json()).results.bindings
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      const wait = Number(res.headers?.get?.('retry-after')) || 30 * attempt
      console.warn(`${type}: HTTP ${res.status}, waiting ${wait}s`)
      await new Promise(r => setTimeout(r, wait * 1000))
      continue
    }
    throw new Error(`${type}: HTTP ${res.status}`)
  }
}

export async function main({ argv = process.argv.slice(2), env = process.env, fetcher = globalThis.fetch } = {}) {
  const dryRun = argv.includes('--dry-run')
  const ua = userAgent(env.BENDLE_CATALOG_CONTACT)
  const bindings = []
  for (const type of ITEM_TYPES) { // one request at a time, never in parallel
    const rows = await runQuery(type, ua, fetcher)
    console.log(`${type}: ${rows.length} rows`)
    bindings.push(...rows)
  }
  const rows = buildRows(bindings)
  const file = catalogFile(rows)
  console.log(`${rows.length} songs, ${file.json.length} B raw, ${file.gzipBytes} B gzipped -> public/${file.name}`)
  const problems = checkCatalog({ rows, gzipBytes: file.gzipBytes })
  if (problems.length) throw new Error(`Catalog check failed: ${problems.join('; ')}`)
  if (dryRun) { console.log('--dry-run: nothing written'); return file }
  for (const old of readdirSync(PUBLIC_DIR).filter(f => /^bendle-catalog\..+\.json$/.test(f))) unlinkSync(new URL(old, PUBLIC_DIR))
  writeFileSync(new URL(file.name, PUBLIC_DIR), file.json)
  writeFileSync(VERSION_FILE, versionModule(file.name))
  return file
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(e => { console.error(e.message); process.exit(1) })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `VITE_SUPABASE_URL=http://127.0.0.1:9 VITE_SUPABASE_ANON_KEY=dummy npx vitest run scripts/build-bendle-catalog.test.mjs`
Expected: PASS. Do NOT run the script against Wikidata.

- [ ] **Step 5: Commit**

```bash
git add scripts/build-bendle-catalog.mjs scripts/build-bendle-catalog.test.mjs
git commit -m "feat(bendle): Wikidata song list build script (owner-run)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6 (OWNER, separate session): build and commit the real file**

```bash
cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os
BENDLE_CATALOG_CONTACT='<your email>' node scripts/build-bendle-catalog.mjs --dry-run   # expect ~50-60k songs, ~0.6 MB gzipped
BENDLE_CATALOG_CONTACT='<your email>' node scripts/build-bendle-catalog.mjs
VITE_SUPABASE_URL=http://127.0.0.1:9 VITE_SUPABASE_ANON_KEY=dummy npx vitest run client/src/lib/bendleCatalog.test.js   # "real catalog" now runs
git add public/bendle-catalog.*.json client/src/lib/bendleCatalogVersion.js
git commit -m "chore(bendle): song list build <date>"
```
Then spot-check the next 20 Bendle picks by typing each into a phone board.

---

### Task 8: Stepping — Bendle mechanic, `lockHere`, group-aware entry and replay protection

**Files:**
- Modify: `client/src/lib/slideStepping.js` (imports `:24`, `withEntryState :126-197`, `PHONE_MECHANICS :361-394`, `isScoredOrStarted :399-403`, `pendingLockPhase :412-428`, `pendingReveal :447-457`, `computeNextStep :603`, `computeJumpStep :679-691`)
- Test: `client/src/lib/slideStepping.bendle.test.js`

**Interfaces:**
- Consumes: `bendleLockSlide` (T1), `isBendleShiny` (`shinySeries.js:129`).
- Produces:
  - `PHONE_MECHANICS.bendle = { guard: isBendleShiny, lockHere: d => d.bendleStepIndex === 2, lockFields: ['bendleLocked'], revealField: 'bendleRevealed', clearFields: ['bendleResults', 'bendleLockedAt'], freshClearFields: ['bendleOverrides'] }`
  - optional `lockHere(data): boolean` on any mechanic: when present and false, `pendingLockPhase` and `pendingReveal` return `null`.
  - `lockSlideFor(slides, slide): Slide` (step-3 sibling for Bendle, else `slide`)
  - `liveSlideOpenForPhones(slides, slide): boolean`, `phonePhaseKey(slides, slide): string` (for Join)
  - `REVEAL_FIELD.bendle === 'bendleRevealed'`, `unlockPatch('bendle', data)` = `{ bendleLocked: false, bendleRevealed: false, bendleResults: null, bendleLockedAt: null }` (no code change; follows from the entry).

Why the group-aware changes: the lock lives on step 3, so today's `withEntryState` (which only looks at the entered slide's own fields, `:141-161`) would neither clear a stale rehearsal lock when entering step 1, nor protect a locked step 3 when Next re-enters it from step 2 (`computeNextStep :603` protects only fully locked+revealed slides). A stale `bendleLocked` would also make the DB trigger refuse every step-1 guess.

`remoteFix.js` needs no change: it reads the current slide's own last lock field (`remoteFix.js:33-35`), and only step 3 ever carries `bendleLocked`, so steps 1-2 already answer `nothing-locked` / `not-locked`. T9 pins that with a test.

- [ ] **Step 1: Write the failing test**

```js
// client/src/lib/slideStepping.bendle.test.js
import { describe, it, expect } from 'vitest'
import {
  PHONE_MECHANICS, REVEAL_FIELD, pendingLockPhase, pendingReveal, unlockPatch, withEntryState,
  computeNextStep, computePrevStep, computeJumpStep, lockSlideFor, liveSlideOpenForPhones, phonePhaseKey,
} from './slideStepping.js'

const noTeams = async () => 0
const bendle = (id, order, step, extra = {}) => ({ id, order, type: 'question', roundId: 'r1',
  data: { isShiny: true, shinyInputSchema: { type: 'bendle' }, shinyGroupId: 'g1', bendleStepIndex: step, bendleSongId: 'bnd_1', ...extra } })
const plain = (id, order) => ({ id, order, type: 'question', roundId: 'r1', data: { text: id } })
const title = { id: 't', order: 1, type: 'shiny-title', roundId: 'r1', data: { isShiny: true, shinyGroupId: 'g1' } }
const show = (slides, idx) => ({ slides, currentSlideIndex: idx, currentSlideId: [...slides].sort((a, b) => a.order - b.order)[idx].id })
const dataOf = (patch, id) => patch.slides.find(s => s.id === id).data
const LOCKED = { bendleLocked: true, bendleLockedAt: '2026-10-02T20:00:00Z' }
const DONE = { ...LOCKED, bendleRevealed: true, bendleResults: [{ teamId: 'p1', points: 30 }], bendleOverrides: { p1: 30 } }
const deck = (s3extra = {}) => [plain('q0', 0), title, bendle('s1', 2, 0), bendle('s2', 3, 1), bendle('s3', 4, 2, s3extra), plain('q5', 5)]

describe('PHONE_MECHANICS.bendle', () => {
  it('is registered with lockHere on step 3 only', () => {
    const m = PHONE_MECHANICS.bendle
    expect(m.lockFields).toEqual(['bendleLocked'])
    expect(m.revealField).toBe('bendleRevealed')
    expect(m.clearFields).toEqual(['bendleResults', 'bendleLockedAt'])
    expect(m.freshClearFields).toEqual(['bendleOverrides'])
    expect([0, 1, 2].map(i => m.lockHere({ bendleStepIndex: i }))).toEqual([false, false, true])
    expect(REVEAL_FIELD.bendle).toBe('bendleRevealed')
  })
  it('lock and reveal are pending only on step 3', () => {
    const [s1, s2, s3] = deck().slice(2, 5)
    expect([s1, s2, s3].map(pendingLockPhase)).toEqual([null, null, 'bendle'])
    expect(pendingLockPhase(bendle('s3', 4, 2, LOCKED))).toBe(null)
    expect(pendingReveal(bendle('s1', 2, 0, LOCKED))).toBe(null) // even a stray flag on step 1
    expect(pendingReveal(bendle('s3', 4, 2, LOCKED))).toBe('bendle')
    expect(pendingReveal(bendle('s3', 4, 2, DONE))).toBe(null)
  })
  it('unlockPatch clears lock, reveal, results and lock time, keeps overrides', () => {
    expect(unlockPatch('bendle', DONE)).toEqual({ bendleLocked: false, bendleRevealed: false, bendleResults: null, bendleLockedAt: null })
  })
  it('lockSlideFor points every step at step 3', () => {
    const slides = deck()
    expect(lockSlideFor(slides, slides[2]).id).toBe('s3')
    expect(lockSlideFor(slides, slides[4]).id).toBe('s3')
    expect(lockSlideFor(slides, slides[0]).id).toBe('q0')
  })
})

describe('entry and replay protection', () => {
  it('fresh entry into step 1 clears a stale lock on step 3, overrides included', async () => {
    const patch = await computeNextStep(show(deck(DONE).map(s => s.id === 's3' ? { ...s, data: { ...s.data, bendleRevealed: false } } : s), 1), noTeams)
    expect(patch.current_slide_id).toBe('s1')
    expect(dataOf(patch, 's3')).toMatchObject({ bendleLocked: false, bendleResults: null, bendleLockedAt: null, bendleOverrides: null })
  })
  it('a fully finished Bendle re-entered from the title keeps its results', async () => {
    const patch = await computeNextStep(show(deck(DONE), 1), noTeams)
    expect(dataOf(patch, 's3')).toMatchObject({ bendleLocked: true, bendleRevealed: true })
  })
  it('replaying step 2 then Next back onto a locked step 3 keeps the lock', async () => {
    const back = await computePrevStep(show(deck(LOCKED), 4), noTeams)
    expect(back.current_slide_id).toBe('s2')
    expect(dataOf(back, 's3').bendleLocked).toBe(true)
    const fwd = await computeNextStep({ slides: back.slides, currentSlideIndex: 3, currentSlideId: 's2' }, noTeams)
    expect(fwd.current_slide_id).toBe('s3')
    expect(dataOf(fwd, 's3')).toMatchObject({ bendleLocked: true, bendleLockedAt: LOCKED.bendleLockedAt })
  })
  it('Prev from step 2 to step 1 keeps a locked step 3', async () => {
    const back = await computePrevStep(show(deck(LOCKED), 3), noTeams)
    expect(dataOf(back, 's3').bendleLocked).toBe(true)
  })
  it('jump: within the group protects; from outside and unvisited resets', () => {
    const fromS1 = computeJumpStep(show(deck(LOCKED), 2), 4, { furthest: 2 })
    expect(dataOf(fromS1, 's3').bendleLocked).toBe(true)
    const fromStart = computeJumpStep(show(deck(LOCKED), 0), 4, { furthest: 0 })
    expect(dataOf(fromStart, 's3').bendleLocked).toBe(false)
    const visited = computeJumpStep(show(deck(LOCKED), 5), 2, { furthest: 5 })
    expect(dataOf(visited, 's3').bendleLocked).toBe(true)
  })
  it('goLiveFrom-style protected entry into step 1 keeps a locked group', () => {
    const slides = deck(LOCKED)
    const out = withEntryState(slides, slides[2], { currentPart: 0, protectInProgress: true })
    expect(out.find(s => s.id === 's3').data.bendleLocked).toBe(true)
  })
})

describe('phone helpers for Join', () => {
  it('phones stay open on steps 1-2 until the group locks, then close on every step', () => {
    const open = deck()
    expect([2, 3, 4].map(i => liveSlideOpenForPhones(open, open[i]))).toEqual([true, true, true])
    const locked = deck(LOCKED)
    expect([2, 3, 4].map(i => liveSlideOpenForPhones(locked, locked[i]))).toEqual([false, false, false])
    expect(liveSlideOpenForPhones(open, open[0])).toBe(false)
  })
  it('the phase key changes with the slide and with the group lock', () => {
    const open = deck(), locked = deck(LOCKED)
    expect(phonePhaseKey(open, open[2])).not.toBe(phonePhaseKey(open, open[3]))
    expect(phonePhaseKey(open, open[3])).not.toBe(phonePhaseKey(locked, locked[3]))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `VITE_SUPABASE_URL=http://127.0.0.1:9 VITE_SUPABASE_ANON_KEY=dummy npx vitest run client/src/lib/slideStepping.bendle.test.js`
Expected: FAIL (`PHONE_MECHANICS.bendle` undefined; `lockSlideFor` not exported).

- [ ] **Step 3: Implement**

3a. Imports, line 24: add `isBendleShiny` to the `shinySeries.js` list, and add below it:

```js
import { bendleLockSlide } from './bendleGuessScoring.js'
```

3b. Replace `withEntryState` lines 141-161 (from `const protectLockedFlags` through the end of the `if (slide.data?.isShiny && !protectLockedFlags) { ... }` block) with:

```js
  // Bendle keeps its lock on the group's step-3 slide (lockSlideFor), so
  // entering ANY step judges and clears that slide's flags, not its own.
  const lockSlide = lockSlideFor(slides, slide)
  const protectLockedFlags = protectInProgress &&
    Object.values(PHONE_MECHANICS).some(m => m.lockFields.some(f => lockSlide.data?.[f]))
  // Fresh entry clears stale phone-scored lock+reveal flags (2026-08-31, ...
  // [keep the existing comment block here unchanged]
  const lockPatch = {}
  if (lockSlide.data?.isShiny && !protectLockedFlags) {
    for (const m of Object.values(PHONE_MECHANICS)) {
      for (const f of m.lockFields) {
        if (lockSlide.data?.[f]) lockPatch[f] = false
      }
      if (lockSlide.data?.[m.revealField]) lockPatch[m.revealField] = false
      for (const f of [...(m.clearFields ?? []), ...(m.freshClearFields ?? [])]) {
        if (lockSlide.data?.[f] != null) lockPatch[f] = null
      }
    }
  }
```

and replace the tail (lines 195-196):

```js
  if (Object.keys(patch).length === 0) return slides
  return patchSlideData(slides, slide.id, patch)
```

with:

```js
  let out = slides
  if (Object.keys(lockPatch).length > 0) out = patchSlideData(out, lockSlide.id, lockPatch)
  if (Object.keys(patch).length > 0) out = patchSlideData(out, slide.id, patch)
  return out
```

3c. In the comment above `PHONE_MECHANICS` (lines 365-368), replace the stale sentence "Bendle shipped without its lockFields being added to withEntryState's clear list (2026-09-05 whole-branch audit, C1) — a rehearsal-locked Bendle slide stayed locked live, silently." with "A mechanic once shipped without its lockFields in withEntryState's clear list (2026-09-05 audit, C1) and stayed locked live."

Add the entry after `movieChain` (line 393), plus the `lockHere` note:

```js
  // Bendle (2026-10-02): three step slides, one guess per team for the
  // group. Lock, results and overrides live on the step-3 slide only
  // (lockHere), so Next on steps 1-2 only advances, the countdown runs once
  // on step 3, and A refuses until then. guard stays true on all three steps
  // so Join, the remote and the host pane keep working. lockSlideFor finds
  // the step-3 slide from any step.
  bendle:   { guard: isBendleShiny, lockHere: d => d.bendleStepIndex === 2, lockFields: ['bendleLocked'], revealField: 'bendleRevealed', clearFields: ['bendleResults', 'bendleLockedAt'],
            // fresh entry only; Unlock keeps the host's per-team points
            freshClearFields: ['bendleOverrides'] },
```

3d. After `PHONE_MECHANICS`, add:

```js
// The slide that holds a mechanic's lock state: the slide itself, or for
// Bendle the group's step-3 slide (falls back to itself without a group).
export function lockSlideFor(slides, slide) {
  if (!slide?.data || !isBendleShiny(slide.data)) return slide
  return bendleLockSlide(slides, slide) ?? slide
}

function sameBendleGroup(a, b) {
  const g = a?.data?.shinyGroupId
  return !!g && g === b?.data?.shinyGroupId && isBendleShiny(a.data) && !!b.data && isBendleShiny(b.data)
}

// Join.jsx: phones are pinned to the board while the live slide still takes
// answers (last lock field unset on the lock slide).
export function liveSlideOpenForPhones(slides, slide) {
  if (slide?.type !== 'question' || !slide.data?.isShiny) return false
  const lockData = lockSlideFor(slides, slide)?.data ?? {}
  return Object.values(PHONE_MECHANICS).some(m => m.guard(slide.data) && !lockData[m.lockFields[m.lockFields.length - 1]])
}

// Join.jsx: resets "this team answered" whenever the slide or a lock flag changes.
export function phonePhaseKey(slides, slide) {
  const lockData = lockSlideFor(slides, slide)?.data
  return [slide?.id, ...Object.values(PHONE_MECHANICS).flatMap(m => m.lockFields.map(f => lockData?.[f]))].join(':')
}
```

3e. `isScoredOrStarted` (line 399) becomes group-aware:

```js
function isScoredOrStarted(slides, slide) {
  const d = lockSlideFor(slides, slide)?.data
  if (!d) return false
  return Object.values(PHONE_MECHANICS).some(m => m.lockFields.every(f => d[f]) && d[m.revealField])
}
```

3f. `pendingLockPhase` (after `if (!m.guard(data)) continue`, line 416) and `pendingReveal` (after `if (key === 'drop') return null`, line 452) each get:

```js
    // A mechanic that locks on one slide of a group (Bendle: step 3) has no
    // lock phase and nothing to reveal on its other slides.
    if (m.lockHere && !m.lockHere(data)) return null
```

3g. `computeNextStep` line 603:

```js
  const newSlides = withEntryState(bakedSlides, resolvedNext, { currentPart: 0, protectInProgress: isScoredOrStarted(bakedSlides, resolvedNext) || sameBendleGroup(curSlide, resolvedNext) })
```

3h. `computeJumpStep` line 686:

```js
    slides: withEntryState(slides, resolved, { currentPart: 0, protectInProgress: visited || isScoredOrStarted(slides, resolved) || sameBendleGroup(sorted[show?.currentSlideIndex ?? 0], resolved) }),
```

- [ ] **Step 4: Run the new and the existing stepping tests**

Run: `VITE_SUPABASE_URL=http://127.0.0.1:9 VITE_SUPABASE_ANON_KEY=dummy npx vitest run client/src/lib/slideStepping.bendle.test.js client/src/lib/slideStepping.test.js client/src/lib/slideStepping.jump.test.js client/src/lib/goLive.test.js client/src/lib/dropStepping.test.js client/src/lib/remoteFix.test.js`
Expected: PASS. An existing test that iterates `PHONE_MECHANICS` with a fake slide may need the new key accounted for; fix the test data, not the behavior.

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/slideStepping.js client/src/lib/slideStepping.bendle.test.js
git commit -m "feat(bendle): phone mechanic with lockHere on step 3, group-aware entry and replay protection" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Press order (clip before lock), A held on steps 1-2, lock refusal, remote text

**Files:**
- Modify: `client/src/lib/hostCommands.js:126-145` (next) and `:148-158` (answer)
- Modify: `client/src/lib/nextPressCue.js:44-50`
- Modify: `client/src/lib/lockRefusal.js:15-26`
- Modify: `client/src/lib/remoteProtocol.js:47-90` (REFUSAL_TEXT)
- Test: `client/src/lib/bendlePressOrder.test.js`

**Interfaces:**
- Consumes: `pendingLockPhase`, `pendingReveal`, `computeNextStep`, `PHONE_MECHANICS` (T8); `audioPlayPending`, `withAudioReset` (`audioPending.js:22,61`); `fixFor` (`remoteFix.js`); `bendleConfigError` (T1).
- Produces:
  - `planHostCommand` ctx gains `answerHeld: boolean`; new refusal `'answer-held'`. When `ctx.lockPhase === 'bendle' && ctx.audioPending`, `next` returns `{ run: 'play-audio' }` before the lock.
  - `nextPressGate` returns `{ label: 'Play clip', gate: 'audio' }` before the lock gate on Bendle step 3.
  - `lockRefusal(slide)` returns `bendleConfigError(slide.data)` for phase `'bendle'`.
  - `REFUSAL_TEXT['answer-held'] = 'Bendle shows the answer after step 3 is locked'`.

Today the lock is checked before audio (`hostCommands.js:131-136`, `nextPressCue.js:46-50`), so the first Next on step 3 would lock before step 3's clip plays.

- [ ] **Step 1: Write the failing test**

```js
// client/src/lib/bendlePressOrder.test.js
import { describe, it, expect } from 'vitest'
import { planHostCommand } from './hostCommands.js'
import { nextPressGate } from './nextPressCue.js'
import { pendingLockPhase, pendingReveal, computeNextStep, patchSlideData, sortSlides } from './slideStepping.js'
import { audioPlayPending, withAudioReset } from './audioPending.js'
import { lockRefusal } from './lockRefusal.js'
import { fixFor } from './remoteFix.js'
import { REFUSAL_TEXT } from './remoteProtocol.js'

const bendle = (id, order, step, extra = {}) => ({ id, order, type: 'question', roundId: 'r1',
  data: { isShiny: true, shinyInputSchema: { type: 'bendle' }, shinyGroupId: 'g1', bendleStepIndex: step, bendleSongId: 'bnd_1', ...extra } })
const idle = { modalOpen: false, pendingAdvance: false, lockCountdownRunning: false, scoringBlocked: false, answerReveal: false, scoringBusy: false, scoreboardVisible: false, scoresRevealed: false }

// A tiny host: real decision code, state applied the way LiveMode applies it.
function makeHost() {
  const st = { slides: [bendle('s1', 0, 0), bendle('s2', 1, 1), bendle('s3', 2, 2), { id: 'q4', order: 3, type: 'question', roundId: 'r1', data: { text: 'next' } }], idx: 0, currentSlideId: 's1', audio: null }
  const cur = () => sortSlides(st.slides)[st.idx]
  const ctx = () => {
    const slide = cur()
    const isBendle = slide.data?.shinyInputSchema?.type === 'bendle'
    return { ...idle, lockPhase: pendingLockPhase(slide), audioPending: audioPlayPending(slide, st.audio), revealPending: !!pendingReveal(slide),
      answerHeld: isBendle && !pendingReveal(slide), lockBlocked: lockRefusal(slide) }
  }
  async function press(cmd) {
    const plan = planHostCommand({ cmd }, ctx())
    switch (plan.run) {
      case 'play-audio': st.audio = { slideId: cur().id, playing: true, part: 0 }; break
      case 'start-lock-countdown': st.slides = patchSlideData(st.slides, cur().id, { bendleLocked: true, bendleLockedAt: 'now' }); break
      case 'reveal-slide': st.slides = patchSlideData(st.slides, cur().id, { bendleRevealed: true, bendleResults: [] }); break
      case 'next': {
        const patch = withAudioReset(await computeNextStep({ slides: st.slides, currentSlideIndex: st.idx, currentSlideId: st.currentSlideId }, async () => 0), st.audio)
        st.slides = patch.slides; st.idx = patch.current_slide_index; st.currentSlideId = patch.current_slide_id
        if ('audio_playing' in patch) st.audio = patch.audio_playing
        break
      }
    }
    return plan.run ?? `refuse:${plan.refuse}`
  }
  return { press, cur, st }
}

describe('Bendle press order', () => {
  it('land, play, advance; play, advance; on step 3: play, lock, A, Next', async () => {
    const h = makeHost()
    const seq = []
    for (const cmd of ['next', 'next', 'next', 'next', 'next', 'next', 'answer', 'next']) seq.push(await h.press(cmd))
    expect(seq).toEqual(['play-audio', 'next', 'play-audio', 'next', 'play-audio', 'start-lock-countdown', 'reveal-slide', 'next'])
    expect(h.cur().id).toBe('q4')
  })
  it('A refuses on steps 1-2 and on step 3 before the lock', async () => {
    const h = makeHost()
    expect(await h.press('answer')).toBe('refuse:answer-held')
    await h.press('next'); await h.press('next')             // play s1, go to s2
    expect(await h.press('answer')).toBe('refuse:answer-held')
    await h.press('next'); await h.press('next'); await h.press('next') // play s2, go s3, play s3
    expect(await h.press('answer')).toBe('refuse:answer-held')  // not locked yet
  })
  it('the remote may still hide an answer that is showing; refuses turning it on', () => {
    expect(planHostCommand({ cmd: 'answer', via: 'remote', sentAt: 1, expectSlideId: 's1', args: { value: true } }, { ...idle, now: 1, slideId: 's1', answerHeld: true })).toEqual({ refuse: 'answer-held' })
    expect(planHostCommand({ cmd: 'answer', via: 'remote', sentAt: 1, expectSlideId: 's1', args: { value: false } }, { ...idle, now: 1, slideId: 's1', answerHeld: true, answerReveal: true })).toEqual({ run: 'set-answer-reveal', value: false })
    expect(planHostCommand({ cmd: 'answer' }, { ...idle, answerHeld: true, answerReveal: true })).toEqual({ run: 'set-answer-reveal', value: false })
  })
  it('other mechanics keep lock-before-audio', () => {
    expect(planHostCommand({ cmd: 'next' }, { ...idle, lockPhase: 'order', audioPending: true })).toEqual({ run: 'start-lock-countdown', phase: 'order' })
  })
  it('the cue and the remote gate follow the same order', () => {
    const s3 = bendle('s3', 2, 2)
    expect(nextPressGate({ slide: s3, nextSlide: null, audioPending: true })).toEqual({ label: 'Play clip', gate: 'audio' })
    expect(nextPressGate({ slide: s3, nextSlide: null, audioPending: false }).gate).toBe('lock')
    expect(nextPressGate({ slide: bendle('s1', 0, 0), nextSlide: s3, audioPending: false }).gate).toBe('advance')
  })
  it('lockRefusal names a broken Bendle; the remote has text for answer-held', () => {
    expect(lockRefusal(bendle('s3', 2, 2, { shinyGroupId: undefined }))).toMatch(/Recreate this Bendle/)
    expect(lockRefusal(bendle('s3', 2, 2))).toBe(null)
    expect(REFUSAL_TEXT['answer-held']).toBeTruthy()
  })
  it('iPad Fix drawer: steps 1-2 have nothing to fix; a locked step 3 can unlock and rescore', () => {
    expect(fixFor(bendle('s1', 0, 0))).toMatchObject({ mechanic: 'bendle', canUnlock: false, unlockRefusal: 'nothing-locked', canRescore: false })
    expect(fixFor(bendle('s3', 2, 2, { bendleLocked: true }))).toMatchObject({ canUnlock: true, canRescore: true })
    expect(fixFor(bendle('s3', 2, 2, { bendleLocked: true, bendleRevealed: true }))).toMatchObject({ canRescore: false, rescoreRefusal: 'already-revealed' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `VITE_SUPABASE_URL=http://127.0.0.1:9 VITE_SUPABASE_ANON_KEY=dummy npx vitest run client/src/lib/bendlePressOrder.test.js`
Expected: FAIL (sequence shows `start-lock-countdown` where `play-audio` is expected; `answer-held` missing).

- [ ] **Step 3: Implement**

`hostCommands.js`, in `case 'next':` replace

```js
      if (ctx.lockPhase) {
```

with

```js
      // Bendle step 3: the clip plays before the lock (spec 2026-10-02:
      // play, lock, A, Next). Every other mechanic keeps lock-first.
      if (ctx.audioPending && ctx.lockPhase === 'bendle') return { run: 'play-audio' }
      if (ctx.lockPhase) {
```

`case 'answer':` becomes

```js
    case 'answer': {
      if (ctx.scoringBusy) return { refuse: 'scoring' }
      // answerHeld: a Bendle slide whose answer must not show yet (steps 1-2,
      // or step 3 before the lock). Hiding a showing answer is still allowed.
      if (!remote) {
        if (ctx.revealPending) return { run: 'reveal-slide' }
        if (ctx.answerHeld && !ctx.answerReveal) return { refuse: 'answer-held' }
        return { run: 'set-answer-reveal', value: !ctx.answerReveal }
      }
      const value = args.value === true
      if (value && ctx.revealPending) return { run: 'reveal-slide' }
      if (value && ctx.phoneRevealed) return { run: 'noop' }
      if (value && ctx.answerHeld) return { refuse: 'answer-held' }
      return setTo('set-answer-reveal', value, ctx.answerReveal)
    }
```

`nextPressCue.js`, after `const phase = slide ? pendingLockPhase(slide) : null`:

```js
  // Bendle step 3 plays its clip before the lock (hostCommands.js 'next').
  if (phase === 'bendle' && audioPending) return { label: 'Play clip', gate: 'audio' }
```

`lockRefusal.js`: import `import { bendleConfigError } from './bendleGuessScoring.js'` and add to the switch:

```js
    case 'bendle': return bendleConfigError(d)
```

`remoteProtocol.js` REFUSAL_TEXT, after `'already-revealed'`:

```js
  'answer-held': 'Bendle shows the answer after step 3 is locked',
```

- [ ] **Step 4: Run tests**

Run: `VITE_SUPABASE_URL=http://127.0.0.1:9 VITE_SUPABASE_ANON_KEY=dummy npx vitest run client/src/lib/bendlePressOrder.test.js client/src/lib/hostCommands.test.js client/src/lib/nextPressCue.test.js client/src/lib/lockRefusal.test.js client/src/lib/remoteProtocol.test.js client/src/lib/remoteFix.test.js`
Expected: PASS (existing "lock beats audio" tests use `order`, unchanged).

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/hostCommands.js client/src/lib/nextPressCue.js client/src/lib/lockRefusal.js client/src/lib/remoteProtocol.js client/src/lib/bendlePressOrder.test.js
git commit -m "feat(bendle): clip before lock on step 3, hold A until locked" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Phone board

**Files:**
- Create: `client/src/components/join/BendleBoard.jsx`
- Test: `client/src/components/join/BendleBoard.test.jsx`

**Interfaces:**
- Consumes: `loadBendleCatalog`, `searchCatalog` (T6), `BENDLE_CATALOG_URL` (T6), `parseGuess`, `guessLabel`, `bendleLockSlide`, `bendleStepIds` (T1), `supabase`. Trigger messages from T2.
- Produces: `default function BendleBoard({ slide, slides, team, theme, preview = false, onAnswered, catalogUrl = BENDLE_CATALOG_URL })`; `export function saveErrorKind(error): 'moved'|'locked'|'duplicate'|'network'`.
  - Writes `phone_answers` with `insert` (never upsert): `{ show_id: slide.showId ?? team.showId, slide_id: slide.id, team_id: team.id, answer: Guess }`.
  - Reads the team's own rows for all three step ids; any row means locked; calls `onAnswered(true)`.
  - Shows "Lock in now" while `slide.data.lockCountdownStartedAt` is set and a guess is picked but not locked.
  - Keeps the in-progress query/pick across the step-to-step remount (module-level `drafts` keyed by team + group).
  - No `ShrinkToFit` (like `MovieChainBoard`): the board has a text input and a results list; scaling an input below 16px makes iOS zoom.

- [ ] **Step 1: Write the failing test**

```jsx
// @vitest-environment jsdom
// client/src/components/join/BendleBoard.test.jsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

const db = { rows: [], insertError: null, inserts: [] }
vi.mock('../../lib/supabase.js', () => ({ supabase: { from: () => ({
  select: () => ({ eq: () => ({ in: (_c, ids) => Promise.resolve({ data: db.rows.filter(r => ids.includes(r.slide_id)), error: null }) }) }),
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
let root, host
beforeEach(() => {
  db.rows = []; db.insertError = null; db.inserts = []
  globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ rows: ROWS }) }))
})
afterEach(() => { act(() => root?.unmount()); host?.remove(); vi.useRealTimers() })
const tick = (ms = 0) => act(() => new Promise(r => setTimeout(r, ms)))
async function render(slide, { slides = [step(0), step(1), step(2)], onAnswered = vi.fn(), catalogUrl = `/cat-${++urlN}.json` } = {}) {
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  await act(async () => root.render(<BendleBoard slide={slide} slides={slides.map(s => s.id === slide.id ? slide : s)} team={team} theme={theme} onAnswered={onAnswered} catalogUrl={catalogUrl} />))
  await tick()
  return onAnswered
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
  it('after the reveal shows this team's result only', async () => {
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
    expect(saveErrorKind(new Error('timeout'))).toBe('network')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `VITE_SUPABASE_URL=http://127.0.0.1:9 VITE_SUPABASE_ANON_KEY=dummy npx vitest run client/src/components/join/BendleBoard.test.jsx`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the component**

```jsx
// client/src/components/join/BendleBoard.jsx
// Bendle on /join (spec 2026-10-02): search the song list or type a title,
// lock ONE guess for the whole three-step Bendle. The database (trigger
// guard_bendle_phone_answers) accepts it only at the live step, once per team
// per group, never after the host locks. No correctness shows before the reveal.
import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { loadBendleCatalog, searchCatalog } from '../../lib/bendleCatalog.js'
import { BENDLE_CATALOG_URL } from '../../lib/bendleCatalogVersion.js'
import { bendleLockSlide, bendleStepIds, guessLabel, parseGuess } from '../../lib/bendleGuessScoring.js'

const MAX_SAVE_MS = 8000
const SEARCH_DEBOUNCE_MS = 100
// Join remounts the board on every step; this keeps a team's half-done pick.
const drafts = new Map()

export function saveErrorKind(error) {
  const msg = String(error?.message ?? '')
  if (msg.includes('bendle_not_live')) return 'moved'
  if (msg.includes('bendle_locked')) return 'locked'
  if (msg.includes('bendle_already_guessed') || msg.includes('bendle_no_update') || error?.code === '23505') return 'duplicate'
  return 'network'
}

export default function BendleBoard({ slide, slides, team, theme, preview = false, onAnswered, catalogUrl = BENDLE_CATALOG_URL }) {
  const { data } = slide
  const all = slides ?? [slide]
  const lockData = (bendleLockSlide(all, slide) ?? slide).data ?? {}
  const stepIds = useMemo(() => bendleStepIds(all, slide), [all, slide])
  const idsKey = stepIds.filter(Boolean).join('|')
  const stepIndex = data.bendleStepIndex ?? 0
  const groupLocked = !!lockData.bendleLocked
  const revealed = !!lockData.bendleRevealed
  const draftKey = `${team?.id}:${data.shinyGroupId ?? slide.id}`
  const draft = drafts.get(draftKey)

  const [query, setQuery] = useState(draft?.query ?? '')
  const [choice, setChoice] = useState(draft?.choice ?? null) // { source:'catalog', title, artist } | { source:'typed' } | null
  const [artist, setArtist] = useState(draft?.artist ?? '')
  const [catalog, setCatalog] = useState(null) // null loading | 'error' | index
  const [results, setResults] = useState([])
  const [saved, setSaved] = useState(null) // { stepIndex, guess }
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [recheck, setRecheck] = useState(0)
  const prevLocked = useRef(groupLocked)

  const ink = theme?.colors?.text ?? '#fff'
  const accent = theme?.colors?.highlight ?? '#f5c842'
  const guess = choice?.source === 'typed'
    ? (query.trim() ? { title: query.trim().slice(0, 200), artist: artist.trim().slice(0, 200) || null, source: 'typed', qid: null } : null)
    : choice ? { title: choice.title, artist: choice.artist, source: 'catalog', qid: null } : null

  useEffect(() => {
    let dead = false
    loadBendleCatalog(catalogUrl).then(ix => { if (!dead) setCatalog(ix) }, () => { if (!dead) setCatalog('error') })
    return () => { dead = true }
  }, [catalogUrl])

  useEffect(() => {
    if (preview || !team?.id || !idsKey) return undefined
    let dead = false
    const ids = idsKey.split('|')
    supabase.from('phone_answers').select('slide_id, answer').eq('team_id', team.id).in('slide_id', ids)
      .then(({ data: rows }) => {
        if (dead || !rows?.length) return
        const best = rows
          .map(r => ({ stepIndex: stepIds.indexOf(r.slide_id), guess: parseGuess(r.answer) }))
          .filter(r => r.stepIndex >= 0)
          .sort((a, b) => a.stepIndex - b.stepIndex)[0]
        if (best) setSaved(best)
      }, () => {})
    return () => { dead = true }
  }, [preview, team?.id, idsKey, recheck, groupLocked]) // eslint-disable-line react-hooks/exhaustive-deps

  // Host Unlock deletes every guess: a phone that was locked starts over.
  useEffect(() => {
    if (prevLocked.current && !groupLocked) setSaved(null)
    prevLocked.current = groupLocked
  }, [groupLocked])

  useEffect(() => { onAnswered?.(!!saved) }, [saved, onAnswered])

  useEffect(() => {
    if (!catalog || catalog === 'error') { setResults([]); return undefined }
    const t = setTimeout(() => setResults(searchCatalog(catalog, query, 8)), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [catalog, query])

  useEffect(() => { drafts.set(draftKey, { query, choice, artist }) }, [draftKey, query, choice, artist])

  async function lockIn() {
    if (!guess || saved || groupLocked || busy) return
    if (preview) { setSaved({ stepIndex, guess }); return }
    setBusy(true); setError('')
    try {
      const { error: saveError } = await Promise.race([
        supabase.from('phone_answers').insert({ show_id: slide.showId ?? team.showId, slide_id: slide.id, team_id: team.id, answer: guess }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), MAX_SAVE_MS)),
      ])
      if (saveError) throw saveError
      setSaved({ stepIndex, guess })
      drafts.delete(draftKey)
    } catch (caught) {
      const kind = saveErrorKind(caught)
      if (kind === 'duplicate') setRecheck(n => n + 1) // already locked (maybe another phone): read it back
      else if (kind === 'moved') setError('The step moved on. Tap Lock In again.')
      else if (kind === 'locked') setError('Guesses are locked.')
      else setError('Could not save your guess. Check your connection and try again.')
    } finally { setBusy(false) }
  }

  const box = { padding: '0.9rem', border: `1px solid ${accent}`, borderRadius: 14 }
  const rowBtn = { textAlign: 'left', padding: '0.7rem 0.75rem', borderRadius: 10, color: ink, border: `1px solid ${ink}44`, background: 'transparent', fontSize: 16 }
  const result = revealed && Array.isArray(lockData.bendleResults) ? lockData.bendleResults.find(r => r.teamId === team?.id) : null

  return (
    <section style={{ color: ink, display: 'grid', gap: '0.9rem', fontFamily: theme?.fonts?.body }}>
      <p style={{ margin: 0, fontSize: '1.1rem', lineHeight: 1.35 }}>{data.text || 'Name that song.'}</p>

      {revealed ? (
        <div style={box} role="status">
          {result?.guess ? <>
            <p style={{ margin: 0 }}>Your guess: <strong>{guessLabel(result.guess)}</strong> (step {result.stepIndex + 1})</p>
            <p style={{ margin: '0.4rem 0 0', fontWeight: 700 }}>{result.points > 0 ? `+${result.points} points` : 'Not this time · 0 points'}</p>
          </> : <p style={{ margin: 0 }}>No guess from your team{result?.points > 0 ? ` · +${result.points} points` : ''}.</p>}
        </div>
      ) : saved ? (
        <div style={box} role="status">
          <p style={{ margin: 0, fontWeight: 700 }}>✓ Locked in at step {saved.stepIndex + 1}</p>
          <p style={{ margin: '0.4rem 0 0' }}>Your guess: {guessLabel(saved.guess)}</p>
          <p style={{ margin: '0.4rem 0 0', opacity: 0.8 }}>Waiting for the reveal.</p>
        </div>
      ) : groupLocked ? (
        <p role="status" style={{ margin: 0 }}>Guesses are locked. No guess from your team.</p>
      ) : <>
        {data.lockCountdownStartedAt && guess && <p role="alert" style={{ margin: 0, fontWeight: 700, color: accent }}>Lock in now!</p>}
        <input
          type="search" aria-label="Search for the song" value={query} placeholder="Song title or artist"
          autoComplete="off" autoCorrect="off" spellCheck={false}
          onChange={e => { setQuery(e.target.value); if (choice?.source !== 'typed') setChoice(null) }}
          style={{ width: '100%', padding: '0.75rem', borderRadius: 10, color: '#111', fontSize: 16 }}
        />
        {catalog === 'error' && <p style={{ margin: 0, fontSize: '0.9rem', opacity: 0.85 }}>Song list did not load. Type the title and tap "Use what I typed".</p>}
        <div style={{ display: 'grid', gap: 6 }}>
          {results.map(r => (
            <button type="button" key={`${r.title}|${r.artist}`} onClick={() => { setChoice({ source: 'catalog', title: r.title, artist: r.artist }); setError('') }}
              style={{ ...rowBtn, borderColor: choice?.source === 'catalog' && choice.title === r.title && choice.artist === r.artist ? accent : `${ink}44` }}>
              <strong>{r.title}</strong>{r.artist ? <span style={{ opacity: 0.8 }}> - {r.artist}</span> : null}
            </button>
          ))}
          {query.trim() && (
            <button type="button" onClick={() => { setChoice({ source: 'typed' }); setError('') }}
              style={{ ...rowBtn, borderStyle: 'dashed', borderColor: choice?.source === 'typed' ? accent : `${ink}66` }}>
              Use what I typed: “{query.trim()}”
            </button>
          )}
        </div>
        {choice?.source === 'typed' && (
          <input aria-label="Artist (optional)" value={artist} placeholder="Artist (optional)" autoComplete="off"
            onChange={e => setArtist(e.target.value)} style={{ width: '100%', padding: '0.75rem', borderRadius: 10, color: '#111', fontSize: 16 }} />
        )}
        {guess && <p style={{ margin: 0 }}>Your guess: <strong>{guessLabel(guess)}</strong></p>}
        <button type="button" onClick={lockIn} disabled={!guess || busy}
          style={{ color: ink, border: `2px solid ${accent}`, borderRadius: 12, padding: '0.9rem', fontWeight: 700, fontSize: 16, opacity: !guess || busy ? 0.5 : 1 }}>
          {busy ? 'Saving…' : `Lock In at step ${stepIndex + 1}`}
        </button>
        <p style={{ margin: 0, fontSize: '0.85rem', opacity: 0.75 }}>One guess for the whole Bendle. Earlier steps score more.</p>
      </>}
      {error && <p role="alert" style={{ color: '#ff8888', margin: 0 }}>{error}</p>}
    </section>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `VITE_SUPABASE_URL=http://127.0.0.1:9 VITE_SUPABASE_ANON_KEY=dummy npx vitest run client/src/components/join/BendleBoard.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/join/BendleBoard.jsx client/src/components/join/BendleBoard.test.jsx
git commit -m "feat(bendle): phone board to search, type and lock one guess" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: TV reveals on `bendleRevealed` and shows the list

**Files:**
- Modify: `client/src/components/display/slides/ShinyBendleQuestion.jsx:174-189` (header comment, `revealed`), `:322-372` (render)
- Test: `client/src/components/display/slides/ShinyBendleQuestion.test.jsx`

**Interfaces:**
- Consumes: `BendleRevealList` (T3); `data.bendleRevealed`, `data.bendleResults` on the step-3 slide.
- Produces: the component treats `show.answer_reveal || data.bendleRevealed` as revealed (full mix with vocals plays, song title shows); when `bendleRevealed` and results exist it shows the list and hides the question text and step dots.

- [ ] **Step 1: Write the failing test** (append inside `describe('(d) reveal', ...)`, using the file's existing `mkSong`, `slideFor`, `playing`, `render`, `settle`, `players`, `transport`)

```jsx
    it('reveals on bendleRevealed alone (no answer_reveal) and lists every team', async () => {
      const song = mkSong()
      const results = [
        { teamId: 'p1', teamName: 'Alpha', guess: { title: 'Crazy On You', artist: 'Heart' }, stepIndex: 0, correct: true, autoPoints: 30, points: 30, overridden: false },
        { teamId: 'p2', teamName: 'Bravo', guess: null, stepIndex: null, correct: false, autoPoints: 0, points: 0, overridden: false },
      ]
      await render(slideFor(song, { bendleStepIndex: 2, text: 'Name it', bendleLocked: true, bendleRevealed: true, bendleResults: results }), playing('s1'))
      await settle()
      expect(players()).toHaveLength(4) // drums bass other vocals
      expect(container.textContent).toContain('Crazy On You — Heart')
      expect(container.querySelectorAll('[role="listitem"]')).toHaveLength(2)
      expect(container.textContent).toContain('No guess')
      expect(container.textContent).not.toContain('Name it')
      expect(container.textContent).not.toContain('pts')
    })
    it('a locked but unrevealed step 3 stays on the step mix', async () => {
      const song = mkSong()
      await render(slideFor(song, { bendleStepIndex: 2, bendleLocked: true }), playing('s1'))
      await settle()
      expect(players()).toHaveLength(3)
      expect(container.querySelectorAll('[role="listitem"]')).toHaveLength(0)
    })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `VITE_SUPABASE_URL=http://127.0.0.1:9 VITE_SUPABASE_ANON_KEY=dummy npx vitest run client/src/components/display/slides/ShinyBendleQuestion.test.jsx`
Expected: FAIL (3 players instead of 4; no list).

- [ ] **Step 3: Implement**

Import: `import BendleRevealList from './BendleRevealList.jsx'`.

Replace the header comment lines 177-180 ("Scoring is MANUAL; pressing "A" ...") with:

```js
// Teams lock one guess on their phones (BendleBoard). The reveal is the
// host's A on step 3 (LiveMode writes bendleRevealed + bendleResults on the
// step-3 slide); the older show-level answer_reveal still counts. Revealed
// swaps the audio to the full mix, vocals included, and lists every team.
```

Line 189 becomes:

```js
  const answerReveal = !!(show?.answer_reveal ?? show?.showState?.answerReveal)
  const revealed = answerReveal || !!data.bendleRevealed
  const listShown = !!data.bendleRevealed && Array.isArray(data.bendleResults)
```

In the render: outer div `padding: listShown ? '3vmin 4vmin' : '4rem', gap: listShown ? '2vmin' : '2.5rem'`; change `{data.text && (` to `{data.text && !listShown && (`; after the song-title `motion.p` block add `{listShown && <BendleRevealList results={data.bendleResults} theme={theme} />}`; change `<StepIndicator ... />` to `{!listShown && <StepIndicator tiers={tiers} stepIndex={stepIndex} text={text} bodyFont={bodyFont} />}`.

- [ ] **Step 4: Run test to verify it passes**

Run: `VITE_SUPABASE_URL=http://127.0.0.1:9 VITE_SUPABASE_ANON_KEY=dummy npx vitest run client/src/components/display/slides/ShinyBendleQuestion.test.jsx client/src/components/display/slides/QuestionSlide.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/display/slides/ShinyBendleQuestion.jsx client/src/components/display/slides/ShinyBendleQuestion.test.jsx
git commit -m "feat(bendle): TV reveals on bendleRevealed and lists every team's guess" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: LiveMode wiring (lock, reveal+score, override, unlock, remote)

**Files:**
- Modify: `client/src/components/host/LiveMode.jsx` (imports `~23-37`, state `:270-272`, `scoringBusy :299`, error reset `:407-417`, fix-busy map `:439-448`, handlers after `:1287`, `revealCurrentSlide :1289-1297`, `unlockCurrentSlide :1307-1312`, `scoreActionFor :1330-1344`, `lockHandlersRef :1356-1366`, `runHostCommand ctx :1450-1499`, panel `:1888-1890`)
- Test: `client/src/components/host/LiveMode.bendle.test.jsx`

**Interfaces:**
- Consumes: T1 (`gradeBendleGroup`, `applyBendleOverrides`, `computeBendleScoreUpdates`, `bendleStepIds`, `bendleLockSlide`, `bendleConfigError`), T2 (`clear_bendle_group_answers` RPC), T4 (`BendleHostPanel`), T8 (`PHONE_MECHANICS.bendle`, `unlockPatch`, `pendingReveal`), T9 (`answerHeld` ctx, `lockRefusal` bendle case).
- Produces: `handleLockBendle(slide)`, `handleRevealBendle(slide)`, `overrideBendleTeam(slide, teamId, points)`, `unlockBendle(slide)`; `lockHandlersRef.current.bendle`; `scoreActionFor('bendle', slide)`; the iPad's `next` (countdown phase `'bendle'`), `answer`, `unlock` and `rescore` all route through these (the relay carries commands generically; no relay change).

- [ ] **Step 1: Write the failing test** (harness copied from `LiveMode.movieChain.test.jsx:1-80`, plus `rpc`)

```jsx
// @vitest-environment jsdom
// client/src/components/host/LiveMode.bendle.test.jsx
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
    then(res, rej) { calls.push(entry); return Promise.resolve(responses[`${table}.${entry.op}`] ?? { data: [], error: null }).then(res, rej) },
  }
  return q
}
vi.mock('../../lib/supabase.js', () => ({
  supabase: {
    from: t => builder(t),
    rpc: (name, args) => { calls.push({ table: 'rpc', op: name, args }); return Promise.resolve(responses[`rpc.${name}`] ?? { data: 0, error: null }) },
    channel: () => ({ on() { return this }, subscribe() { return this } }), removeChannel() {},
  },
}))
const { default: LiveMode } = await import('./LiveMode.jsx')

const step = (i, extra = {}) => ({ id: `s${i + 1}`, roundId: 'r1', order: i, type: 'question',
  data: { isShiny: true, shinyInputSchema: { type: 'bendle' }, shinyGroupId: 'g1', bendleStepIndex: i, bendleSongId: 'bnd_1', ...extra } })
const SHOW = (slides, idx) => ({
  id: 'show1', title: 'Test', theme: 'midnight-galaxy', audio_playing: null,
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
const render = (slides, idx, a) => act(() => root.render(<LiveMode show={SHOW(slides, idx)} actions={a} scoreboardModalOpen={false} />))
const upserts = () => calls.filter(c => c.table === 'scoreboard_teams' && c.op === 'upsert')
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
  it('step 1 shows the count and no lock button', async () => {
    render([step(0), step(1), step(2)], 0, actions())
    await tick(10)
    expect(host.textContent).toContain('step 1 of 3')
    expect(host.textContent).toContain('2 of 3 teams locked a guess')
    expect(button('Lock Guesses')).toBeUndefined()
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
    expect(calls.some(c => c.table === 'scoreboard_teams')).toBe(false)
  })
  it('reveal grades across all three steps, publishes with the reveal flag, scores into the step-3 bucket', async () => {
    const a = actions()
    render([step(0), step(1), step(2, LOCKED)], 2, a)
    await act(async () => button('Reveal & Score').click())
    await tick(20)
    const answersQuery = calls.find(c => c.table === 'phone_answers' && c.filters.some(([k]) => k === 'show_id'))
    expect(answersQuery.filters).toContainEqual(['slide_id', ['s1', 's2', 's3']])
    const published = a.updateSlide.mock.calls.find(([, p]) => p.data.bendleRevealed)[1].data
    expect(published.bendleResults.map(r => [r.teamId, r.points])).toEqual([['p1', 30], ['p2', 0], ['p3', 0]])
    const up = upserts()[0].args
    expect(up.find(u => u.id === 't1').scores.r_r1).toEqual({ written: 4, phone: { s3: 30 } })
    expect(up.every(u => !('s1' in (u.scores.r_r1?.phone ?? {})))).toBe(true)
  })
  it('A on step 1 is refused; A on locked step 3 reveals', async () => {
    const a = actions()
    render([step(0), step(1), step(2)], 0, a)
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' })))
    expect(a.setAnswerReveal).not.toHaveBeenCalled()
    render([step(0), step(1), step(2, LOCKED)], 2, a)
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' })))
    await tick(20)
    expect(a.updateSlide.mock.calls.some(([, p]) => p.data.bendleRevealed)).toBe(true)
  })
  it('override sets one team, rescoring the step-3 bucket and saving bendleOverrides', async () => {
    const a = actions()
    const results = [
      { teamId: 'p1', teamName: 'Quizzly Bears', guess: { title: 'Mr. Brightside', artist: 'The Killers' }, stepIndex: 0, correct: true, autoPoints: 30, points: 30, overridden: false },
      { teamId: 'p3', teamName: 'No Phone', guess: null, stepIndex: null, correct: false, autoPoints: 0, points: 0, overridden: false },
    ]
    render([step(0), step(1), step(2, { ...LOCKED, bendleRevealed: true, bendleResults: results })], 2, a)
    const select = host.querySelector('select[aria-label="Set No Phone points"]')
    await act(async () => { select.value = '20'; select.dispatchEvent(new Event('change', { bubbles: true })) })
    await tick(20)
    expect(upserts()[0].args.find(u => u.id === 't3').scores.r_r1.phone.s3).toBe(20)
    const saved = a.updateSlide.mock.calls.at(-1)[1].data
    expect(saved.bendleOverrides).toEqual({ p3: 20 })
    expect(saved.bendleResults.find(r => r.teamId === 'p3')).toMatchObject({ points: 20, overridden: true })
  })
  it('unlock clears the group rows through the host RPC, then reopens', async () => {
    const a = actions()
    render([step(0), step(1), step(2, { ...LOCKED, bendleRevealed: true, bendleResults: [], bendleOverrides: { p3: 20 } })], 2, a)
    await act(async () => button('Unlock').click())
    await act(async () => button('Tap again').click())
    await tick(10)
    expect(calls.find(c => c.table === 'rpc')).toMatchObject({ op: 'clear_bendle_group_answers', args: { p_show_id: 'show1', p_group_id: 'g1' } })
    const data = a.updateSlide.mock.calls.at(-1)[1].data
    expect(data).toMatchObject({ bendleLocked: false, bendleRevealed: false, bendleResults: null, bendleLockedAt: null, bendleOverrides: { p3: 20 } })
  })
  it('a failed RPC leaves the slide locked and says so', async () => {
    responses['rpc.clear_bendle_group_answers'] = { data: null, error: { message: 'not authorized' } }
    const a = actions()
    render([step(0), step(1), step(2, LOCKED)], 2, a)
    await act(async () => button('Unlock').click())
    await act(async () => button('Tap again').click())
    await tick(10)
    expect(a.updateSlide).not.toHaveBeenCalled()
    expect(host.textContent).toContain('Could not unlock')
  })
})
```

Before writing the A-key test, confirm the keydown listener target and key value in LiveMode (`grep -n "keydown" client/src/components/host/LiveMode.jsx`) and match it (the existing scoreChain test shows the house pattern).

- [ ] **Step 2: Run test to verify it fails**

Run: `VITE_SUPABASE_URL=http://127.0.0.1:9 VITE_SUPABASE_ANON_KEY=dummy npx vitest run client/src/components/host/LiveMode.bendle.test.jsx`
Expected: FAIL (no Bendle pane; the generic panel shows "undefined" status or nothing).

- [ ] **Step 3: Implement** (exact edits)

Imports, next to the movieChain imports (line 23):

```js
import { gradeBendleGroup, applyBendleOverrides, computeBendleScoreUpdates, bendleStepIds, bendleLockSlide, bendleConfigError } from '../../lib/bendleGuessScoring.js'
import BendleHostPanel from './BendleHostPanel.jsx'
```

State, after `const movieChainRunRef = useRef(false)` (line 272):

```js
  const [bendleBusy, setBendleBusy] = useState(false)
  const [bendleError, setBendleError] = useState(null)
  const bendleRunRef = useRef(false)
```

Line 299:

```js
  const scoringBusy = matchingBusy || orderBusy || wagerBusy || choiceBusy || dropBusy || huesCuesBusy || pinBusy || movieChainBusy || bendleBusy
```

Error reset effect (line 415), add `setBendleError(null)` after `setMovieChainError(null)`.

Fix-busy map (line 447), add after `movieChain: [movieChainBusy, movieChainError],`:

```js
        bendle: [bendleBusy, bendleError],
```

Handlers, after `correctMovieChainTeam` (line 1287):

```js
  // Bendle (spec 2026-10-02). The lock, results and overrides live on the
  // step-3 slide; teams' rows sit on whichever step was live when they
  // locked (bendleStepIds). Scores go to the step-3 slide's bucket.
  async function handleLockBendle(slide) {
    if (bendleRunRef.current || !slide?.data || slide.data.bendleLocked || slide.data.bendleStepIndex !== 2) return
    const issue = bendleConfigError(slide.data)
    if (issue) { setBendleError(issue); return }
    bendleRunRef.current = true
    setBendleBusy(true); setBendleError(null)
    try {
      actions.updateSlide(slide.id, { data: { ...slide.data, bendleLocked: true, bendleLockedAt: new Date().toISOString() } })
      await actions.flushSlides()
    } catch (error) {
      console.error('Bendle lock failed:', error)
      setBendleError('Could not lock guesses. Check connection and retry.')
    } finally { bendleRunRef.current = false; setBendleBusy(false) }
  }

  async function writeBendleScores(slide, results, teams) {
    await scoreChainRef.current.run(async () => {
      const { data: scoreboardTeams, error: sbError } = await withTimeout(signal => supabase.from('scoreboard_teams')
        .select('id, show_id, name, scores, sort_order').eq('show_id', show.id).abortSignal(signal), SCORE_CALL_TIMEOUT_MS)
      if (sbError) throw sbError
      const updates = computeBendleScoreUpdates({ results, teams, scoreboardTeams, roundKey: roundKeyFor(show, slide), lockSlideId: slide.id })
      if (results.length > 0 && updates.length === 0) throw new Error('No team matched a scoreboard row')
      if (!slide.data.bendleRevealed) {
        // Publish results and the reveal together: nothing public before A.
        actions.updateSlide(slide.id, { data: { ...slide.data, bendleResults: results, bendleRevealed: true } })
        await actions.flushSlides()
      }
      if (updates.length > 0) {
        const { error: writeError } = await withTimeout(signal => supabase.from('scoreboard_teams').upsert(updates).abortSignal(signal), SCORE_CALL_TIMEOUT_MS)
        if (writeError) throw writeError
      }
    })
  }

  async function handleRevealBendle(slide) {
    if (bendleRunRef.current || !slide?.data?.bendleLocked) return
    bendleRunRef.current = true
    setBendleBusy(true); setBendleError(null)
    try {
      const stepIds = bendleStepIds(slides, slide)
      const [teamsRes, rowsRes, songRes] = await Promise.all([
        supabase.from('teams').select('id, name').eq('show_id', show.id),
        supabase.from('phone_answers').select('team_id, slide_id, answer').eq('show_id', show.id).in('slide_id', stepIds.filter(Boolean)),
        supabase.from('bendle_songs').select('title, answer, aliases, artist').eq('id', slide.data.bendleSongId).single(),
      ])
      for (const r of [teamsRes, rowsRes, songRes]) if (r.error) throw r.error
      if (!songRes.data) throw new Error('Bendle song row missing')
      const teams = teamsRes.data ?? []
      const results = gradeBendleGroup({ rows: rowsRes.data, stepIds, song: songRes.data, teams, overrides: slide.data.bendleOverrides })
      await writeBendleScores(slide, results, teams)
      refreshScoresView()
    } catch (error) {
      console.error('Bendle reveal failed:', error)
      setBendleError('Could not finish reveal or scoring. Check connection and use Retry below.')
    } finally { bendleRunRef.current = false; setBendleBusy(false) }
  }

  async function overrideBendleTeam(slide, teamId, points) {
    if (bendleRunRef.current || !slide?.data?.bendleRevealed) return
    bendleRunRef.current = true
    setBendleBusy(true); setBendleError(null)
    try {
      const overrides = { ...(slide.data.bendleOverrides ?? {}), [teamId]: points }
      const results = applyBendleOverrides(slide.data.bendleResults, overrides)
      const { data: teams, error: teamsError } = await supabase.from('teams').select('id, name').eq('show_id', show.id)
      if (teamsError) throw teamsError
      await writeBendleScores(slide, results, teams ?? [])
      actions.updateSlide(slide.id, { data: { ...slide.data, bendleOverrides: overrides, bendleResults: results } })
      await actions.flushSlides()
      refreshScoresView()
    } catch (error) {
      console.error('Bendle override failed:', error)
      setBendleError('Could not save the change. Check connection and retry.')
    } finally { bendleRunRef.current = false; setBendleBusy(false) }
  }

  // Deletes every team's guess for this Bendle (host-only RPC), then reopens.
  // Rows go first: if the delete fails the slide stays locked.
  async function unlockBendle(slide) {
    if (bendleRunRef.current || !slide?.data) return
    bendleRunRef.current = true
    setBendleBusy(true); setBendleError(null)
    try {
      const { error } = await supabase.rpc('clear_bendle_group_answers', { p_show_id: show.id, p_group_id: slide.data.shinyGroupId })
      if (error) throw error
      actions.updateSlide(slide.id, { data: { ...slide.data, ...unlockPatch('bendle', slide.data) } })
      await actions.flushSlides()
    } catch (error) {
      console.error('Bendle unlock failed:', error)
      setBendleError('Could not unlock. Check connection and retry.')
    } finally { bendleRunRef.current = false; setBendleBusy(false) }
  }
```

`revealCurrentSlide` (line 1292), add after the movieChain line:

```js
    if (mechanic === 'bendle') { handleRevealBendle(currentSlide); return true }
```

`unlockCurrentSlide` (line 1308), first line becomes:

```js
    if (!phoneMechanic || !currentSlide) return
    if (phoneMechanic === 'bendle') { unlockBendle(currentSlide); return }
```

`scoreActionFor` (line 1342), add:

```js
      bendle: () => slide.data.bendleLocked ? handleRevealBendle(slide) : handleLockBendle(slide),
```

`lockHandlersRef.current` (line 1365), add `bendle: handleLockBendle,`.

`runHostCommand` ctx, after `revealPending: !!pendingReveal(currentSlide),` (line 1470):

```js
      // Bendle: A must not show the answer on steps 1-2 or before the step-3 lock.
      answerHeld: phoneMechanic === 'bendle' && !pendingReveal(currentSlide),
```

and the lock-blocked routing (line 1497), add before the final `else`:

```js
      else if (ph === 'bendle') setBendleError(plan.message)
```

Panel (line 1889), right after `if (!phoneMechanic) return null`:

```jsx
            if (phoneMechanic === 'bendle') {
              return (
                <BendleHostPanel
                  slide={currentSlide}
                  lockData={(bendleLockSlide(slides, currentSlide) ?? currentSlide).data ?? {}}
                  stepIds={bendleStepIds(slides, currentSlide)}
                  showId={show.id}
                  busy={bendleBusy}
                  error={bendleError}
                  onLock={() => handleLockBendle(currentSlide)}
                  onReveal={() => handleRevealBendle(currentSlide)}
                  onUnlock={() => unlockBendle(currentSlide)}
                  onOverride={(teamId, points) => overrideBendleTeam(currentSlide, teamId, points)}
                />
              )
            }
```

- [ ] **Step 4: Run tests**

Run: `VITE_SUPABASE_URL=http://127.0.0.1:9 VITE_SUPABASE_ANON_KEY=dummy npx vitest run client/src/components/host/LiveMode.bendle.test.jsx client/src/components/host/LiveMode.movieChain.test.jsx client/src/components/host/LiveMode.scoreChain.test.jsx`
Expected: PASS.

- [ ] **Step 5: Security scan (lock/score surface touches host auth RPC)**

Run: `semgrep --config auto client/src/components/host/LiveMode.jsx client/src/components/join/BendleBoard.jsx supabase/migrations/20261002120000_bendle_phone_guess_guard.sql`
Expected: no real findings; fix any that are.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/host/LiveMode.jsx client/src/components/host/LiveMode.bendle.test.jsx
git commit -m "feat(bendle): host lock, reveal+score, per-team points, unlock via host RPC" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Join wiring (board, sibling-aware interactivity, lockout exemption, prefetch)

**Files:**
- Modify: `client/src/views/Join.jsx` (imports `:8-18`, `:10`; `SlideBody :778-783`; `liveSlideIsInteractive :1471-1474`; `interactivePhaseKey :1489-1492`; lockout `:1514-1540`)

**Interfaces:**
- Consumes: `BendleBoard` (T10), `loadBendleCatalog` (T6), `liveSlideOpenForPhones`, `phonePhaseKey` (T8), `isBendleShiny`.
- Produces: no new exports.

**30-second lockout decision:** exempt Bendle. The lockout (`Join.jsx:1498-1540`) fires on `visibilitychange` after 30 s hidden. A Bendle round is three listening steps with phones face-down between them, so 30 s strands normal play; a longer grace still strands a slow round. The cheat it guards (looking the answer up) is a second phone running a song-ID app, which the lockout cannot see. The real integrity guard is server-side (Task 2). `SlideContent`'s `bare` list (`:731-732`) picks Bendle up automatically from `PHONE_MECHANICS`.

- [ ] **Step 1: Write the failing check**

Join.jsx has no unit test file and is 2,678 lines; its new logic is in the T8 helpers (tested there) and BendleBoard (T10). The check for this task is the build plus a grep that the old inline predicates are gone:

Run: `grep -n "m.lockFields\[m.lockFields.length - 1\]\]" client/src/views/Join.jsx; grep -c "BendleBoard" client/src/views/Join.jsx`
Expected now: one match on line ~1473; count `0`.

- [ ] **Step 2: Implement**

Imports: add `isBendleShiny` to the `shinySeries.js` import (line 8); change line 10 to

```js
import { PHONE_MECHANICS, sortSlides, liveSlideOpenForPhones, phonePhaseKey } from '../lib/slideStepping.js'
```

and add after line 18:

```js
import BendleBoard from '../components/join/BendleBoard.jsx'
import { loadBendleCatalog } from '../lib/bendleCatalog.js'
```

`SlideBody`, before `if (d.isShiny && isMovieChainShiny(d)) {` (line 781):

```jsx
      if (d.isShiny && isBendleShiny(d)) {
        return <BendleBoard slide={slide} slides={show?.slides} team={team} theme={theme} onAnswered={onInteractiveAnswered} />
      }
```

Lines 1471-1474 become:

```js
  // Bendle keeps its lock on the step-3 slide, so "still taking answers" and
  // the phase key read the group's lock slide (slideStepping.js lockSlideFor).
  const liveSlideIsInteractive = liveSlideOpenForPhones(show?.slides, liveSlide)
```

Lines 1489-1492 become:

```js
  const interactivePhaseKey = phonePhaseKey(show?.slides, liveSlide)
```

Lockout: after `const [leftDuringQuestion, setLeftDuringQuestion] = useState(false)` (line 1514) add

```js
  // Bendle is exempt: three listening steps with phones face-down would trip
  // the 30 s rule in normal play, and the song-ID-app cheat it would guard
  // happens on a second device it cannot see. The database guard
  // (guard_bendle_phone_answers) is the real integrity check.
  const lockoutExempt = !!liveSlide?.data && isBendleShiny(liveSlide.data)
```

and the effect's first line and deps (lines 1517, 1540):

```js
    if (!liveSlideIsInteractive || lockoutExempt) return
```
```js
  }, [liveSlideIsInteractive, interactivePhaseKey, lockoutExempt])
```

Prefetch, after the lockout effect:

```js
  // Fetch the Bendle song list while the team waits, not when the step starts.
  const hasBendle = useMemo(() => (show?.slides ?? []).some(s => s?.type === 'question' && s.data && isBendleShiny(s.data)), [show?.slides])
  useEffect(() => { if (hasBendle) loadBendleCatalog().catch(() => {}) }, [hasBendle])
```

- [ ] **Step 3: Verify**

Run: `grep -n "m.lockFields\[m.lockFields.length - 1\]\]" client/src/views/Join.jsx; grep -c "BendleBoard" client/src/views/Join.jsx; npm run build`
Expected: no grep match; count `2` (import + render); build succeeds.

Run: `VITE_SUPABASE_URL=http://127.0.0.1:9 VITE_SUPABASE_ANON_KEY=dummy npx vitest run client/src/lib/slideStepping.bendle.test.js client/src/components/join`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add client/src/views/Join.jsx
git commit -m "feat(bendle): mount the phone board, group-aware pinning, lockout exemption, song list prefetch" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Rules card — BLOCKED-ON PR #33 (round-2 rules cards)

Do not start until PR #33 is merged to `main` and this branch is rebased onto it. #33 edits the same files; apply this change on top of its version, not this branch's.

**Files:**
- Modify: `client/src/lib/shinyExplainers.js` (Bendle entry, today `:37-48`)
- Modify: `client/src/lib/shinyExplainers.test.js`
- Modify: `client/src/components/display/explainers/BendleExplainer.jsx`
- Modify: `references/shiny-rules-card.md` (Bendle entry, today `:50`, and rules `:70-71`)

**Interfaces:**
- Consumes: `BENDLE_STEP_POINTS`.
- Produces: Bendle card copy:
  - action: `Search the song on your phone and lock in your one guess.`
  - scoring: `` `Get it right on step 1 for ${BENDLE_STEP_POINTS[0]}, step 2 for ${BENDLE_STEP_POINTS[1]}, step 3 for ${BENDLE_STEP_POINTS[2]}.` `` and `Right song and artist.`
  - visual: the "Your answer sheet" box becomes a phone search mock.

- [ ] **Step 1: Failing test** — add to `shinyExplainers.test.js`:

```js
describe('Bendle card copy (phone guess)', () => {
  it('states the phone action and both scoring lines', () => {
    const e = getShinyExplainer({ inputType: 'bendle' })
    expect(e.action).toBe('Search the song on your phone and lock in your one guess.')
    expect(e.scoring).toEqual(['Get it right on step 1 for 30, step 2 for 20, step 3 for 10.', 'Right song and artist.'])
    expect(e.scoring.join(' ')).not.toMatch(/by hand|No phone/)
  })
})
```

Run: `VITE_SUPABASE_URL=http://127.0.0.1:9 VITE_SUPABASE_ANON_KEY=dummy npx vitest run client/src/lib/shinyExplainers.test.js` — Expected: FAIL.

- [ ] **Step 2: Copy change** — in the Bendle entry set `action` and `scoring` exactly as above; replace its comment with "Ben, 2026-10-02: teams lock one guess on their phones; the step it is locked at sets the points; artist must match when both sides have one."

- [ ] **Step 3: Visual change** — in `BendleExplainer.jsx`:
  - Header comment: "teams search the song on their phone and lock one guess" replaces "write the song title on paper".
  - `aria-label`: `` `Example: the song plays in three steps, one more layer each. Search the song on your phone and lock one guess: step 1, ${BENDLE_STEP_POINTS[0]} points; step 2, ${BENDLE_STEP_POINTS[1]}; step 3, ${BENDLE_STEP_POINTS[2]}.` ``
  - Replace the "Your answer sheet" block with a static phone mock (same `enter(STEP_AT(0) + 0.15, 10)` entrance, same panel styling): a rounded frame `width: min(100%, 520px)`, `borderRadius: 3vmin`, `border: 2px solid ${text}55`; inside, a search field showing the text `mr bright` with a caret, two result rows "Mr. Brightside - The Killers" (highlighted with `SHINY_GOLD` border) and "Mr. Blue Sky - Electric Light Orchestra", then a gold "Lock In at step 1" pill and the caption "One guess. Step 1 = 30 pts". Text sizes `clamp(1.4rem, 2.6vmin, 2.8rem)` like the current sheet. Static only (no typing animation), opacity/transform entrance only, reduced motion respected through `enter()`.
  - Keep the three waveform stages unchanged.

- [ ] **Step 4: Docs** — in `references/shiny-rules-card.md` replace the Bendle bullet's "Reference only: Ben grades by hand via Quick Entry; there is no phone entry and no auto-scoring" and "Line 2: No phone entry. Ben checks answers by hand." with the new action, the two scoring lines, and "Example: three waveform stages plus a phone search mock (static)". Keep the "never names a layer order" and "visual-only, no audio" rules.

- [ ] **Step 5: Verify and commit**

Run: `VITE_SUPABASE_URL=http://127.0.0.1:9 VITE_SUPABASE_ANON_KEY=dummy npx vitest run client/src/lib/shinyExplainers.test.js client/src/components/display/slides` then the Task 16 harness screenshot of the Bendle card at 1920x1080 and 1280x720 (full and reduced motion).

```bash
git add client/src/lib/shinyExplainers.js client/src/lib/shinyExplainers.test.js client/src/components/display/explainers/BendleExplainer.jsx references/shiny-rules-card.md
git commit -m "feat(bendle): rules card says phone search and one guess" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Docs and stale comments

**Files:**
- Modify: `client/src/lib/bendleScoring.js:1-24` (header comment)
- Modify: `client/src/lib/shinyWizardKinds.jsx:267-276` (comment above `BENDLE_STEP_COUNT`)
- Modify: `client/src/components/host/SlideEditor.jsx:1071-1074` (comment)
- Modify: `SKILL.md` (files list near `:214`)

**Interfaces:** none (comments and docs only).

- [ ] **Step 1: `bendleScoring.js` header** — replace lines 4-10 ("Points (30/20/10) are a REFERENCE for Ben's manual grading, not auto-scored ... this superseded).") with:

```js
// edited in SlideEditor's BendleBuilder) — see buildBendleTiers below. Points
// (30/20/10) are auto-scored from each team's one phone guess: the step that
// was live when the team locked sets its points (bendleGuessScoring.js,
// spec docs/superpowers/specs/2026-10-02-bendle-phone-guess-design.md).
```

- [ ] **Step 2: `shinyWizardKinds.jsx` comment** — replace lines 268-276 ("Manual grading, not phone-scored ... same as a regular question.") with:

```js
// slide). Teams lock ONE guess on their phones across the three steps
// (BendleBoard); the lock, results and overrides live on the step-3 slide
// (PHONE_MECHANICS.bendle, lockHere). Each slide still carries the real
// `answer` field for the song editor and AnswerRevealOverlay.
```

- [ ] **Step 3: `SlideEditor.jsx` comment** — replace lines 1071-1074 ("No phone preview — Bendle is manually graded ... nothing for a team's phone to show.") with:

```js
            // No phone preview yet: BendleBoard needs the three sibling
            // slides and the song list (Join.jsx passes them). Phones search
            // and lock one guess (spec 2026-10-02).
```

- [ ] **Step 4: `SKILL.md`** — after the "Movie Chain files" entry (line ~216) add:

```
      Bendle phone guess      — client/src/components/join/BendleBoard.jsx (phone),
                                 client/src/lib/bendleGuessScoring.js (grading, groups),
                                 client/src/lib/bendleCatalog.js + public/bendle-catalog.<hash>.json
                                 (song list, built by scripts/build-bendle-catalog.mjs, owner-run),
                                 BendleRevealList.jsx (TV), BendleHostPanel.jsx (host).
                                 Lock/results live on the step-3 slide (PHONE_MECHANICS.bendle.lockHere);
                                 DB trigger guard_bendle_phone_answers allows one live-step guess per
                                 team per group; Unlock calls clear_bendle_group_answers. Do not use
                                 Quick Entry for a phone-played Bendle (points would count twice).
```

- [ ] **Step 5: Verify and commit**

Run: `grep -n "not auto-scored\|No phone guess-lock\|manually graded" client/src/lib/bendleScoring.js client/src/lib/shinyWizardKinds.jsx client/src/components/host/SlideEditor.jsx client/src/components/display/slides/ShinyBendleQuestion.jsx`
Expected: no matches.

```bash
git add client/src/lib/bendleScoring.js client/src/lib/shinyWizardKinds.jsx client/src/components/host/SlideEditor.jsx SKILL.md
git commit -m "docs(bendle): phone guess replaces manual grading in comments and SKILL.md" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: Verification

**Files:** none in the repo. Harness files go in the session scratchpad.

- [ ] **Step 1: Targeted tests**

```bash
VITE_SUPABASE_URL=http://127.0.0.1:9 VITE_SUPABASE_ANON_KEY=dummy npx vitest run \
  client/src/lib/bendleGuessScoring.test.js client/src/lib/bendleCatalog.test.js scripts/build-bendle-catalog.test.mjs \
  client/src/lib/slideStepping.bendle.test.js client/src/lib/bendlePressOrder.test.js \
  client/src/components/join/BendleBoard.test.jsx client/src/components/host/BendleHostPanel.test.jsx \
  client/src/components/host/LiveMode.bendle.test.jsx client/src/components/host/BendleAdmin.test.jsx \
  client/src/components/display/slides/BendleRevealList.test.jsx client/src/components/display/slides/ShinyBendleQuestion.test.jsx
```
Expected: all PASS. Do not pipe through `tail`; read the exit code.

- [ ] **Step 2: Full suite and build** (outside the sandbox: relay suites bind localhost)

```bash
VITE_SUPABASE_URL=http://127.0.0.1:9 VITE_SUPABASE_ANON_KEY=dummy npm run test:unit; echo "exit=$?"
npm run build; echo "exit=$?"
```
Expected: `exit=0` twice. Compare the failure list with `main` before blaming this branch.

- [ ] **Step 3: DB tests** — Task 2 Step 4 against the throwaway database. Expected: "all checks passed".

- [ ] **Step 4: Isolated browser checks (headless, bundled Chromium only — never `executablePath`, never Ben's Chrome)**

Harness in `$SCRATCH/bendle-harness/` (`$SCRATCH` = this session's scratchpad), following the earlier drop-harness: `index.html` with `<div id="root">` and `main.jsx` importing by absolute path from this worktree:
- `?view=board&w=375|390|430`: `ThemeProvider` + `BendleBoard` with `preview`, a fixture step slide, and `catalogUrl="/fixture-catalog.json"` (a 30-row fixture in the harness folder). Variants via query: `search` (query "mr" typed through the input), `typed` (Use what I typed + artist field), `locked`, `revealed`.
- `?view=reveal&n=3|20`: `BendleRevealList` inside a full-viewport div with the theme's shiny background and the song title above it, as ShinyBendleQuestion lays it out.

Serve: `cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os/.worktrees/feat-shiny-rules-card && npx vite "$SCRATCH/bendle-harness" --port 5799 --strictPort`

Drive with a script using `require('/Users/bencoughlin/Projects/baynes-trivia/trivia-os/node_modules/playwright').chromium.launch()` (no options):
- Board at 375, 390 and 430 wide (all three together = a phone audit): screenshot each variant; assert `document.documentElement.scrollWidth <= innerWidth` and every `input` has computed `font-size >= 16px`.
- Reveal at 1920x1080 and 1280x720 with 3 and 20 teams, `reducedMotion` both `reduce` and `no-preference`: assert no vertical overflow and `min(computed font-size of [role=listitem]) >= 0.022 * min(innerWidth, innerHeight) - 0.5`.
- After Task 14: the Bendle rules card at 1920x1080 and 1280x720, full and reduced motion.
Look at every screenshot before reporting.

- [ ] **Step 5: Two-device rehearsal (manual, on a throwaway show, after the migration is applied by the owner)**

1. Laptop: /host Live Mode and /display on the TV output. Two phones on /join as two teams; a third team with no phone added on the scoreboard.
2. Shiny title → step 1: Next plays the clip. Phone A searches "mr bright", picks, locks: "Locked in at step 1". Host pane shows "1 of 3".
3. Phone B puts the phone to sleep for 60 s during step 1: no "stepped away" overlay on wake.
4. Next → step 2 (clip plays on Next). Phone A shows locked at step 1, is not pinned. Phone B types a title with "Use what I typed", leaves artist blank, locks at step 2.
5. Prev → step 1 → Next → step 2: nothing reopens, both phones still locked.
6. Next → step 3: first Next plays the clip (cue says "Play clip"), second Next runs the 3-2-1 and locks. A phone that picked but did not lock sees "Lock in now" during the countdown and "Guesses are locked" after.
7. Press A on step 1 earlier in the round: nothing shows on the TV.
8. A on step 3: TV lists all three teams (correct first, "No guess" for the third), vocals play. Phones show their own result. Scoreboard shows the points once.
9. Set the no-phone team to 20 in the host dropdown: scoreboard updates, TV list re-sorts.
10. Unlock (two taps): phones reopen at step 3 only; a re-lock and A rescore without double-counting.
11. iPad remote (if linked): Next on step 3 shows "Play clip" then "Lock"; Answer on step 1 shows "Bendle shows the answer after step 3 is locked"; Fix drawer Unlock and Rescore work on step 3.
12. Airplane mode on phone A, reload: board still offers "Use what I typed".

**Not automatable here:** the live Wikidata build and its coverage of real picks (owner, Task 7 Step 6); the trigger and RPC on production; iOS Safari keyboard, sleep and `visibilitychange` behavior; TV audio and vocals timing; venue wifi; a Stream Deck press landing on the /display window (that path never starts a lock countdown, `Display.jsx:1384-1399`, so a TV-window Next on step 3 after the clip advances off step 3 unlocked — pre-existing for every phone mechanic).

---

## Self-review

**Spec coverage**

| Spec requirement | Task |
|---|---|
| Static Wikidata catalog, 4 item types, P175, 3+ sitelinks, one-at-a-time, User-Agent with contact, dedupe, rank, versioned file | T7 (script), T6 (loader), T7 Step 6 (owner run) |
| No live music service; Spotify picker/jukebox untouched | Global Constraints; no task edits them |
| Guess shape `{title, artist, source, qid}` | Shared Types, T1 `parseGuess`, T10 |
| Title match with Damerau tolerance, ≤4 exact, empty never | T1 |
| Artist rule (split, main artist, "the", title-only fallback, cover misses) | T1 |
| Normalization steps | T1 |
| Step points 30/20/10, wrong/missing 0 | T1 `stepPoints`, T12 |
| Host override 0/10/20/30, covers no-phone team | T1 `applyBendleOverrides`, T4, T12 |
| Quick Entry not used once phone play is on | T15 (SKILL.md note); no code gate (open question 6) |
| Aliases prompt in song editor | T5 |
| Board: ready, search (100 ms debounce, word-prefix, top 8 by rank), typed row + artist, preview, lock, locked state on other steps | T6, T10 |
| Offline / catalog failure keeps typed path | T10 test "works typed-only" |
| One guess across three slides, `onAnswered(true)` on sibling rows | T10, T8 helpers, T13 |
| "Lock in now" during countdown; unlocked guess scores 0 | T10; T2 trigger `bendle_locked` |
| 30 s lockout decision | T13 (exempt Bendle) |
| DB trigger: live slide only, no write after lock, one row per team per group, no UPDATE | T2 |
| Duplicate/rejected second tap treated as success; "step moved on" message | T10 `saveErrorKind` |
| Host-gated delete RPC (`host_verified`) | T2, T12 `unlockBendle` |
| `PHONE_MECHANICS.bendle` + `lockHere` used by pendingLockPhase/pendingReveal/panel/remoteFix | T8; T4/T12 panel; remoteFix needs no change (T9 test) |
| Press order play, lock, A, Next with test | T9 |
| Lock writes only `bendleLocked` + `bendleLockedAt` | T12 test |
| A refuses on steps 1-2; on step 3 grades by `shinyGroupId`+`bendleStepIndex`, overrides, publishes results+reveal together, idempotent score keyed to step 3, vocals | T9, T12, T11 |
| `ShinyBendleQuestion` reveals on `answer_reveal || bendleRevealed` | T11 |
| Unlock clears fields, deletes rows, clears revealed | T8 `unlockPatch`, T12 |
| Replay protection (Prev/Next within group), jump/goLive carry-over | T8 |
| `lockHandlersRef`, `scoreActionFor`, fix-busy map, `runHostCommand` routing, iPad lock/rescore | T12 (relay unchanged: commands are generic) |
| Dead `bendle_answer_counts` removed | T2 |
| TV list: all teams, guess, step, ✓/✗, points, order, "No guess", 2 columns past 10, ≥2.2vmin | T3, T11, T16 Step 4 |
| Phones show own guess, result, step, points | T10 |
| Host "N of M locked" and per-team table | T4 |
| Rules card copy + phone search mock; doc/tests; stale comments | T14 (blocked on #33), T15 |
| Verification list (unit, component, DB, stepping, browser, rehearsal) | T16 |

**Placeholder scan:** no TBD/TODO. Two steps depend on facts this plan could not read: the `shows` NOT NULL columns in the DB test fixture (the step says how to find them) and LiveMode's exact keydown key string for the A test (the step says to grep it). Task 14's visual is described, not coded, because it must be written on top of #33's version of `BendleExplainer.jsx`.

**Type consistency:** `bendleLocked`, `bendleLockedAt`, `bendleRevealed`, `bendleResults`, `bendleOverrides`, `bendleStepIndex`, `shinyGroupId` are used with one spelling throughout. `computeBendleScoreUpdates` takes `lockSlideId` everywhere (T1, T12). `bendleStepIds` returns an array indexed by step in T1, T4, T10, T12. `BendleHostPanel` props match between T4 and T12. Trigger messages match between T2 and T10's `saveErrorKind`. `answerHeld` / `'answer-held'` match between T9 and T12.

## Open questions for the owner

1. **Where to run the DB tests.** This repo's migrations do not create `shows` (no base schema migration), so a local stack cannot build the schema; a scratch project loaded from a schema-only dump, or a Supabase branch (may cost money), are the options.
2. **Unlock clears every team's guess**, and re-guesses can only happen at step 3 (10 points) because the trigger allows the live step only. Is that the intent, or should Unlock clear one team?
3. **QID in catalog rows.** The guess shape has `qid`, but the spec's file rows are `[title, artist, rank]`; this plan stores `qid: null`. Adding QIDs costs roughly another 0.2 MB gzipped and nothing reads them.
4. **Overrides across Unlock.** The plan keeps `bendleOverrides` through Unlock (Pin It precedent, `slideStepping.js:390-392`) and clears them only on fresh entry. Say if Unlock should clear them.
5. **TV-window Next skips the lock** on every phone mechanic (`Display.jsx:1384-1399`); for Bendle a Stream Deck press focused on /display after step 3's clip leaves step 3 unlocked. Not fixed here.
6. **Quick Entry double-count** is a usage rule only (SKILL.md note). Say if the scoreboard should block written points on a phone-played Bendle round.
