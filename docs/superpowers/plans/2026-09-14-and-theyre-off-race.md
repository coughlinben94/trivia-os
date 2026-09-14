# "And They're Off!" (horse-race shiny format) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a new own-type shiny slide (`slide.type: 'horse-race'`) where
teams write a paper pick among 4 named contenders, and the host reveals the
answer by playing an animated one-lap horse race around an oval track, driven
beat-by-beat by real data the host enters.

**Architecture:** Own top-level slide type (Pattern A, same shape as
`flip-em-down` which shipped today), no phone mechanic, no new scoring model
— plain pick-one-of-4 graded like any question. The race itself is
pre-computed CSS `@keyframes` injected per slide (same technique
`ParticleBackground.jsx`'s bespoke ambients already use), driven by a single
timestamp field (`data.raceStartedAt`) so a reload/reconnect can seek via
negative `animation-delay` with no JS animation loop.

**Tech Stack:** React, Vite, Supabase (Postgres + Realtime), vitest,
`references/fact-hunt` conventions N/A. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-14-and-theyre-off-race-design.md`
(revised 2026-09-14 for the one-lap oval track — read the whole spec before
starting; every task below assumes it, and the spec has exact file:line
anchors this plan doesn't repeat).

## Global Constraints

- GPU-only animation: every keyframe touches only `transform`/`opacity`
  (Critical Rule 2). Never animate `width`, `height`, `left`, `top`,
  `background-position`.
- Every animated element needs a `prefers-reduced-motion: reduce` guard
  (Critical Rule 3) — for this feature, reduced motion renders the finished
  state immediately, no race.
- No Socket.io/Express — Supabase Realtime only (Critical Rule 4).
- `translate()`/`translateX()` percentages in this feature are always
  relative to a wrapper sized to exactly the geometry they represent (lane
  bounding box), never to pixel measurement — this is what keeps the TV
  render and the `SlideCanvasEditor` `scale(k)` preview in agreement.
- `raceStartedAt` rides inside the `slides` jsonb column — RT-1 landmine
  applies, this is a `slides` write like any other, don't split it into a
  separate column.
- Right rail in `SlideEditor.jsx` stays content-only — no design controls.
- Do not mount `ShinyGroupAnnounce` — that file is deleted (`9be7685`).
- Fonts: Boogaloo (`theme.fonts.display`) / DM Sans (`theme.fonts.body`)
  only, read from `theme`, never hardcoded.

---

### Task 1: `lib/raceMath.js` — running totals, fractions, angles, winner

**Files:**
- Create: `client/src/lib/raceMath.js`
- Test: `client/src/lib/raceMath.test.js`

**Interfaces:**
- Consumes: `beats: [{ label: string, values: number[] }]` (length = beat
  count, each `values` array length = contender count, always 4 for this
  format but the math takes any length), `contenders: [{ id, name,
  imageUrl }]`
- Produces (used by Task 4's `RaceSlide.jsx` and Task 6's `RaceEditor`):
  - `runningTotals(beats): number[][]` — one row per beat, cumulative sums
  - `computeFractions(beats): { totals: number[][], fractions: number[][],
    winnerFinal: number }` — `fractions[k][i]` = lane *i*'s progress (0–1)
    through beat *k*, normalised to the winner's final total
  - `computeWinner(contenders, beats): { winnerIndex: number|null,
    winnerName: string, tie: boolean, leaderPerBeat: (number|null)[],
    finalTotals: number[], margin: number }` — `leaderPerBeat[k]` is the
    lane index leading after beat *k*, or `null` if tied; `tie: true` means
    the final beat has 2+ lanes at the max value, `winnerIndex` is then
    `null`
  - `keyframeStops(beats): { percent: number, angleDeg: number, flip:
    boolean }[][]` — one array per lane, each starting with the gate stop
    (`percent: 0, angleDeg: -90, flip: false`) followed by one stop per
    beat; `angleDeg = -90 - fraction × 360`, `flip = Math.sin(angleDeg ×
    π/180) < 0`
  - `formatWinnerLine(contenders, beats): string` — e.g. `"🏆 Forrest Gump
    wins by $12.4M — Lion King leads beats 1–2, Gump takes it at beat 3"`,
    or `"Two contenders tie — the race has no winner, fix the data"` on a
    tie, or `"Add at least 2 beats to see a winner"` when `beats.length < 2`
  - `BEAT_MS = 700` (exported constant)

- [ ] **Step 1: Write the failing tests**

```js
// client/src/lib/raceMath.test.js
import { describe, it, expect } from 'vitest';
import {
  runningTotals,
  computeFractions,
  computeWinner,
  keyframeStops,
  formatWinnerLine,
  BEAT_MS,
} from './raceMath';

const contenders = [
  { id: 'a', name: 'Lion King' },
  { id: 'b', name: 'Forrest Gump' },
  { id: 'c', name: 'True Lies' },
  { id: 'd', name: 'Speed' },
];

const beats = [
  { label: 'Week 1', values: [40.9, 24.5, 25.9, 14.5] },
  { label: 'Week 2', values: [10.0, 20.0, 8.0, 6.0] },
  { label: 'Week 3', values: [5.0, 25.0, 3.0, 4.0] },
];

describe('runningTotals', () => {
  it('sums per-contender values cumulatively across beats', () => {
    expect(runningTotals(beats)).toEqual([
      [40.9, 24.5, 25.9, 14.5],
      [50.9, 44.5, 33.9, 20.5],
      [55.9, 69.5, 36.9, 24.5],
    ]);
  });

  it('treats a missing cell as 0', () => {
    const withGap = [{ label: 'Week 1', values: [1, undefined, 3, 4] }];
    expect(runningTotals(withGap)).toEqual([[1, 0, 3, 4]]);
  });

  it('returns an empty array for no beats', () => {
    expect(runningTotals([])).toEqual([]);
  });
});

describe('computeFractions', () => {
  it('normalises every lane against the WINNER final total, not per-beat', () => {
    const { fractions, winnerFinal } = computeFractions(beats);
    expect(winnerFinal).toBe(69.5); // Forrest Gump's final total
    // winner's own last fraction is exactly 1
    expect(fractions[2][1]).toBeCloseTo(1, 10);
    // a mid-race leader (Lion King, beat 1) never exceeds 1
    fractions.flat().forEach((f) => expect(f).toBeLessThanOrEqual(1));
    // Lion King leads beat 1: 40.9 / 69.5
    expect(fractions[0][0]).toBeCloseTo(40.9 / 69.5, 10);
  });

  it('returns fraction 0 everywhere when all totals are 0', () => {
    const zero = [{ label: 'Week 1', values: [0, 0, 0, 0] }];
    const { fractions, winnerFinal } = computeFractions(zero);
    expect(winnerFinal).toBe(0);
    expect(fractions[0]).toEqual([0, 0, 0, 0]);
  });
});

describe('computeWinner', () => {
  it('finds the winner, the lead-change sequence, and the margin', () => {
    const result = computeWinner(contenders, beats);
    expect(result.tie).toBe(false);
    expect(result.winnerIndex).toBe(1);
    expect(result.winnerName).toBe('Forrest Gump');
    // beat 1: Lion King leads (40.9 highest); beat 2: Lion King still ahead
    // (50.9 vs 44.5); beat 3: Gump takes it (69.5 vs 55.9)
    expect(result.leaderPerBeat).toEqual([0, 0, 1]);
    expect(result.margin).toBeCloseTo(69.5 - 55.9, 10);
  });

  it('reports a tie with no winner', () => {
    const tiedBeats = [{ label: 'Week 1', values: [10, 10, 5, 5] }];
    const result = computeWinner(contenders, tiedBeats);
    expect(result.tie).toBe(true);
    expect(result.winnerIndex).toBeNull();
    expect(result.winnerName).toBe('');
  });
});

describe('keyframeStops', () => {
  it('emits a gate stop plus one stop per beat, per lane', () => {
    const lanes = keyframeStops(beats);
    expect(lanes).toHaveLength(4);
    lanes.forEach((stops) => expect(stops).toHaveLength(beats.length + 1));
    // gate stop is always the top of the ellipse, 0%
    lanes.forEach((stops) => {
      expect(stops[0]).toEqual({ percent: 0, angleDeg: -90, flip: false });
    });
    // winner's final stop lands exactly one full lap from the gate: -90 - 360
    const winnerLane = lanes[1];
    expect(winnerLane[winnerLane.length - 1].angleDeg).toBeCloseTo(-90 - 360, 10);
  });

  it('flips a lane exactly when its angle is on the top half of the ellipse (sin < 0)', () => {
    const lanes = keyframeStops(beats);
    lanes.flat().forEach((stop) => {
      const rad = (stop.angleDeg * Math.PI) / 180;
      expect(stop.flip).toBe(Math.sin(rad) < 0);
    });
  });
});

describe('formatWinnerLine', () => {
  it('names the winner, the margin, and the lead changes', () => {
    const line = formatWinnerLine(contenders, beats);
    expect(line).toContain('Forrest Gump');
    expect(line).toContain('Lion King');
    expect(line).toMatch(/wins by/);
  });

  it('flags a tie instead of a winner', () => {
    const tiedBeats = [{ label: 'Week 1', values: [10, 10, 5, 5] }];
    expect(formatWinnerLine(contenders, tiedBeats)).toMatch(/tie/i);
  });

  it('flags too few beats', () => {
    expect(formatWinnerLine(contenders, [beats[0]])).toMatch(/at least 2 beats/i);
  });
});

it('BEAT_MS is the 700ms pace constant', () => {
  expect(BEAT_MS).toBe(700);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run client/src/lib/raceMath.test.js`
Expected: FAIL — `Cannot find module './raceMath'`

- [ ] **Step 3: Implement `raceMath.js`**

```js
// client/src/lib/raceMath.js
export const BEAT_MS = 700;

export function runningTotals(beats) {
  if (!beats.length) return [];
  const laneCount = beats[0].values.length;
  const running = new Array(laneCount).fill(0);
  return beats.map((beat) => {
    beat.values.forEach((v, i) => {
      running[i] += Number.isFinite(v) ? v : 0;
    });
    return [...running];
  });
}

export function computeFractions(beats) {
  const totals = runningTotals(beats);
  const finalTotals = totals[totals.length - 1] || [];
  const winnerFinal = finalTotals.length ? Math.max(...finalTotals) : 0;
  const fractions = totals.map((row) =>
    row.map((v) => (winnerFinal > 0 ? v / winnerFinal : 0))
  );
  return { totals, fractions, winnerFinal };
}

function leaderOfRow(row) {
  const max = Math.max(...row);
  const leaders = row.reduce((acc, v, i) => (v === max ? [...acc, i] : acc), []);
  return leaders.length === 1 ? leaders[0] : null;
}

export function computeWinner(contenders, beats) {
  const { totals } = computeFractions(beats);
  if (!totals.length) {
    return { winnerIndex: null, winnerName: '', tie: false, leaderPerBeat: [], finalTotals: [], margin: 0 };
  }
  const finalTotals = totals[totals.length - 1];
  const winnerIndex = leaderOfRow(finalTotals);
  const leaderPerBeat = totals.map(leaderOfRow);
  const sorted = [...finalTotals].sort((a, b) => b - a);
  const margin = sorted.length > 1 ? sorted[0] - sorted[1] : sorted[0] || 0;
  return {
    winnerIndex,
    winnerName: winnerIndex !== null ? contenders[winnerIndex]?.name || '' : '',
    tie: winnerIndex === null,
    leaderPerBeat,
    finalTotals,
    margin,
  };
}

export function keyframeStops(beats) {
  const { fractions } = computeFractions(beats);
  const laneCount = fractions[0]?.length ?? 0;
  const n = beats.length;
  const gate = { percent: 0, angleDeg: -90, flip: false };
  return Array.from({ length: laneCount }, (_, i) => {
    const stops = [gate];
    for (let k = 0; k < n; k += 1) {
      const f = fractions[k][i];
      const angleDeg = -90 - f * 360;
      const rad = (angleDeg * Math.PI) / 180;
      stops.push({
        percent: ((k + 1) / n) * 100,
        angleDeg,
        flip: Math.sin(rad) < 0,
      });
    }
    return stops;
  });
}

export function formatWinnerLine(contenders, beats) {
  if (beats.length < 2) return 'Add at least 2 beats to see a winner';
  const { tie, winnerName, leaderPerBeat, margin } = computeWinner(contenders, beats);
  if (tie) return 'Two contenders tie — the race has no winner, fix the data';

  const changes = [];
  let currentLeader = leaderPerBeat[0];
  let rangeStart = 1;
  for (let k = 1; k <= leaderPerBeat.length; k += 1) {
    const leader = leaderPerBeat[k];
    if (leader !== currentLeader || k === leaderPerBeat.length) {
      const rangeEnd = k;
      const name = currentLeader !== null ? contenders[currentLeader]?.name || '?' : 'nobody';
      const range = rangeEnd === rangeStart ? `beat ${rangeStart}` : `beats ${rangeStart}–${rangeEnd}`;
      changes.push(`${name} leads ${range}`);
      rangeStart = k + 1;
      currentLeader = leader;
    }
  }
  const marginText = Number.isInteger(margin) ? margin : margin.toFixed(1);
  return `🏆 ${winnerName} wins by ${marginText} — ${changes.join(', ')}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run client/src/lib/raceMath.test.js`
Expected: PASS (all cases)

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/raceMath.js client/src/lib/raceMath.test.js
git commit -m "feat(race): add raceMath — running totals, lap fractions, winner, keyframe stops"
```

---

### Task 2: Seed the `shiny_formats` row

**Files:**
- Create: `supabase/migrations/<timestamp>_seed_and_theyre_off_format.sql`
  (use `date +%Y%m%d%H%M%S` for the timestamp prefix, matching the existing
  migration naming convention — check `supabase/migrations/` for the exact
  pattern already in use before naming this file)

**Interfaces:**
- Consumes: nothing
- Produces: a `shiny_formats` row with `id` starting `fmt_` (8-char nanoid,
  matching every other row — check an existing row's `id` shape with
  `mcp__supabase__execute_sql` against project `qwtbgusqfoypvehnungr` before
  writing the literal id), `name: "And They're Off!"`, `icon: '🏇'`,
  `input_schema: { "type": "race" }`. Task 3's `shinyWizardKinds.jsx` reads
  `input_schema.type === 'race'` to route to `buildRaceSlide`.

- [ ] **Step 1: Confirm the id shape and write the migration**

Run against Supabase project `qwtbgusqfoypvehnungr` (confirm this is the
project — NOT `dreggwinegtirxxanntv` — before running anything):

```sql
select id, name from shiny_formats order by created_at desc limit 3;
```

Then write the migration, using a literal id in that same shape (e.g.
`fmt_race001` — 8 chars after the prefix, adjust to match what the query
above actually shows):

```sql
insert into shiny_formats (id, name, icon, description, input_schema)
values (
  'fmt_race001',
  'And They''re Off!',
  '🏇',
  'Teams pick a winner among 4 real contenders; the host reveals it with an animated one-lap horse race driven by real historical data.',
  '{"type": "race"}'::jsonb
)
on conflict (id) do nothing;
```

- [ ] **Step 2: Apply the migration**

Use `mcp__supabase__apply_migration` (project `qwtbgusqfoypvehnungr`) with
the SQL above, name `seed_and_theyre_off_format`.

- [ ] **Step 3: Verify**

```sql
select id, name, icon, input_schema from shiny_formats where id = 'fmt_race001';
```

Expected: one row, `input_schema` = `{"type": "race"}`.

- [ ] **Step 4: Commit the migration file**

```bash
git add supabase/migrations/
git commit -m "feat(race): seed And They're Off! shiny_formats row"
```

---

### Task 3: `buildRaceSlide` in `lib/shinyWizardKinds.jsx`

**Files:**
- Modify: `client/src/lib/shinyWizardKinds.jsx`
- Modify: `client/src/components/host/AddSlideWizard.jsx` (hide the shared
  answer field for this format, mirroring the `bendle` gate at line ~424 per
  the spec)
- Test: `client/src/lib/shinyWizardKinds.test.js` (add to existing file if
  one exists — check first; if not, create it)

**Interfaces:**
- Consumes: `nanoid` (already imported elsewhere in this file — check the
  existing import), the wizard `ctx` object shape already used by every
  other `build*Slide` function in this file (read 2-3 existing ones, e.g.
  `buildElimSlide`, to match the exact `ctx` fields available — `ctx.text`
  at minimum per the spec)
- Produces: `FIXED_SHAPE_KINDS.race = { hasOwnControls: false, buildSlideData:
  buildRaceSlide }`, and `buildRaceSlide(ctx)` returns the `data` shape
  documented in the spec's Data Model section — 4 blank contenders
  (`nanoid(6)` ids, empty names, `imageUrl: null`), 10 blank beats (`label:
  ''`, `values: [0,0,0,0]`), `raceStartedAt: null`, `answer: ''`, `text:
  ctx.text ?? ''`

- [ ] **Step 1: Write the failing test**

```js
// client/src/lib/shinyWizardKinds.test.js (append if file exists)
import { describe, it, expect } from 'vitest';
import { FIXED_SHAPE_KINDS } from './shinyWizardKinds';

describe('race fixed-shape kind', () => {
  it('stamps 4 blank contenders and 10 blank beats', () => {
    const data = FIXED_SHAPE_KINDS.race.buildSlideData({ text: 'Who won?' });
    expect(data.contenders).toHaveLength(4);
    data.contenders.forEach((c) => {
      expect(c.id).toBeTruthy();
      expect(c.name).toBe('');
      expect(c.imageUrl).toBeNull();
    });
    expect(data.beats).toHaveLength(10);
    data.beats.forEach((b) => expect(b.values).toEqual([0, 0, 0, 0]));
    expect(data.raceStartedAt).toBeNull();
    expect(data.answer).toBe('');
    expect(data.text).toBe('Who won?');
    expect(FIXED_SHAPE_KINDS.race.hasOwnControls).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run client/src/lib/shinyWizardKinds.test.js`
Expected: FAIL — `FIXED_SHAPE_KINDS.race is undefined`

- [ ] **Step 3: Implement**

Read the existing `buildElimSlide`/`buildVennSlide` implementations in this
file first and match their exact style (import style, how `nanoid` is
called, how `ctx.text` is defaulted) rather than guessing — then add:

```js
function buildRaceSlide(ctx) {
  return {
    text: ctx.text ?? '',
    contenders: Array.from({ length: 4 }, () => ({
      id: nanoid(6),
      name: '',
      imageUrl: null,
    })),
    beats: Array.from({ length: 10 }, () => ({ label: '', values: [0, 0, 0, 0] })),
    raceStartedAt: null,
    answer: '',
  };
}

// inside the existing FIXED_SHAPE_KINDS object literal, alongside elim/venn:
race: { hasOwnControls: false, buildSlideData: buildRaceSlide },
```

Then in `AddSlideWizard.jsx`, find the `bendle` gate near line ~424
(`sharedAnswerRequired` / the condition that hides the shared Answer field)
and add `'race'` to whatever condition excludes `bendle` from that
requirement, so the wizard doesn't ask for a typed answer this format
throws away.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run client/src/lib/shinyWizardKinds.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/shinyWizardKinds.jsx client/src/lib/shinyWizardKinds.test.js client/src/components/host/AddSlideWizard.jsx
git commit -m "feat(race): add buildRaceSlide fixed-shape kind, skip shared answer field"
```

---

### Task 4: `display/slides/RaceSlide.jsx` — the renderer

**Files:**
- Create: `client/src/components/display/slides/RaceSlide.jsx`
- Test: `client/src/components/display/slides/RaceSlide.test.jsx`

**Interfaces:**
- Consumes: `raceMath.js`'s `keyframeStops`, `computeWinner`, `BEAT_MS`;
  `theme` from context (same pattern as `FlipEmDownSlide.jsx`); `SHINY_GOLD`
  / `SHINY_GOLD_GLOW` from `lib/shinyGold.js`; `fitToBox` from
  `lib/autoFitText.js`; `slide.data` shape from Task 3
- Produces: default export `RaceSlide({ slide })`, mounted by Task 5's
  `SLIDE_COMPONENTS['horse-race']`

Read `FlipEmDownSlide.jsx` in full before starting — copy its shiny-signal
header block (badge + glow, lines ~71–79 per the spec) verbatim, and match
its component structure (props, how it reads `slide.data`, how it handles
`prefers-reduced-motion`).

- [ ] **Step 1: Write the failing tests**

```jsx
// client/src/components/display/slides/RaceSlide.test.jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import RaceSlide from './RaceSlide';

const baseData = {
  text: 'Which movie made the most money?',
  contenders: [
    { id: 'a', name: 'Lion King', imageUrl: null },
    { id: 'b', name: 'Forrest Gump', imageUrl: null },
    { id: 'c', name: 'True Lies', imageUrl: null },
    { id: 'd', name: 'Speed', imageUrl: null },
  ],
  beats: [
    { label: 'Week 1', values: [40.9, 24.5, 25.9, 14.5] },
    { label: 'Week 2', values: [10, 20, 8, 6] },
    { label: 'Week 3', values: [5, 25, 3, 4] },
  ],
  raceStartedAt: null,
  answer: 'Forrest Gump',
};

describe('RaceSlide', () => {
  it('renders four lane wrappers at the gate position with no bob', () => {
    const { container } = render(<RaceSlide slide={{ id: 's1', type: 'horse-race', data: baseData }} />);
    const wrappers = container.querySelectorAll('[data-race-lane]');
    expect(wrappers).toHaveLength(4);
    wrappers.forEach((el) => {
      expect(el.getAttribute('data-race-state')).toBe('gate');
    });
  });

  it('renders the finished state immediately when raceStartedAt is far in the past', () => {
    const started = Date.now() - 60_000; // well past total duration (3 beats * 700ms)
    const data = { ...baseData, raceStartedAt: started };
    const { container } = render(<RaceSlide slide={{ id: 's1', type: 'horse-race', data }} />);
    expect(container.querySelector('[data-race-winner="true"]')).toBeTruthy();
  });

  it('generates one keyframe rule with N+1 stops per lane', () => {
    const data = { ...baseData, raceStartedAt: Date.now() };
    const { container } = render(<RaceSlide slide={{ id: 's1', type: 'horse-race', data }} />);
    const styleTag = container.querySelector('style[data-race-keyframes]');
    expect(styleTag).toBeTruthy();
    // 4 lanes worth of @keyframes blocks
    const matches = styleTag.textContent.match(/@keyframes/g) || [];
    expect(matches).toHaveLength(4);
  });

  it('renders final positions with animation: none under reduced motion', () => {
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    const data = { ...baseData, raceStartedAt: Date.now() };
    const { container } = render(<RaceSlide slide={{ id: 's1', type: 'horse-race', data }} />);
    const lane = container.querySelector('[data-race-lane]');
    expect(lane.style.animation).toMatch(/none/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run client/src/components/display/slides/RaceSlide.test.jsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `RaceSlide.jsx`**

Build it against the spec's Layout/Sprites/Timeline sections exactly — the
spec is the source of truth for the ellipse math, the per-lane bounding-box
wrapper sizing, the `scaleX` direction flip, the finish-line marker, and the
`animationend` finish handling (guard on `e.animationName`, per the spec's
note that the bob keyframe also fires `animationend` and must not be
mistaken for the position keyframe). Key structural requirements the tests
above check for, which must be real DOM attributes (not just internal
state) so they're testable:

- Each lane wrapper carries `data-race-lane` and `data-race-state`
  (`"gate"` | `"running"` | `"finished"`).
- The winner's lane (or the container, your call) carries
  `data-race-winner="true"` once finished.
- The injected `<style>` tag carries `data-race-keyframes` so tests (and
  future debugging) can find it without string-matching the whole DOM.
- Reduced motion sets `animation: none` inline on each lane wrapper and
  applies the final `transform` as the base inline style instead.

Use `keyframeStops(beats)` for the per-lane stop list, `BEAT_MS` for pacing,
and `computeWinner(contenders, beats)` to know which lane's `animationend`
to listen for and what name to slam in at the finish.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run client/src/components/display/slides/RaceSlide.test.jsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/components/display/slides/RaceSlide.jsx client/src/components/display/slides/RaceSlide.test.jsx
git commit -m "feat(race): add RaceSlide renderer — one-lap oval track, GPU-only keyframes"
```

---

### Task 5: Wire the slide type into rendering + labels

**Files:**
- Modify: `client/src/components/display/SlideRenderer.jsx`
- Modify: `client/src/views/Display.jsx`
- Modify: `client/src/components/host/RoundSidebar.jsx`
- Modify: `client/src/views/Host.jsx`

**Interfaces:**
- Consumes: `RaceSlide` from Task 4
- Produces: `/display` actually renders the new slide type full-bleed with
  the ring world opacity-neutralized behind it; the host sidebar and title
  fallback show a sensible label instead of the raw type string

- [ ] **Step 1: Wire `SlideRenderer.jsx`**

Grep for `'flip-em-down'` in this file to find both places it's registered
(the `SLIDE_COMPONENTS` map and the opacity-neutralize list near line ~268
per the spec) and add `'horse-race': RaceSlide` / `'horse-race'` to each in
the same shape.

- [ ] **Step 2: Wire `Display.jsx`**

Grep for `FULL_BLEED_SLIDE_TYPES` (line ~101 per the spec) and add
`'horse-race'` to the array.

- [ ] **Step 3: Wire label fallbacks**

Grep for `'flip-em-down'` in `RoundSidebar.jsx` (line ~65) and `Host.jsx`
(line ~335) — each has a small label/icon fallback map or switch for slide
types. Add a `'horse-race'` entry with label "And They're Off!" and icon
`🏇`, matching Flip's exact pattern in each file.

- [ ] **Step 4: Manual verification (no automated test for pure wiring)**

Run: `npm run build` (or `npx vite build` if `build` isn't the script name —
check `package.json`)
Expected: builds clean, no missing-import errors.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/display/SlideRenderer.jsx client/src/views/Display.jsx client/src/components/host/RoundSidebar.jsx client/src/views/Host.jsx
git commit -m "feat(race): wire horse-race slide type into renderer, full-bleed list, labels"
```

---

### Task 6: `RaceEditor` in `SlideEditor.jsx`

**Files:**
- Modify: `client/src/components/host/SlideEditor.jsx`
- Test: `client/src/components/host/RaceEditor.test.jsx` (or colocated with
  whatever test pattern `ElimEditor` already uses — check first)

**Interfaces:**
- Consumes: `raceMath.js`'s `formatWinnerLine`; `cleanPastedText` from
  `lib/cleanPaste.js`; the existing `MediaUpload` component's
  `onMediaUpload` callback (spec warns: resolves to `{url, type, filename}`,
  not a bare URL — unwrap `.url`)
- Produces: a `RaceEditor` component dispatched at `slide.type ===
  'horse-race'` (find the dispatch switch near line ~259 per the spec,
  alongside where `ElimEditor` is dispatched at line ~2501), which writes
  `data.contenders`, `data.beats`, and a derived `data.answer` via
  `actions.updateSlide`

Read `ElimEditor` (Flip 'Em Down!'s editor, line ~2501) in full first and
match its structural conventions (how it reads/writes `data`, how it calls
`actions.updateSlide`, its warning-banner pattern) before writing this.

- [ ] **Step 1: Write the failing test**

```jsx
// client/src/components/host/RaceEditor.test.jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import RaceEditor from './RaceEditor'; // adjust import path to wherever Step 3 exports it from

const baseData = {
  text: '',
  contenders: [
    { id: 'a', name: '', imageUrl: null },
    { id: 'b', name: '', imageUrl: null },
    { id: 'c', name: '', imageUrl: null },
    { id: 'd', name: '', imageUrl: null },
  ],
  beats: [
    { label: 'Week 1', values: [0, 0, 0, 0] },
    { label: 'Week 2', values: [0, 0, 0, 0] },
  ],
  raceStartedAt: null,
  answer: '',
};

describe('RaceEditor', () => {
  it('derives data.answer from the current beats whenever a value changes', () => {
    const updateSlide = vi.fn();
    render(<RaceEditor slide={{ id: 's1', data: baseData }} actions={{ updateSlide }} />);

    fireEvent.change(screen.getByLabelText(/contender 1 name/i), { target: { value: 'Lion King' } });
    fireEvent.change(screen.getByLabelText(/contender 2 name/i), { target: { value: 'Forrest Gump' } });
    fireEvent.change(screen.getByLabelText(/week 1.*contender 2/i), { target: { value: '50' } });

    expect(updateSlide).toHaveBeenCalled();
    const lastCallData = updateSlide.mock.calls.at(-1)[1].data;
    expect(lastCallData.answer).toBe('Forrest Gump');
  });

  it('shows an inline warning and clears the answer on a final-beat tie', () => {
    const updateSlide = vi.fn();
    const tiedData = {
      ...baseData,
      contenders: baseData.contenders.map((c, i) => ({ ...c, name: `C${i}` })),
      beats: [{ label: 'Week 1', values: [10, 10, 5, 5] }],
    };
    render(<RaceEditor slide={{ id: 's1', data: tiedData }} actions={{ updateSlide }} />);
    expect(screen.getByText(/no winner/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run client/src/components/host/RaceEditor.test.jsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `RaceEditor`**

Build the four pieces the spec's Host Authoring section describes:
question-text field, 4 fixed contender rows (name + optional `MediaUpload`),
a beats table (beat-count control 2–20 default 10, one row per beat = label
+ 4 numeric inputs), and a paste-from-spreadsheet textarea above the table
that runs `cleanPastedText()` on paste and fills the grid. On every
contenders/beats change, call `formatWinnerLine` and `computeWinner` from
`raceMath.js`, write the read-only winner line into the UI, and write
`data.answer` via `actions.updateSlide(slide.id, { data: { ...data, answer:
tie ? '' : winnerName } })`. Render the amber warning banner (matching
Flip's pattern) for: a final-beat tie, any blank/negative cell, fewer than 2
beats, a contender with no name, or an all-zero beat.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run client/src/components/host/RaceEditor.test.jsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/components/host/SlideEditor.jsx client/src/components/host/RaceEditor.test.jsx
git commit -m "feat(race): add RaceEditor — contenders, beats grid, paste-from-spreadsheet, derived answer"
```

---

### Task 7: Live Mode controls — Start Race / Reset

**Files:**
- Modify: `client/src/components/host/LiveMode.jsx`

**Interfaces:**
- Consumes: `actions.updateSlide` (existing), `currentSlide` (existing)
- Produces: two buttons visible only when `currentSlide?.type ===
  'horse-race'`

- [ ] **Step 1: Implement**

Find Flip 'Em Down!'s "Next Hint" button block (line ~1197 per the spec) and
copy its gating/layout shape exactly. Add:

```jsx
{currentSlide?.type === 'horse-race' && (
  <div className="flex gap-2">
    <button
      type="button"
      disabled={Boolean(currentSlide.data?.raceStartedAt)}
      onClick={() =>
        actions.updateSlide(currentSlide.id, {
          data: { ...currentSlide.data, raceStartedAt: Date.now() },
        })
      }
    >
      🏁 Start Race
    </button>
    <button
      type="button"
      disabled={!currentSlide.data?.raceStartedAt}
      onClick={() =>
        actions.updateSlide(currentSlide.id, {
          data: { ...currentSlide.data, raceStartedAt: null },
        })
      }
    >
      ↺ Reset
    </button>
  </div>
)}
```

Match the existing button/styling classes used by the neighboring Next Hint
buttons rather than inventing new ones.

- [ ] **Step 2: Manual verification**

Run: `npm run build`
Expected: builds clean.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/host/LiveMode.jsx
git commit -m "feat(race): add Start Race / Reset controls to Live Mode"
```

---

### Task 8: Reset `raceStartedAt` on fresh entry

**Files:**
- Modify: `client/src/lib/slideStepping.js`
- Test: `client/src/lib/slideStepping.test.js` (add to existing file)

**Interfaces:**
- Consumes: the existing `withEntryState()` function and its
  `protectInProgress` gate (used today for `elimStep`, line ~181 per the
  spec)
- Produces: `withEntryState()` also clears `data.raceStartedAt` to `null` on
  a fresh forward entry into a `horse-race` slide, gated the same way

- [ ] **Step 1: Write the failing test**

```js
// client/src/lib/slideStepping.test.js (append)
describe('withEntryState — horse-race', () => {
  it('clears raceStartedAt on fresh forward entry', () => {
    const slide = { type: 'horse-race', data: { raceStartedAt: 12345 } };
    const result = withEntryState(slide, { protectInProgress: false });
    expect(result.data.raceStartedAt).toBeNull();
  });

  it('preserves raceStartedAt when protectInProgress is true', () => {
    const slide = { type: 'horse-race', data: { raceStartedAt: 12345 } };
    const result = withEntryState(slide, { protectInProgress: true });
    expect(result.data.raceStartedAt).toBe(12345);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run client/src/lib/slideStepping.test.js`
Expected: FAIL (or passes vacuously if `raceStartedAt` isn't touched yet —
confirm it actually fails by checking `result.data.raceStartedAt` is still
`12345` before the fix)

- [ ] **Step 3: Implement**

Find the `elimStep` reset block at line ~181 and add an equivalent block for
`horse-race`:

```js
if (slide.type === 'horse-race' && !protectInProgress) {
  data.raceStartedAt = null;
}
```

Match the exact surrounding structure (how `data` is cloned/mutated) that
the existing `elimStep` block uses — don't mutate the input slide directly
if the existing pattern doesn't.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run client/src/lib/slideStepping.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/slideStepping.js client/src/lib/slideStepping.test.js
git commit -m "feat(race): reset raceStartedAt on fresh slide entry"
```

---

### Task 9: Archive row — `lib/questionRows.js`

**Files:**
- Modify: `client/src/lib/questionRows.js`
- Test: `client/src/lib/questionRows.test.js` (add to existing file)

**Interfaces:**
- Consumes: the existing `case` dispatch pattern in this file (read 2-3
  existing cases first, e.g. whatever handles `grid` or `flip-em-down`, to
  match the exact return shape)
- Produces: `case 'horse-race'` returning `{ type: 'shiny', text:
  data.text, answer: data.answer, is_shiny: true, shiny_type: 'race',
  shiny_format_name: data.shinyFormatName, questions_data: { contenders:
  data.contenders, beats: data.beats } }`, or `null` when both `text` and
  `answer` are blank

- [ ] **Step 1: Write the failing test**

```js
// client/src/lib/questionRows.test.js (append)
describe('questionRows — horse-race', () => {
  const data = {
    text: 'Which movie made the most money?',
    answer: 'Forrest Gump',
    shinyFormatName: "And They're Off!",
    contenders: [{ id: 'a', name: 'Lion King', imageUrl: null }],
    beats: [{ label: 'Week 1', values: [1, 2, 3, 4] }],
  };

  it('builds an archive row from race data', () => {
    const row = buildQuestionRow({ type: 'horse-race', data });
    expect(row).toMatchObject({
      type: 'shiny',
      text: data.text,
      answer: 'Forrest Gump',
      is_shiny: true,
      shiny_type: 'race',
      shiny_format_name: "And They're Off!",
      questions_data: { contenders: data.contenders, beats: data.beats },
    });
  });

  it('returns null when text and answer are both blank', () => {
    const row = buildQuestionRow({ type: 'horse-race', data: { ...data, text: '', answer: '' } });
    expect(row).toBeNull();
  });
});
```

(Adjust `buildQuestionRow` to whatever this file's actual exported function
is named — check the file first; it may be named differently.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run client/src/lib/questionRows.test.js`
Expected: FAIL — no `horse-race` case, falls through to default/undefined

- [ ] **Step 3: Implement**

Add the `case 'horse-race':` block matching the exact style of the case
above/below it in the existing `switch`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run client/src/lib/questionRows.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/questionRows.js client/src/lib/questionRows.test.js
git commit -m "feat(race): add horse-race archive row"
```

---

### Task 10: Phones — `/join` fallback

**Files:**
- Modify: `client/src/views/Join.jsx`

**Interfaces:**
- Consumes: the existing `venn` case in `SlideBody` (line ~765 per the
  spec) as the pattern to copy
- Produces: `case 'horse-race'` rendering the question text plus the 4
  contender names as a plain list — no values, no race, no winner

- [ ] **Step 1: Implement**

Copy the `venn` case's structure exactly, swapping its content for: `<p>
{slide.data.text}</p>` followed by a `<ul>` of `slide.data.contenders.map(c
=> <li key={c.id}>{c.name}</li>)`.

- [ ] **Step 2: Manual verification**

Run: `npm run build`
Expected: builds clean.

- [ ] **Step 3: Commit**

```bash
git add client/src/views/Join.jsx
git commit -m "feat(race): show contender pick-list on /join for horse-race slides"
```

---

### Task 11: Full suite + build gate

**Files:** none (verification-only task)

- [ ] **Step 1: Run the full unit suite**

Run: `npm run test:unit` (per `scripts/ship.sh`'s deploy gate — use the same
command it uses, check the script if unsure)
Expected: all tests pass, including every test added in Tasks 1–10

- [ ] **Step 2: Run a clean build**

Run: `npm run build`
Expected: builds clean

- [ ] **Step 3: Manual live check**

Create a test show (or use an existing scratch show), add an "And They're
Off!" slide via the wizard, fill in the 4 contenders and a few beats in
`RaceEditor`, go live, and confirm on `/display`: the gate state shows 4
sprites at the top of the ellipse, "🏁 Start Race" in Live Mode plays the
race, the winner's lane gets the gold-ring treatment and slams in its name
at the finish, and `/join` shows the 4 contender names with no race/values.
Also toggle `prefers-reduced-motion` in devtools and confirm the finished
state renders immediately with no animation.

- [ ] **Step 4: Note the pre-existing numbering gap**

Confirm (don't fix) that a round with a horse-race slide in the middle still
numbers subsequent regular questions correctly per the existing `venn`/
`flip-em-down` skip behavior in `lib/questionNumbering.js` — this is the
spec's flagged, out-of-scope gap, just confirm horse-race behaves the same
as its siblings rather than differently.

No commit for this task — it's verification of Tasks 1–10, not new code.
