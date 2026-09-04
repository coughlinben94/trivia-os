# Bendle (Layered Audio Reveal Question) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a new phone-interactive shiny question format, Bendle — a song plays on `/display` starting with drums only, layering in bass/other/vocals over time, while teams guess via phone; earlier correct guesses score more.

**Architecture:** Bendle slots into Trivia OS's existing shiny-format system exactly the way Wager/Matching/Order already do (`shiny_formats` + `slide.data`, phone answers in `phone_answers`, scoring folded into `scoreboard_teams`). One new reference table (`bendle_songs`) holds reusable pre-separated song stems. Playback on `/display` uses Tone.js (new dependency) — four `Tone.Player`s synced to one `Tone.Transport`. Stem separation itself never runs in the app; it's an offline step (Demucs, local machine) whose output gets uploaded through a small admin panel.

**Tech Stack:** React + Vite, Supabase (Postgres + Realtime + Storage), Tone.js (new), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-04-bendle-layered-audio-question-design.md`

## Global Constraints

- Follow the existing shiny-format conventions exactly — do not invent a parallel system. Every naming pattern below (`data.bendleXxx`, `isBendleShiny`, `handleLockAndScoreBendle`) mirrors an existing Wager/Matching/Order equivalent on purpose; an implementer should open the cited wager file alongside their task and pattern-match.
- `/display` renders on real desktop Chrome at Baynes (confirmed) — do not add iOS/Safari-specific workarounds.
- `/display`'s audio-unlock is already solved at the page level (`Display.jsx`'s `onFirstInteraction` handler, ~line 1305, primes any `AudioContext` created later in the same tab; the standing operational practice is "tap the TV once during setup"). Bendle's Tone.js context does **not** need its own unlock gesture — do not add one.
- Per-stem load failure must degrade gracefully (skip that layer), never hang or crash the round on a live TV.
- Nothing on `/display` may render individual teams' guesses before lock — only aggregate counts (mirrors Wager's `wager_answer_counts` RPC pattern). This is the scale-to-30-teams requirement from the spec.
- Demucs only ever produces 4 stems (drums/bass/other/vocals) regardless of what instruments are actually in the mix — no per-instrument logic anywhere in this plan.
- RLS on every new table follows the exact precedent already in the codebase: `bendle_songs` write-gated by `host_verified` JWT claim (same as `shiny_formats`/`questions`); `phone_answers` reused as-is, no RLS changes.

---

### Task 1: Database — `bendle_songs` table + `bendle_answer_counts` RPC

**Files:**
- Create: `supabase/migrations/20260904120000_bendle_songs_table.sql`
- Create: `supabase/migrations/20260904120100_bendle_answer_counts_rpc.sql`

**Interfaces:**
- Produces: `bendle_songs` table (`id, title, answer, aliases, source_url, drums_url, bass_url, other_url, vocals_url, created_at`), `bendle_answer_counts(p_slide_id text) returns table(answered int, total int)` RPC — later tasks (admin upload, `/display`, `/join`) read/write these.

- [ ] **Step 1: Write the `bendle_songs` migration**

```sql
-- supabase/migrations/20260904120000_bendle_songs_table.sql
-- Reusable pre-separated song content for the Bendle shiny format. Stem
-- separation itself runs offline (Demucs, local machine) — this table only
-- ever receives finished stem URLs through the admin upload panel. See
-- docs/superpowers/specs/2026-09-04-bendle-layered-audio-question-design.md.
create table public.bendle_songs (
  id           text primary key,   -- 'bnd_' + nanoid(8), generated client-side —
                                    -- same convention as shiny_formats.id ('fmt_'+nanoid8)
  title        text not null,
  answer       text not null,
  aliases      text[] not null default '{}',
  source_url   text,               -- the YouTube URL it came from; not called live, prep-trail only
  drums_url    text not null,
  bass_url     text not null,
  other_url    text not null,
  vocals_url   text not null,
  created_at   timestamptz not null default now()
);

alter table public.bendle_songs enable row level security;

create policy "public read bendle_songs"
  on public.bendle_songs for select
  to public
  using (true);

create policy "host write bendle_songs insert"
  on public.bendle_songs for insert
  to public
  with check ((auth.jwt() -> 'app_metadata' ->> 'host_verified')::boolean = true);

create policy "host write bendle_songs update"
  on public.bendle_songs for update
  to public
  using ((auth.jwt() -> 'app_metadata' ->> 'host_verified')::boolean = true)
  with check ((auth.jwt() -> 'app_metadata' ->> 'host_verified')::boolean = true);

create policy "host write bendle_songs delete"
  on public.bendle_songs for delete
  to public
  using ((auth.jwt() -> 'app_metadata' ->> 'host_verified')::boolean = true);
```

- [ ] **Step 2: Apply it and verify live**

Run: `cd ~/Projects/baynes-trivia/trivia-os && supabase db push` (or apply via the Supabase MCP `apply_migration` tool against project `qwtbgusqfoypvehnungr` — **never** `dreggwinegtirxxanntv`, that's Baynes Business Suite).
Expected: migration applies cleanly. Verify with `select * from public.bendle_songs limit 1;` (empty result, no error) and confirm RLS policies exist via `select policyname from pg_policies where tablename = 'bendle_songs';` — expect 4 rows.

- [ ] **Step 3: Write the `bendle_answer_counts` RPC migration**

Mirrors `wager_answer_counts` — returns only an aggregate, never individual guesses, so `/display` can show "N of M teams guessed" before lock without leaking answers past `phone_answers`' tightened SELECT policy.

```sql
-- supabase/migrations/20260904120100_bendle_answer_counts_rpc.sql
create or replace function public.bendle_answer_counts(p_slide_id text)
returns table(answered int, total int)
language sql
security definer
set search_path = public
as $$
  select
    (select count(*)::int from public.phone_answers
       where slide_id = p_slide_id and answer ? 'guess' and (answer->>'guess') is not null and trim(answer->>'guess') != ''),
    (select count(*)::int from public.teams t
       where t.show_id = (select show_id from public.phone_answers where slide_id = p_slide_id limit 1)
          or t.show_id = (select s.id::text from public.shows s, jsonb_array_elements(s.slides) sl
                            where sl->>'id' = p_slide_id limit 1))
$$;

grant execute on function public.bendle_answer_counts(text) to anon, authenticated;
```

- [ ] **Step 4: Apply and verify**

Run: same push/apply-migration method as Step 2.
Expected: `select * from public.bendle_answer_counts('nonexistent-slide');` returns one row, `answered=0, total=0` (or `null` if no team can be resolved — acceptable, `/display`'s consumer in Task 7 treats `null` as `0`).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260904120000_bendle_songs_table.sql supabase/migrations/20260904120100_bendle_answer_counts_rpc.sql
git commit -m "feat: add bendle_songs table and bendle_answer_counts RPC"
```

---

### Task 2: `bendleScoring.js` — pure scoring functions (TDD)

**Files:**
- Create: `client/src/lib/bendleScoring.js`
- Create: `client/src/lib/bendleScoring.test.js`

**Interfaces:**
- Consumes: nothing (pure functions).
- Produces: `BENDLE_TIERS` (array), `matchesBendleAnswer(guess, answer, aliases)`, `resolveBendleTier(elapsedSeconds, tiers)`, `scoreBendleRound({ entries, song })`, `computeBendleScoreUpdates({ results, teams, scoreboardTeams, roundKey, slideId })` — Task 9 (`LiveMode.jsx`) calls `scoreBendleRound` and `computeBendleScoreUpdates` directly; Task 7 (`ShinyBendleQuestion.jsx`) imports `BENDLE_TIERS` for the default tier ladder and reveal display.

- [ ] **Step 1: Write the failing tests**

