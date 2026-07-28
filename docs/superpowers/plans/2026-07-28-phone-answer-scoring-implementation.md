# Phone-Answer Scoring Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Matching question type end to end — a new phone-scored "Use Your Phone" question category, wired into the existing shiny-format builder, that auto-scores and folds its points into the round total without a separate column.

**Architecture:** One new table (`phone_answers`) captures each team's live tap-to-pair submission. `shiny_formats.input_schema.type: 'matching'` is a new format mechanic, flowing through the existing generic "✨ Add Shiny" pipeline with zero changes to `AddSlideWizard.jsx` (confirmed — non-grid, non-image format types are already handled generically there). A new `MatchingBuilder` in `SlideEditor.jsx` lets the host fill in pairs per-slide, mirroring the existing `ShinyListBuilder`. `/display` gets a new `ShinyMatchingQuestion.jsx` (open → locked → revealed), styled TV-first per `brand.md`'s Midnight Orchard language. `/join` gets a new `MatchingBoard.jsx`, styled Quiplash-simple — huge flat color-fill touch targets, one action at a time, all real spectacle deferred to the TV. `LiveMode.jsx` gets a "Lock Answers" control that closes submissions and triggers scoring: a pure function counts correct pairs, multiplies by points, and folds the result into `scoreboard_teams.scores[roundKey].phone` (matched to the team by case-insensitive name — `teams` and `scoreboard_teams` are separate, unrelated tables, confirmed during research). `scoreboardMath.js`'s round-value shape changes from a raw number to `{written, phone}`, which requires fixing four existing call sites that read/write the raw cell directly and would otherwise silently break (found by independent review of the design spec).

**Tech Stack:** React 18, Vite, Supabase JS + Realtime, Framer Motion 10, vitest (new — no unit-test framework exists in this repo yet, only Playwright e2e).

