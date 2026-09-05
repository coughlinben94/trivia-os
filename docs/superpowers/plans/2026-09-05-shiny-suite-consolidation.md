# Shiny Suite Consolidation (H1-H5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close a live scoring bug (Bendle's lock flags never reset on fresh slide entry) and four real simplify/level-up opportunities across Trivia OS's shiny-question suite, found by a Fable 5.1 critique and approved by Ben in full.

**Architecture:** Five independently-shippable changes to already-working, already-live shared files behind the four phone-scored mechanics (matching/wager/order/bendle): a shared mechanic descriptor table (H1), a shared lock-and-score helper (H2, depends on H1), a missing post-creation editor for Bendle (H3), a scoped bugfix in the archive bulk-entry panel (H4), and a missing TV status line for Matching (H5). No new shiny formats, no behavior changes beyond what's specified — H1/H2 are explicitly behavior-preserving refactors.

**Tech Stack:** React + Vite, Supabase (Postgres + Realtime), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-05-shiny-suite-consolidation-design.md`

## Global Constraints

- This touches shared files behind matching/wager/order — all live, all working, all already reviewed once (Bendle's build). A regression to any of them is worse than not doing this pass. `npx vitest run` and `npm run build` must stay green after every task.
- H1 and H2 are behavior-preserving refactors, not behavior changes, except the one deliberate bug fix (Bendle's missing lock-field reset — C1). If a task's refactor would change observable behavior anywhere else, stop and flag it rather than shipping the change silently.
- Task order matters: H1 before H2 (H2's control-panel collapse reads H1's `pendingLockPhase`/`pendingReveal`). H3, H4, H5 are independent of each other and of H1/H2, but H4 is explicitly lowest priority (Ben: "it just doesn't need to be prioritized") — do it last.
- No scope creep into Fable's Nice-to-have list (N1-N6) — those are explicitly out of scope for this pass (see spec's "Explicitly out of scope" section).
- `roundKeyFor(show, slide)` already exists (used by order/wager/bendle's handlers) — H2's shared helper should use it uniformly; this incidentally fixes matching's inline `roundKey` computation (`round ? \`r_${round.id}\` : 'bonus'`) without that being a separate task.

---

### Task 1 (H1): One shared mechanic descriptor in `slideStepping.js`

**Files:**
- Modify: `client/src/lib/slideStepping.js`
- Modify: `client/src/views/Join.jsx`
- Modify: `client/src/lib/slideStepping.test.js`