```javascript
// client/src/lib/bendleScoring.test.js
import { describe, it, expect } from 'vitest'
import {
  BENDLE_TIERS, matchesBendleAnswer, resolveBendleTier,
  scoreBendleRound, computeBendleScoreUpdates,
} from './bendleScoring.js'

describe('matchesBendleAnswer', () => {
  it('matches the canonical answer case-insensitively', () => {
    expect(matchesBendleAnswer('bohemian rhapsody', 'Bohemian Rhapsody', [])).toBe(true)
  })
  it('matches an alias', () => {
    expect(matchesBendleAnswer('sweet child o mine', 'Sweet Child o\' Mine', ["sweet child o' mine", 'sweet child of mine'])).toBe(true)
  })
  it('trims whitespace before comparing', () => {
    expect(matchesBendleAnswer('  Hey Jude  ', 'Hey Jude', [])).toBe(true)
  })
  it('rejects a non-match', () => {
    expect(matchesBendleAnswer('yesterday', 'Hey Jude', [])).toBe(false)
  })
  it('rejects an empty guess', () => {
    expect(matchesBendleAnswer('', 'Hey Jude', [])).toBe(false)
  })
  it('rejects a null guess', () => {
    expect(matchesBendleAnswer(null, 'Hey Jude', [])).toBe(false)
  })
})

describe('resolveBendleTier', () => {
  const tiers = [
    { id: 'drums', label: 'Drums Only', atSeconds: 0, points: 40 },
    { id: 'bass', label: '+ Bass', atSeconds: 20, points: 30 },
    { id: 'other', label: '+ Everything Else', atSeconds: 40, points: 20 },
    { id: 'vocals', label: '+ Vocals', atSeconds: 60, points: 10 },
  ]
  it('returns the drums tier for elapsed=0', () => {
    expect(resolveBendleTier(0, tiers).id).toBe('drums')
  })
  it('returns the drums tier just before the bass boundary', () => {
    expect(resolveBendleTier(19.9, tiers).id).toBe('drums')
  })
  it('returns the bass tier exactly at its boundary', () => {
    expect(resolveBendleTier(20, tiers).id).toBe('bass')
  })
  it('returns the vocals tier for elapsed past the last boundary', () => {
    expect(resolveBendleTier(500, tiers).id).toBe('vocals')
  })
  it('returns the drums tier for negative elapsed (defensive)', () => {
    expect(resolveBendleTier(-5, tiers).id).toBe('drums')
  })
})

describe('scoreBendleRound', () => {
  const song = { answer: 'Hey Jude', aliases: [] }
  const tiers = BENDLE_TIERS

  it('awards the drums-tier points to a correct early guess', () => {
    const results = scoreBendleRound({
      entries: [{ teamId: 't1', teamName: 'Alpha', guess: 'Hey Jude', elapsedSeconds: 5 }],
      song,
    })
    expect(results[0]).toMatchObject({ teamId: 't1', correct: true, tierId: 'drums', points: 40 })
  })

  it('awards fewer points to a correct later guess', () => {
    const results = scoreBendleRound({
      entries: [{ teamId: 't1', teamName: 'Alpha', guess: 'Hey Jude', elapsedSeconds: 45 }],
      song,
    })
    expect(results[0]).toMatchObject({ tierId: 'other', points: 20 })
  })

  it('awards zero points to a wrong guess regardless of timing', () => {
    const results = scoreBendleRound({
      entries: [{ teamId: 't1', teamName: 'Alpha', guess: 'Yesterday', elapsedSeconds: 5 }],
      song,
    })
    expect(results[0]).toMatchObject({ correct: false, tierId: null, points: 0 })
  })

  it('awards zero points to a team that never guessed', () => {
    const results = scoreBendleRound({
      entries: [{ teamId: 't1', teamName: 'Alpha', guess: null, elapsedSeconds: null }],
      song,
    })
    expect(results[0]).toMatchObject({ correct: false, tierId: null, points: 0 })
  })

  it('matches an alias for full credit', () => {
    const aliasSong = { answer: 'Sweet Child o\' Mine', aliases: ['sweet child of mine'] }
    const results = scoreBendleRound({
      entries: [{ teamId: 't1', teamName: 'Alpha', guess: 'sweet child of mine', elapsedSeconds: 5 }],
      song: aliasSong,
    })
    expect(results[0].correct).toBe(true)
  })

  it('sorts correct-and-earliest first', () => {
    const results = scoreBendleRound({
      entries: [
        { teamId: 't1', teamName: 'Late', guess: 'Hey Jude', elapsedSeconds: 55 },
        { teamId: 't2', teamName: 'Early', guess: 'Hey Jude', elapsedSeconds: 2 },
        { teamId: 't3', teamName: 'Wrong', guess: 'Nope', elapsedSeconds: 1 },
      ],
      song,
    })
    expect(results.map(r => r.teamId)).toEqual(['t2', 't1', 't3'])
  })
})

describe('computeBendleScoreUpdates', () => {
  it('folds points into the round key, preserving other phone-scored slides in the same round', () => {
    const results = [{ teamId: 'team-1', teamName: 'Alpha', points: 40, correct: true, tierId: 'drums', guess: 'Hey Jude' }]
    const teams = [{ id: 'team-1', name: 'Alpha' }]
    const scoreboardTeams = [{
      id: 'sb-1', show_id: 'show-1', name: 'Alpha', sort_order: 0,
      scores: { r1: { written: 10, phone: { 'other-slide': 20 } } },
    }]
    const updates = computeBendleScoreUpdates({
      results, teams, scoreboardTeams, roundKey: 'r1', slideId: 'bendle-slide',
    })
    expect(updates).toHaveLength(1)
    expect(updates[0].scores.r1.phone).toEqual({ 'other-slide': 20, 'bendle-slide': 40 })
    expect(updates[0].scores.r1.written).toBe(10)
  })

  it('skips a result with no live team registration', () => {
    const results = [{ teamId: 'ghost', teamName: 'Ghost', points: 40, correct: true, tierId: 'drums', guess: 'x' }]
    const updates = computeBendleScoreUpdates({ results, teams: [], scoreboardTeams: [], roundKey: 'r1', slideId: 's1' })
    expect(updates).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~/Projects/baynes-trivia/trivia-os && npx vitest run client/src/lib/bendleScoring.test.js`
Expected: FAIL — `bendleScoring.js` does not exist.

- [ ] **Step 3: Implement `bendleScoring.js`**

