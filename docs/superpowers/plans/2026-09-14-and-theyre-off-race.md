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

**PREFLIGHT RULING (2026-09-14):** this repo has **no `@testing-library/react`
dependency** (checked `package.json` — it isn't there). Every display-slide
test in this codebase uses raw `react-dom/client`'s `createRoot` + `act()` +
manual `querySelector`/`textContent` assertions, wrapped in `<ThemeProvider>`
— see `FlipEmDownSlide.test.jsx` in full before writing this test, it is the
exact pattern to copy (including its `beforeEach`/`afterEach` root
lifecycle). Test rewritten below to that idiom. Reduced-motion is read via
Framer Motion's `useReducedMotion()` (that's what `FlipEmDownSlide.jsx`
itself uses at line 65, not raw `window.matchMedia`) — mocked below via
`vi.mock('framer-motion', ...)` with `importActual` for everything else.

- [ ] **Step 1: Write the failing tests**

```jsx
// client/src/components/display/slides/RaceSlide.test.jsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from '../../shared/ThemeProvider.jsx'
import RaceSlide from './RaceSlide.jsx'

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
}

function makeSlide(overrides = {}) {
  return { id: 's1', type: 'horse-race', data: { ...baseData, ...overrides } }
}

describe('<RaceSlide>', () => {
  let container, root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  const render = slide => act(() => {
    root.render(
      <ThemeProvider>
        <RaceSlide slide={slide} />
      </ThemeProvider>
    )
  })

  it('renders four lane wrappers at the gate position with no bob', () => {
    render(makeSlide())
    const wrappers = container.querySelectorAll('[data-race-lane]')
    expect(wrappers.length).toBe(4)
    wrappers.forEach(el => expect(el.getAttribute('data-race-state')).toBe('gate'))
  })

  it('renders the finished state immediately when raceStartedAt is far in the past', () => {
    const started = Date.now() - 60_000 // well past total duration (3 beats * 700ms)
    render(makeSlide({ raceStartedAt: started }))
    expect(container.querySelector('[data-race-winner="true"]')).toBeTruthy()
  })

  it('generates one keyframe rule with N+1 stops per lane', () => {
    render(makeSlide({ raceStartedAt: Date.now() }))
    const styleTag = container.querySelector('style[data-race-keyframes]')
    expect(styleTag).toBeTruthy()
    const matches = styleTag.textContent.match(/@keyframes/g) || []
    expect(matches.length).toBe(4) // one block per lane
  })
})

describe('<RaceSlide> — reduced motion', () => {
  let container, root

  beforeEach(async () => {
    vi.resetModules()
    vi.doMock('framer-motion', async () => {
      const actual = await vi.importActual('framer-motion')
      return { ...actual, useReducedMotion: () => true }
    })
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.doUnmock('framer-motion')
  })

  it('renders final positions with animation: none under reduced motion', async () => {
    const { default: RaceSlideReduced } = await import('./RaceSlide.jsx')
    const { ThemeProvider: TP } = await import('../../shared/ThemeProvider.jsx')
    act(() => {
      root.render(
        <TP>
          <RaceSlideReduced slide={makeSlide({ raceStartedAt: Date.now() })} />
        </TP>
      )
    })
    const lane = container.querySelector('[data-race-lane]')
    expect(lane.style.animation).toMatch(/none/)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run client/src/components/display/slides/RaceSlide.test.jsx`
Expected: FAIL — `./RaceSlide.jsx` does not exist yet

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

**Cinematic layer (Ben, 2026-09-14 — see the spec's "Cinematic treatment"
section, added after this task was originally drafted; read it before
implementing this step).** Four additions, all computed here in
`RaceSlide.jsx` — `raceMath.js` does not change:

1. **Photo-finish slow motion.** Don't use `keyframeStops()`'s raw
   `percent`/duration directly. Compute `FINISH_SLOWMO_MS = BEAT_MS * 2.5`,
   `TOTAL_MS = (N - 1) * BEAT_MS + FINISH_SLOWMO_MS` (N = beat count), and
   remap each stop's percent to `percentCinematic[k] = (k * BEAT_MS /
   TOTAL_MS) * 100` for `k < N`, and `100` for the final stop `k = N`. Use
   `percentCinematic` in the generated `@keyframes` text and set
   `animation-duration: ${TOTAL_MS}ms` (not `N * BEAT_MS`). `angleDeg`/
   `flip`/translate values from `keyframeStops()` are unchanged — only the
   *timing* is remapped.
2. **Camera push-in.** One more `@keyframes` block on the track container
   element (the ancestor of all 4 lane wrappers + the finish line, given
   `data-race-track`): holds `scale(1)` through `75%`, eases to
   `scale(1.06)` by `100%` (`cubic-bezier(0.4, 0, 0.2, 1)`, same curve as
   the lane keyframes), `transform-origin: center`. Same `animation-duration:
   ${TOTAL_MS}ms` so it stays in sync with the lanes.
3. **Dust trail.** A second sprite element per lane, behind the main sprite,
   marked `data-race-trail`, `opacity: 0.3`, static `filter: blur(3px)`
   (static filter is fine — only *animating* filter is banned). Its own
   `@keyframes` use the same `percentCinematic` stops but with each angle
   computed from a lagging fraction `f_trail[k] = Math.max(0, f_i[k] -
   0.035)`. `opacity: 0` at the gate and finished states — only visible
   while `data-race-state="running"`.
4. **Finish vignette pulse.** A `motion.div` sibling to the existing
   winner-name-slam one-shot, marked `data-race-vignette`, full-bleed
   radial-gradient, animating `opacity: [0, 0.35, 0]` over ~500ms on the
   same `animationend` trigger as the winner slam.

All four are Framer-Motion/CSS-keyframe only (`transform`/`opacity`, one
static `filter`) and all four are simply omitted under
`prefers-reduced-motion` — the existing reduced-motion path (instant final
standings) already covers it, these are pure flourish layers with no
standings-bearing information.

Add one more test to Step 1's test file, in the first `describe` block:

```jsx
it('stretches the final beat into a photo-finish slow-motion duration', () => {
  render(makeSlide({ raceStartedAt: Date.now() }))
  const styleTag = container.querySelector('style[data-race-keyframes]')
  const track = container.querySelector('[data-race-track]')
  expect(track).toBeTruthy()
  // 3 beats at 700ms = 2100ms raw; cinematic remap stretches the last
  // beat to 700*2.5 = 1750ms, so TOTAL_MS = 2*700 + 1750 = 3150ms
  expect(styleTag.textContent).toMatch(/3150ms/)
})
```

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

**PREFLIGHT RULING (2026-09-14):** the draft below originally assumed
`RaceEditor` was its own file taking `{ slide, actions }` props. Checked
against the real codebase: `ElimEditor` (Flip 'Em Down!'s editor) is a
**private, unexported** `function ElimEditor({ data, onChange, setData,
scheduleSave, onMediaUpload })` defined inline in `SlideEditor.jsx` at line
2501 and dispatched at line 260 — no separate file, no `slide`/`actions`
props, it receives already-unwrapped `data` plus callbacks the parent
`SlideEditor` closure provides. `CustomEditor` (line 2270) is the one sibling
editor that IS a **named export** from the same file — that's the
precedent to follow here so the piece is unit-testable without mounting the
whole `SlideEditor`. `TextInput`, `TextArea`, `NumberInput`, `Field`,
`Divider` are local components already defined in this file (lines
328–410) — use them, don't reinvent. Corrected task below.

**Files:**
- Modify: `client/src/components/host/SlideEditor.jsx` — add `export
  function RaceEditor({ data, onChange, setData, scheduleSave,
  onMediaUpload })` (same signature as `ElimEditor`, exported like
  `CustomEditor`), dispatched at line ~259/260 alongside `ElimEditor`
- Test: `client/src/components/host/RaceEditor.test.jsx`, importing `{
  RaceEditor }` (named import) from `./SlideEditor.jsx`

**Interfaces:**
- Consumes: `raceMath.js`'s `formatWinnerLine`/`computeWinner`;
  `cleanPastedText` from `lib/cleanPaste.js`; `onMediaUpload` (resolves to
  `{url, type, filename}`, not a bare URL — unwrap `.url`, exactly as
  `ElimEditor.uploadItemPhoto` does at line 2526)
- Produces: on any contenders/beats edit, calls `setData(next)` then
  `scheduleSave({ data: next })` — the exact two-call pattern
  `ElimEditor.writeItem`/`writeHint` use (lines 2509–2515) — where `next =
  { ...data, contenders/beats: updatedArray, answer: derivedAnswer }`. Use
  `onChange('text', value)` for the plain question-text field, matching
  `ElimEditor`'s `onChange('answer', v)` call for its own text field.

**Test convention (no RTL — see `CustomEditor.test.jsx` in full before
writing this):** `createRoot` + `act()`, `lib/supabase.js` mocked before
import (this file's top-level `createClient()` call throws with no real env
vars otherwise), `SlideEditor.jsx` imported via top-level `await import(...)`
AFTER the mock is registered, and a small `Harness` that holds `data` in
`useState` so `setData` writes round-trip into a re-render (mirroring how
`CustomEditor.test.jsx`'s harness checks writes by re-render, not by
inspecting a spy's raw call args) while `scheduleSave` stays a plain spy.
Query contender-name inputs by their distinct `placeholder` (`"Contender 1
name"` … `"Contender 4 name"`, same placeholder-based query style
`CustomEditor.test.jsx` uses for its YouTube URL input). Beat-value inputs
are queried positionally: each beat row renders as `<div data-beat-row={k}>`
containing the row's label input first, then its 4 contender-value inputs
in order — a test reaches contender *i*'s value in beat *k* via
`container.querySelectorAll('[data-beat-row]')[k].querySelectorAll('input')[1 + i]`
(index 0 is the label).