**Spec:** `docs/superpowers/specs/2026-07-28-phone-answer-scoring-design.md` (read first — this plan implements it, doesn't restate the reasoning).

---

## Task 1: `phone_answers` table + RLS migration

**Files:**
- Create: `supabase/migrations/20260728120000_phone_answers_table.sql`

Naming convention confirmed from the 5 existing migrations: `YYYYMMDDHHMMSS_snake_case_description.sql`. No `CREATE TABLE` migration exists anywhere in this repo (all 5 existing ones are `ALTER`/`CREATE POLICY`/`CREATE FUNCTION` deltas against tables created outside migration tracking) — this is the first one, so it also has to define its own RLS from scratch. The trust model to mirror is `teams`' — confirmed via `AUDIT.md:419` (`anon update team status`: `USING (true) WITH CHECK (true)`, no PIN/JWT gate) and `Join.jsx`'s registration insert (`Join.jsx:1137`) — fully open to the `public` role, ownership enforced only in application code (a team can only act as the `team.id` it holds in its own `localStorage`), not in the database. `phone_answers` gets the same shape: open to `public`, no `host_verified` JWT gate (unlike every *other* write-gated table in this app — `shows`/`team_scores`/`scoreboard_teams`/`shiny_formats`/`questions` all require the host PIN's JWT claim, but `teams` and `phone_answers` are both "the phone's own data," gated by nothing but held IDs).

- [ ] **Step 1: Write the migration**

```sql
-- phone_answers — captures a team's live tap-to-pair submission for a
-- "Use Your Phone" (matching, and later chain-reaction/map-maker) question.
-- Trust model deliberately mirrors `teams`, not the host-gated tables: this
-- is the phone's own data, ownership enforced by the team_id the phone holds
-- in localStorage (same as every other /join write in this app), not by a
-- host PIN JWT claim. See docs/superpowers/specs/2026-07-28-phone-answer-scoring-design.md.
--
-- One row per (slide_id, team_id) — a team's answer upserts on that pair
-- while the question is open, so changing your mind before Lock Answers
-- doesn't create duplicate rows. `score` stays null until the host locks
-- and the scoring pass runs; it's computed client-side in LiveMode.jsx,
-- same as every other score in this app (no server-side grading exists
-- anywhere in this codebase today).

create table public.phone_answers (
  id           uuid primary key default gen_random_uuid(),
  show_id      text not null,
  slide_id     text not null,
  team_id      text not null references public.teams(id) on delete cascade,
  answer       jsonb not null default '[]'::jsonb,
  score        numeric,
  submitted_at timestamptz not null default now(),
  unique (slide_id, team_id)
);

create index phone_answers_team_id_idx on public.phone_answers (team_id);
create index phone_answers_slide_id_idx on public.phone_answers (slide_id);

alter table public.phone_answers enable row level security;

create policy "public read phone_answers"
  on public.phone_answers for select
  to public
  using (true);

create policy "public insert phone_answers"
  on public.phone_answers for insert
  to public
  with check (true);

create policy "public update phone_answers"
  on public.phone_answers for update
  to public
  using (true)
  with check (true);
```

- [ ] **Step 2: Apply the migration**

Use the Supabase MCP `apply_migration` tool (project id `qwtbgusqfoypvehnungr` — Baynes Trivia, confirmed against `.env.local`, NOT `dreggwinegtirxxanntv`/Baynes Business Suite per `SKILL.md`'s standing warning), name `phone_answers_table`, with the exact SQL above.

- [ ] **Step 3: Verify**

Run the Supabase MCP `list_tables` tool, confirm `phone_answers` appears with the 3 policies. Run `get_advisors` (type `security`) and confirm no new lint fires beyond the pre-existing ones already known in this project.

- [ ] **Step 4: Commit**

```bash
cd /sessions/fervent-wizardly-galileo/mnt/trivia-os
git add supabase/migrations/20260728120000_phone_answers_table.sql
git commit -m "feat(db): add phone_answers table for Use Your Phone questions"
```

---

## Task 2: vitest setup (new — no unit-test framework exists yet)

**Files:**
- Modify: `package.json`
- Create: `vitest.config.js`

The repo only has Playwright e2e specs (`test:e2e`/`test:smoke`/`test:audit`/`test:wizard*` scripts, confirmed by reading `package.json`). The new scoring logic (`computeTotal`, `normalizeRoundScore`, `scoreMatchingSubmission`) is pure and cheap to unit-test, and correctness here is the single place the whole "one merged total" feature lives or dies — worth the one-time cost of adding a runner.

- [ ] **Step 1: Install vitest**

```bash
cd /sessions/fervent-wizardly-galileo/mnt/trivia-os
npm install -D vitest
```

- [ ] **Step 2: Add the config**

```js
// vitest.config.js
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['client/src/**/*.test.js'],
  },
})
```

- [ ] **Step 3: Add the script**

In `package.json`'s `"scripts"` block, add one entry (keep every existing script untouched):

```json
"test:unit": "vitest run"
```

- [ ] **Step 4: Verify it runs with zero tests**

```bash
npm run test:unit
```
Expected: exits 0, "No test files found" is acceptable at this point — the next tasks add real specs.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.js
git commit -m "chore: add vitest for unit-testable pure logic"
```

---

## Task 3: `normalizeRoundScore` + `computeTotal` — the load-bearing fix

**Files:**
- Modify: `client/src/lib/scoreboardMath.js`
- Test: `client/src/lib/scoreboardMath.test.js` (new)

This is the single chokepoint fix the independent spec review found missing. Every round value goes from a raw number to `{written, phone}`, normalized on read so old shows with plain-number rounds keep working with zero migration.

- [ ] **Step 1: Write the failing tests**

```js
// client/src/lib/scoreboardMath.test.js
import { describe, it, expect } from 'vitest'
import { normalizeRoundScore, computeTotal, deriveRoundCols } from './scoreboardMath.js'

describe('normalizeRoundScore', () => {
  it('treats a legacy plain number as written-only', () => {
    expect(normalizeRoundScore(12)).toEqual({ written: 12, phone: 0 })
  })
  it('treats null/undefined as zero/zero', () => {
    expect(normalizeRoundScore(null)).toEqual({ written: 0, phone: 0 })
    expect(normalizeRoundScore(undefined)).toEqual({ written: 0, phone: 0 })
  })
  it('passes through an already-split value, defaulting missing halves to 0', () => {
    expect(normalizeRoundScore({ written: 8, phone: 6 })).toEqual({ written: 8, phone: 6 })
    expect(normalizeRoundScore({ written: 8 })).toEqual({ written: 8, phone: 0 })
    expect(normalizeRoundScore({ phone: 6 })).toEqual({ written: 0, phone: 6 })
  })
  it('treats a non-numeric legacy value as zero', () => {
    expect(normalizeRoundScore('')).toEqual({ written: 0, phone: 0 })
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
```

- [ ] **Step 2: Run to verify failure**

```bash
npm run test:unit
```
Expected: FAIL — `normalizeRoundScore is not exported` (it doesn't exist yet), and the split-round `computeTotal` cases fail (current implementation does `Number(scores[c.key])` directly, which is `NaN` on an object).

- [ ] **Step 3: Implement**

Replace the full contents of `client/src/lib/scoreboardMath.js`:

```js
// Single source of truth for the scoreboard's round columns, team totals, and
// medal emoji — used by ScoreboardModal (host), ScoreboardOverlay (TV), Join's
// scores drawer (phone), and ShowDetail (post-show history) so all four
// surfaces agree.

export const MEDALS = ['🥇', '🥈', '🥉']

export function deriveRoundCols(show) {
  const sorted = (show.rounds ?? []).slice().sort((a, b) => (a.number ?? 0) - (b.number ?? 0))
  const cols = sorted.map(round => {
    if (round.roundType === 'swing') return { key: `r_${round.id}`, label: 'SW' }
    if (round.roundType === 'pyl') return { key: `r_${round.id}`, label: 'PYL' }
    const slides = (show.slides ?? []).filter(s => s.roundId === round.id)
    if (slides.some(s => s.type === 'swing-round-intro')) return { key: `r_${round.id}`, label: 'SW' }
    if (slides.some(s => s.type === 'pyl-reveal')) return { key: `r_${round.id}`, label: 'PYL' }
    return { key: `r_${round.id}`, label: `R${round.number ?? '?'}` }
  })
  cols.push({ key: 'bonus', label: '?' })
  return cols
}

// A round's stored score value is EITHER a legacy plain number (every show
// created before 2026-07-28) or a { written, phone } split (new — see
// docs/superpowers/specs/2026-07-28-phone-answer-scoring-design.md). This is
// the one place that ambiguity gets resolved — every consumer of a round
// value, read or write, must go through this first. Never read
// `scores[key]` directly anywhere else in the codebase.
export function normalizeRoundScore(raw) {
  if (raw != null && typeof raw === 'object') {
    return { written: Number(raw.written) || 0, phone: Number(raw.phone) || 0 }
  }
  const n = Number(raw)
  return { written: Number.isFinite(n) ? n : 0, phone: 0 }
}

// Sums only the keys present in `cols` — a team's scores object may carry
// stale keys from a since-deleted round, which must not count toward the total.
export function computeTotal(scores, cols) {
  if (!scores || typeof scores !== 'object') return 0
  return cols.reduce((sum, c) => {
    const { written, phone } = normalizeRoundScore(scores[c.key])
    return sum + written + phone
  }, 0)
}
```

- [ ] **Step 4: Run to verify pass**

```bash
npm run test:unit
```
Expected: PASS, all cases green.

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/scoreboardMath.js client/src/lib/scoreboardMath.test.js
git commit -m "fix(scoring): split round scores into {written, phone}, normalized at the one chokepoint"
```

---

## Task 4: `matchingScoring.js` — pure scoring function

**Files:**
- Create: `client/src/lib/matchingScoring.js`
- Test: `client/src/lib/matchingScoring.test.js`

Scoring design (from the spec, made concrete): each pair in `slide.data.pairs` carries one `id` shared by both its left and right column entries. A team's submitted `answer` is an array of `{ leftId, rightId }` — the board only ever writes a connection between an actual left-column item and an actual right-column item, so a pair is correct exactly when `leftId === rightId` (both reference the same canonical pair id). No answer-key comparison needed at all — correctness is self-evident from the submission shape itself, same trust model as every other phone write in this app (no server-side validation exists anywhere in this codebase; a malicious client could fabricate a matching id, exactly as a malicious client could already fabricate any other `/join` write today — not a new risk this feature introduces).

- [ ] **Step 1: Write the failing tests**

```js
// client/src/lib/matchingScoring.test.js
import { describe, it, expect } from 'vitest'
import { scoreMatchingSubmission } from './matchingScoring.js'

describe('scoreMatchingSubmission', () => {
  it('scores zero for no pairs', () => {
    expect(scoreMatchingSubmission([], 2)).toBe(0)
  })
  it('scores zero for a null/undefined answer', () => {
    expect(scoreMatchingSubmission(null, 2)).toBe(0)
    expect(scoreMatchingSubmission(undefined, 2)).toBe(0)
  })
  it('counts only pairs where leftId matches rightId', () => {
    const answer = [
      { leftId: 'p1', rightId: 'p1' }, // correct
      { leftId: 'p2', rightId: 'p3' }, // wrong
      { leftId: 'p4', rightId: 'p4' }, // correct
    ]
    expect(scoreMatchingSubmission(answer, 2)).toBe(4)
  })
  it('gives partial credit for a partial submission', () => {
    expect(scoreMatchingSubmission([{ leftId: 'p1', rightId: 'p1' }], 3)).toBe(3)
  })
  it('ignores malformed entries rather than throwing', () => {
    const answer = [{ leftId: 'p1' }, { rightId: 'p2' }, null, {}]
    expect(scoreMatchingSubmission(answer, 5)).toBe(0)
  })
})
```

- [ ] **Step 2: Run to verify failure**

```bash
npm run test:unit
```
Expected: FAIL — `matchingScoring.js` doesn't exist.

- [ ] **Step 3: Implement**

```js
// client/src/lib/matchingScoring.js
//
// A matching submission is scored purely from its own shape — no answer-key
// lookup needed. Each pair in slide.data.pairs shares one `id` between its
// left and right column entries (see docs/superpowers/specs/2026-07-28-
// phone-answer-scoring-design.md and MatchingBoard.jsx, which only ever
// writes a connection as { leftId, rightId } pulled from the actual rendered
// items). A connection is correct exactly when leftId === rightId.

export function scoreMatchingSubmission(answer, pointsPerMatch) {
  if (!Array.isArray(answer)) return 0
  const correctCount = answer.filter(
    pair => pair && pair.leftId != null && pair.leftId === pair.rightId
  ).length
  return correctCount * (Number(pointsPerMatch) || 0)
}
```

- [ ] **Step 4: Run to verify pass**

```bash
npm run test:unit
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/matchingScoring.js client/src/lib/matchingScoring.test.js
git commit -m "feat(matching): add pure scoring function for tap-to-pair submissions"
```

---

## Task 5: Fix the 4 broken round-score call sites

**Files:**
- Modify: `client/src/components/host/ScoreboardModal.jsx`
- Modify: `client/src/components/display/ScoreboardOverlay.jsx`
- Modify: `client/src/views/ShowDetail.jsx`

These are the exact sites the independent review flagged as bypassing `computeTotal` and reading/writing the raw cell directly — must be fixed or Task 3's shape change silently breaks live editing, the TV overlay, and the public history page the moment this ships.

- [ ] **Step 1: Fix `ScoreboardModal.jsx`'s `TeamTable` input (currently lines 185–194)**

Import the normalizer at the top of the file (add to existing imports, currently line 4):

```js
import { deriveRoundCols, computeTotal, normalizeRoundScore } from '../../lib/scoreboardMath.js'
```

Replace the score `<input>` block:

```jsx
              {cols.map(c => (
                <td key={c.key} className="px-1 py-1 text-center">
                  <input type="number" value={normalizeRoundScore(team.scores[c.key]).written || ''} placeholder="—"
                    onChange={e => onUpdateScore(team.id, c.key, e.target.value)}
                    title={atRiskCells?.[`${team.id}:${c.key}`] ? 'Didn't save — check connection' : undefined}
                    className={`w-full text-center text-sm text-gray-800 bg-transparent border-b outline-none py-0.5 placeholder:text-gray-300 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                      atRiskCells?.[`${team.id}:${c.key}`] ? 'border-amber-400' : 'border-transparent hover:border-gray-200 focus:border-[#1a6b4a]'
                    }`} />
                  {normalizeRoundScore(team.scores[c.key]).phone > 0 && (
                    <span
                      title={`+${normalizeRoundScore(team.scores[c.key]).phone} from phone`}
                      className="block text-[9px] leading-none text-amber-500 font-semibold mt-0.5"
                    >⚡ +{normalizeRoundScore(team.scores[c.key]).phone}</span>
                  )}
                </td>
              ))}
```

This is also the host-only passive indicator from the spec (⚡ badge) — it lives here and nowhere else, satisfying "backend-only, never on TV/phone/history."

- [ ] **Step 2: Fix `updateScore()` (currently lines 282–289) to preserve `phone`**

```js
  function updateScore(id, key, val) {
    setTeams(prev => prev.map(t => {
      if (t.id !== id) return t
      const prevSplit = normalizeRoundScore(t.scores[key])
      const updated = {
        ...t,
        scores: {
          ...t.scores,
          [key]: val === '' ? { written: 0, phone: prevSplit.phone } : { written: Number(val), phone: prevSplit.phone },
        },
      }
      save(updated, key)
      return updated
    }))
  }
```

`quickSave()` (line 340) is untouched — it already delegates straight to `updateScore`, which now does the right thing automatically.

- [ ] **Step 3: Fix `ScoreboardOverlay.jsx`'s round-score pills (currently lines 69–93)**

Add the import (find the existing top-of-file imports and add):

```js
import { normalizeRoundScore } from '../../lib/scoreboardMath.js'
```

Replace the pill block:

```jsx
      {/* Round score pills */}
      <div className="shrink-0 hidden xl:flex items-center gap-1.5">
        {cols.map(col => {
          const { written, phone } = normalizeRoundScore(team.scores?.[col.key])
          const total = written + phone
          if (total === 0) return null
          return (
            <span
              key={col.key}
              style={{
                fontFamily: `'${theme.fonts.body}', 'DM Sans', sans-serif`,
                fontSize: '0.7rem',
                fontWeight: 600,
                color: 'rgba(255,255,255,0.55)',
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.1)',
                padding: '1px 7px',
                borderRadius: '999px',
                whiteSpace: 'nowrap',
              }}
            >
              {col.label} {total}
            </span>
          )
        })}
      </div>
```

Note: no ⚡ badge here — per the spec, the passive indicator is host-only, and this file only renders on `/display` (the TV). `written`/`phone` are summed to one number here, deliberately indistinguishable from the room's point of view.

- [ ] **Step 4: Fix `ShowDetail.jsx`'s per-round render (currently lines 170–185)**

Add the import (find the existing imports near the top of the file and add):

```js
import { normalizeRoundScore } from '../lib/scoreboardMath.js'
```

Replace both blocks:

```jsx
                      {roundCols.map(col => {
                        const { written, phone } = normalizeRoundScore(team.scores?.[col.key])
                        const total = written + phone
                        return (
                          <td key={col.key} className="px-3 py-2.5 text-center text-gray-600 tabular-nums">
                            {team.scores?.[col.key] != null
                              ? total
                              : <span className="text-gray-300">—</span>
                            }
                          </td>
                        )
                      })}
                      {(scoreboardTeams ?? []).some(t => t.scores?.['bonus'] != null) && (
                        <td className="px-3 py-2.5 text-center text-gray-600 tabular-nums">
                          {team.scores?.['bonus'] != null
                            ? normalizeRoundScore(team.scores['bonus']).written + normalizeRoundScore(team.scores['bonus']).phone
                            : <span className="text-gray-300">—</span>
                          }
                        </td>
                      )}
```

This is the public-facing surface the spec is emphatic must never leak internals — confirmed no ⚡ badge, no written/phone split shown, just the merged total, same as it looked before this feature existed.

- [ ] **Step 5: Manual verification (no e2e test added for this — see Task 8 for why)**

Run the dev server (`vercel dev` per `SKILL.md`), open a show with an existing round score, confirm: editing a score in `ScoreboardModal` still saves correctly; a round's TV pill on `/display` (with `S` to toggle scoreboard overlay) still shows the right total; `ShowDetail`'s history page for a past show still renders correctly. This is a pure refactor at this point (no phone score exists yet to fold in) — the bar is "nothing regressed," confirmed by eye since there's no unit-testable surface for React rendering in this repo yet.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/host/ScoreboardModal.jsx client/src/components/display/ScoreboardOverlay.jsx client/src/views/ShowDetail.jsx
git commit -m "fix(scoring): route all 4 round-score call sites through normalizeRoundScore"
```

---

## Task 6: Wire `matching` into the shiny-format system

**Files:**
- Modify: `client/src/lib/shinySeries.js`
- Modify: `client/src/components/host/FormatLibrary.jsx`
- Modify: `client/src/components/host/SlideEditor.jsx`

- [ ] **Step 1: Add `isMatchingShiny()`**

In `client/src/lib/shinySeries.js`, add this function alongside the existing four (after `isVideoShiny`, end of file):

```js
export function isMatchingShiny(data) {
  return data.shinyInputSchema?.type === 'matching'
}
```

- [ ] **Step 2: Add `'matching'` to the format-creation type picker**

In `client/src/components/host/FormatLibrary.jsx`, line 3, change:

```js
const INPUT_TYPES = ['image', 'audio', 'video', 'text', 'list', 'grid']
```
to:
```js
const INPUT_TYPES = ['image', 'audio', 'video', 'text', 'list', 'grid', 'matching']
```

No further change needed in this file — confirmed by research that `AddSlideWizard.jsx` treats every non-grid, non-image format type generically (stamps `data.shinyInputSchema = format.input_schema` verbatim, `data.isShiny = true`, leaves all type-specific behavior to downstream renderers/editors). `matching` needs no `FormatLibrary.jsx` config block beyond appearing in the type list — `pairs` and `pointsPerMatch` are per-slide fields filled in `SlideEditor.jsx` (next step), not per-format config.

- [ ] **Step 3: Add `MatchingBuilder` to `SlideEditor.jsx`**

Add this function as a new sibling to `ShinyListBuilder` (which lives at lines 924–969 — place `MatchingBuilder` directly after it):

```jsx
function MatchingBuilder({ pairs, pointsPerMatch, onChangePairs, onChangePoints }) {
  function updatePair(i, side, value) {
    onChangePairs(pairs.map((p, idx) => idx === i ? { ...p, [side]: value } : p))
  }
  function addPair() {
    onChangePairs([...pairs, { id: `p${Date.now()}_${pairs.length}`, left: '', right: '' }])
  }
  function removePair(i) {
    onChangePairs(pairs.filter((_, idx) => idx !== i))
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="block text-xs font-medium text-gray-700 mb-1.5">Matching Pairs</label>
      {pairs.map((pair, i) => (
        <div key={pair.id} className="flex gap-2 items-center">
          <span className="text-xs text-gray-400 w-5 shrink-0 text-right">{i + 1}.</span>
          <input
            value={pair.left}
            onChange={e => updatePair(i, 'left', e.target.value)}
            placeholder="Left item…"
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-baynes-forest"
          />
          <span className="text-xs text-gray-300 shrink-0">↔</span>
          <input
            value={pair.right}
            onChange={e => updatePair(i, 'right', e.target.value)}
            placeholder="Right item…"
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-baynes-forest"
          />
          {pairs.length > 2 && (
            <button
              onClick={() => removePair(i)}
              className="text-xs text-gray-300 hover:text-red-400 shrink-0"
            >✕</button>
          )}
        </div>
      ))}
      <button
        onClick={addPair}
        className="text-xs text-baynes-forest hover:text-green-800 font-medium text-left"
      >
        + Add pair
      </button>
      <div className="flex items-center gap-2 mt-1 pt-3 border-t border-gray-100">
        <label className="text-xs font-medium text-gray-700">Points per correct pair</label>
        <input
          type="number"
          value={pointsPerMatch}
          onChange={e => onChangePoints(Number(e.target.value))}
          min={0}
          className="w-16 border border-gray-200 rounded px-2 py-1.5 text-sm text-center text-gray-900 focus:outline-none focus:ring-1 focus:ring-baynes-forest"
        />
      </div>
    </div>
  )
}
```

Mount it as a new sibling block right after the existing List builder mount (currently lines 704–711):

```jsx
          {/* Matching builder */}
          {schema.type === 'matching' && (
            <MatchingBuilder
              pairs={data.pairs ?? [{ id: 'p0', left: '', right: '' }, { id: 'p1', left: '', right: '' }]}
              pointsPerMatch={data.pointsPerMatch ?? 2}
              onChangePairs={pairs => onChange('pairs', pairs)}
              onChangePoints={pts => onChange('pointsPerMatch', pts)}
            />
          )}
```

(`onChange` here follows the exact same field-setter pattern the List builder already uses one block above — `onChange('listItems', items)` → `onChange('pairs', pairs)`/`onChange('pointsPerMatch', pts)`, same signature.)

- [ ] **Step 4: Manual verification**

Run the dev server, open Build Mode, "✨ Add Shiny" → create a new format with type `matching` → confirm it appears in `AddSlideWizard`'s format picker exactly like any other shiny format → pick it, create a question slide → confirm `MatchingBuilder` renders in `SlideEditor` and pairs can be typed and saved (check `data.pairs`/`data.pointsPerMatch` persist via the existing debounced `updateSlide` — no new save path was added, so this should just work).

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/shinySeries.js client/src/components/host/FormatLibrary.jsx client/src/components/host/SlideEditor.jsx
git commit -m "feat(matching): wire matching into the shiny-format builder pipeline"
```

---

## Task 7: `/display` rendering — `ShinyMatchingQuestion.jsx`

**Files:**
- Create: `client/src/components/display/slides/ShinyMatchingQuestion.jsx`
- Modify: `client/src/components/display/slides/QuestionSlide.jsx`

Three states per the spec: open (live submit count), locked (brief transitional), revealed (color-fill correct pairs in fixed shiny gold). Styled per `brand.md`'s Midnight Orchard language — bold geometry, massive text, dark background, GPU-only animation (`transform`/`opacity` only, per `SKILL.md` Critical Rule 2).

- [ ] **Step 1: Create the component**

```jsx
// client/src/components/display/slides/ShinyMatchingQuestion.jsx
import { useState, useEffect } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { supabase } from '../../../lib/supabase.js'
import { SHINY_GOLD } from '../../../lib/shinyGold.js'
import { EASE_OUT } from '../../../lib/easings.js'

const PALETTE = ['#e02020', '#3aa0e0', '#e0a020', '#8050c0', '#20a060', '#e05090']

export default function ShinyMatchingQuestion({ slide, theme }) {
  const { data } = slide
  const pairs = data.pairs ?? []
  const locked = !!data.matchingLocked
  const revealed = !!data.matchingRevealed
  const [submittedCount, setSubmittedCount] = useState(0)
  const shouldReduceMotion = useReducedMotion()

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { count } = await supabase
        .from('phone_answers')
        .select('id', { count: 'exact', head: true })
        .eq('slide_id', slide.id)
      if (!cancelled) setSubmittedCount(count ?? 0)
    }
    load()
    const channel = supabase
      .channel(`phone_answers:${slide.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'phone_answers', filter: `slide_id=eq.${slide.id}` }, load)
      .subscribe()
    return () => { cancelled = true; supabase.removeChannel(channel) }
  }, [slide.id])

  const text = theme.colors.text

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', padding: '4rem' }}>
      <div style={{ display: 'flex', gap: '6vw', width: '100%', maxWidth: 1400, justifyContent: 'space-between' }}>
        <Column items={pairs.map(p => ({ id: p.id, label: p.left }))} theme={theme} revealed={revealed} shouldReduceMotion={shouldReduceMotion} />
        <Column items={pairs.map(p => ({ id: p.id, label: p.right }))} theme={theme} revealed={revealed} shouldReduceMotion={shouldReduceMotion} shuffled />
      </div>
      {!locked && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, ease: EASE_OUT }}
          style={{ marginTop: '2.5rem', color: `${text}70`, fontSize: '1.1rem', fontFamily: `'${theme.fonts.body}', 'DM Sans', sans-serif` }}
        >
          {submittedCount} team{submittedCount === 1 ? '' : 's'} submitted
        </motion.p>
      )}
      {locked && !revealed && (
        <p style={{ marginTop: '2.5rem', color: `${text}45`, fontSize: '1rem', fontFamily: `'${theme.fonts.body}', 'DM Sans', sans-serif` }}>
          Locked — scoring…
        </p>
      )}
    </div>
  )
}