**Interfaces:**
- Produces: `PHONE_MECHANICS` (exported table), rewritten `pendingLockPhase`/`pendingReveal`/`REVEAL_FIELD`/`withEntryState` deriving from it — all four keep their existing exported names and call signatures, so Task 2 (H2) and every existing caller (`LiveMode.jsx`'s `lockHandlersRef`, `Display.jsx`) need zero changes.
- Consumes: `isMatchingShiny`/`isWagerShiny`/`isOrderShiny`/`isBendleShiny` (`shinySeries.js`, unchanged).

- [ ] **Step 1: Write the failing tests**

The existing `slideStepping.test.js` already has `describe('pendingLockPhase', ...)` and `describe('pendingReveal', ...)` blocks covering matching/wager/order/bendle — read them first to match their exact fixture shape (`shiny()` helper, etc.) before adding. Add these cases (the ones that prove C1 is fixed):

```javascript
// Inside describe('pendingLockPhase' or a new describe('C1 regression'), matching the file's existing fixture helper:
it('PHONE_MECHANICS lists a lockFields entry and revealField for every mechanic REVEAL_FIELD lists', () => {
  for (const key of Object.keys(REVEAL_FIELD)) {
    expect(PHONE_MECHANICS[key]).toBeDefined()
    expect(PHONE_MECHANICS[key].lockFields.length).toBeGreaterThan(0)
    expect(PHONE_MECHANICS[key].revealField).toBe(REVEAL_FIELD[key])
  }
})

it('withEntryState clears a stale bendleGuessesLocked flag on fresh entry (C1)', () => {
  const slide = { id: 's1', data: { isShiny: true, shinyInputSchema: { type: 'bendle' }, bendleGuessesLocked: true, bendleRevealed: true } }
  const [result] = withEntryState([slide], slide, {})
  expect(result.data.bendleGuessesLocked).toBe(false)
  expect(result.data.bendleRevealed).toBe(false)
})

it('withEntryState protects a locked bendle slide during re-entry (protectInProgress)', () => {
  const slide = { id: 's1', data: { isShiny: true, shinyInputSchema: { type: 'bendle' }, bendleGuessesLocked: true, bendleRevealed: false } }
  const [result] = withEntryState([slide], slide, { protectInProgress: true })
  expect(result.data.bendleGuessesLocked).toBe(true)
})
```

Also add the wager two-phase edge case, since this is the one place a naive derivation breaks (see spec's H1 section):

```javascript
it('pendingLockPhase still walks wager tiers-then-guesses in order after the refactor', () => {
  const untiered = { data: { isShiny: true, shinyInputSchema: { type: 'wager' }, wagerTiersLocked: false, wagerGuessesLocked: false } }
  expect(pendingLockPhase(untiered)).toBe('wager-tiers')
  const tiered = { data: { isShiny: true, shinyInputSchema: { type: 'wager' }, wagerTiersLocked: true, wagerGuessesLocked: false } }
  expect(pendingLockPhase(tiered)).toBe('wager-guesses')
  const both = { data: { isShiny: true, shinyInputSchema: { type: 'wager' }, wagerTiersLocked: true, wagerGuessesLocked: true } }
  expect(pendingLockPhase(both)).toBeNull()
})

it('pendingReveal keys wager off wagerGuessesLocked alone, not both lock fields', () => {
  // tiers locked, guesses not — no reveal owed yet, matching current live behavior
  const midWager = { data: { isShiny: true, shinyInputSchema: { type: 'wager' }, wagerTiersLocked: true, wagerGuessesLocked: false, wagerRevealed: false } }
  expect(pendingReveal(midWager)).toBeNull()
  const readyWager = { data: { isShiny: true, shinyInputSchema: { type: 'wager' }, wagerTiersLocked: true, wagerGuessesLocked: true, wagerRevealed: false } }
  expect(pendingReveal(readyWager)).toBe('wager')
})
```

Import `PHONE_MECHANICS` alongside the file's existing imports from `slideStepping.js` at the top of the test file.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run client/src/lib/slideStepping.test.js`
Expected: FAIL — `PHONE_MECHANICS` doesn't exist yet; the C1 regression test fails because `withEntryState` doesn't clear `bendleGuessesLocked` today (this is the live bug — confirm the failure is exactly this, not a typo in your test).

- [ ] **Step 3: Add `PHONE_MECHANICS` and rewrite the four consumers in `slideStepping.js`**

Read the current file's imports at the top (it already imports `isMatchingShiny, isWagerShiny, isOrderShiny, isBendleShiny` from `shinySeries.js` — confirm the exact import line before editing it) and the real current bodies of `pendingLockPhase` (currently ~line 327-338), `REVEAL_FIELD` (~343-349), `pendingReveal` (~359-368), and `withEntryState`'s `protectLockedFlags` (~127-128) and clear-list (~136-144) — line numbers may have shifted slightly since this plan was written; read the file first.

Add near the top of the mechanics section (before `pendingLockPhase`):

```javascript
// One definition of "what does mechanic X need to lock/reveal/reset" — every
// place that used to restate this list by hand (pendingLockPhase,
// pendingReveal, REVEAL_FIELD, withEntryState's clear/protect lists,
// Join.jsx's liveSlideIsInteractive/interactivePhaseKey) now derives from
// here. Bendle shipped without its lockFields being added to withEntryState's
// clear list (2026-09-05 whole-branch audit, C1) — a rehearsal-locked Bendle
// slide stayed locked live, silently. One table instead of seven hand-written
// lists is how the next mechanic doesn't repeat that.
//
// lockFields order matters: wager is the one two-phase mechanic (a blind
// tier pick, then the numeric guess), and callers that need "which phase is
// still open" (pendingLockPhase) walk lockFields in order and return the
// first one not yet set. Callers that need "is ANY locking still pending at
// all" (liveSlideIsInteractive) check only the LAST field — wager stays
// interactive through both phases, only releasing once the guess locks, not
// the moment tiers lock (a team still has to enter a number once the
// question is revealed).
export const PHONE_MECHANICS = {
  matching: { guard: isMatchingShiny, lockFields: ['matchingLocked'], revealField: 'matchingRevealed' },
  wager:    { guard: isWagerShiny,    lockFields: ['wagerTiersLocked', 'wagerGuessesLocked'], revealField: 'wagerRevealed' },
  order:    { guard: isOrderShiny,    lockFields: ['orderLocked'], revealField: 'orderRevealed' },
  bendle:   { guard: isBendleShiny,   lockFields: ['bendleGuessesLocked'], revealField: 'bendleRevealed' },
}
```

Replace `pendingLockPhase`'s body:

```javascript
export function pendingLockPhase(slide) {
  const data = slide?.data
  if (!data) return null
  for (const [key, m] of Object.entries(PHONE_MECHANICS)) {
    if (!m.guard(data)) continue
    if (m.lockFields.length === 1) {
      return !data[m.lockFields[0]] ? key : null
    }
    // Multi-phase (wager today): first unlocked field in order, phase-named
    // as `${key}-${fieldSuffix}` to preserve the exact existing phase
    // strings ('wager-tiers'/'wager-guesses') lockHandlersRef keys off.
    for (const field of m.lockFields) {
      if (!data[field]) {
        const suffix = field === 'wagerTiersLocked' ? 'tiers' : field === 'wagerGuessesLocked' ? 'guesses' : field
        return `${key}-${suffix}`
      }
    }
    return null
  }
  return null
}
```

Replace `REVEAL_FIELD`:

```javascript
export const REVEAL_FIELD = Object.fromEntries(
  Object.entries(PHONE_MECHANICS).map(([key, m]) => [key, m.revealField])
)
```

Replace `pendingReveal`'s body:

```javascript
export function pendingReveal(slide) {
  const data = slide?.data
  if (!data) return null
  for (const [key, m] of Object.entries(PHONE_MECHANICS)) {
    if (!m.guard(data)) continue
    const lastField = m.lockFields[m.lockFields.length - 1]
    return data[lastField] && !data[m.revealField] ? key : null
  }
  return null
}
```

In `withEntryState`, replace the `protectLockedFlags` line:

```javascript
const protectLockedFlags = protectInProgress &&
  Object.values(PHONE_MECHANICS).some(m => m.lockFields.some(f => slide.data?.[f]))
```

and replace the hand-written clear block (the seven `if (slide.data?.X) patch.X = false` lines) with:

```javascript
if (slide.data?.isShiny && !protectLockedFlags) {
  for (const m of Object.values(PHONE_MECHANICS)) {
    for (const f of m.lockFields) {
      if (slide.data?.[f]) patch[f] = false
    }
    if (slide.data?.[m.revealField]) patch[m.revealField] = false
  }
}
```

- [ ] **Step 4: Rewrite the two `Join.jsx` call sites**

Read the current exact lines first (`liveSlideIsInteractive` ~1281-1285, `interactivePhaseKey` ~1300 — already correctly includes `bendleGuessesLocked` from the Bendle final-review fix, commit `1f10a30`; this step replaces the hand-written version with a derived one, it does not add anything new here). Add `PHONE_MECHANICS` to the import from `slideStepping.js` at the top of `Join.jsx`.

```javascript
const liveSlideIsInteractive = !!(
  liveSlide?.type === 'question' && liveSlide.data?.isShiny &&
  Object.values(PHONE_MECHANICS).some(m => m.guard(liveSlide.data) && !liveSlide.data?.[m.lockFields[m.lockFields.length - 1]])
)
```

```javascript
const interactivePhaseKey = [
  liveSlide?.id,
  ...Object.values(PHONE_MECHANICS).flatMap(m => m.lockFields.map(f => liveSlide?.data?.[f])),
].join(':')
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run client/src/lib/slideStepping.test.js`
Expected: PASS, all tests including the new C1 regression tests and the wager two-phase tests.

- [ ] **Step 6: Run the full suite and build**

Run: `npx vitest run && npm run build`
Expected: PASS, 38 files / 675+ tests, clean build. Any failure outside `slideStepping.test.js` means this "behavior-preserving" refactor changed something it shouldn't have — do not proceed to commit until green.

- [ ] **Step 7: Commit**

```bash
git add client/src/lib/slideStepping.js client/src/lib/slideStepping.test.js client/src/views/Join.jsx
git commit -m "fix: add one PHONE_MECHANICS table, fixes Bendle's live lock-reset bug (C1)"
```

---

### Task 2 (H2): One shared `lockAndScore()` helper in `LiveMode.jsx`

**Files:**
- Modify: `client/src/components/host/LiveMode.jsx`

**Interfaces:**
- Consumes: `PHONE_MECHANICS`, `pendingLockPhase`, `pendingReveal` from Task 1.
- Produces: `handleLockAndScoreMatching`/`handleLockAndScoreOrder`/`handleLockAndScoreWagers`/`handleLockAndScoreBendle` keep their exact existing names and call signatures (so `lockHandlersRef` and every `onClick` in the control-panel JSX need zero changes) — internally they become thin wrappers around a new private `lockAndScore()` helper. `handleLockWagers` (the first-phase tiers-only lock) is untouched — it's a genuinely different operation, not a fifth call site.

- [ ] **Step 1: Read the real current state of all four handlers and the four control panels**

Read `LiveMode.jsx` in full for: the four `*Busy`/`*Error` `useState` pairs (~245-252), `scoringBusy` (~263), the slide-change error-clear effect (~281-286), `wagerActionShowing` (~306-310), `handleLockAndScoreMatching` (~356-442), `handleLockAndScoreOrder` (~454-518), `handleLockWagers` (~529-574, do not touch), `handleLockAndScoreWagers` (~580-703), `handleLockAndScoreBendle` (~710-818), `lockHandlersRef` assignment, and the four control-panel JSX blocks (~1390-1519). Confirm line numbers against the real file — this plan's numbers were verified 2026-09-05 but Task 1 may have shifted nearby lines slightly (Task 1 doesn't touch this file, so they shouldn't have, but verify).

- [ ] **Step 2: Add the shared `lockAndScore()` helper**

Place it above `handleLockAndScoreMatching`. This is the exact shared shape distilled from the four real handlers (every fetch, the cutoff filter, the zero-answers refusal, and the upsert are byte-identical across all four today except field names — verified 2026-09-05):

```javascript
// Shared shape behind every phone-scored mechanic's lock+score handler. Each
// mechanic differs only in: its lock field name(s), an optional pre-check
// before locking (wager refuses without a numeric Answer and a tier
// snapshot; bendle refuses without a song), an optional extra fetch beyond
// phone_answers/teams/scoreboard_teams (bendle needs the song row), and how
// it turns `answers` into scoreboard `updates` — matching and order call
// their compute*ScoreUpdates directly on raw answers in one step and write
// no results array back; wager and bendle build one entry per REGISTERED
// team first (not just answered teams — a team that never guessed is a real
// 0), score them, THEN compute updates, and persist a `*Results` array the
// reveal and phone popup both read. buildResults owns that difference,
// including which population's zero-updates case is a real "couldn't match
// the scoreboard" error (matching/order: any answers; wager/bendle: any
// registered team) — everything else here was drifting slightly out of sync
// between the four hand-copies before this existed (2026-09-05 consolidation).
async function lockAndScore({
  slide,
  lockField,            // e.g. 'matchingLocked', 'wagerGuessesLocked', 'bendleGuessesLocked'
  lockedAtField,         // e.g. 'matchingLockedAt', 'wagerGuessesLockedAt', 'bendleGuessesLockedAt'
  resultsField,           // 'wagerResults' | 'bendleResults' | null (matching/order write no results array)
  preCheck,                // optional: (slide) => error string | null, checked before any write
  loadExtra,                 // optional: async (slide) => extra | undefined — undefined means loadExtra already called setError and the caller must bail
  buildResults,               // ({ answers, teams, scoreboardTeams, roundKey, slideId, extra }) => { results: array|null, updates: array, unmatchedError: string|null }
  zeroAnswersErrorMsg,
  lateLogLabel,               // e.g. 'matching lock', 'wager-guess lock', 'bendle lock'
  force = false,
  setBusy, setError,
}) {
  setBusy(true)
  setError(null)
  try {
    if (preCheck) {
      const err = preCheck(slide)
      if (err) { setError(err); return }
    }

    let lockedAt = slide.data[lockedAtField]
    if (!slide.data[lockField]) {
      lockedAt = new Date().toISOString()
      actions.updateSlide(slide.id, { data: { ...slide.data, [lockField]: true, [lockedAtField]: lockedAt } })
      await actions.flushSlides()
      await new Promise(r => setTimeout(r, 700))
    }

    const { data: rawAnswers, error: fetchError } = await supabase
      .from('phone_answers')
      .select('team_id, answer, submitted_at')
      .eq('slide_id', slide.id)
    if (fetchError) { console.error('phone_answers fetch failed:', fetchError); setError('Scoring failed — check connection and retry'); return }
    const answers = rawAnswers?.filter(a => !a.submitted_at || a.submitted_at <= lockedAt) ?? []
    const lateCount = (rawAnswers?.length ?? 0) - answers.length
    if (lateCount > 0) console.warn(`[LiveMode] discarded ${lateCount} phone_answers row(s) submitted after ${lateLogLabel}`)

    const { data: teams, error: teamsError } = await supabase
      .from('teams')
      .select('id, name')
      .eq('show_id', show.id)
    if (teamsError) { console.error('teams fetch failed:', teamsError); setError('Scoring failed — check connection and retry'); return }

    const { data: scoreboardTeams, error: sbError } = await supabase
      .from('scoreboard_teams')
      .select('id, show_id, name, scores, sort_order')
      .eq('show_id', show.id)
    if (sbError) { console.error('scoreboard_teams fetch failed:', sbError); setError('Scoring failed — check connection and retry'); return }

    if (!force && answers.length === 0 && (teams?.length ?? 0) > 0) {
      setError(zeroAnswersErrorMsg)
      return
    }

    let extra
    if (loadExtra) {
      extra = await loadExtra(slide)
      if (extra === undefined) return // loadExtra already set its own error
    }

    const roundKey = roundKeyFor(show, slide)
    const { results, updates, unmatchedError } = buildResults({ answers, teams, scoreboardTeams, roundKey, slideId: slide.id, extra })

    if (unmatchedError) { setError(unmatchedError); return }

    if (updates.length > 0) {
      const { error: updateError } = await supabase.from('scoreboard_teams').upsert(updates)
      if (updateError) { console.error('scoreboard_teams score fold-in failed:', updateError); setError('Scoring failed — check connection and retry'); return }
    }

    const finalData = { ...slide.data, [lockField]: true, [lockedAtField]: lockedAt }
    if (resultsField && results) finalData[resultsField] = results
    await actions.updateSlide(slide.id, { data: finalData })
  } finally {
    setBusy(false)
  }
}
```

- [ ] **Step 3: Replace `handleLockAndScoreMatching`'s body with a thin wrapper**

```javascript
async function handleLockAndScoreMatching(slide, opts) {
  await lockAndScore({
    slide, force: opts?.force,
    lockField: 'matchingLocked', lockedAtField: 'matchingLockedAt', resultsField: null,
    lateLogLabel: 'matching lock',
    zeroAnswersErrorMsg: 'No answers came back — check connection and retry before scoring',
    buildResults: ({ answers, teams, scoreboardTeams, roundKey, slideId }) => {
      const updates = computeMatchingScoreUpdates({ answers, teams, scoreboardTeams, roundKey, pointsPerMatch: slide.data.pointsPerMatch ?? 2, slideId })
      const unmatchedError = answers.length > 0 && updates.length === 0
        ? 'No answers could be matched to the scoreboard — check team names match, then retry'
        : null
      return { results: null, updates, unmatchedError }
    },
    setBusy: setMatchingBusy, setError: setMatchingScoreError,
  })
}
```

Confirm the original zero-answers error message text — matching's original handler (unlike wager/bendle) had no named `*_ZERO_ANSWERS_ERROR` constant or force-override UI, so check whether the control panel actually offers a force-retry for matching today (grep the JSX for `matchingScoreError ===`); if matching never had a force-override path, `zeroAnswersErrorMsg` here still needs a real string (the fetch could still return empty), but confirm no override button needs wiring for it — don't add one that didn't exist before.

- [ ] **Step 4: Replace `handleLockAndScoreOrder`'s body the same way**

```javascript
async function handleLockAndScoreOrder(slide, opts) {
  await lockAndScore({
    slide, force: opts?.force,
    lockField: 'orderLocked', lockedAtField: 'orderLockedAt', resultsField: null,
    lateLogLabel: 'order lock',
    zeroAnswersErrorMsg: 'No answers came back — check connection and retry before scoring',
    buildResults: ({ answers, teams, scoreboardTeams, roundKey, slideId }) => {
      const updates = computeOrderScoreUpdates({
        answers, teams, scoreboardTeams, roundKey,
        points: slide.data.pointsForOrder ?? DEFAULT_ORDER_POINTS,
        correctOrder: slide.data.correctOrder ?? [],
        slideId,
      })
      const unmatchedError = answers.length > 0 && updates.length === 0
        ? 'No answers could be matched to the scoreboard — check team names match, then retry'
        : null
      return { results: null, updates, unmatchedError }
    },
    setBusy: setOrderBusy, setError: setOrderScoreError,
  })
}
```

Same confirm-no-force-override-existed check as matching.

- [ ] **Step 5: Replace `handleLockAndScoreWagers`'s body**

`handleLockWagers` (the tiers-only first lock) is NOT touched — leave it exactly as-is.

```javascript
async function handleLockAndScoreWagers(slide, { force = false } = {}) {
  await lockAndScore({
    slide, force,
    lockField: 'wagerGuessesLocked', lockedAtField: 'wagerGuessesLockedAt', resultsField: 'wagerResults',
    lateLogLabel: 'wager-guess lock',
    zeroAnswersErrorMsg: WAGER_ZERO_ANSWERS_ERROR,
    preCheck: s => {
      if (parseWagerNumber(s.data.answer) == null) return 'This slide’s Answer isn’t a number — fix it in the slide editor, then score'
      if (s.data.wagerTiers == null) return 'Wagers were never locked — tap Lock Wagers first'
      return null
    },
    buildResults: ({ answers, teams, scoreboardTeams, roundKey, slideId }) => {
      const guessByTeam = new Map((answers ?? []).map(r => [r.team_id, r.answer?.guess]))
      const tierSnapshot = slide.data.wagerTiers ?? {}
      const entries = (teams ?? []).map(t => ({
        teamId: t.id, teamName: t.name,
        tier: tierSnapshot[t.id] ?? DEFAULT_TIER_ID,
        guess: guessByTeam.get(t.id),
      }))
      const results = scoreWagerRound({ entries, correctAnswer: slide.data.answer })
      const updates = computeWagerScoreUpdates({ results, teams, scoreboardTeams, roundKey, slideId })
      const unmatchedError = entries.length > 0 && updates.length === 0
        ? 'No teams could be matched to the scoreboard — check team names match, then retry'
        : null
      return {
        results: results.map(r => ({ teamId: r.teamId, teamName: r.teamName, guess: r.guess, tier: r.tier, points: r.points, won: r.won })),
        updates, unmatchedError,
      }
    },
    setBusy: setWagerBusy, setError: setWagerError,
  })
}
```

- [ ] **Step 6: Replace `handleLockAndScoreBendle`'s body**

```javascript
async function handleLockAndScoreBendle(slide, { force = false } = {}) {
  await lockAndScore({
    slide, force,
    lockField: 'bendleGuessesLocked', lockedAtField: 'bendleGuessesLockedAt', resultsField: 'bendleResults',
    lateLogLabel: 'bendle lock',
    zeroAnswersErrorMsg: BENDLE_ZERO_ANSWERS_ERROR,
    preCheck: s => !s.data.bendleSongId
      ? 'This slide has no song attached — this shouldn’t be possible. Delete and recreate the slide.'
      : null,
    loadExtra: async s => {
      const { data: song, error: songError } = await supabase
        .from('bendle_songs')
        .select('answer, aliases')
        .eq('id', s.data.bendleSongId)
        .single()
      if (songError || !song) {
        console.error('bendle_songs fetch failed:', songError)
        setBendleError('Couldn’t read the song — check connection and retry')
        return undefined
      }
      return song
    },
    buildResults: ({ answers, teams, scoreboardTeams, roundKey, slideId, extra: song }) => {
      const answerByTeam = new Map((answers ?? []).map(r => [r.team_id, r.answer]))
      const entries = (teams ?? []).map(t => {
        const a = answerByTeam.get(t.id)
        return { teamId: t.id, teamName: t.name, guess: a?.guess ?? null, elapsedSeconds: a?.elapsedSeconds ?? null }
      })
      const results = scoreBendleRound({ entries, song })
      const updates = computeBendleScoreUpdates({ results, teams, scoreboardTeams, roundKey, slideId })
      const unmatchedError = entries.length > 0 && updates.length === 0
        ? 'No teams could be matched to the scoreboard — check team names match, then retry'
        : null
      return {
        results: results.map(r => ({ teamId: r.teamId, teamName: r.teamName, guess: r.guess, correct: r.correct, tierId: r.tierId, points: r.points })),
        updates, unmatchedError,
      }
    },
    setBusy: setBendleBusy, setError: setBendleError,
  })
}
```

- [ ] **Step 7: Register `lockAndScore`'s wrappers unchanged in `lockHandlersRef`**

`lockHandlersRef.current` already maps `matching`/`wager-tiers`/`wager-guesses`/`order`/`bendle` to these four function names plus `handleLockWagers` — since the wrapper functions keep their exact names and signatures, this assignment needs NO changes. Confirm this by reading it, don't skip verifying.

- [ ] **Step 8: Collapse the four control-panel JSX blocks into one**

Read the four blocks in full (~1390-1519) — they share one structural shape (a card, a status line, a lock/retry button, an optional error line, wager/bendle's optional force-override button). Replace all four with one block driven by `pendingLockPhase`/`pendingReveal` (Task 1) so it picks the right mechanic dynamically:

```javascript
{(() => {
  const phase = pendingLockPhase(currentSlide)
  const owesReveal = pendingReveal(currentSlide)
  const mechanic = phase?.split('-')[0] ?? owesReveal
  if (currentSlide?.type !== 'question' || !mechanic) return null
  // wagerTiers-only lock (phase === 'wager-tiers') still uses handleLockWagers,
  // not lockAndScore — keep that branch distinct from the other four.
  const panels = {
    matching: { busy: matchingBusy, error: matchingScoreError, locked: currentSlide.data?.matchingLocked, handler: handleLockAndScoreMatching, zeroErr: null, label: 'Matching question — teams are submitting on their phones' },
    order:    { busy: orderBusy, error: orderScoreError, locked: currentSlide.data?.orderLocked, handler: handleLockAndScoreOrder, zeroErr: null, label: 'Order Up question — teams are submitting on their phones' },
    wager:    { busy: wagerBusy, error: wagerError, locked: currentSlide.data?.wagerGuessesLocked, handler: currentSlide.data?.wagerTiers != null ? handleLockAndScoreWagers : handleLockWagers, zeroErr: WAGER_ZERO_ANSWERS_ERROR,
                label: currentSlide.data?.wagerTiers == null ? 'Wager question — teams are picking a risk tier. The question is hidden everywhere until you lock.' : currentSlide.data?.wagerGuessesLocked ? 'Guesses locked and scored — press A to reveal the answer on the TV.' : 'Wagers locked — the question is up and teams are entering numbers.' },
    bendle:   { busy: bendleBusy, error: bendleError, locked: currentSlide.data?.bendleGuessesLocked, handler: handleLockAndScoreBendle, zeroErr: BENDLE_ZERO_ANSWERS_ERROR, label: currentSlide.data?.bendleGuessesLocked ? 'Guesses locked and scored — press A to reveal the song on the TV.' : 'Bendle is playing — teams are guessing as the layers come in.' },
  }
  const p = panels[mechanic]
  if (!p) return null
  const buttonLabel = mechanic === 'wager' && currentSlide.data?.wagerTiers == null
    ? '🎲 Lock Wagers & Reveal Question'
    : p.locked ? '🔁 Retry Scoring' : '🔒 Lock Answers & Score'
  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-5 shrink-0">
      <p className="text-xs text-gray-400 mb-3">{p.label}</p>
      <button
        onClick={() => p.handler(currentSlide)}
        disabled={p.busy}
        className={`w-full py-3 rounded-xl border-2 font-semibold text-sm transition-[color,background-color,border-color,transform] duration-[120ms] active:scale-[0.97] ${
          p.busy ? 'border-gray-100 text-gray-300 cursor-not-allowed' : 'border-[#1a6b4a] text-[#1a6b4a] hover:bg-green-50'
        }`}
      >
        {p.busy ? (mechanic === 'wager' || mechanic === 'bendle' ? 'Working…' : 'Scoring…') : buttonLabel}
      </button>
      {p.error && <p className="text-xs text-red-600 mt-2 text-center">{p.error}</p>}
      {p.zeroErr && p.error === p.zeroErr && (
        <button
          onClick={() => p.handler(currentSlide, { force: true })}
          disabled={p.busy}
          className="w-full mt-2 py-2 rounded-lg border border-amber-300 text-amber-700 text-xs font-semibold hover:bg-amber-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Score anyway — 0 for every team
        </button>
      )}
    </div>
  )
})()}
```

This must render only while the panel SHOULD show — the original four blocks each additionally gated on `(!currentSlide?.data?.XRevealed || XError)` (keep showing the panel if there's an error even after reveal, so a late-discovered error's retry/override stays reachable). Fold that into the guard: only bail out of the whole block if `mechanic` is null AND there's no lingering error on any of the four `*Error` states for the current slide's type — read the original four conditions again before finalizing this guard, this is the one place a naive collapse could hide an error state the original code would have kept showing.

- [ ] **Step 9: Generalize `wagerActionShowing`**

Replace:
```javascript
const wagerActionShowing = currentSlide?.type === 'question'
  && isWagerShiny(currentSlide?.data)
  && !currentSlide?.data?.wagerRevealed
```
with:
```javascript
const phoneActionShowing = currentSlide?.type === 'question'
  && Object.values(PHONE_MECHANICS).some(m => m.guard(currentSlide?.data))
  && !currentSlide?.data?.[REVEAL_FIELD[Object.keys(PHONE_MECHANICS).find(k => PHONE_MECHANICS[k].guard(currentSlide?.data))]]
```
Find every place `wagerActionShowing` was read (grep the file) and update those call sites to `phoneActionShowing` — this is the B6 fix (scoreboard modal covering the Lock button) now applying to all four mechanics, not just wager.

- [ ] **Step 10: Run the full suite and build**

Run: `npx vitest run && npm run build`
Expected: PASS.

- [ ] **Step 11: Live-DB verification (all four mechanics)**

Same discipline as Bendle's Task 9 — insert real test rows into `phone_answers`/`teams`/`scoreboard_teams` for a throwaway show via Supabase MCP tools (project `qwtbgusqfoypvehnungr`, never `dreggwinegtirxxanntv`), and confirm, for EACH of matching/order/wager/bendle: a normal lock-and-score produces the same point values the pre-refactor code would have; the zero-answers refusal fires and (for wager/bendle) the force-override recovers it; a scoreboard-name-mismatch produces the "couldn't be matched" error; retry-after-lock is idempotent (doesn't double-score). Delete all test data afterward, confirm 0 rows remain.

- [ ] **Step 12: Commit**

```bash
git add client/src/components/host/LiveMode.jsx
git commit -m "refactor: collapse 4 lock-and-score handlers + control panels into one shared helper"
```

---

### Task 3 (H3): `BendleBuilder` + `preview` support in `BendleBoard.jsx`

**Files:**
- Modify: `client/src/components/join/BendleBoard.jsx`
- Modify: `client/src/components/host/SlideEditor.jsx`

**Interfaces:**
- Consumes: `BENDLE_TIERS` (`bendleScoring.js`), `bendle_songs` table.
- Produces: `BendleBuilder({ songId, onChangeSongId })` component; `BendleBoard` gains a `preview` prop matching `WagerBoard`'s contract.

- [ ] **Step 1: Read `WagerBoard.jsx`'s real `preview` handling in full**

Note every `if (preview) ...` guard (mount-check fetch skip, submit no-op, synthetic team count) — `WagerBoard.jsx:39,76,111,116,133,141,151` per the 2026-09-05 audit; confirm against the real current file.

- [ ] **Step 2: Add `preview` support to `BendleBoard.jsx`**

Read the current file in full first. Add a `preview = false` param to the component's props. Guard the mount-check `phone_answers` fetch effect to skip when `preview` (mirror `WagerBoard`'s exact pattern — same early-return shape, same dependency array change). Make the submit handler a no-op when `preview` (return early before any Supabase write). If `BendleBoard` fetches a live team/answer count anywhere, guard that too the same way `WagerBoard` does.

- [ ] **Step 3: Write a failing test for the preview guard**

If `BendleBoard.jsx` already has a test file, add a case there; if not, check whether `WagerBoard.jsx` has one to mirror. If neither has a test file, skip this step and rely on Step 8's manual verification — do not invent a new test-file convention for this one component.

- [ ] **Step 4: Write `BendleBuilder` in `SlideEditor.jsx`**

Read `WagerBuilder` (`SlideEditor.jsx:1729-1767`) in full first — this is close to that shape but needs an edit callback (Bendle's song pick isn't free text in the shared Answer field). Add near `WagerBuilder`:

```javascript
function BendleBuilder({ songId, onChangeSongId }) {
  const [songs, setSongs] = useState([])
  useEffect(() => {
    let cancelled = false
    supabase.from('bendle_songs').select('id, title, answer, aliases').order('title')
      .then(({ data }) => { if (!cancelled) setSongs(data ?? []) })
    return () => { cancelled = true }
  }, [])
  const selected = songs.find(s => s.id === songId)
  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Song</label>
        <select
          value={songId ?? ''}
          onChange={e => onChangeSongId(e.target.value || null)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-[#1a6b4a]"
        >
          <option value="">Pick a song…</option>
          {songs.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
        </select>
        {!selected && (
          <p className="text-xs text-amber-600 mt-1">⚠️ Pick a song — without one this question can't be scored.</p>
        )}
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Bendle steps</label>
        <div className="flex flex-col gap-1.5">
          {BENDLE_TIERS.map(t => (
            <div key={t.id} className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-gray-50 border border-gray-100">
              <span className="text-sm font-medium text-gray-800 flex-1">{t.label}</span>
              <span className="text-sm font-semibold text-gray-900 tabular-nums">{t.points} pts</span>
              <span className="text-xs text-gray-400">at {t.atSeconds}s</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
```

Confirm the exact `bendle_songs` fetch query matches what `AddSlideWizard.jsx`'s song picker already uses (same column list, same ordering) — reuse the pattern, don't invent a divergent one. Add `BENDLE_TIERS` to `SlideEditor.jsx`'s import from `bendleScoring.js` (new import line if none exists yet), and `useEffect`/`useState` to its React import if not already present.

- [ ] **Step 5: Wire `BendleBuilder` into `SlideEditor.jsx`'s dispatcher**

Read the real current dispatcher block (`~950-1010`, `schema.type === 'X'` branches) to confirm the exact surrounding shape, then add a sibling branch modeled on Wager's (`~980-995`):

```javascript
{schema.type === 'bendle' && (
  <>
    <BendleBuilder songId={data.bendleSongId} onChangeSongId={id => onChange('bendleSongId', id)} />
    <div className="flex flex-col gap-2">
      <label className="block text-xs font-medium text-gray-700">Phone preview — what teams see once guesses are open</label>
      <div style={{ width: 300, margin: '0 auto', padding: '1.25rem 1rem', borderRadius: 20, background: theme.colors.bg }}>
        <BendleBoard
          preview
          theme={theme}
          team={{ id: '__preview__', showId: show?.id ?? '__preview__' }}
          slide={{ id: slide.id, showId: show?.id, data: { ...data, bendleGuessesLocked: false, bendleRevealed: false } }}
        />
      </div>
    </div>
  </>
)}
```

Add the `BendleBoard` import to `SlideEditor.jsx` if not already present.

- [ ] **Step 6: Run the full suite and build**

Run: `npx vitest run && npm run build`
Expected: PASS.

- [ ] **Step 7: Manual verification**

Start the app locally (see Global Constraints — same care as prior tasks about not driving a full headless browser session if it risks stalling; a direct code read plus one lightweight check is acceptable). Open the slide editor for an existing Bendle slide (or create one), confirm: the song dropdown shows and can change the attached song, the tier list renders, the phone preview renders without throwing (confirms the `preview` guard works — no real Supabase write happens from the preview pane).

- [ ] **Step 8: Commit**

```bash
git add client/src/components/join/BendleBoard.jsx client/src/components/host/SlideEditor.jsx
git commit -m "feat: add BendleBuilder editor + preview support to BendleBoard"
```

---

### Task 4 (H5): Submitted-count line for `ShinyMatchingQuestion.jsx`

**Files:**
- Modify: `client/src/components/display/slides/ShinyMatchingQuestion.jsx`

**Interfaces:**
- Consumes: `phone_answers_count(slide_id)` RPC (already live, `supabase/migrations/20260817171310_lock_down_phone_answers_select.sql`).

- [ ] **Step 1: Read `ShinyOrderQuestion.jsx`'s real count-line implementation in full**

Confirm the exact effect shape (`submittedCount`/`teamCount` state, the `locked || revealed` stop condition, the 2s poll interval, the `phone_answers_count` RPC call, the `teams` head-count fetch) — `ShinyOrderQuestion.jsx:34-62` per the 2026-09-05 audit.

- [ ] **Step 2: Read `ShinyMatchingQuestion.jsx`'s real current beat-1 render**

Confirm the `locked` variable (`~line 26`, `!!data.matchingLocked`) and the `StatusSlot` render (`~line 54`, currently `{locked && !revealed ? <AnswersLockedBadge theme={theme} /> : null}`) — this `null` branch is where the count line goes when not locked.

- [ ] **Step 3: Add the count-line effects, copied-and-adapted from Order**

```javascript
const [submittedCount, setSubmittedCount] = useState(0)
const [teamCount, setTeamCount] = useState(0)

useEffect(() => {
  if (locked || revealed) return
  let cancelled = false
  async function load() {
    const { data: count } = await supabase.rpc('phone_answers_count', { p_slide_id: slide.id })
    if (!cancelled) setSubmittedCount(count ?? 0)
  }
  load()
  const interval = setInterval(load, 2000)
  return () => { cancelled = true; clearInterval(interval) }
}, [slide.id, locked, revealed])

useEffect(() => {
  if (!show?.id || revealed) return
  let cancelled = false
  supabase.from('teams').select('id', { count: 'exact', head: true }).eq('show_id', show.id)
    .then(({ count }) => { if (!cancelled) setTeamCount(count ?? 0) })
  return () => { cancelled = true }
}, [show?.id, revealed])
```

Add `useState`/`useEffect` to the React import if not already present, and `supabase` import if not already present (check — `ShinyOrderQuestion.jsx` already imports it, `ShinyMatchingQuestion.jsx` may already have it too for other reasons, verify before adding a duplicate).

- [ ] **Step 4: Render the count line**

Change the `StatusSlot` line from:
```javascript
<StatusSlot>{locked && !revealed ? <AnswersLockedBadge theme={theme} /> : null}</StatusSlot>
```
to (mirroring Order's exact render for the equivalent slot — read `ShinyOrderQuestion.jsx`'s count-line JSX and reuse the same text/style, not a new format):
```javascript
<StatusSlot>
  {locked && !revealed ? <AnswersLockedBadge theme={theme} /> :
   !revealed ? <CountLine n={submittedCount} total={teamCount} theme={theme} /> : null}
</StatusSlot>
```
If `ShinyOrderQuestion.jsx` defines its own local `CountLine` component rather than importing a shared one, copy its exact JSX/styling into `ShinyMatchingQuestion.jsx` (don't extract a new shared component as part of this task — out of scope, Fable's critique didn't ask for that and it would touch a third file unnecessarily).

- [ ] **Step 5: Run the full suite and build**

Run: `npx vitest run && npm run build`
Expected: PASS. If `ShinyOrderQuestion.test.jsx` exists and covers its count-line, check whether an equivalent test file exists for Matching — if the house convention has one, mirror it; if not, this is display-component work verified manually (Step 6).

- [ ] **Step 6: Manual verification**

Confirm on `/display` (or via careful code read if live verification isn't practical) that a live, unlocked Matching question now shows "N of M teams submitted," matching Order/Wager/Bendle's existing behavior.

- [ ] **Step 7: Commit**

```bash
git add client/src/components/display/slides/ShinyMatchingQuestion.jsx
git commit -m "feat: add submitted-count line to Matching's TV view, matching Order/Wager/Bendle"
```

---

### Task 5 (H4): Fix the preset-lock bug in `DatabaseAddPanels.jsx`

**Files:**
- Modify: `client/src/components/host/DatabaseAddPanels.jsx`

**Interfaces:** None external — purely internal to this panel's component state.

- [ ] **Step 1: Read the real current state of the three target spots**

Confirm `effectiveAssets` (`~line 200`: `const effectiveAssets = hasAssetPreset ? fmtAssetPreset : assetCount`), the `{!hasAssetPreset && (...)}` gate around the "How many assets?" input (`~line 393`), and find where `selectedShinyFmt` is set (search for `setSelectedShinyFmt` — likely in the format-picker step earlier in this file) to know where to add the pre-fill.

- [ ] **Step 2: Write a failing test if a test file exists for this component; otherwise skip to Step 3**

Check for `DatabaseAddPanels.test.jsx` or similar. If one exists and covers `effectiveAssets`/asset-count behavior, add a case proving: picking a format with `input_schema.slots = 4` pre-fills `assetCount` to 4 but the input stays visible and editable, and typing a different number overrides it (never silently reverts). If no test file exists for this component, skip — this panel's other bulk-entry logic (regular/swing/PYL) has no test coverage either per the file's own convention; don't introduce a new testing pattern for just this fix.

- [ ] **Step 3: Fix `effectiveAssets`**

Change:
```javascript
const effectiveAssets = hasAssetPreset ? fmtAssetPreset : assetCount
```
to:
```javascript
const effectiveAssets = assetCount
```
`hasAssetPreset`/`fmtAssetPreset` stay defined (used by the pre-fill in Step 5) but no longer override.

- [ ] **Step 4: Remove the input-hiding gate**

Change:
```javascript
{!hasAssetPreset && (
  <div className="flex-1">
    <label className="block text-xs font-medium text-gray-500 mb-1.5">How many assets?</label>
    ...
  </div>
)}
```
to the same `<div>` block unconditionally rendered (drop the `{!hasAssetPreset && ( ... )}` wrapper, keep everything inside it exactly as-is).

- [ ] **Step 5: Pre-fill `assetCount` from the preset when the format changes**

Find the exact `setSelectedShinyFmt(...)` call site(s) (read the file to confirm — likely a format-picker `onClick` handler). Immediately after setting the format, pre-fill the count:

```javascript
const preset = fmt?.input_schema?.slots
if (typeof preset === 'number' && preset > 0) setAssetCount(preset)
```

(`fmt` here is whatever the real local variable name is at that call site — confirm from the actual code, don't assume the name.) This must be a **pre-fill only** — if the host then edits the "How many assets?" field, their typed value must persist (it will, since `assetCount` is now the single source of truth per Step 3's fix) and must NOT get silently reset back to the preset on any subsequent render.

- [ ] **Step 6: Run the full suite and build**

Run: `npx vitest run && npm run build`
Expected: PASS.

- [ ] **Step 7: Manual verification — the panel's existing functionality must not regress**

Confirm: regular/swing/PYL bulk-entry (untouched by this fix) still works exactly as before. For a shiny format WITH a `slots` preset: the count input is now visible, pre-filled to the preset value, and editable — typing a different number and adding an entry uses the typed number, not the preset. For a shiny format WITHOUT a preset: unchanged behavior (blank/default count, host types a value). This panel is being kept deliberately (Ben, 2026-09-05: "just in case," "dont want to lose the functionality") — a regression here is a real problem.

- [ ] **Step 8: Commit**

```bash
git add client/src/components/host/DatabaseAddPanels.jsx
git commit -m "fix: stop DatabaseAddPanels' asset-count preset from hiding/overriding the host's input"
```

---

## Self-Review Notes

**Spec coverage:** H1 (Task 1), H2 (Task 2, depends on Task 1), H3 (Task 3), H4 (Task 5, deliberately last per Ben's deprioritization), H5 (Task 4) — all five covered, task order matches the plan's Global Constraints.

**Verified against real code, not assumed:** every file:line citation in this plan was confirmed against the actual current worktree state on 2026-09-05 (matching/order/wager/bendle's full handler bodies, the four control panels, `WagerBuilder`'s real minimal shape, `BendleBoard.jsx`'s absent `preview` prop, `DatabaseAddPanels.jsx`'s exact three-line bug, `ShinyOrderQuestion.jsx`'s count-line pattern, `computeMatchingScoreUpdates`/`computeOrderScoreUpdates`'s real signatures). Two corrections made during planning that the initial Fable critique's higher-level description would have gotten wrong if transcribed literally: `liveSlideIsInteractive`/`pendingReveal` must check the LAST lock field only (not "every field"), or wager's live interactivity breaks; `BendleBuilder` needs its own edit callback (not `WagerBuilder`'s read-only shape) since a song pick isn't free text.

**Known residual risk, not a plan defect:** Task 2's `unmatchedError` contract is a genuine synthesis (no single existing handler has this exact shape) — flagged explicitly in Task 2 Step 11 for mandatory live-DB verification across all four mechanics before considering H2 done, on top of the unit-test suite staying green.