- [ ] **Step 1: Write the failing test**

```jsx
// client/src/components/host/RaceEditor.test.jsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { useState } from 'react'

vi.mock('../../lib/supabase.js', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => Promise.resolve({ data: [] }), order: () => Promise.resolve({ data: [] }) }) }) },
}))

const { RaceEditor } = await import('./SlideEditor.jsx')

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
}

function nativeInputSet(input, value) {
  const proto = input.type === 'textarea' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('<RaceEditor>', () => {
  let container, root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  // Mirrors real usage: SlideEditor owns `data` and passes setData/scheduleSave
  // down; this harness does the same so RaceEditor's writes are checked via
  // the round-trip re-render, not by inspecting a spy's call args.
  function Harness({ initial = baseData, scheduleSave = vi.fn() }) {
    const [data, setData] = useState(initial)
    return (
      <RaceEditor
        data={data}
        onChange={(key, value) => setData(d => ({ ...d, [key]: value }))}
        setData={setData}
        scheduleSave={scheduleSave}
        onMediaUpload={vi.fn()}
      />
    )
  }

  it('derives data.answer from the current beats whenever a value changes', () => {
    const scheduleSave = vi.fn()
    act(() => { root.render(<Harness scheduleSave={scheduleSave} />) })

    const nameInputs = container.querySelectorAll('input[placeholder^="Contender"]')
    expect(nameInputs.length).toBe(4)
    act(() => { nativeInputSet(nameInputs[0], 'Lion King') })
    act(() => { nativeInputSet(nameInputs[1], 'Forrest Gump') })

    const row0 = container.querySelectorAll('[data-beat-row]')[0]
    const contender2ValueInput = row0.querySelectorAll('input')[2] // [0]=label, [1]=contender1, [2]=contender2
    act(() => { nativeInputSet(contender2ValueInput, '50') })

    expect(scheduleSave).toHaveBeenCalled()
    const lastCall = scheduleSave.mock.calls.at(-1)[0]
    expect(lastCall.data.answer).toBe('Forrest Gump')
  })

  it('shows an inline warning and clears the answer on a final-beat tie', () => {
    const tiedData = {
      ...baseData,
      contenders: baseData.contenders.map((c, i) => ({ ...c, name: `C${i}` })),
      beats: [{ label: 'Week 1', values: [10, 10, 5, 5] }],
    }
    act(() => { root.render(<Harness initial={tiedData} />) })
    expect(container.textContent).toMatch(/no winner/i)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run client/src/components/host/RaceEditor.test.jsx`