function Column({ items, theme, revealed, shouldReduceMotion, shuffled }) {
  const ordered = shuffled ? [...items].sort((a, b) => a.id.localeCompare(b.id)).reverse() : items
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', flex: 1 }}>
      {ordered.map((item, i) => (
        <motion.div
          key={item.id}
          initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, transform: 'translateY(12px)' }}
          animate={{ opacity: 1, transform: 'translateY(0px)' }}
          transition={{ duration: 0.28, delay: i * 0.05, ease: EASE_OUT }}
          style={{
            padding: '1.25rem 1.75rem',
            borderRadius: 14,
            fontSize: '1.4rem',
            fontFamily: `'${theme.fonts.display}', 'Boogaloo', sans-serif`,
            color: revealed ? '#1a1a1a' : theme.colors.text,
            background: revealed ? SHINY_GOLD : 'rgba(255,255,255,0.06)',
            border: revealed ? 'none' : '1px solid rgba(255,255,255,0.12)',
          }}
        >
          {item.label}
        </motion.div>
      ))}
    </div>
  )
}
```

Note: this v1 shuffle is a placeholder deterministic sort (stable per slide, not re-shuffled per render) — good enough to ship since the spec's Open Question on per-team vs. shared shuffle is explicitly deferred, not blocking.

- [ ] **Step 2: Wire the dispatcher**

In `client/src/components/display/slides/QuestionSlide.jsx`, line 6, change the import:

```js
import { resolveShinyPart, isVisualShiny, isAudioShiny, isListShiny, isVideoShiny, isMatchingShiny } from '../../../lib/shinySeries.js'
```

Add the component import near the top (alongside `ShinyIntroScreen` at line 5):

```js
import ShinyMatchingQuestion from './ShinyMatchingQuestion.jsx'
```

In the dispatcher (currently lines 811–814), add a new branch before the `isListShiny` check (order doesn't matter functionally since these are mutually exclusive types, but keep it grouped with its siblings):

```jsx
  if (data.isShiny && isMatchingShiny(data)) {
    return <ShinyMatchingQuestion slide={slide} theme={theme} />
  }
  if (data.isShiny && isListShiny(data)) {
    return <ShinyListQuestion slide={slide} theme={theme} />
  }