```javascript
// client/src/lib/bendleScoring.js
import { normalizeRoundScore } from './scoreboardMath.js'

// The default tier ladder: earlier layers are harder to guess, so they pay
// more. Not exposed for per-slide editing in this build (mirrors WAGER_TIERS
// being fixed, not configurable) — a follow-up if the defaults don't hold up
// live. See docs/superpowers/specs/2026-09-04-bendle-layered-audio-question-design.md.
export const BENDLE_TIERS = [
  { id: 'drums',  label: 'Drums Only',        atSeconds: 0,  points: 40 },
  { id: 'bass',   label: '+ Bass',            atSeconds: 20, points: 30 },
  { id: 'other',  label: '+ Everything Else', atSeconds: 40, points: 20 },
  { id: 'vocals', label: '+ Vocals',          atSeconds: 60, points: 10 },
]

function normalize(s) {
  return (s ?? '').toString().trim().toLowerCase()
}

// Exact-after-normalize match against the canonical answer or any alias.
// No fuzzy-distance library — aliases are how this codebase already covers
// real spelling/title variants (same bar every other free-text answer in
// this app clears).
export function matchesBendleAnswer(guess, answer, aliases) {
  const g = normalize(guess)
  if (!g) return false
  if (g === normalize(answer)) return true
  return (aliases ?? []).some(a => normalize(a) === g)
}

// Which tier was active at this many elapsed seconds. Tiers must be in
// ascending atSeconds order (same load-bearing-order contract WAGER_TIERS
// documents) — walks forward and returns the LAST tier whose atSeconds <=
// elapsed, defaulting to the first tier for anything before/at zero.
export function resolveBendleTier(elapsedSeconds, tiers) {
  const list = tiers ?? BENDLE_TIERS
  let active = list[0]
  for (const tier of list) {
    if (tier.atSeconds <= elapsedSeconds) active = tier
    else break
  }
  return active
}

// entries: [{ teamId, teamName, guess, elapsedSeconds }]. song: { answer, aliases }.
// A team with no guess (guess == null) scores 0, sorted last — same "no
// guess isn't a bad guess, it's no guess" convention scoreWagerRound uses.
export function scoreBendleRound({ entries, song, tiers = BENDLE_TIERS }) {
  const rows = (entries ?? []).map(e => {
    const correct = e.guess != null && matchesBendleAnswer(e.guess, song?.answer, song?.aliases)
    const tier = correct && e.elapsedSeconds != null ? resolveBendleTier(e.elapsedSeconds, tiers) : null
    return {
      teamId: e.teamId,
      teamName: e.teamName ?? null,
      guess: e.guess ?? null,
      elapsedSeconds: e.elapsedSeconds ?? null,
      correct,
      tierId: tier?.id ?? null,
      points: tier?.points ?? 0,
    }
  })

  return rows.sort((a, b) => {
    if (a.correct !== b.correct) return a.correct ? -1 : 1
    if (!a.correct) return 0
    return a.elapsedSeconds - b.elapsedSeconds
  })
}

// Same fold-in contract as computeWagerScoreUpdates — writes only this
// slide's entry into the round's phoneBySlide bucket, preserving every
// other phone-scored slide already in the round. Dedupes by scoreboard team
// id (last write wins) so a host data-entry name collision can't crash the
// upsert's ON CONFLICT clause.
export function computeBendleScoreUpdates({ results, teams, scoreboardTeams, roundKey, slideId }) {
  const teamIdToName = new Map((teams ?? []).map(t => [t.id, t.name.trim().toLowerCase()]))
  const updates = []
  for (const r of results ?? []) {
    const teamName = teamIdToName.get(r.teamId)
    if (!teamName) continue
    const sbTeam = (scoreboardTeams ?? []).find(t => t.name.trim().toLowerCase() === teamName)
    if (!sbTeam) continue
    const prevSplit = normalizeRoundScore(sbTeam.scores?.[roundKey])
    const nextPhone = { ...prevSplit.phoneBySlide, [slideId]: r.points }
    const nextScores = { ...sbTeam.scores, [roundKey]: { written: prevSplit.written, phone: nextPhone } }
    updates.push({ id: sbTeam.id, show_id: sbTeam.show_id, name: sbTeam.name, scores: nextScores, sort_order: sbTeam.sort_order })
  }
  return [...new Map(updates.map(u => [u.id, u])).values()]
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ~/Projects/baynes-trivia/trivia-os && npx vitest run client/src/lib/bendleScoring.test.js`
Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/bendleScoring.js client/src/lib/bendleScoring.test.js
git commit -m "feat: add bendleScoring pure functions with full test coverage"
```

---

### Task 3: Wire Bendle into the shiny lock/reveal phase system

**Files:**
- Modify: `client/src/lib/shinySeries.js` (add `isBendleShiny`, next to `isOrderShiny` at line 95-97)
- Modify: `client/src/lib/slideStepping.js` (extend `pendingLockPhase`, `REVEAL_FIELD`, `pendingReveal`)
- Modify: `client/src/lib/slideStepping.test.js` (add Bendle cases alongside the existing Order/Wager/Matching ones)

**Interfaces:**
- Consumes: nothing new.
- Produces: `isBendleShiny(data)` — used by Task 7 (`ShinyBendleQuestion.jsx` dispatch in `QuestionSlide.jsx`), Task 8 (`Join.jsx`), Task 9 (`LiveMode.jsx`). `pendingLockPhase`/`pendingReveal` now return `'bendle'` for a Bendle slide with `!data.bendleGuessesLocked` / `data.bendleGuessesLocked && !data.bendleRevealed` respectively — Task 9's `lockHandlersRef` and the A-key `revealCurrentSlide()` consume these.

- [ ] **Step 1: Add the type guard**

In `client/src/lib/shinySeries.js`, immediately after `isOrderShiny` (line 97):

```javascript
export function isBendleShiny(data) {
  return data.shinyInputSchema?.type === 'bendle'
}
```

- [ ] **Step 2: Write the failing tests**

In `client/src/lib/slideStepping.test.js`, find the existing `describe('pendingLockPhase', ...)` and `describe('pendingReveal', ...)` blocks (they already cover matching/wager/order — match their exact fixture shape) and add:

```javascript
// Inside describe('pendingLockPhase', ...):
it('returns "bendle" for an unlocked bendle slide', () => {
  const slide = { data: { shinyInputSchema: { type: 'bendle' }, bendleGuessesLocked: false } }
  expect(pendingLockPhase(slide)).toBe('bendle')
})
it('returns null for a locked bendle slide', () => {
  const slide = { data: { shinyInputSchema: { type: 'bendle' }, bendleGuessesLocked: true } }
  expect(pendingLockPhase(slide)).toBeNull()
})