Expected: FAIL — `RaceEditor` is not exported from `SlideEditor.jsx`

- [ ] **Step 3: Implement `RaceEditor`**

Build the four pieces the spec's Host Authoring section describes:
question-text field (`Field` + `TextArea`, wired via `onChange('text', v)`),
4 fixed contender rows (`TextInput` with `placeholder={'Contender ' + (i+1)
+ ' name'}` + optional `MediaUpload`, matching `uploadItemPhoto`'s
`result?.url` unwrap), a beats table (`NumberInput` for beat count 2–20
default 10; each row wrapped `<div data-beat-row={k}>` containing a
`TextInput` for `label` first, then 4 numeric `TextInput`s in contender
order — the row-wrapper + positional order is what the test above depends
on, don't reorder), and a paste-from-spreadsheet `TextArea` above the table
that runs `cleanPastedText()` on its value and fills the grid on an "Apply"
button click. On every contenders/beats edit, build `next = { ...data,
contenders, beats }`, compute `{ tie, winnerName } =
computeWinner(next.contenders, next.beats)`, set `next.answer = tie ? '' :
winnerName`, then `setData(next); scheduleSave({ data: next })` — the exact
two-call sequence `ElimEditor.writeItem` uses (lines 2509–2515). Render
`formatWinnerLine(next.contenders, next.beats)` as a read-only line, and an
amber warning banner for: a final-beat tie (text must contain "no winner" —
the test above matches `/no winner/i` against the whole rendered text), any
blank/negative cell, fewer than 2 beats, a contender with no name, or an
all-zero beat.

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

**PREFLIGHT RULING (2026-09-14):** checked against the real file — the
exported signature is `withEntryState(slides, slide, { currentPart,
protectInProgress = false } = {})`, taking the WHOLE slides array plus the
one slide entering, and returning an updated slides array (via the internal
`patch`/`patchSlideData` mechanism) — not `withEntryState(slide, opts)`
returning `{ data }` as originally drafted. `client/src/lib/slideStepping.test.js`
already has a `slide(id, order, type, data)` fixture helper (line 23) and an
existing `describe('withEntryState', ...)` block (line 298) with the exact
call shape to copy: `withEntryState([s], s, { currentPart: 0, ... })`, read
result as `out[0].data.<field>`. Test corrected below.

**Interfaces:**
- Consumes: the existing `withEntryState()` function, its `patch` object
  pattern and `protectInProgress` gate (used today for `elimStep`, line
  187), and the file's existing `slide()` test fixture helper (don't
  redefine it)
- Produces: `withEntryState()` also clears `data.raceStartedAt` to `null` on
  a fresh forward entry into a `horse-race` slide, gated the same way as
  `elimStep`

- [ ] **Step 1: Write the failing test**

```js
// client/src/lib/slideStepping.test.js — add inside the existing
// describe('withEntryState', ...) block (line 298), using the file's own
// slide() helper already defined at line 23
it('clears raceStartedAt on fresh forward entry into a horse-race slide', () => {
  const s = slide('a', 0, 'horse-race', { raceStartedAt: 12345 })
  const fresh = withEntryState([s], s, { currentPart: 0 })
  expect(fresh[0].data.raceStartedAt).toBeNull()
})

it('preserves raceStartedAt on a protected re-entry into a horse-race slide', () => {
  const s = slide('a', 0, 'horse-race', { raceStartedAt: 12345 })
  const reentry = withEntryState([s], s, { currentPart: 0, protectInProgress: true })
  expect(reentry[0].data.raceStartedAt).toBe(12345)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run client/src/lib/slideStepping.test.js`