```

- [ ] **Step 3: Manual verification**

Preview a matching slide (`/display?preview=true` per `SKILL.md`'s routing table), confirm both columns render, confirm the submit-count text shows `0 teams submitted` with no phones connected yet.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/display/slides/ShinyMatchingQuestion.jsx client/src/components/display/slides/QuestionSlide.jsx
git commit -m "feat(matching): add /display rendering — open/locked/revealed states"
```

---

## Task 8: `/join` rendering — `MatchingBoard.jsx`

**Files:**
- Create: `client/src/components/join/MatchingBoard.jsx`
- Modify: `client/src/views/Join.jsx`

Quiplash-style phone UI per Ben's reference: huge flat touch targets, minimal chrome, one action visible at a time, zero spectacle on the phone itself — the reveal lives entirely on the TV (Task 7). Tap-to-pair, color-fill (not a connector line, per Ben's explicit UX call) — a fixed palette sized to the pair count, first pair made gets color 1, etc. Color is purely a submission-side visual aid, carries no scoring meaning (scoring only cares about `leftId === rightId`, per Task 4).

- [ ] **Step 1: Create the component**

```jsx
// client/src/components/join/MatchingBoard.jsx
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase.js'

const PALETTE = ['#e02020', '#3aa0e0', '#e0a020', '#8050c0', '#20a060', '#e05090']

export default function MatchingBoard({ slide, team, theme }) {
  const { data } = slide
  const pairs = data.pairs ?? []
  const locked = !!data.matchingLocked
  const text = theme?.colors?.text ?? '#ffffff'

  // connections: { [itemId]: colorIndex } — one entry per left OR right item
  // that's been assigned a color. A completed pair exists once both a left
  // item and a right item share the same colorIndex.
  const [connections, setConnections] = useState({})
  const [pendingSide, setPendingSide] = useState(null) // { side: 'left'|'right', itemId } — first tap of a pair, waiting for the second

  const rightOrder = [...pairs].sort((a, b) => a.id.localeCompare(b.id)).reverse()

  const usedColors = new Set(Object.values(connections))
  const nextColor = PALETTE.findIndex((_, i) => !usedColors.has(i))

  const submit = useCallback(async (nextConnections) => {
    const leftIds = pairs.map(p => p.id)
    const rightIds = pairs.map(p => p.id)
    const byColor = {}
    Object.entries(nextConnections).forEach(([itemId, color]) => {
      byColor[color] = byColor[color] ?? {}
      if (leftIds.includes(itemId)) byColor[color].leftId = itemId
      if (rightIds.includes(itemId)) byColor[color].rightId = itemId
    })
    const answer = Object.values(byColor).filter(p => p.leftId && p.rightId)
    await supabase.from('phone_answers').upsert(
      { show_id: slide.showId ?? team.showId, slide_id: slide.id, team_id: team.id, answer },
      { onConflict: 'slide_id,team_id' }
    )
  }, [pairs, slide.id, slide.showId, team.id, team.showId])

  function tapItem(side, itemId) {
    if (locked) return
    // Already colored — tapping it again undoes that pair (both halves clear).
    if (connections[itemId] != null) {
      const color = connections[itemId]
      const next = { ...connections }
      Object.keys(next).forEach(id => { if (next[id] === color) delete next[id] })
      setConnections(next)
      submit(next)
      return
    }
    if (!pendingSide) {
      setPendingSide({ side, itemId })
      return
    }
    if (pendingSide.side === side) {
      // Tapped same-side twice — switch the pending item instead of pairing with itself.
      setPendingSide({ side, itemId })
      return
    }
    if (nextColor === -1) return // no colors left (shouldn't happen — palette matches pair count)
    const next = { ...connections, [pendingSide.itemId]: nextColor, [itemId]: nextColor }
    setConnections(next)
    setPendingSide(null)
    submit(next)
  }

  useEffect(() => {
    let cancelled = false
    supabase
      .from('phone_answers')
      .select('answer')
      .eq('slide_id', slide.id)
      .eq('team_id', team.id)
      .maybeSingle()
      .then(({ data: row }) => {
        if (cancelled || !row?.answer) return
        const restored = {}
        row.answer.forEach((pair, i) => {
          restored[pair.leftId] = i
          restored[pair.rightId] = i
        })
        setConnections(restored)
      })
    return () => { cancelled = true }
  }, [slide.id, team.id])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', flex: 1 }}>
          {pairs.map(p => (
            <MatchTile key={p.id} label={p.left} color={connections[p.id] != null ? PALETTE[connections[p.id]] : null}
              pending={pendingSide?.side === 'left' && pendingSide.itemId === p.id}
              disabled={locked} onTap={() => tapItem('left', p.id)} textColor={text} />
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', flex: 1 }}>
          {rightOrder.map(p => (
            <MatchTile key={p.id} label={p.right} color={connections[p.id] != null ? PALETTE[connections[p.id]] : null}
              pending={pendingSide?.side === 'right' && pendingSide.itemId === p.id}
              disabled={locked} onTap={() => tapItem('right', p.id)} textColor={text} />
          ))}
        </div>
      </div>
      <p style={{ color: `${text}55`, fontSize: '0.85rem', textAlign: 'center', margin: 0 }}>
        {locked ? 'Answers locked' : 'Tap one from each side to match them'}
      </p>
    </div>
  )
}

function MatchTile({ label, color, pending, disabled, onTap, textColor }) {
  return (
    <button
      onClick={onTap}
      disabled={disabled}
      style={{
        minHeight: 56,
        padding: '0.9rem 1rem',
        borderRadius: 14,
        border: pending ? `3px solid ${textColor}` : '1px solid rgba(255,255,255,0.15)',
        background: color ?? 'rgba(255,255,255,0.06)',
        color: color ? '#1a1a1a' : textColor,
        fontSize: '1.05rem',
        fontWeight: 600,
        fontFamily: 'DM Sans, sans-serif',
        textAlign: 'left',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {label}
    </button>
  )
}
```