// Inside describe('pendingReveal', ...):
it('returns "bendle" for a locked-but-not-revealed bendle slide', () => {
  const slide = { data: { shinyInputSchema: { type: 'bendle' }, bendleGuessesLocked: true, bendleRevealed: false } }
  expect(pendingReveal(slide)).toBe('bendle')
})
it('returns null for a bendle slide not yet locked', () => {
  const slide = { data: { shinyInputSchema: { type: 'bendle' }, bendleGuessesLocked: false } }
  expect(pendingReveal(slide)).toBeNull()
})
it('returns null for an already-revealed bendle slide', () => {
  const slide = { data: { shinyInputSchema: { type: 'bendle' }, bendleGuessesLocked: true, bendleRevealed: true } }
  expect(pendingReveal(slide)).toBeNull()
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd ~/Projects/baynes-trivia/trivia-os && npx vitest run client/src/lib/slideStepping.test.js`
Expected: FAIL — `isBendleShiny` not imported/recognized yet in `slideStepping.js`.

- [ ] **Step 4: Wire the phase functions**

In `client/src/lib/slideStepping.js`, add `isBendleShiny` to the existing import from `shinySeries.js`, then:

```javascript
// In pendingLockPhase, after the isOrderShiny branch (was line 336-337):
if (isOrderShiny(data)) return !data.orderLocked ? 'order' : null
if (isBendleShiny(data)) return !data.bendleGuessesLocked ? 'bendle' : null
return null
```

```javascript
// REVEAL_FIELD (was line 343-347):
export const REVEAL_FIELD = {
  matching: 'matchingRevealed',
  wager: 'wagerRevealed',
  order: 'orderRevealed',
  bendle: 'bendleRevealed',
}
```

```javascript
// In pendingReveal, after the isOrderShiny branch (was line 364-365):
if (isOrderShiny(data)) return data.orderLocked && !data.orderRevealed ? 'order' : null
if (isBendleShiny(data)) return data.bendleGuessesLocked && !data.bendleRevealed ? 'bendle' : null
return null
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd ~/Projects/baynes-trivia/trivia-os && npx vitest run client/src/lib/slideStepping.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add client/src/lib/shinySeries.js client/src/lib/slideStepping.js client/src/lib/slideStepping.test.js
git commit -m "feat: wire bendle into the shiny lock/reveal phase system"
```

---

### Task 4: Add Tone.js dependency

**Files:**
- Modify: `package.json`

**Interfaces:**
- Produces: the `tone` package, importable as `import * as Tone from 'tone'` — Task 7 (`ShinyBendleQuestion.jsx`) is the only consumer in this plan.

- [ ] **Step 1: Install**

Run: `cd ~/Projects/baynes-trivia/trivia-os && npm install tone@^15`
Expected: `package.json`'s `dependencies` gains `"tone": "^15.x.x"` (pin whatever `npm install` resolves — do not hand-edit the version), `package-lock.json` updates.

- [ ] **Step 2: Verify it imports cleanly**

Run: `cd ~/Projects/baynes-trivia/trivia-os && node -e "console.log(require('tone/package.json').version)"`
Expected: prints a version string, no error.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: add tone.js dependency for bendle stem playback"
```

---

### Task 5: Host build flow — format registration, song picker, slide creation

**Files:**
- Modify: `client/src/components/host/FormatLibrary.jsx` (line 3, add `'bendle'` to `INPUT_TYPES`)
- Modify: `client/src/lib/shinyWizardKinds.jsx` (add `FIXED_SHAPE_KINDS.bendle` entry + `bendleExtraControls` + `buildBendleSlide`)
- Modify: `client/src/components/host/AddSlideWizard.jsx` (fetch `bendle_songs`, wire into `extraControls`/`buildSlideData` call sites, hide the generic Answer field for bendle)

**Interfaces:**
- Consumes: `FIXED_SHAPE_KINDS` registry shape from Task-independent existing code (`{ hasOwnControls, extraControls, buildSlideData }`), `bendle_songs` table from Task 1.
- Produces: a `question`-type slide with `data.shinyInputSchema.type === 'bendle'`, `data.bendleSongId`, `data.answer` (copied from the song), `data.bendleTiers` (defaulted to `BENDLE_TIERS`) — Task 7/8/9 all read this shape.

- [ ] **Step 1: Register the format type**

In `client/src/components/host/FormatLibrary.jsx` line 3:

```javascript
const INPUT_TYPES = ['image', 'audio', 'video', 'text', 'list', 'grid', 'matching', 'wager', 'venn', 'order', 'bendle']
```

- [ ] **Step 2: Add the shinyWizardKinds registry entry**

In `client/src/lib/shinyWizardKinds.jsx`, add `bendle` to `FIXED_SHAPE_KINDS` (near the top, alongside `matching`/`wager`/`order`):

```javascript
export const FIXED_SHAPE_KINDS = {
  matching: { hasOwnControls: false },
  wager:    { hasOwnControls: false },
  order:    { hasOwnControls: false },
  grid:     { hasOwnControls: true, extraControls: gridExtraControls, buildSlideData: buildGridSlide },
  venn:     { hasOwnControls: true, extraControls: vennExtraControls, buildSlideData: buildVennSlide },
  bendle:   { hasOwnControls: true, extraControls: bendleExtraControls, buildSlideData: buildBendleSlide },
}
```

Then add these two functions at the end of the file, following `buildVennSlide`'s structure:

```javascript
// ── Bendle ───────────────────────────────────────────────────────────────

// ctx: { bendleSongs, bendleSongId, setBendleSongId }
export function bendleExtraControls(ctx) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1.5">Song</label>
      <select
        value={ctx.bendleSongId ?? ''}
        onChange={e => ctx.setBendleSongId(e.target.value || null)}
        className="w-full border border-gray-200 rounded-lg px-3 py-3 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-[#1a6b4a]"
      >
        <option value="">Pick a song…</option>
        {(ctx.bendleSongs ?? []).map(s => (
          <option key={s.id} value={s.id}>{s.title}</option>
        ))}
      </select>
      {(ctx.bendleSongs ?? []).length === 0 && (
        <p className="text-[11px] text-gray-400 mt-1">
          No songs prepped yet — upload stems from the Bendle admin panel first.
        </p>
      )}
    </div>
  )
}

// ctx: { qNum, roundId, afterId, selectedShinyFmt, shinyQuestion, bendleSongId, bendleSongs }
export function buildBendleSlide(ctx) {
  const fmt = ctx.selectedShinyFmt
  const song = (ctx.bendleSongs ?? []).find(s => s.id === ctx.bendleSongId)
  const data = {
    questionNumber:  ctx.qNum,
    questionLabel:   `Q${ctx.qNum}`,
    questionMode:    'shiny',
    isShiny:         true,
    shinyFormatId:   fmt.id,
    shinyFormatName: fmt.name,
    shinyFormatIcon: fmt.icon,
    shinyInputSchema: fmt.input_schema ?? { type: 'bendle' },
    bendleSongId:    ctx.bendleSongId ?? null,
    text:            ctx.shinyQuestion.trim(),
    answer:          song?.answer ?? '',
    bendleGuessesLocked: false,
    bendleRevealed:      false,
  }
  return { type: 'question', roundId: ctx.roundId ?? null, afterSlideId: ctx.afterId, data }
}
```

- [ ] **Step 2: Run the existing shinyWizardKinds tests to make sure nothing broke**

Run: `cd ~/Projects/baynes-trivia/trivia-os && npx vitest run client/src/lib/shinyWizardKinds.test.js`
Expected: PASS (this task doesn't change matching/wager/order/grid/venn behavior — a break here means the registry edit was malformed).

- [ ] **Step 3: Wire AddSlideWizard.jsx — fetch songs, pass into extraControls, pass into buildSlideData, hide the generic Answer field**

Add the import and state near the top of `AddSlideWizard.jsx` (alongside the other `useState` hooks for `gridCols`/`vennSlideCount` etc.):

```javascript
import { supabase } from '../../lib/supabase.js'
// ...
const [bendleSongs, setBendleSongs] = useState([])
const [bendleSongId, setBendleSongId] = useState(null)

useEffect(() => {
  let cancelled = false
  supabase.from('bendle_songs').select('id, title, answer, aliases').order('title')
    .then(({ data }) => { if (!cancelled) setBendleSongs(data ?? []) })
  return () => { cancelled = true }
}, [])
```

At the `extraControls` call site (was line 586-589):

```javascript
{fixedShapeKind?.extraControls?.({
  gridCols, setGridCols, gridRows, setGridRows,
  vennSlideCount, setVennSlideCount, vennNum, vennPerSide, setVennPerSide,
  bendleSongs, bendleSongId, setBendleSongId,
})}
```

At the `buildSlideData` call site (was line 205-212):

```javascript
if (fixedShapeKind?.buildSlideData) {
  const afterId = insertAfterSlideId(roundSlides, sorted)
  await addShiny(fixedShapeKind.buildSlideData({
    qNum, roundId, afterId, selectedShinyFmt,
    shinyQuestion, shinyAnswer,
    gridCols, gridRows, vennPerSide, vennSlideCount,
    bendleSongId, bendleSongs,
  }))
  return
}
```

The generic Answer field doesn't apply to Bendle (the answer comes from the picked song, not free text) — find the `showSharedFields` derivation (was line 410) and add a sibling flag used only to gate the Answer block, leaving the Question-text field visible for both:

```javascript
const showSharedFields = effectiveRel !== 'separate' && !(isVenn && vennNum > 1)
const showAnswerField  = showSharedFields && shinyFmtType !== 'bendle'
```

Then wrap just the Answer `<div>` (the one right after the Question-text `<div>`, was around line 607) with `{showAnswerField && (...)}"` instead of the existing `{showSharedFields && (` wrapper it currently shares with the Question-text field — leave the Question-text `<div>` under its original `showSharedFields` condition unchanged.

- [ ] **Step 4: Manual verification**

Run: `cd ~/Projects/baynes-trivia/trivia-os && vercel dev` (per this repo's local-dev convention), open the host build UI, "✨ Add Shiny" → create a format named "Bendle" with type `bendle` → add a question slide, pick that format.
Expected: the song dropdown appears (empty, since Task 6 hasn't shipped the upload panel yet — that's fine, verify the dropdown renders and the Question-text field shows while Answer does not).

- [ ] **Step 5: Commit**

```bash
git add client/src/components/host/FormatLibrary.jsx client/src/lib/shinyWizardKinds.jsx client/src/components/host/AddSlideWizard.jsx
git commit -m "feat: wire bendle into the shiny format host-build flow"
```

---

### Task 6: Admin content panel — upload stems into `bendle_songs`

**Files:**
- Create: `client/src/components/host/BendleAdmin.jsx`
- Modify: wherever the host dashboard's panel/route list lives — grep for how `FormatLibrary` gets opened from `Host.jsx` (a button/tile) and add an equivalent entry point for `BendleAdmin`. Confirm the exact mount point by running `grep -n "FormatLibrary" client/src/components/host/Host.jsx` before writing this task's integration line — this plan does not hand-guess that file's current structure.

**Interfaces:**
- Consumes: `trivia-show-media` Storage bucket (existing, public read/anon insert), `bendle_songs` table (Task 1).
- Produces: rows in `bendle_songs` — Task 5's song picker reads them.

- [ ] **Step 1: Confirm the mount point**

Run: `cd ~/Projects/baynes-trivia/trivia-os && grep -n "FormatLibrary" client/src/components/host/Host.jsx`
Expected: shows the import line and the JSX/state that opens it (a button + `useState` boolean + conditional render). Use the exact same shape for `BendleAdmin` — same button-row location, same open/close state pattern. Record what you find; the next step assumes a `showFormatLibrary`-style boolean toggle exists to mirror.

- [ ] **Step 2: Write `BendleAdmin.jsx`**

```javascript
// client/src/components/host/BendleAdmin.jsx
import { useState, useEffect } from 'react'
import { nanoid } from 'nanoid'
import { supabase } from '../../lib/supabase.js'

const STEM_KEYS = ['drums', 'bass', 'other', 'vocals']

export default function BendleAdmin({ onClose }) {
  const [songs, setSongs] = useState([])
  const [title, setTitle] = useState('')
  const [answer, setAnswer] = useState('')
  const [aliasesText, setAliasesText] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [files, setFiles] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    supabase.from('bendle_songs').select('id, title, created_at').order('created_at', { ascending: false })
      .then(({ data }) => { if (!cancelled) setSongs(data ?? []) })
    return () => { cancelled = true }
  }, [])

  function reset() {
    setTitle(''); setAnswer(''); setAliasesText(''); setSourceUrl(''); setFiles({}); setError(null)
  }

  async function handleSave() {
    setError(null)
    if (!title.trim() || !answer.trim()) { setError('Title and answer are required'); return }
    const missing = STEM_KEYS.filter(k => !files[k])
    if (missing.length > 0) { setError(`Missing stem file(s): ${missing.join(', ')}`); return }

    setSaving(true)
    try {
      const id = `bnd_${nanoid(8)}`
      const urls = {}
      for (const key of STEM_KEYS) {
        const file = files[key]
        const path = `bendle/${id}/${key}.${file.name.split('.').pop()}`
        const { error: uploadError } = await supabase.storage.from('trivia-show-media').upload(path, file)
        if (uploadError) throw uploadError
        const { data: pub } = supabase.storage.from('trivia-show-media').getPublicUrl(path)
        urls[`${key}_url`] = pub.publicUrl
      }
      const aliases = aliasesText.split(',').map(a => a.trim()).filter(Boolean)
      const { error: insertError } = await supabase.from('bendle_songs').insert({
        id, title: title.trim(), answer: answer.trim(), aliases,
        source_url: sourceUrl.trim() || null, ...urls,
      })
      if (insertError) throw insertError
      const { data } = await supabase.from('bendle_songs').select('id, title, created_at').order('created_at', { ascending: false })
      setSongs(data ?? [])
      reset()
    } catch (e) {
      setError(e.message ?? 'Upload failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-6" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Bendle Songs</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Title</label>
            <input value={title} onChange={e => setTitle(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm" placeholder="e.g. Hey Jude" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Answer (canonical)</label>
            <input value={answer} onChange={e => setAnswer(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm" placeholder="e.g. Hey Jude" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Aliases (comma-separated, optional)</label>
            <input value={aliasesText} onChange={e => setAliasesText(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm" placeholder="e.g. hey jude by the beatles" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Source URL (optional, for re-processing later)</label>
            <input value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm" placeholder="https://youtube.com/..." />
          </div>
          {STEM_KEYS.map(key => (
            <div key={key}>
              <label className="block text-xs font-medium text-gray-500 mb-1.5 capitalize">{key} stem (.wav/.mp3)</label>
              <input type="file" accept="audio/*" onChange={e => setFiles(f => ({ ...f, [key]: e.target.files[0] }))} className="w-full text-sm" />
            </div>
          ))}
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button
            onClick={handleSave}
            disabled={saving}
            className={`w-full py-3 rounded-xl border-2 font-semibold text-sm ${saving ? 'border-gray-100 text-gray-300 cursor-not-allowed' : 'border-[#1a6b4a] text-[#1a6b4a] hover:bg-green-50'}`}
          >
            {saving ? 'Uploading…' : '+ Add Song'}
          </button>
          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs font-medium text-gray-500 mb-2">{songs.length} song{songs.length === 1 ? '' : 's'} prepped</p>
            <ul className="flex flex-col gap-1">
              {songs.map(s => <li key={s.id} className="text-sm text-gray-700">{s.title}</li>)}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Mount it from `Host.jsx`**

Using the exact pattern found in Step 1 (same button-row location, same boolean-toggle shape as `FormatLibrary`'s), add an import and a `showBendleAdmin` boolean, a button in the same row as the "✨ Add Shiny" trigger, and `{showBendleAdmin && <BendleAdmin onClose={() => setShowBendleAdmin(false)} />}`.

- [ ] **Step 4: Manual verification**

Run: `vercel dev`, open the new Bendle Songs panel, upload 4 short placeholder audio files (any 4 small `.mp3`/`.wav` files work for this check) with a title/answer.
Expected: no error, the song appears in the "prepped" list, and `select * from public.bendle_songs;` in Supabase shows the row with all 4 URLs populated and reachable (paste a `..._url` into a browser tab, confirm it plays/downloads).

- [ ] **Step 5: Commit**

```bash
git add client/src/components/host/BendleAdmin.jsx client/src/components/host/Host.jsx
git commit -m "feat: add Bendle Songs admin panel for stem upload"
```

---

### Task 7: `/display` — `ShinyBendleQuestion.jsx` (Tone.js playback)

**Files:**
- Create: `client/src/components/display/slides/ShinyBendleQuestion.jsx`
- Modify: wherever `QuestionSlide.jsx` dispatches to `ShinyWagerQuestion`/`ShinyOrderQuestion` (grep `isWagerShiny` in `QuestionSlide.jsx` to find the exact dispatch block) — add an `isBendleShiny(data)` branch rendering `ShinyBendleQuestion`.
- Test: `client/src/components/display/slides/ShinyBendleQuestion.test.jsx`

**Interfaces:**
- Consumes: `isBendleShiny` (Task 3), `BENDLE_TIERS` (Task 2), `slide.data.{bendleSongId, bendleGuessesLocked, bendleRevealed, bendleResults}`, `bendle_answer_counts` RPC (Task 1), `bendle_songs` row for the song's stem URLs.
- Produces: nothing new consumed elsewhere — this is a leaf display component, same as `ShinyWagerQuestion`.

- [ ] **Step 1: Confirm the QuestionSlide.jsx dispatch pattern**

Run: `cd ~/Projects/baynes-trivia/trivia-os && grep -n "isWagerShiny\|ShinyWagerQuestion" client/src/components/display/slides/QuestionSlide.jsx`
Expected: shows the exact conditional branch (something like `isWagerShiny(data) ? <ShinyWagerQuestion ... /> : ...`). Copy that shape exactly for the new branch — same props passed (`slide, show, theme`).

- [ ] **Step 2: Write `ShinyBendleQuestion.jsx`**

Three beats — Playing, Locked, Reveal (no separate "arm" beat: per the Global Constraints, `/display`'s audio unlock is already solved page-level, so Tone.js starts loading/playing as soon as the slide mounts, same zero-extra-ceremony convention `ShinyWagerQuestion`'s Wagering beat already uses).

```javascript
// client/src/components/display/slides/ShinyBendleQuestion.jsx
import { useState, useEffect, useRef } from 'react'
import * as Tone from 'tone'
import { motion, useReducedMotion } from 'framer-motion'
import { supabase } from '../../../lib/supabase.js'
import { SHINY_GOLD, SHINY_GOLD_GLOW } from '../../../lib/shinyGold.js'
import { EASE_OUT } from '../../../lib/easings.js'
import { BENDLE_TIERS } from '../../../lib/bendleScoring.js'
import { AnswersLockedBadge } from '../LockCountdownOverlay.jsx'

const STEM_KEYS = ['drums', 'bass', 'other', 'vocals']
const ROUND_LENGTH_SECONDS = BENDLE_TIERS[BENDLE_TIERS.length - 1].atSeconds + 20

export default function ShinyBendleQuestion({ slide, show, theme }) {
  const { data } = slide
  const guessesLocked = !!data.bendleGuessesLocked
  const revealed = !!data.bendleRevealed
  const shouldReduceMotion = useReducedMotion()

  const [song, setSong] = useState(null)
  const [loadState, setLoadState] = useState('loading') // 'loading' | 'ready' | 'error'
  const [answered, setAnswered] = useState(0)
  const [teamCount, setTeamCount] = useState(0)
  const playersRef = useRef({})
  const startedRef = useRef(false)

  const text = theme.colors.text
  const displayFont = `'${theme.fonts.display}', 'Boogaloo', sans-serif`
  const bodyFont = `'${theme.fonts.body}', 'DM Sans', sans-serif`

  useEffect(() => {
    let cancelled = false
    if (!data.bendleSongId) return
    supabase.from('bendle_songs').select('*').eq('id', data.bendleSongId).single()
      .then(({ data: row }) => { if (!cancelled) setSong(row) })
    return () => { cancelled = true }
  }, [data.bendleSongId])

  // Load + sync the 4 stems once the song row is known. Per-stem failure
  // skips that layer (gain never ramps above 0) rather than blocking
  // Tone.loaded() indefinitely and hanging the round on a live TV.
  useEffect(() => {
    if (!song || guessesLocked || revealed || startedRef.current) return
    let cancelled = false
    async function setup() {
      Tone.Transport.stop()
      Tone.Transport.position = 0
      const players = {}
      for (const key of STEM_KEYS) {
        const url = song[`${key}_url`]
        try {
          const player = new Tone.Player({ url }).toDestination()
          player.volume.value = -Infinity // ramped in via rampTo below, drums excepted
          await new Promise((resolve, reject) => {
            player.load(url).then(resolve).catch(reject)
          })
          player.sync().start(0)
          players[key] = player
        } catch (e) {
          console.error(`[Bendle] stem load failed for "${key}":`, e)
          // Layer skipped — leave it out of `players`, the reveal timeline
          // below just never fades it in.
        }
      }
      if (cancelled) { Object.values(players).forEach(p => p.dispose()); return }
      playersRef.current = players
      // Drums start audible immediately; every other layer starts silent
      // and gets gain-ramped up at its tier's atSeconds.
      if (players.drums) players.drums.volume.value = 0
      setLoadState(Object.keys(players).length > 0 ? 'ready' : 'error')
    }
    setup()
    return () => { cancelled = true }
  }, [song, guessesLocked, revealed])

  // Schedule the layer-in fades and start the Transport once ready. Runs
  // once per song (startedRef guards re-entry on unrelated re-renders).
  useEffect(() => {
    if (loadState !== 'ready' || startedRef.current || guessesLocked || revealed) return
    startedRef.current = true
    Tone.start()
    for (const tier of BENDLE_TIERS.slice(1)) {
      const player = playersRef.current[tier.id]
      if (!player) continue
      Tone.Transport.scheduleOnce(() => {
        player.volume.rampTo(0, 1.5)
      }, tier.atSeconds)
    }
    Tone.Transport.start()
  }, [loadState, guessesLocked, revealed])

  // Stop and dispose on unmount / lock — a locked or left slide shouldn't
  // keep playing under the next slide.
  useEffect(() => {
    if (!guessesLocked) return
    Tone.Transport.stop()
    Object.values(playersRef.current).forEach(p => p.dispose())
    playersRef.current = {}
  }, [guessesLocked])

  useEffect(() => () => {
    Tone.Transport.stop()
    Object.values(playersRef.current).forEach(p => p.dispose())
  }, [])

  useEffect(() => {
    if (guessesLocked) return
    let cancelled = false
    async function load() {
      const { data: counts } = await supabase.rpc('bendle_answer_counts', { p_slide_id: slide.id })
      if (cancelled) return
      setAnswered(counts?.answered ?? 0)
    }
    load()
    const interval = setInterval(load, 2000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [slide.id, guessesLocked])

  useEffect(() => {
    if (!show?.id) return
    let cancelled = false
    supabase.from('teams').select('id', { count: 'exact', head: true }).eq('show_id', show.id)
      .then(({ count }) => { if (!cancelled) setTeamCount(count ?? 0) })
    return () => { cancelled = true }
  }, [show?.id])

  if (revealed) {
    return <BendleReveal data={data} song={song} theme={theme} shouldReduceMotion={shouldReduceMotion} />
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      width: '100%', height: '100%', padding: '4rem', gap: '2.5rem',
    }}>
      <motion.h2
        initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, transform: 'translateY(14px)' }}
        animate={{ opacity: 1, transform: 'translateY(0px)' }}
        transition={{ duration: 0.3, ease: EASE_OUT }}
        style={{ margin: 0, fontFamily: displayFont, fontSize: '4.5rem', lineHeight: 1, color: SHINY_GOLD, textShadow: `0 0 26px ${SHINY_GOLD_GLOW}66`, textAlign: 'center' }}
      >
        Bendle
      </motion.h2>
      {data.text && (
        <p style={{ margin: 0, color: `${text}80`, fontSize: '1.4rem', fontFamily: bodyFont, textAlign: 'center', maxWidth: 1200 }}>
          {data.text}
        </p>
      )}
      {loadState === 'loading' && (
        <p style={{ margin: 0, color: `${text}60`, fontSize: '1.3rem', fontFamily: bodyFont }}>Loading song…</p>
      )}
      {loadState === 'error' && (
        <p style={{ margin: 0, color: '#e8703a', fontSize: '1.3rem', fontFamily: bodyFont }}>Couldn't load this song's audio — lock and retry on the host panel.</p>
      )}
      {loadState === 'ready' && <BendleProgressBar theme={theme} />}
      <div style={{ minHeight: '3.4rem', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {!guessesLocked ? (
          <CountLine n={answered} total={teamCount} text={text} bodyFont={bodyFont} />
        ) : (
          <AnswersLockedBadge theme={theme} />
        )}
      </div>
    </div>
  )
}

function BendleProgressBar({ theme }) {
  const [progress, setProgress] = useState(0)
  useEffect(() => {
    const interval = setInterval(() => {
      setProgress(Math.min(1, (Tone.Transport.seconds ?? 0) / ROUND_LENGTH_SECONDS))
    }, 100)
    return () => clearInterval(interval)
  }, [])
  return (
    <div style={{ width: '100%', maxWidth: 900, height: 14, borderRadius: 7, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
      <div style={{ width: `${progress * 100}%`, height: '100%', background: SHINY_GOLD, transition: 'width 100ms linear' }} />
    </div>
  )
}

function CountLine({ n, total, text, bodyFont }) {
  return (
    <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, ease: EASE_OUT }} style={{ margin: 0, color: `${text}70`, fontSize: '1.35rem', fontFamily: bodyFont }}>
      {total > 0 ? `${n} of ${total} teams guessed` : `${n} team${n === 1 ? '' : 's'} guessed`}
    </motion.p>
  )
}

function BendleReveal({ data, song, theme, shouldReduceMotion }) {
  const results = data.bendleResults ?? []
  const text = theme.colors.text
  const displayFont = `'${theme.fonts.display}', 'Boogaloo', sans-serif`
  const bodyFont = `'${theme.fonts.body}', 'DM Sans', sans-serif`
  const twoCol = results.length > 8

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', padding: '3rem 4rem', gap: '1.75rem' }}>
      <motion.div
        initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, transform: 'scale(0.94)' }}
        animate={{ opacity: 1, transform: 'scale(1)' }}
        transition={{ duration: 0.32, ease: EASE_OUT }}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem' }}
      >
        <span style={{ fontFamily: bodyFont, fontSize: '1.15rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: `${text}60` }}>The song was</span>
        <span style={{ fontFamily: displayFont, fontSize: '5rem', lineHeight: 1, color: SHINY_GOLD, textShadow: `0 0 30px ${SHINY_GOLD_GLOW}77` }}>
          {song?.title ?? data.answer ?? '—'}
        </span>
      </motion.div>

      {results.length === 0 ? (
        <p style={{ margin: 0, color: `${text}60`, fontFamily: bodyFont, fontSize: '1.3rem' }}>No one guessed it.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: twoCol ? '1fr 1fr' : '1fr', gap: '0.5rem 2.5rem', width: '100%', maxWidth: twoCol ? 1600 : 1000 }}>
          {results.map((r, i) => (
            <motion.div
              key={`${r.teamId}-${i}`}
              initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, transform: 'translateY(10px)' }}
              animate={{ opacity: 1, transform: 'translateY(0px)' }}
              transition={{ duration: 0.26, delay: 0.28 + i * 0.06, ease: EASE_OUT }}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.9rem', padding: '0.65rem 1.1rem', borderRadius: 12,
                background: r.correct ? `${SHINY_GOLD}1f` : 'rgba(255,255,255,0.04)',
                border: r.correct ? `1px solid ${SHINY_GOLD}66` : '1px solid rgba(255,255,255,0.08)',
              }}
            >
              <span style={{ flex: 1, minWidth: 0, fontFamily: displayFont, fontSize: '1.9rem', color: text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {r.teamName}
              </span>
              <span style={{ fontFamily: bodyFont, fontSize: '1.1rem', color: `${text}70`, flexShrink: 0 }}>
                {r.correct ? BENDLE_TIERS.find(t => t.id === r.tierId)?.label ?? '' : '—'}
              </span>
              <span style={{ minWidth: '4.5rem', textAlign: 'right', flexShrink: 0, fontFamily: displayFont, fontSize: '2rem', color: r.correct ? SHINY_GOLD : `${text}40` }}>
                {r.correct ? `+${r.points}` : '0'}
              </span>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Wire the dispatch in `QuestionSlide.jsx`**

Following the exact shape confirmed in Step 1, add an `isBendleShiny(data)` branch that renders `<ShinyBendleQuestion slide={slide} show={show} theme={theme} />`, and add the corresponding import at the top of `QuestionSlide.jsx`.

- [ ] **Step 4: Write a beat-transition test**

Following `ShinyTitleSlide.test.jsx`'s pattern (mock `supabase`, render with a fixture slide, assert on visible text per state):

```javascript
// client/src/components/display/slides/ShinyBendleQuestion.test.jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import ShinyBendleQuestion from './ShinyBendleQuestion.jsx'

vi.mock('../../../lib/supabase.js', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ single: () => Promise.resolve({ data: { id: 'bnd_1', title: 'Hey Jude', drums_url: 'x', bass_url: 'x', other_url: 'x', vocals_url: 'x' } }) }),
        order: () => Promise.resolve({ data: [] }),
      }),
      insert: () => Promise.resolve({ error: null }),
    }),
    rpc: () => Promise.resolve({ data: { answered: 2 } }),
  },
}))
vi.mock('tone', () => ({
  Player: vi.fn().mockImplementation(() => ({
    toDestination: () => ({ sync: () => ({ start: vi.fn() }) }),
    load: () => Promise.resolve(),
    dispose: vi.fn(),
    volume: { value: 0, rampTo: vi.fn() },
  })),
  Transport: { stop: vi.fn(), start: vi.fn(), scheduleOnce: vi.fn(), position: 0, seconds: 0 },
  start: () => Promise.resolve(),
}))

const theme = { colors: { text: '#fff' }, fonts: { display: 'Boogaloo', body: 'DM Sans' } }

describe('ShinyBendleQuestion', () => {
  it('shows the reveal state when data.bendleRevealed is true', () => {
    const slide = { id: 's1', data: { bendleSongId: 'bnd_1', bendleGuessesLocked: true, bendleRevealed: true, bendleResults: [{ teamId: 't1', teamName: 'Alpha', correct: true, tierId: 'drums', points: 40 }] } }
    render(<ShinyBendleQuestion slide={slide} show={{ id: 'show1' }} theme={theme} />)
    expect(screen.getByText('Alpha')).toBeInTheDocument()
  })

  it('shows the locked badge once guesses are locked but not revealed', () => {
    const slide = { id: 's1', data: { bendleSongId: 'bnd_1', bendleGuessesLocked: true, bendleRevealed: false } }
    render(<ShinyBendleQuestion slide={slide} show={{ id: 'show1' }} theme={theme} />)
    expect(screen.getByText('Bendle')).toBeInTheDocument()
  })
})
```

- [ ] **Step 5: Run tests**

Run: `cd ~/Projects/baynes-trivia/trivia-os && npx vitest run client/src/components/display/slides/ShinyBendleQuestion.test.jsx`
Expected: PASS. If `@testing-library/react` isn't already a devDependency, check `ShinyTitleSlide.test.jsx`'s imports first — match whatever testing setup it already uses instead of introducing a new one.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/display/slides/ShinyBendleQuestion.jsx client/src/components/display/slides/ShinyBendleQuestion.test.jsx client/src/components/display/slides/QuestionSlide.jsx
git commit -m "feat: add ShinyBendleQuestion display component with Tone.js playback"
```

---

### Task 8: `/join` — `BendleBoard.jsx` phone component

**Files:**
- Create: `client/src/components/join/BendleBoard.jsx`
- Modify: `client/src/views/Join.jsx` (import + dispatch branch, following the `WagerBoard` wiring at lines 8, 11, 600-601, and the interactive-lock-state OR chain at line 1280)

**Interfaces:**
- Consumes: `isBendleShiny` (Task 3), writes to `phone_answers` (existing table, no schema change — `answer: { guess, elapsedSeconds }`).
- Produces: nothing else consumes this directly; Task 9's `handleLockAndScoreBendle` reads `phone_answers` rows it wrote.

- [ ] **Step 1: Write `BendleBoard.jsx`**

Simpler than `WagerBoard.jsx` — no tier-picking step on the phone (the tier is derived automatically from *when* the team submits, not chosen by them). One text input, one submit, locked after.

```javascript
// client/src/components/join/BendleBoard.jsx
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase.js'

export default function BendleBoard({ slide, team, theme, onAnswered }) {
  const { data } = slide
  const guessesLocked = !!data.bendleGuessesLocked
  const revealed = !!data.bendleRevealed
  const [guess, setGuess] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState(null)
  const openedAtRef = useRef(Date.now())

  useEffect(() => { openedAtRef.current = Date.now() }, [slide.id])

  useEffect(() => {
    let cancelled = false
    supabase.from('phone_answers').select('answer').eq('slide_id', slide.id).eq('team_id', team.id).maybeSingle()
      .then(({ data: row }) => { if (!cancelled && row) setSubmitted(true) })
    return () => { cancelled = true }
  }, [slide.id, team.id])

  async function handleSubmit() {
    if (!guess.trim() || submitted || guessesLocked) return
    setError(null)
    const elapsedSeconds = (Date.now() - openedAtRef.current) / 1000
    const { error: upsertError } = await supabase.from('phone_answers').upsert({
      show_id: slide.showId ?? team.showId, slide_id: slide.id, team_id: team.id,
      answer: { guess: guess.trim(), elapsedSeconds },
    }, { onConflict: 'slide_id,team_id' })
    if (upsertError) { setError('Submission failed — check connection and retry'); return }
    setSubmitted(true)
    onAnswered?.()
  }

  if (revealed) {
    const mine = (data.bendleResults ?? []).find(r => r.teamId === team.id)
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p style={{ fontSize: '1.4rem', fontWeight: 700, color: theme.colors.text }}>
          {mine?.correct ? `You got it! +${mine.points}` : 'Not this time.'}
        </p>
      </div>
    )
  }

  return (
    <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {submitted || guessesLocked ? (
        <p style={{ fontSize: '1.2rem', textAlign: 'center', color: theme.colors.text }}>
          {submitted ? "Locked in — good luck!" : 'Guesses are locked.'}
        </p>
      ) : (
        <>
          <input
            value={guess}
            onChange={e => setGuess(e.target.value)}
            placeholder="Name that song…"
            style={{ padding: '0.9rem', borderRadius: 12, border: '1px solid #ddd', fontSize: '1.1rem' }}
          />
          <button
            onClick={handleSubmit}
            disabled={!guess.trim()}
            style={{ padding: '0.9rem', borderRadius: 12, border: '2px solid #1a6b4a', color: '#1a6b4a', fontWeight: 700, background: 'white' }}
          >
            Lock In Guess
          </button>
          {error && <p style={{ color: '#c00', fontSize: '0.85rem', textAlign: 'center' }}>{error}</p>}
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Wire `Join.jsx`**

Add to the import at line 8: `isBendleShiny` alongside the existing named imports. Add at line 11: `import BendleBoard from '../components/join/BendleBoard.jsx'`.

At the dispatch block (was line 597-601, mirroring the `WagerBoard` branch exactly):

```javascript
if (d.isShiny && isBendleShiny(d)) {
  return <BendleBoard slide={slide} team={team} theme={theme} onAnswered={onInteractiveAnswered} />
}
```

At the interactive-lock OR chain (was line 1280):

```javascript
(isMatchingShiny(liveSlide.data) || isWagerShiny(liveSlide.data) || isOrderShiny(liveSlide.data) || isBendleShiny(liveSlide.data))
```

- [ ] **Step 3: Manual verification**

Run: `vercel dev`, open `/host`, arm a Bendle slide with a test song, open `/join` on a second device/tab, register a team, submit a guess.
Expected: submission appears in `phone_answers` (`select * from phone_answers where slide_id = '<slide-id>';`) with `answer.guess` and `answer.elapsedSeconds` populated; the phone shows "Locked in — good luck!" after submit.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/join/BendleBoard.jsx client/src/views/Join.jsx
git commit -m "feat: add BendleBoard phone component for song guessing"
```

---

### Task 9: Host live controls — lock, score, reveal

**Files:**
- Modify: `client/src/components/host/LiveMode.jsx`

**Interfaces:**
- Consumes: `scoreBendleRound`, `computeBendleScoreUpdates` (Task 2), `pendingLockPhase`/`REVEAL_FIELD`/`pendingReveal` returning `'bendle'` (Task 3).
- Produces: `handleLockAndScoreBendle` registered in `lockHandlersRef.current.bendle` — the existing generalized "Next locks answers" countdown effect (already reads `lockHandlersRef.current[phase]`) picks it up with no further wiring.

- [ ] **Step 1: Add the import**

Alongside the existing `import { scoreWagerRound, computeWagerScoreUpdates, ... } from '../../lib/wagerScoring.js'`:

```javascript
import { scoreBendleRound, computeBendleScoreUpdates } from '../../lib/bendleScoring.js'
```

- [ ] **Step 2: Write `handleLockAndScoreBendle`**

Place it near `handleLockAndScoreWagers` — single-phase, mirrors that function's guesses-lock-and-score half exactly (no tiers pre-lock step, since Bendle has only one lock phase):

```javascript
const [bendleBusy, setBendleBusy] = useState(false)
const [bendleError, setBendleError] = useState(null)
const BENDLE_ZERO_ANSWERS_ERROR = 'No guesses recorded — check phones, or score everyone at 0'

async function handleLockAndScoreBendle(slide, { force = false } = {}) {
  setBendleBusy(true)
  setBendleError(null)
  try {
    let lockedAt = slide.data.bendleGuessesLockedAt
    if (!slide.data.bendleGuessesLocked) {
      lockedAt = new Date().toISOString()
      actions.updateSlide(slide.id, { data: { ...slide.data, bendleGuessesLocked: true, bendleGuessesLockedAt: lockedAt } })
      await actions.flushSlides()
      await new Promise(r => setTimeout(r, 700))
    }

    const { data: rawAnswers, error: fetchError } = await supabase
      .from('phone_answers')
      .select('team_id, answer, submitted_at')
      .eq('slide_id', slide.id)
    if (fetchError) { console.error('phone_answers fetch failed:', fetchError); setBendleError('Scoring failed — check connection and retry'); return }
    const answers = rawAnswers?.filter(a => !a.submitted_at || a.submitted_at <= lockedAt) ?? []

    const { data: teams, error: teamsError } = await supabase
      .from('teams').select('id, name').eq('show_id', show.id)
    if (teamsError) { console.error('teams fetch failed:', teamsError); setBendleError('Scoring failed — check connection and retry'); return }

    const { data: scoreboardTeams, error: sbError } = await supabase
      .from('scoreboard_teams').select('id, show_id, name, scores, sort_order').eq('show_id', show.id)
    if (sbError) { console.error('scoreboard_teams fetch failed:', sbError); setBendleError('Scoring failed — check connection and retry'); return }

    if (!force && (answers?.length ?? 0) === 0 && (teams?.length ?? 0) > 0) {
      setBendleError(BENDLE_ZERO_ANSWERS_ERROR)
      return
    }

    const { data: song } = await supabase.from('bendle_songs').select('answer, aliases').eq('id', slide.data.bendleSongId).single()
    const answerByTeam = new Map((answers ?? []).map(r => [r.team_id, r.answer]))
    const entries = (teams ?? []).map(t => {
      const a = answerByTeam.get(t.id)
      return { teamId: t.id, teamName: t.name, guess: a?.guess ?? null, elapsedSeconds: a?.elapsedSeconds ?? null }
    })

    const results = scoreBendleRound({ entries, song })
    const updates = computeBendleScoreUpdates({ results, teams, scoreboardTeams, roundKey: roundKeyFor(show, slide), slideId: slide.id })

    if (entries.length > 0 && updates.length === 0) {
      setBendleError('No teams could be matched to the scoreboard — check team names match, then retry')
      return
    }

    if (updates.length > 0) {
      const { error: updateError } = await supabase.from('scoreboard_teams').upsert(updates)
      if (updateError) { console.error('scoreboard_teams score fold-in failed:', updateError); setBendleError('Scoring failed — check connection and retry'); return }
    }

    await actions.updateSlide(slide.id, {
      data: {
        ...slide.data,
        bendleGuessesLocked: true,
        bendleGuessesLockedAt: lockedAt,
        bendleResults: results.map(r => ({
          teamId: r.teamId, teamName: r.teamName, guess: r.guess, correct: r.correct, tierId: r.tierId, points: r.points,
        })),
      },
    })
  } finally {
    setBendleBusy(false)
  }
}
```

- [ ] **Step 3: Register it in `lockHandlersRef`**

Find the existing assignment (was lines 933-938) and add the `bendle` entry:

```javascript
lockHandlersRef.current = {
  matching: handleLockAndScoreMatching,
  'wager-tiers': handleLockWagers,
  'wager-guesses': handleLockAndScoreWagers,
  order: handleLockAndScoreOrder,
  bendle: handleLockAndScoreBendle,
}
```

- [ ] **Step 4: Add the host control panel JSX**

Following the wager panel's exact shape (was lines 1310-1354), add a sibling block:

```jsx
{currentSlide?.type === 'question' && isBendleShiny(currentSlide?.data) && (!currentSlide?.data?.bendleRevealed || bendleError) && (
  <div className="bg-white border border-gray-100 rounded-2xl p-5 shrink-0">
    <p className="text-xs text-gray-400 mb-3">
      {currentSlide?.data?.bendleGuessesLocked
        ? 'Guesses locked and scored — press A to reveal the song on the TV.'
        : 'Bendle is playing — teams are guessing as the layers reveal. Press Next (or the button below) to lock.'}
    </p>
    <button
      onClick={() => handleLockAndScoreBendle(currentSlide)}
      disabled={bendleBusy}
      className={`w-full py-3 rounded-xl border-2 font-semibold text-sm transition-[color,background-color,border-color,transform] duration-[120ms] active:scale-[0.97] ${
        bendleBusy ? 'border-gray-100 text-gray-300 cursor-not-allowed' : 'border-[#1a6b4a] text-[#1a6b4a] hover:bg-green-50'
      }`}
    >
      {bendleBusy ? 'Working…' : currentSlide?.data?.bendleGuessesLocked ? '🔁 Retry Scoring' : '🔒 Lock Answers & Score'}
    </button>
    {bendleError && <p className="text-xs text-red-600 mt-2 text-center">{bendleError}</p>}
    {bendleError === BENDLE_ZERO_ANSWERS_ERROR && (
      <button
        onClick={() => handleLockAndScoreBendle(currentSlide, { force: true })}
        disabled={bendleBusy}
        className="w-full mt-2 py-2 rounded-lg border border-amber-300 text-amber-700 text-xs font-semibold hover:bg-amber-50 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Score anyway — 0 for every team
      </button>
    )}
  </div>
)}
```

Add `isBendleShiny` to the existing `shinySeries.js` import at the top of `LiveMode.jsx`.

- [ ] **Step 5: Manual verification — full round, live**

Run: `vercel dev`, run a Bendle slide end-to-end: arm it, let (or have a second device) submit a guess, press Next (starts the 3-2-1 lock countdown per the existing generalized system) or the Lock button directly, confirm scoring, press A to reveal.
Expected: `/display` shows the reveal with the correct team(s) highlighted and point values matching `BENDLE_TIERS`; `scoreboard_teams` for that show shows the round's `phone` bucket updated with this slide's id key. This is the standing Trivia OS rule — verify live on a real slide, not just green tests, before calling this done.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/host/LiveMode.jsx
git commit -m "feat: add bendle host live controls — lock, score, reveal"
```

---

### Task 10: Local content-prep script (offline, not part of the app)

**Files:**
- Create: `scripts/bendle-prep.sh`

**Interfaces:**
- Consumes: `yt-dlp`, `demucs` (both external CLI tools, not npm dependencies — document the one-time install in the script's own header comment).
- Produces: 4 local `.wav` files Ben uploads by hand through `BendleAdmin` (Task 6). Nothing in the live app calls this script.

- [ ] **Step 1: Write the script**

```bash
#!/usr/bin/env bash
# scripts/bendle-prep.sh — offline stem prep for Bendle. Not called by the
# app; run this locally, then upload the 4 output files through the Bendle
# Songs admin panel (BendleAdmin.jsx). See
# docs/superpowers/specs/2026-09-04-bendle-layered-audio-question-design.md.
#
# One-time setup:
#   pip install demucs yt-dlp
#
# Usage:
#   scripts/bendle-prep.sh "<youtube-url>" "<output-name>"
# Produces (in ./bendle-stems/<output-name>/):
#   drums.wav  bass.wav  other.wav  vocals.wav

set -euo pipefail

URL="${1:?Usage: bendle-prep.sh <youtube-url> <output-name>}"
NAME="${2:?Usage: bendle-prep.sh <youtube-url> <output-name>}"
OUT_DIR="./bendle-stems/${NAME}"

mkdir -p "${OUT_DIR}"
echo "Downloading audio from ${URL}..."
yt-dlp "${URL}" -x --audio-format wav -o "${OUT_DIR}/source.wav"

echo "Separating stems with Demucs..."
demucs --two-stems=vocals -o "${OUT_DIR}/_demucs_tmp" "${OUT_DIR}/source.wav" >/dev/null 2>&1 || true
demucs -o "${OUT_DIR}/_demucs_tmp" "${OUT_DIR}/source.wav"

MODEL_DIR=$(find "${OUT_DIR}/_demucs_tmp" -mindepth 2 -maxdepth 2 -type d | head -1)
mv "${MODEL_DIR}/drums.wav" "${OUT_DIR}/drums.wav"
mv "${MODEL_DIR}/bass.wav" "${OUT_DIR}/bass.wav"
mv "${MODEL_DIR}/other.wav" "${OUT_DIR}/other.wav"
mv "${MODEL_DIR}/vocals.wav" "${OUT_DIR}/vocals.wav"
rm -rf "${OUT_DIR}/_demucs_tmp" "${OUT_DIR}/source.wav"

echo "Done — 4 stems in ${OUT_DIR}/"
echo "Upload them through the Bendle Songs admin panel in Trivia OS."
```

- [ ] **Step 2: Make it executable and smoke-test**

Run: `cd ~/Projects/baynes-trivia/trivia-os && chmod +x scripts/bendle-prep.sh && ./scripts/bendle-prep.sh "<a real short public-domain or Ben-owned YouTube URL>" "test-song"`
Expected: `bendle-stems/test-song/` contains exactly `drums.wav`, `bass.wav`, `other.wav`, `vocals.wav`. (Requires `demucs`/`yt-dlp` installed locally — `pip install demucs yt-dlp` first if not already present.)

- [ ] **Step 3: Commit**

```bash
git add scripts/bendle-prep.sh
git commit -m "feat: add local bendle-prep.sh script for offline stem separation"
```

---

## Self-Review Notes

**Spec coverage:** content pipeline (Task 10 + Task 6), data model (Task 1), phone side (Task 8), playback (Task 7), scoring lib (Task 2), host build flow (Task 5), out-of-scope items (auto separation, daily companion, editable tiers) — none scheduled, matches spec's explicit exclusions.

**Known gap flagged, not silently papered over:** Task 6's Step 1 requires the implementer to grep `Host.jsx` for the real `FormatLibrary` mount pattern before writing the integration — this plan does not fabricate that file's current structure, since it wasn't read during planning. Every other task's file-integration points were confirmed against the real, current source before being written into this plan.