Expected: FAIL — `fresh[0].data.raceStartedAt` is still `12345` (no patch
applied yet)

- [ ] **Step 3: Implement**

Find the `elimStep` reset block (line 187, inside `withEntryState`, right
after the `lockCountdownPhase`/`lockCountdownStartedAt` block) and add an
equivalent block in the same `patch`-object style:

```js
// Fresh entry also resets And They're Off!'s raceStartedAt — same
// stale-state class as elimStep above: a rehearsal that finished the race
// must not bleed into the next genuinely fresh entry.
if (!protectInProgress && slide.data?.raceStartedAt != null) {
  patch.raceStartedAt = null
}
```

Place it adjacent to the `elimStep` block, before the final
`if (Object.keys(patch).length === 0) return slides` line.

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

**PREFLIGHT RULING (2026-09-14):** checked against the real file — the
exported function is `slideToArchiveRow(slide, show)`, not `buildQuestionRow`,
and it takes a `show` object (used only for `show.id`/`show.title`/
`show.date`/round lookup, spread into every case via a shared `base` object
— see `grid`/`venn`/`flip-em-down` cases at lines 100–143). Test corrected
below to the real signature and to assert only the `horse-race`-specific
fields via `toMatchObject`, not the full row (the `base` fields are common
to every case and not this task's concern).

**Interfaces:**
- Consumes: `slideToArchiveRow(slide, show)`'s existing `blank()` helper and
  `base` object (both already defined in the file, don't redefine); the
  `grid`/`venn`/`flip-em-down` cases (lines 100–143) as the pattern to copy
- Produces: `case 'horse-race'` inside the same `switch (slide.type)`,
  returning `{ ...base, type: 'shiny', text: data.text?.trim() ?? null,
  answer: data.answer?.trim() ?? null, is_shiny: true, shiny_type: 'race',
  shiny_format_name: data.shinyFormatName ?? null, questions_data: {
  contenders: data.contenders ?? [], beats: data.beats ?? [] } }`, or `null`
  when `blank(data.text) && blank(data.answer)` (the exact guard every
  sibling case uses)

- [ ] **Step 1: Write the failing test**

```js
// client/src/lib/questionRows.test.js (append)
import { slideToArchiveRow } from './questionRows.js'; // adjust if already imported at top of file

describe('questionRows — horse-race', () => {
  const data = {
    text: 'Which movie made the most money?',
    answer: 'Forrest Gump',
    shinyFormatName: "And They're Off!",
    contenders: [{ id: 'a', name: 'Lion King', imageUrl: null }],
    beats: [{ label: 'Week 1', values: [1, 2, 3, 4] }],
  };
  const show = { id: 'show1', title: 'Test Show', date: '2026-09-14', rounds: [] };

  it('builds an archive row from race data', () => {
    const row = slideToArchiveRow({ id: 'slide1', type: 'horse-race', data }, show);
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
    const row = slideToArchiveRow({ id: 'slide1', type: 'horse-race', data: { ...data, text: '', answer: '' } }, show);
    expect(row).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run client/src/lib/questionRows.test.js`
Expected: FAIL — no `horse-race` case, falls through to `default`/`undefined`

- [ ] **Step 3: Implement**

Add inside the existing `switch (slide.type)`, in the same style as the
`grid`/`venn` cases immediately above it (lines 100–125):

```js
case 'horse-race': {
  if (blank(data.text) && blank(data.answer)) return null
  return {
    ...base,
    type: 'shiny',
    text: data.text?.trim() ?? null,
    answer: data.answer?.trim() ?? null,
    is_shiny: true,
    shiny_type: 'race',
    shiny_format_name: data.shinyFormatName ?? null,
    questions_data: { contenders: data.contenders ?? [], beats: data.beats ?? [] },
  }
}
```

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