- [ ] **Step 2: Wire it into `Join.jsx`'s `SlideContent`**

Add the import near the top of `Join.jsx` (alongside the existing `resolveShinyPart` import):

```js
import { resolveShinyPart, isMatchingShiny } from '../lib/shinySeries.js'
import MatchingBoard from '../components/join/MatchingBoard.jsx'
```

In `SlideContent`'s `case 'question':` block (currently lines 349–380), add the matching branch right after the shiny-intro check (line 358) and before the `resolveShinyPart` fallthrough:

```jsx
      case 'question': {
        const d = slide.data
        if (d.isShiny && !d.introDone) {
          return (
            <p style={{ color: `${text}70`, fontSize: 'clamp(1rem, 4vw, 1.2rem)', lineHeight: 1.5, margin: 0, fontStyle: 'italic' }}>
              {d.isSeries && d.seriesTheme ? d.seriesTheme : 'Next question incoming…'}
            </p>
          )
        }
        if (d.isShiny && isMatchingShiny(d)) {
          return <MatchingBoard slide={slide} team={window.__triviaOsTeam} theme={theme} />
        }
        const part = resolveShinyPart(d)
        // ... rest unchanged
```

**Note on `team` access:** `SlideContent`'s signature (line 343) is `function SlideContent({ slide, show, theme })` — it does not currently receive `team`. `window.__triviaOsTeam` above is a placeholder that must NOT ship — the real fix is adding `team` as a fourth prop threaded from `LiveView` (which already has `team` in its own signature, line 742) down through wherever it renders `<SlideContent ... />` (line 838). Do that instead:

```jsx
function SlideContent({ slide, show, theme, team }) {
```
and at the call site (`Join.jsx:838`):
```jsx
<SlideContent slide={visibleSlide} show={show} theme={theme} team={team} />
```
and the matching branch above becomes:
```jsx
        if (d.isShiny && isMatchingShiny(d)) {
          return <MatchingBoard slide={slide} team={team} theme={theme} />
        }
```

- [ ] **Step 3: Manual verification**

Two phones (or two browser tabs with different localStorage-cleared sessions), register two different teams, go live on a matching question, confirm: tapping a left then right item fills both with the same color; tapping either half again undoes it; the `phone_answers` row updates on each change (check via Supabase table editor or the `list_tables`/`execute_sql` MCP tool); closing and reopening the tab restores the in-progress state (Step 1's restore-on-mount effect).

- [ ] **Step 4: Commit**

```bash
git add client/src/components/join/MatchingBoard.jsx client/src/views/Join.jsx
git commit -m "feat(matching): add /join tap-to-pair color-fill board"
```

---

## Task 9: Lock Answers + scoring fold-in

**Files:**
- Modify: `client/src/components/host/LiveMode.jsx`

New host control, modeled directly on the existing PYL-picker precedent block (`LiveMode.jsx:366-387`) — same conditional-on-`currentSlide?.type` shape, same visual weight.

- [ ] **Step 1: Add imports**

Near the top of `LiveMode.jsx`, add:

```js
import { supabase } from '../../lib/supabase.js'
import { isMatchingShiny } from '../../lib/shinySeries.js'
import { scoreMatchingSubmission } from '../../lib/matchingScoring.js'
import { normalizeRoundScore } from '../../lib/scoreboardMath.js'
```

- [ ] **Step 2: Add the scoring function**

Inside the `LiveMode` component body (alongside the existing `handlePickAnimation`-style handlers), add:

```js
  const [matchingBusy, setMatchingBusy] = useState(false)

  async function handleLockAndScoreMatching(slide) {
    setMatchingBusy(true)
    try {
      await actions.updateSlide(slide.id, { data: { ...slide.data, matchingLocked: true } })

      const { data: answers, error: fetchError } = await supabase
        .from('phone_answers')
        .select('team_id, answer')
        .eq('slide_id', slide.id)
      if (fetchError) { console.error('phone_answers fetch failed:', fetchError); return }

      const { data: teams, error: teamsError } = await supabase
        .from('teams')
        .select('id, name')
        .eq('show_id', show.id)
      if (teamsError) { console.error('teams fetch failed:', teamsError); return }

      const { data: scoreboardTeams, error: sbError } = await supabase
        .from('scoreboard_teams')
        .select('id, name, scores')
        .eq('show_id', show.id)
      if (sbError) { console.error('scoreboard_teams fetch failed:', sbError); return }

      const round = show.rounds.find(r => r.id === slide.roundId)
      const roundKey = round ? `r_${round.id}` : 'bonus'
      const pointsPerMatch = slide.data.pointsPerMatch ?? 2

      const teamIdToName = new Map(teams.map(t => [t.id, t.name.trim().toLowerCase()]))

      const updates = []
      for (const ans of answers) {
        const points = scoreMatchingSubmission(ans.answer, pointsPerMatch)
        const teamName = teamIdToName.get(ans.team_id)
        if (!teamName) continue // team_id has no matching live registration — skip, nothing to attribute the score to
        const sbTeam = scoreboardTeams.find(t => t.name.trim().toLowerCase() === teamName)
        if (!sbTeam) continue // no scoreboard_teams row for this name yet — host hasn't added them to the admin scoreboard, nothing to fold into
        const prevSplit = normalizeRoundScore(sbTeam.scores?.[roundKey])
        const nextScores = { ...sbTeam.scores, [roundKey]: { written: prevSplit.written, phone: points } }
        updates.push({ id: sbTeam.id, show_id: sbTeam.show_id, name: sbTeam.name, scores: nextScores, sort_order: sbTeam.sort_order })
      }

      if (updates.length > 0) {
        const { error: updateError } = await supabase.from('scoreboard_teams').upsert(updates)
        if (updateError) console.error('scoreboard_teams score fold-in failed:', updateError)
      }

      await actions.updateSlide(slide.id, { data: { ...slide.data, matchingLocked: true, matchingRevealed: true } })
    } finally {
      setMatchingBusy(false)
    }
  }
```

**Design notes baked into this code, worth reading before changing it:**
- Scoring **overwrites** `phone` for this round key (`phone: points`, not `phone: prevSplit.phone + points`) — this is the idempotent-re-lock behavior the spec calls for: if Lock Answers is somehow triggered twice, re-running scoring recomputes and replaces rather than double-adding. This is correct for the single-phone-question-per-round case this plan covers; the spec's Open Questions section already flags multi-phone-question-per-round as needing a different (per-slide-keyed) storage shape, deliberately out of scope here.
- `written` is preserved from whatever the host already typed (`prevSplit.written`), never touched by this function.
- A team that answered on their phone but was never added to the admin `scoreboard_teams` table (or whose name doesn't match) is silently skipped, not errored — the host still has to add every team to the scoreboard by hand today regardless of phone questions, so this doesn't change host workflow, it just means the phone score has nothing to land in until they do.
- This single function does both Lock (Step 1's `updateSlide`) and Reveal (final `updateSlide` with `matchingRevealed: true`) — the spec describes these as the host's two separate, independently-timed actions (Lock closes submissions, Reveal is a presentation beat). **This plan intentionally collapses them into one button for v1** (simpler, one less control to explain live) — splitting them into two separate buttons is a fast-follow if Ben wants the presentation gap back, not a blocker for shipping.

- [ ] **Step 3: Add the control**

Add this block as a new sibling to the existing PYL-picker block (`LiveMode.jsx:366-387`), same location (right under `<CurrentSlideCard slide={currentSlide} show={show} />`):

```jsx
          {currentSlide?.type === 'question' && isMatchingShiny(currentSlide?.data) && !currentSlide?.data?.matchingLocked && (
            <div className="bg-white border border-gray-100 rounded-2xl p-5 shrink-0">
              <p className="text-xs text-gray-400 mb-3">Matching question — teams are submitting on their phones</p>
              <button
                onClick={() => handleLockAndScoreMatching(currentSlide)}
                disabled={matchingBusy}
                className={`w-full py-3 rounded-xl border-2 font-semibold text-sm transition-[color,background-color,border-color,transform] duration-[120ms] active:scale-[0.97] ${
                  matchingBusy
                    ? 'border-gray-100 text-gray-300 cursor-not-allowed'
                    : 'border-[#1a6b4a] text-[#1a6b4a] hover:bg-green-50'
                }`}
              >
                {matchingBusy ? 'Scoring…' : '🔒 Lock Answers & Score'}
              </button>
            </div>
          )}
```

- [ ] **Step 4: Manual verification**

Full live-fire test: go live on a matching question with 2+ phones submitting real answers, click "Lock Answers & Score," confirm: `/join` immediately stops accepting taps on those phones; `/display` flips to the locked-then-revealed state (Task 7); `ScoreboardModal`'s round cell shows the folded-in total with the ⚡ badge (Task 5, Step 1); `ScoreboardOverlay` on the TV and `ShowDetail` history both show the merged total with no badge.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/host/LiveMode.jsx
git commit -m "feat(matching): add Lock Answers control + auto-scoring fold-in"
```

---

## Plan self-review notes

**Spec coverage:** every numbered section of `docs/superpowers/specs/2026-07-28-phone-answer-scoring-design.md` maps to a task above — data model (Tasks 1, 3, 4), question authoring via shiny builder (Task 6), phone UI (Task 8), `/display` rendering (Task 7), locking/scoring (Task 9), the 4-call-site fix (Task 5), host-only badge (Task 5 Step 1). Not covered, deliberately: the spec's own Open Questions (per-team shuffle, multi-phone-question-per-round) — both explicitly marked deferrable in the spec itself.

**Deviation from the spec, flagged here rather than silently:** the spec describes Lock and Reveal as two separate host-timed actions; Task 9 collapses them into one button for v1 simplicity. Worth Ben's explicit sign-off before or after building — not a silent scope cut.

**No e2e/Playwright coverage added.** The repo's only existing test convention is Playwright specs for host build/audit flows; this plan doesn't add a new one for the matching flow given the size this plan already is — flagged as a real gap, not an oversight, and a reasonable Task 10 for a follow-up plan once the feature is live and stable enough to be worth locking down with a regression test.
