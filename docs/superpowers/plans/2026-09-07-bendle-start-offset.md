# Bendle Start-Offset & Vocals-at-Reveal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the host pick one start point in a prepped Bendle song (instead of always playing from 0:00), and move vocals out of in-round playback entirely so they only sound at the reveal beat — the "answer."

**Architecture:** One new `start_offset_seconds` column on `bendle_songs`. A new admin-only component (`BendleOffsetScrubber.jsx`) decodes the drums/bass/other stems client-side via the Web Audio API, draws each as a plain RMS bar graph so the host can see where all three are simultaneously active, and lets them scrub/preview against the `other` stem and commit an offset. `ShinyBendleQuestion.jsx`'s existing Tone.Player playback seeks every stem into its buffer by that offset before starting (`Player.start(startTime, offset)`), so the existing `BENDLE_TIERS` (0/20/40s) schedule is unchanged — it just lands relative to the chosen point instead of relative to 0:00. `BENDLE_TIERS`'s final tier drops `vocals` (keeps `other` only), and a new, separate playback effect in `BendleReveal` plays every stem together (drums+bass+other+vocals, from the same offset) the moment the round is revealed — the "whole song landing at once, vocals included" payoff moves from mid-round to the reveal beat.

**Tech Stack:** React 18, Tone.js (already a dependency), Web Audio API (`AudioContext.decodeAudioData`, no new dependency), Supabase (migration + existing `bendle_songs` realtime subscription).

**Spec:** `docs/superpowers/specs/2026-09-04-bendle-layered-audio-question-design.md` (original Bendle design — not updated by this plan; this plan is a refinement of the tier/reveal mechanic it describes, discussed and confirmed live with Ben on 2026-09-07, not written back into that spec doc since it predates the automation pipeline already built on top of it).

## Global Constraints

- Supabase project: `qwtbgusqfoypvehnungr` ("Baynes Trivia") — never `dreggwinegtirxxanntv`.
- No Socket.io, no Express, no local file storage — Supabase only.
- $0 infra cost. No new external API, no new secret, no new npm dependency.
- House rule: every shiny step format is **always 3 steps** (Ben, 2026-09-05) — `BENDLE_TIERS` stays length 3 with `atSeconds` `[0, 20, 40]`. Only the *stems* named on the third tier change (drops `vocals`), never the step count or timing.
- This repo has no `@testing-library/react`. All new/edited component tests use the house `createRoot` + `act` pattern (see `ShinyBendleQuestion.test.jsx`, `BendleAdmin.test.jsx`).
- Commit only — never `git push`. Pushing is a separate, explicit gate handled after the branch is reviewed and merged (finishing-a-development-branch skill), not part of any task's steps.
- `ShinyBendleQuestion.jsx` deliberately statically imports Tone.js (see the file's own header comment) because it is the one `/display` component where a dynamic-import stall mid-show is unacceptable. Never import Tone.js (or anything that transitively pulls it in, e.g. `ShinyBendleQuestion.jsx` itself) from a **host-side** file (`BendleAdmin.jsx`, `BendleOffsetScrubber.jsx`) — that would leak Tone's ~61kB gzip into the Host bundle for a feature Host never plays audio for via Tone. Host-side stem preview/analysis uses plain `<audio>` elements and the Web Audio API directly, never Tone.
- `bendle_songs` is already in the `supabase_realtime` publication (see `20260907120000_bendle_songs_status_pipeline.sql`) — no publication change needed for this plan's migration.

---

### Task 1: Migration — `start_offset_seconds` column

**Files:**
- Create: `supabase/migrations/20260908090000_bendle_songs_start_offset.sql`

**Interfaces:**
- Produces: `bendle_songs.start_offset_seconds` (integer, not null, default `0`) — consumed by Task 2's `clampBendleOffset`, Task 3's playback, Task 4's scrubber, Task 5's admin display.

- [ ] **Step 1: Write the migration**

```sql
-- Lets the host pick a single point in the song where playback starts,
-- instead of always 0:00. All three in-round tiers (and the reveal beat)
-- anchor to this same point — see BENDLE_TIERS in bendleScoring.js and
-- ShinyBendleQuestion.jsx's playback effects.
-- Default 0 is fully backward compatible: every song processed before this
-- column existed keeps playing from the start of the file, unchanged.
alter table public.bendle_songs
  add column start_offset_seconds integer not null default 0;
```

- [ ] **Step 2: Apply the migration**

Use the Supabase MCP tool `mcp__supabase__apply_migration` (project `qwtbgusqfoypvehnungr`) with this file's name and contents. If that tool is blocked in your environment, report BLOCKED with the exact SQL — do not skip applying it, later tasks assume the column exists live.

- [ ] **Step 3: Verify**

Run `mcp__supabase__execute_sql` with `select column_name, data_type, column_default from information_schema.columns where table_name = 'bendle_songs' and column_name = 'start_offset_seconds';` — expect one row, `integer`, default `0`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260908090000_bendle_songs_start_offset.sql
git commit -m "feat(bendle): add start_offset_seconds column to bendle_songs"
```

---

### Task 2: `bendleScoring.js` — move vocals out of tier 3, add offset helpers

**Files:**
- Modify: `client/src/lib/bendleScoring.js`
- Modify: `client/src/lib/bendleScoring.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `ROUND_LENGTH_SECONDS` (exported constant, `= BENDLE_TIERS[2].atSeconds + 20 = 60`) and `clampBendleOffset(offsetSeconds, stemDurationSeconds)` (exported function) — both consumed by Task 3 (`ShinyBendleQuestion.jsx`) and Task 4 (`BendleOffsetScrubber.jsx`). `BENDLE_TIERS[2].stems` changes from `['other', 'vocals']` to `['other']` — consumed by Task 3's playback effects. `client/src/components/host/SlideEditor.jsx` also imports `BENDLE_TIERS`, but only reads `.label`/`.points`/`.atSeconds` for a display list, never `.stems` — unaffected by this change, verified by reading its two usage sites before writing this task.

- [ ] **Step 1: Edit `BENDLE_TIERS` and its header comment**

Replace the existing `BENDLE_TIERS` block (the comment above it and the array itself) with:

```js
// The default tier ladder: earlier layers are harder to guess, so they pay
// more. Not exposed for per-slide editing in this build (mirrors WAGER_TIERS
// being fixed, not configurable) — a follow-up if the defaults don't hold up
// live. See docs/superpowers/specs/2026-09-04-bendle-layered-audio-question-design.md.
//
// The ladder ROUGHLY HALVES rather than stepping down evenly, and that's the
// whole mechanic (2026-09-05, Ben: "i want them to guess earlier, ie less
// instruments ... so theyd get rewarded for doing so"). An even -10 step
// actually rewards WAITING: a wrong guess costs nothing, so a team 60% sure on
// drums-only compares 0.6 x 40 = 24 against waiting one layer for 0.85 x 30 =
// 25.5 and correctly sits on its hands. Halving flips that (0.6 x 30 = 18 vs
// 0.85 x 15 = 12.75), so committing on the thinnest mix is the right play.
// Keep the cliff between rung 1 and rung 2 steep if these get retuned — the
// gap is what does the work, not the absolute numbers.
//
// THREE steps, always (2026-09-05, Ben: "all shiny step questions will always
// be 3 steps") — that's a house rule across the shiny step formats, not a
// Bendle detail, so keep the count at three if these get retuned.
//
// Vocals are deliberately NOT one of the three in-round tiers (2026-09-07,
// Ben: "the vocals arent introduced until i reveal the answer — that's the
// goal"). They used to land alongside `other` on the third tier, but vocals
// are the giveaway, so having them audible before the round even locks
// undercut the guess. `vocals` is still one of the four real stem columns,
// but ShinyBendleQuestion's round-playing effect now skips fetching it
// entirely — one less stem to download over show wifi for content nobody
// is meant to hear yet. It's loaded only in the separate reveal-beat effect
// (see BendleReveal in ShinyBendleQuestion.jsx), together with the other
// three stems, as the "here's the answer" payoff.
export const BENDLE_TIERS = [
  { id: 'drums', label: 'Drums Only',        atSeconds: 0,  points: 30, stems: ['drums'] },
  { id: 'bass',  label: '+ Bass',            atSeconds: 20, points: 15, stems: ['bass'] },
  { id: 'full',  label: '+ Everything Else', atSeconds: 40, points: 10, stems: ['other'] },
]

// Total seconds a round runs for: the last tier's start plus a tail long
// enough to actually hear it before the host locks. ShinyBendleQuestion
// derives its progress bar from this; the admin scrubber (BendleOffsetScrubber)
// uses it to cap how late a start point can be picked, so an offset can never
// leave less than a full round's worth of audio in the file.
export const ROUND_LENGTH_SECONDS = BENDLE_TIERS[BENDLE_TIERS.length - 1].atSeconds + 20

// Keeps a host-picked start point from running a stem past its own end —
// Tone.Player silently plays nothing (no error) if asked to start at or past
// a buffer's duration, so an unclamped offset near the end of a short song
// would go out on a silent TV with no indication anything is wrong. Clamps
// into [0, duration - ROUND_LENGTH_SECONDS], collapsing to 0 if the stem is
// shorter than one full round (nothing useful to offset in that case; the
// round just plays what there is, same as any other short song today).
export function clampBendleOffset(offsetSeconds, stemDurationSeconds) {
  const maxOffset = Math.max(0, (stemDurationSeconds ?? 0) - ROUND_LENGTH_SECONDS)
  return Math.min(Math.max(0, offsetSeconds ?? 0), maxOffset)
}
```

- [ ] **Step 2: Update the existing "three steps" test**

In `bendleScoring.test.js`, replace the `it('is exactly three steps covering all four stems once each', ...)` test with:

```js
  // House rule, not a Bendle preference (Ben: "all shiny step questions will
  // always be 3 steps"). Also guards the half of the contract that lives in
  // ShinyBendleQuestion: it fades in each tier's `stems` on the transport, so
  // every SCHEDULED stem must be a real bendle_songs column and must appear
  // exactly once — a typo or a duplicate would silently drop a layer from
  // playback or double-fade one, neither of which shows up as a test failure
  // anywhere else. `vocals` is deliberately absent — it plays only at reveal
  // (see BendleReveal), never scheduled into an in-round tier.
  it('is exactly three steps covering drums/bass/other once each, never vocals', () => {
    expect(BENDLE_TIERS).toHaveLength(3)
    const stems = BENDLE_TIERS.flatMap(t => t.stems)
    expect([...stems].sort()).toEqual(['bass', 'drums', 'other'])
    expect(BENDLE_TIERS.map(t => t.atSeconds)).toEqual([0, 20, 40])
  })
```

- [ ] **Step 3: Add tests for the new exports**

Add as new top-level `describe`/`it` blocks, placed directly after whichever existing top-level block covers `BENDLE_TIERS` itself (the one containing the test edited in Step 2 above) — not nested inside it:

```js
  it('ROUND_LENGTH_SECONDS is 20s past the last tier', () => {
    expect(ROUND_LENGTH_SECONDS).toBe(60)
  })

  describe('clampBendleOffset', () => {
    it('passes through an offset that leaves a full round of runway', () => {
      expect(clampBendleOffset(30, 200)).toBe(30)
    })

    it('clamps an offset that would run past the end of the stem', () => {
      // duration 100, round needs 60 -> latest legal offset is 40
      expect(clampBendleOffset(90, 100)).toBe(40)
    })

    it('never goes negative', () => {
      expect(clampBendleOffset(-5, 200)).toBe(0)
    })

    it('collapses to 0 when the stem is shorter than one round', () => {
      expect(clampBendleOffset(10, 45)).toBe(0)
    })

    it('treats a missing offset as 0', () => {
      expect(clampBendleOffset(undefined, 200)).toBe(0)
    })
  })
```

Update the test file's top import line — it currently reads:

```js
import {
  BENDLE_TIERS, matchesBendleAnswer, resolveBendleTier,
  scoreBendleRound, computeBendleScoreUpdates,
} from './bendleScoring.js'
```

Add the two new names to it (don't drop `computeBendleScoreUpdates` — it's used by other tests later in this same file):

```js
import {
  BENDLE_TIERS, matchesBendleAnswer, resolveBendleTier,
  scoreBendleRound, computeBendleScoreUpdates,
  ROUND_LENGTH_SECONDS, clampBendleOffset,
} from './bendleScoring.js'
```

- [ ] **Step 4: Run the tests**

Run: `npm run test:unit -- bendleScoring`
Expected: all tests in `bendleScoring.test.js` PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/bendleScoring.js client/src/lib/bendleScoring.test.js
git commit -m "feat(bendle): drop vocals from tier 3, export ROUND_LENGTH_SECONDS + clampBendleOffset"
```

---

### Task 3: `ShinyBendleQuestion.jsx` — apply offset, play vocals at reveal

**Files:**
- Modify: `client/src/components/display/slides/ShinyBendleQuestion.jsx`
- Modify: `client/src/components/display/slides/ShinyBendleQuestion.test.jsx`

**Interfaces:**
- Consumes: `ROUND_LENGTH_SECONDS`, `clampBendleOffset` from `bendleScoring.js` (Task 2). `song.start_offset_seconds` (Task 1's column, read off the same `bendle_songs` row this component already fetches — no new query).
- Produces: nothing new consumed elsewhere.

- [ ] **Step 1: Replace the local `ROUND_LENGTH_SECONDS` with the imported one, add `ROUND_STEM_KEYS`**

Change the import line:

```js
import { BENDLE_TIERS } from '../../../lib/bendleScoring.js'
```

to:

```js
import { BENDLE_TIERS, ROUND_LENGTH_SECONDS, clampBendleOffset } from '../../../lib/bendleScoring.js'
```

Delete this now-redundant local line (it duplicated the same computation):

```js
const ROUND_LENGTH_SECONDS = BENDLE_TIERS[BENDLE_TIERS.length - 1].atSeconds + 20
```

Find the existing `const STEM_KEYS = ['drums', 'bass', 'other', 'vocals']` line and add a second, round-only list right after it (keep `STEM_KEYS` as-is — the reveal effect in Step 3 still needs all four):

```js
// The round-playing effect (below) only ever needs three of the four real
// stems — vocals is never scheduled into a tier (see BENDLE_TIERS in
// bendleScoring.js), so fetching it during the round would just be a wasted
// download on show wifi for audio nobody will hear yet. STEM_KEYS (all
// four) is still what the reveal effect loads.
const ROUND_STEM_KEYS = ['drums', 'bass', 'other']
```

- [ ] **Step 2: Apply a single shared offset in the round-playing effect**

In the `setup()` function inside the main playback `useEffect` (the one keyed on `[song, guessesLocked, revealed, isPreview]`), find this whole block:

```js
      const players = {}
      for (const key of STEM_KEYS) {
        const url = song[`${key}_url`]
        if (!url) continue
        let player = null
        try {
          player = new Tone.Player().toDestination()
          player.volume.value = -Infinity
          await player.load(url)
        } catch (e) {
          // Per-stem failure skips that layer rather than blocking the whole
          // round on a live TV: it is left out of `players`, so the schedule
          // below simply never fades it in and the rest of the song plays.
          console.error(`[Bendle] stem load failed for "${key}":`, e)
          player?.dispose()
          continue
        }
        if (killed) { player.dispose(); return }
        player.sync().start(0)
        created.push(player)
        players[key] = player
      }
      if (killed) return

      if (Object.keys(players).length === 0) { setLoadState('error'); return }
```

Replace it with:

```js
      const players = {}
      for (const key of ROUND_STEM_KEYS) {
        const url = song[`${key}_url`]
        if (!url) continue
        let player = null
        try {
          player = new Tone.Player().toDestination()
          player.volume.value = -Infinity
          await player.load(url)
        } catch (e) {
          // Per-stem failure skips that layer rather than blocking the whole
          // round on a live TV: it is left out of `players`, so the schedule
          // below simply never fades it in and the rest of the song plays.
          console.error(`[Bendle] stem load failed for "${key}":`, e)
          player?.dispose()
          continue
        }
        if (killed) { player.dispose(); return }
        created.push(player)
        players[key] = player
      }
      if (killed) return

      if (Object.keys(players).length === 0) { setLoadState('error'); return }

      // One shared offset for every stem, computed from the SHORTEST loaded
      // buffer. Clamping each stem independently off its own buffer.duration
      // risks two stems landing on different offsets (if their encoded
      // lengths ever differ even slightly) and drifting out of sync with
      // each other on a live TV — computing once from the minimum and
      // applying it to all of them keeps every stem starting at the exact
      // same point.
      const roundOffsetSeconds = clampBendleOffset(
        song.start_offset_seconds,
        Math.min(...Object.values(players).map(p => p.buffer.duration)),
      )
      for (const player of Object.values(players)) player.sync().start(0, roundOffsetSeconds)
```

- [ ] **Step 3: Give `BendleReveal` its own audio effect (parallel loads) and pass `isPreview` through**

Find the render call:

```js
  if (revealed) {
    return <BendleReveal data={data} song={song} theme={theme} shouldReduceMotion={shouldReduceMotion} />
  }
```

Replace with:

```js
  if (revealed) {
    return <BendleReveal data={data} song={song} theme={theme} shouldReduceMotion={shouldReduceMotion} isPreview={isPreview} />
  }
```

Then find the `function BendleReveal({ data, song, theme, shouldReduceMotion }) {` definition and:

1. Change its signature to `function BendleReveal({ data, song, theme, shouldReduceMotion, isPreview }) {`.
2. Immediately after the existing `const twoCol = results.length > 8` line (before the `return (`), add this new effect:

```js
  // The reveal beat's own audio lifecycle, separate from the round-playing
  // effect above: that effect's cleanup already ran the instant `revealed`
  // flipped true (it's in that effect's own dependency array), so by the
  // time this component mounts there are no live players or scheduled
  // fades left to collide with. Every stem that has a URL plays together,
  // full volume, from the same start_offset_seconds the round used — no
  // tier scheduling needed, this is the "whole song, vocals included"
  // payoff landing all at once. Loads are fired in parallel (Promise.all),
  // not one at a time — the round is already over and the reveal text is
  // already on screen, so four sequential fetches over show wifi would be
  // an awkward silent gap before the payoff actually lands. Same isPreview
  // guard as the round-playing effect: the build-mode canvas never plays
  // audio.
  useEffect(() => {
    if (!song || isPreview) return
    const transport = Tone.getTransport()
    let killed = false
    const created = []

    async function setup() {
      transport.stop()
      transport.cancel(0)
      transport.seconds = 0

      const loaded = await Promise.all(STEM_KEYS.map(async key => {
        const url = song[`${key}_url`]
        if (!url) return null
        const player = new Tone.Player().toDestination()
        try {
          await player.load(url)
          return player
        } catch (e) {
          console.error(`[Bendle] reveal stem load failed for "${key}":`, e)
          player.dispose()
          return null
        }
      }))
      if (killed) { loaded.forEach(p => p?.dispose()); return }

      const players = loaded.filter(Boolean)
      if (players.length === 0) return
      players.forEach(p => created.push(p))

      // Same shared-offset reasoning as the round-playing effect: one value,
      // derived from the shortest loaded buffer, applied to every stem.
      const revealOffsetSeconds = clampBendleOffset(
        song.start_offset_seconds,
        Math.min(...players.map(p => p.buffer.duration)),
      )
      players.forEach(p => p.sync().start(0, revealOffsetSeconds))

      Tone.start().catch(() => {})
      transport.start()
    }
    setup()

    return () => {
      killed = true
      transport.stop()
      transport.cancel(0)
      created.forEach(p => p.dispose())
      created.length = 0
    }
  }, [song, isPreview])
```

- [ ] **Step 4: Replace the test file**

`ShinyBendleQuestion.test.jsx` has several assertions that directly contradict the new behavior (tier-3 scheduling a duplicate 40s call for vocals; reveal asserting `transport.start` is NEVER called). Replace the entire file with:

```js
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import * as Tone from 'tone'
import ShinyBendleQuestion from './ShinyBendleQuestion.jsx'

// No @testing-library/react in this repo — ShinyTitleSlide.test.jsx's
// createRoot + act(...) shape is the house pattern, so this follows it
// rather than pulling in a second testing library.

const SONG = {
  id: 'bnd_1',
  title: 'Hey Jude',
  answer: 'Hey Jude',
  drums_url: 'd.mp3', bass_url: 'b.mp3', other_url: 'o.mp3', vocals_url: 'v.mp3',
  start_offset_seconds: 0,
}

let songRow = SONG
let answeredCount = 2
let loadFails = new Set()
// When true the bendle_songs fetch never settles — the only way to hold the
// component in its 'loading' beat, since the mocked stem loads resolve inside
// the same act() flush that renders.
let songPending = false

vi.mock('../../../lib/supabase.js', () => ({
  supabase: {
    from: () => ({
      // bendle_songs takes .eq().single(); the teams head-count is awaited
      // straight off .eq(), so the same object has to serve both.
      select: () => ({
        eq: () => ({
          single: () => (songPending ? new Promise(() => {}) : Promise.resolve({ data: songRow })),
          then: resolve => resolve({ count: 5 }),
        }),
      }),
    }),
    // A row ARRAY, matching the real bendle_answer_counts, which is declared
    // `returns table(answered int)` — NOT wager_answer_counts' `returns
    // jsonb`. Mocking it as a bare object hides the exact bug this component
    // shipped with (`counts?.answered` on an array is undefined). `total`
    // dropped from the RPC's shape 2026-09-05 (Fix 3, whole-branch review) —
    // it was never read here.
    rpc: () => Promise.resolve({ data: [{ answered: answeredCount }] }),
  },
}))

const transport = {
  seconds: 0,
  stop: vi.fn(), start: vi.fn(), cancel: vi.fn(), scheduleOnce: vi.fn(),
}

// buffer.duration is generous (300s) so clampBendleOffset never engages
// unless a test sets song.start_offset_seconds near/over that on purpose.
vi.mock('tone', () => ({
  getTransport: () => transport,
  start: () => Promise.resolve(),
  Player: vi.fn().mockImplementation(function () {
    const player = {
      volume: { value: 0, rampTo: vi.fn(), setValueAtTime: vi.fn() },
      buffer: { duration: 300 },
      toDestination: () => player,
      load: url => (loadFails.has(url)
        ? Promise.reject(new Error(`boom: ${url}`))
        : Promise.resolve(player)),
      sync: () => player,
      start: vi.fn(() => player),
      dispose: vi.fn(),
    }
    return player
  }),
}))

const theme = { colors: { text: '#ffffff' }, fonts: { display: 'Boogaloo', body: 'DM Sans' } }
const show = { id: 'show1' }

const bendleSlide = data => ({
  id: 's1',
  data: { isShiny: true, shinyInputSchema: { type: 'bendle' }, bendleSongId: 'bnd_1', ...data },
})

describe('<ShinyBendleQuestion>', () => {
  let container, root

  beforeEach(() => {
    songRow = SONG
    answeredCount = 2
    loadFails = new Set()
    songPending = false
    transport.seconds = 0
    vi.clearAllMocks()
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
    root.render(<ShinyBendleQuestion slide={slide} show={show} theme={theme} />)
  })

  // Lets the song fetch, the four stem loads and the count RPC all settle.
  const settle = () => act(async () => { await new Promise(r => setTimeout(r, 0)) })

  it('shows the loading line before the stems have loaded', async () => {
    songPending = true
    await render(bendleSlide({}))
    await settle()
    expect(container.textContent).toContain('Loading song')
    expect(transport.start).not.toHaveBeenCalled()
  })

  it('plays: starts the Transport, schedules the later stems, shows the count', async () => {
    await render(bendleSlide({}))
    await settle()

    expect(transport.start).toHaveBeenCalled()
    // Three steps, but vocals is never one of them (2026-09-07: vocals only
    // plays at reveal) — drums is audible from the first frame, bass comes
    // in at 20, `other` alone lands at 40.
    expect(transport.scheduleOnce).toHaveBeenCalledTimes(2)
    expect(transport.scheduleOnce.mock.calls.map(c => c[1])).toEqual([20, 40])
    expect(container.textContent).toContain('2 of 5 teams guessed')
    expect(container.textContent).not.toContain('Loading song')
  })

  it('starts every round stem player at the song\'s start_offset_seconds', async () => {
    songRow = { ...SONG, start_offset_seconds: 45 }
    await render(bendleSlide({}))
    await settle()

    // Round-only stems: drums, bass, other — vocals is never fetched during
    // the round (see ROUND_STEM_KEYS).
    const players = Tone.Player.mock.results.map(r => r.value)
    expect(players).toHaveLength(3)
    players.forEach(p => expect(p.start).toHaveBeenCalledWith(0, 45))
  })

  it('clamps an offset that would run past the end of the stem', async () => {
    // buffer.duration is mocked at 300, round needs 60 -> latest legal offset is 240
    songRow = { ...SONG, start_offset_seconds: 290 }
    await render(bendleSlide({}))
    await settle()

    const players = Tone.Player.mock.results.map(r => r.value)
    players.forEach(p => expect(p.start).toHaveBeenCalledWith(0, 240))
  })

  it('skips a failed stem instead of failing the whole round', async () => {
    loadFails = new Set(['o.mp3']) // the tier-3 stem dies
    await render(bendleSlide({}))
    await settle()

    expect(transport.start).toHaveBeenCalled()
    // bass still scheduled at 20; other's would-be 40s fade is skipped since
    // its player never loaded.
    expect(transport.scheduleOnce.mock.calls.map(c => c[1])).toEqual([20])
    expect(container.textContent).not.toContain('Couldn')
  })

  it('shows the error line when every round stem fails', async () => {
    // Only drums/bass/other are ever fetched during the round — vocals
    // never gets a load attempt to fail.
    loadFails = new Set(['d.mp3', 'b.mp3', 'o.mp3'])
    await render(bendleSlide({}))
    await settle()

    expect(container.textContent).toContain('load this song')
    expect(transport.start).not.toHaveBeenCalled()
  })

  it('stops the Transport and disposes the players once guesses lock', async () => {
    await render(bendleSlide({}))
    await settle()
    const players = Tone.Player.mock.results.map(r => r.value)
    expect(players).toHaveLength(3) // drums, bass, other — round never loads vocals

    await render(bendleSlide({ bendleGuessesLocked: true }))
    await settle()

    expect(transport.stop).toHaveBeenCalled()
    players.forEach(p => expect(p.dispose).toHaveBeenCalled())
    expect(container.textContent).toContain('Answers locked')
    // Never the aggregate count once locked, and never a raw guess.
    expect(container.textContent).not.toContain('teams guessed')
  })

  it('shows only the aggregate count before lock, never a team or a guess', async () => {
    await render(bendleSlide({}))
    await settle()
    expect(container.textContent).toContain('2 of 5 teams guessed')
    expect(container.textContent).not.toContain('Hey Jude') // the answer stays hidden
  })

  it('reveals the song, each tier label and its points, and plays every stem together', async () => {
    const slide = bendleSlide({
      bendleGuessesLocked: true,
      bendleRevealed: true,
      bendleResults: [
        { teamId: 't1', teamName: 'Alpha', correct: true, tierId: 'drums', points: 30 },
        { teamId: 't2', teamName: 'Beta', correct: true, tierId: 'full', points: 10 },
        { teamId: 't3', teamName: 'Gamma', correct: false, tierId: null, points: 0 },
      ],
    })
    await render(slide)
    await settle()

    expect(container.textContent).toContain('The song was')
    expect(container.textContent).toContain('Hey Jude')
    expect(container.textContent).toContain('Alpha')
    expect(container.textContent).toContain('Drums Only')
    expect(container.textContent).toContain('+30')
    expect(container.textContent).toContain('+ Everything Else')
    expect(container.textContent).toContain('+10')
    // A wrong guess shows a dash and a zero, never the guess itself.
    expect(container.textContent).toContain('Gamma')
    // The round never played (guessesLocked was true from the first render,
    // so the round-playing effect's guard skipped it entirely) — every
    // Player came from the reveal-beat effect instead, one per stem,
    // vocals included this time.
    expect(transport.start).toHaveBeenCalled()
    expect(Tone.Player).toHaveBeenCalledTimes(4)
  })

  it('never touches audio in the build-mode preview pane, even revealed', async () => {
    await act(() => {
      root.render(<ShinyBendleQuestion slide={bendleSlide({})} show={show} theme={theme} isPreview />)
    })
    await settle()
    expect(transport.start).not.toHaveBeenCalled()
    expect(Tone.Player).not.toHaveBeenCalled()
    // No un-resolvable "Loading song…" in the host's build-mode editor.
    expect(container.textContent).not.toContain('Loading song')

    await act(() => {
      root.render(<ShinyBendleQuestion
        slide={bendleSlide({ bendleGuessesLocked: true, bendleRevealed: true, bendleResults: [] })}
        show={show} theme={theme} isPreview
      />)
    })
    await settle()
    expect(transport.start).not.toHaveBeenCalled()
    expect(Tone.Player).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 5: Run the tests**

Run: `npm run test:unit -- ShinyBendleQuestion`
Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/display/slides/ShinyBendleQuestion.jsx client/src/components/display/slides/ShinyBendleQuestion.test.jsx
git commit -m "feat(bendle): apply start offset to playback, play vocals only at reveal"
```

---

### Task 4: `BendleOffsetScrubber.jsx` — the scrub UI (new component)

**Files:**
- Create: `client/src/lib/bendleAudioAnalysis.js`
- Create: `client/src/lib/bendleAudioAnalysis.test.js`
- Create: `client/src/components/host/BendleOffsetScrubber.jsx`
- Create: `client/src/components/host/BendleOffsetScrubber.test.jsx`

**Interfaces:**
- Consumes: `ROUND_LENGTH_SECONDS`, `clampBendleOffset` from `bendleScoring.js` (Task 2); `supabase` client (`client/src/lib/supabase.js`, existing).
- Produces: default export `BendleOffsetScrubber({ song })` where `song` has at least `id`, `drums_url`, `bass_url`, `other_url`, `start_offset_seconds` — consumed by Task 5 (`BendleAdmin.jsx`). Named export `formatOffsetTime(seconds)` — also consumed by Task 5.

- [ ] **Step 1: Write the pure audio-analysis helpers**

`client/src/lib/bendleAudioAnalysis.js`:

```js
// Pure DSP helpers for the Bendle start-offset scrubber. No React, no
// Tone.js, no Supabase — just plain arithmetic over decoded PCM, so this is
// testable without a browser AudioContext. BendleOffsetScrubber.jsx is the
// only caller; it owns the actual AudioContext/decodeAudioData calls and
// passes the resulting Float32Array in here.

// Root-mean-square loudness in fixed-size windows across one channel's PCM
// data — a plain, un-tuned energy measure (no threshold, no detection logic)
// so the host's own eye does the judgment call of "where do all three stems
// go solid," rather than a heuristic guessing on their behalf.
export function computeRmsEnvelope(channelData, sampleRate, windowSeconds = 0.15) {
  const windowSize = Math.max(1, Math.round(sampleRate * windowSeconds))
  const windows = []
  for (let i = 0; i < channelData.length; i += windowSize) {
    const end = Math.min(i + windowSize, channelData.length)
    let sumSquares = 0
    for (let j = i; j < end; j++) sumSquares += channelData[j] * channelData[j]
    windows.push(Math.sqrt(sumSquares / (end - i)))
  }
  return windows
}

// Down/up-samples an envelope to a fixed number of buckets (bar-graph
// columns), independent of song length or window size, by averaging
// whichever source windows fall into each bucket's span.
export function resampleEnvelope(envelope, bucketCount) {
  if (envelope.length === 0) return new Array(bucketCount).fill(0)
  const bucketSize = envelope.length / bucketCount
  const buckets = []
  for (let b = 0; b < bucketCount; b++) {
    const start = Math.floor(b * bucketSize)
    const end = Math.max(start + 1, Math.floor((b + 1) * bucketSize))
    let sum = 0
    let count = 0
    for (let j = start; j < end && j < envelope.length; j++) { sum += envelope[j]; count++ }
    buckets.push(count > 0 ? sum / count : 0)
  }
  return buckets
}

// Scales a bucketed envelope to [0, 1] against ITS OWN peak, not an absolute
// loudness value — Demucs stem levels vary too much per track/mastering for
// a fixed scale to mean anything (this is display only, never a detection
// threshold, so per-stem relative scaling is exactly right here).
export function normalizeEnvelope(buckets) {
  const max = Math.max(0, ...buckets)
  if (max <= 0) return buckets.map(() => 0)
  return buckets.map(v => v / max)
}
```

- [ ] **Step 2: Write its tests**

`client/src/lib/bendleAudioAnalysis.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { computeRmsEnvelope, resampleEnvelope, normalizeEnvelope } from './bendleAudioAnalysis.js'

describe('computeRmsEnvelope', () => {
  it('returns one window of 0 for silence', () => {
    const silence = new Float32Array(4410) // 0.1s @ 44100
    expect(computeRmsEnvelope(silence, 44100, 0.1)).toEqual([0])
  })

  it('computes RMS for a constant-amplitude signal', () => {
    const samples = new Float32Array(100).fill(0.5)
    const windows = computeRmsEnvelope(samples, 100, 0.5) // 2 windows of 50 samples
    expect(windows).toHaveLength(2)
    windows.forEach(w => expect(w).toBeCloseTo(0.5, 5))
  })

  it('handles a final partial window', () => {
    const samples = new Float32Array(120).fill(1)
    const windows = computeRmsEnvelope(samples, 100, 1) // window size 100, 120 samples -> 2 windows
    expect(windows).toHaveLength(2)
    expect(windows[1]).toBeCloseTo(1, 5) // partial window, still all 1s
  })
})

describe('resampleEnvelope', () => {
  it('averages source values into fewer buckets', () => {
    expect(resampleEnvelope([0, 0, 10, 10], 2)).toEqual([0, 10])
  })

  it('returns zeros for an empty envelope', () => {
    expect(resampleEnvelope([], 4)).toEqual([0, 0, 0, 0])
  })

  it('upsamples a short envelope without crashing', () => {
    const result = resampleEnvelope([5], 3)
    expect(result).toHaveLength(3)
    result.forEach(v => expect(v).toBe(5))
  })
})

describe('normalizeEnvelope', () => {
  it('scales values to [0, 1] against their own peak', () => {
    expect(normalizeEnvelope([0, 5, 10])).toEqual([0, 0.5, 1])
  })

  it('returns all zeros when every value is zero', () => {
    expect(normalizeEnvelope([0, 0, 0])).toEqual([0, 0, 0])
  })
})
```

- [ ] **Step 3: Run the analysis tests**

Run: `npm run test:unit -- bendleAudioAnalysis`
Expected: all PASS.

- [ ] **Step 4: Write the scrubber component**

`client/src/components/host/BendleOffsetScrubber.jsx`:

```jsx
import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { ROUND_LENGTH_SECONDS, clampBendleOffset } from '../../lib/bendleScoring.js'
import { computeRmsEnvelope, resampleEnvelope, normalizeEnvelope } from '../../lib/bendleAudioAnalysis.js'

// Which stems get a bar graph — drums/bass/other are the three in-round
// tiers (see BENDLE_TIERS), so this is literally "show me where all three
// tiers would already sound full." Vocals is deliberately excluded: it
// never plays during the round (see bendleScoring.js's BENDLE_TIERS
// comment), so its timing is irrelevant to picking a start point here.
const GRAPH_ROWS = [
  { key: 'drums_url', label: 'Drums', color: '#9333ea' },
  { key: 'bass_url', label: 'Bass', color: '#2563eb' },
  { key: 'other_url', label: 'Other', color: '#16a34a' },
]
const BUCKET_COUNT = 100
const PREVIEW_SECONDS = 5

export function formatOffsetTime(seconds) {
  const s = Math.max(0, Math.round(seconds || 0))
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${String(sec).padStart(2, '0')}`
}

// props: song = { id, drums_url, bass_url, other_url, start_offset_seconds }
export default function BendleOffsetScrubber({ song }) {
  const [envelopes, setEnvelopes] = useState(null)
  const [duration, setDuration] = useState(0)
  const [loadError, setLoadError] = useState(false)
  const [offset, setOffset] = useState(song.start_offset_seconds ?? 0)
  const [saving, setSaving] = useState(false)
  const audioRef = useRef(null)
  const previewTimerRef = useRef(null)

  // Decodes drums/bass/other once per song via the Web Audio API (never
  // Tone.js — see this plan's Global Constraints on keeping Tone out of the
  // Host bundle). Deliberately NOT stored anywhere: recomputed every time
  // the admin opens this song's scrubber, which is rare (once per prepped
  // song) and cheap (one ~3-4 min mp3 decode + a linear RMS scan, done at
  // home on a laptop, not on bar wifi mid-show).
  useEffect(() => {
    let cancelled = false
    // No webkitAudioContext fallback — the host runs this on a current
    // Chrome or Safari (14.1+), both of which have had unprefixed
    // AudioContext for years; window.AudioContext is also what the test in
    // Step 5 below mocks.
    const ctx = new window.AudioContext()

    async function analyze() {
      try {
        const nextEnvelopes = {}
        let minDuration = Infinity
        // Decode-then-analyze one stem at a time, not all three held in
        // memory together — each decoded buffer is tens of MB (a few
        // minutes of float32 PCM), and only the small resulting envelope
        // array needs to survive past this loop.
        for (const row of GRAPH_ROWS) {
          const res = await fetch(song[row.key])
          const arrayBuffer = await res.arrayBuffer()
          const buffer = await ctx.decodeAudioData(arrayBuffer)
          if (cancelled) return
          minDuration = Math.min(minDuration, buffer.duration)
          const raw = computeRmsEnvelope(buffer.getChannelData(0), buffer.sampleRate)
          nextEnvelopes[row.key] = normalizeEnvelope(resampleEnvelope(raw, BUCKET_COUNT))
        }
        if (cancelled) return
        setEnvelopes(nextEnvelopes)
        setDuration(minDuration)
      } catch (e) {
        console.error('[Bendle] scrubber analysis failed:', e)
        if (!cancelled) setLoadError(true)
      }
    }
    analyze()

    return () => {
      cancelled = true
      ctx.close().catch(() => {})
      clearTimeout(previewTimerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song.id])

  const maxOffset = duration ? Math.max(0, duration - ROUND_LENGTH_SECONDS) : 0
  const tooShort = duration > 0 && maxOffset === 0

  function handleSeek(e) {
    const value = Number(e.target.value)
    setOffset(value)
    if (audioRef.current) audioRef.current.currentTime = value
  }

  function playPreview() {
    if (!audioRef.current) return
    clearTimeout(previewTimerRef.current)
    audioRef.current.currentTime = offset
    audioRef.current.play().catch(() => {})
    previewTimerRef.current = setTimeout(() => audioRef.current?.pause(), PREVIEW_SECONDS * 1000)
  }

  async function handleSetStart() {
    setSaving(true)
    const clamped = clampBendleOffset(offset, duration)
    await supabase.from('bendle_songs').update({ start_offset_seconds: Math.round(clamped) }).eq('id', song.id)
    setSaving(false)
  }

  if (loadError) {
    return <p className="text-xs text-red-500">Couldn&rsquo;t load this song&rsquo;s stems to scrub.</p>
  }
  if (!envelopes) {
    return <p className="text-xs text-gray-400">Analyzing song…</p>
  }

  return (
    <div className="space-y-2">
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio ref={audioRef} src={song.other_url} />
      <div className="space-y-0.5" data-testid="bendle-envelope-graph">
        {GRAPH_ROWS.map(row => (
          <div key={row.key} className="flex items-end h-6 gap-px" title={row.label}>
            {envelopes[row.key].map((v, i) => (
              <div
                key={i}
                style={{ height: `${Math.max(4, v * 100)}%`, backgroundColor: row.color, flex: 1 }}
              />
            ))}
          </div>
        ))}
      </div>
      {tooShort ? (
        <p className="text-xs text-gray-400">Song&rsquo;s too short to pick a start point — it&rsquo;ll always play from 0:00.</p>
      ) : (
        <>
          <input
            type="range" min="0" max={maxOffset} step="1" value={Math.min(offset, maxOffset)}
            onChange={handleSeek}
            className="w-full accent-baynes-forest"
            aria-label="Start point"
          />
          <div className="flex items-center justify-between text-[11px] text-gray-500">
            <span>{formatOffsetTime(offset)}</span>
            <span>{formatOffsetTime(duration)}</span>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={playPreview} className="flex-1 text-xs font-medium px-3 py-2 rounded-lg border border-gray-200 hover:border-baynes-forest text-gray-700 transition-colors">
              ▶ Preview 5s
            </button>
            <button type="button" onClick={handleSetStart} disabled={saving} className="flex-1 text-xs font-semibold px-3 py-2 rounded-lg bg-gray-900 text-white hover:bg-gray-700 transition-colors disabled:opacity-50">
              {saving ? 'Saving…' : '🎯 Set Start Here'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Write the component test**

`client/src/components/host/BendleOffsetScrubber.test.jsx`:

```jsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import BendleOffsetScrubber from './BendleOffsetScrubber.jsx'

// No @testing-library/react in this repo — createRoot + act(...) is the
// house pattern (see ShinyBendleQuestion.test.jsx, BendleAdmin.test.jsx).

let updateSpy
vi.mock('../../lib/supabase.js', () => ({
  supabase: {
    from: () => ({
      update: (...args) => { updateSpy(...args); return { eq: () => Promise.resolve({ error: null }) } },
    }),
  },
}))

const SONG = {
  id: 'bnd_1', drums_url: 'd.mp3', bass_url: 'b.mp3', other_url: 'o.mp3', start_offset_seconds: 0,
}

class FakeAudioContext {
  constructor() { this.closed = false }
  async decodeAudioData() {
    // 120s @ 100Hz mono, constant amplitude — enough for a real envelope
    // without a slow test.
    const sampleRate = 100
    const length = 120 * sampleRate
    const data = new Float32Array(length).fill(0.5)
    return { duration: 120, sampleRate, getChannelData: () => data }
  }
  async close() { this.closed = true }
}

describe('<BendleOffsetScrubber>', () => {
  let container, root

  beforeEach(() => {
    updateSpy = vi.fn()
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    global.fetch = vi.fn(() => Promise.resolve({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }))
    window.AudioContext = FakeAudioContext
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  const settle = () => act(async () => { await new Promise(r => setTimeout(r, 0)) })

  it('shows an analyzing state, then the envelope graph and controls', async () => {
    act(() => { root.render(<BendleOffsetScrubber song={SONG} />) })
    expect(container.textContent).toContain('Analyzing')
    await settle()
    expect(container.querySelector('[data-testid="bendle-envelope-graph"]')).toBeTruthy()
    expect(container.querySelector('input[type="range"]')).toBeTruthy()
  })

  it('caps the range at duration minus a full round length', async () => {
    act(() => { root.render(<BendleOffsetScrubber song={SONG} />) })
    await settle()
    const range = container.querySelector('input[type="range"]')
    // duration 120, round needs 60 -> max is 60
    expect(range.max).toBe('60')
  })

  it('saves the clamped offset when "Set Start Here" is clicked', async () => {
    act(() => { root.render(<BendleOffsetScrubber song={SONG} />) })
    await settle()
    const range = container.querySelector('input[type="range"]')
    // React's own value tracker swallows a plain `range.value = '45'` before
    // a dispatched 'change' event ever reaches the onChange handler — the
    // native setter bypasses that tracker. Same workaround this repo already
    // uses in BendleSongSearch.test.jsx / WorldPaletteEditor.test.jsx.
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    act(() => {
      nativeSetter.call(range, '45')
      range.dispatchEvent(new Event('change', { bubbles: true }))
    })
    const button = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Set Start Here'))
    await act(async () => { button.click(); await new Promise(r => setTimeout(r, 0)) })
    expect(updateSpy).toHaveBeenCalledWith({ start_offset_seconds: 45 })
  })

  it('shows the too-short message when the song is under one round length', async () => {
    window.AudioContext = class {
      async decodeAudioData() {
        const data = new Float32Array(100).fill(0.5)
        return { duration: 30, sampleRate: 100, getChannelData: () => data }
      }
      async close() {}
    }
    act(() => { root.render(<BendleOffsetScrubber song={SONG} />) })
    await settle()
    expect(container.textContent).toContain('too short')
    expect(container.querySelector('input[type="range"]')).toBeNull()
  })
})
```

- [ ] **Step 6: Run the component tests**

Run: `npm run test:unit -- BendleOffsetScrubber`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add client/src/lib/bendleAudioAnalysis.js client/src/lib/bendleAudioAnalysis.test.js client/src/components/host/BendleOffsetScrubber.jsx client/src/components/host/BendleOffsetScrubber.test.jsx
git commit -m "feat(bendle): add start-offset scrubber with drums/bass/other envelope graph"
```

---

### Task 5: Wire the scrubber into `BendleAdmin.jsx`

**Files:**
- Modify: `client/src/components/host/BendleAdmin.jsx`
- Modify: `client/src/components/host/BendleAdmin.test.jsx`

**Interfaces:**
- Consumes: `BendleOffsetScrubber`, `formatOffsetTime` from Task 4.

- [ ] **Step 1: Add the shared select-columns constant**

Near the top of the file, below `const STEM_KEYS = [...]`, add:

```js
// Every refresh of the song list (initial load, after insert, after
// delete-and-retry) needs the same columns: the scrubber needs the stem
// URLs and the current offset, which the original list (id/title/
// created_at/status/artist/error_text) never selected — a song already
// `ready` at page-load time would otherwise render its scrubber with no
// audio to fetch until the next realtime UPDATE happened to arrive.
const SONG_LIST_COLUMNS = 'id, title, created_at, status, artist, error_text, drums_url, bass_url, other_url, start_offset_seconds'
```

Replace all four occurrences of the literal string `'id, title, created_at, status, artist, error_text'` (in the initial `useEffect`, `handleDeleteFailed`, `handleSpotifyPick`, and `handleSave`) with `SONG_LIST_COLUMNS`.

- [ ] **Step 2: Import the scrubber, add expand state**

Add to the imports:

```js
import BendleOffsetScrubber, { formatOffsetTime } from './BendleOffsetScrubber.jsx'
```

Add alongside the other `useState` calls:

```js
  const [expandedId, setExpandedId] = useState(null)
```

- [ ] **Step 3: Render the scrub toggle and panel**

Replace the `<li>` block:

```jsx
              {songs.map(s => (
                <li key={s.id} className="flex items-center justify-between text-sm text-gray-700 gap-2">
                  <span className="flex-1 min-w-0">
                    <span className="block truncate">{s.title}{s.artist ? ` — ${s.artist}` : ''}</span>
                    {s.status === 'failed' && s.error_text && (
                      <span className="block text-xs text-red-500 truncate">{s.error_text}</span>
                    )}
                  </span>
                  <span className="text-xs shrink-0">{statusLabel(s.status)}</span>
                  {s.status === 'failed' && (
                    <button onClick={() => handleDeleteFailed(s.id)} className="text-xs text-gray-400 hover:text-red-500 shrink-0" title="Delete and try again">🗑</button>
                  )}
                </li>
              ))}
```

with:

```jsx
              {songs.map(s => (
                <li key={s.id} className="flex flex-col gap-1.5 text-sm text-gray-700">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex-1 min-w-0">
                      <span className="block truncate">{s.title}{s.artist ? ` — ${s.artist}` : ''}</span>
                      {s.status === 'failed' && s.error_text && (
                        <span className="block text-xs text-red-500 truncate">{s.error_text}</span>
                      )}
                      {s.status === 'ready' && s.start_offset_seconds > 0 && (
                        <span className="block text-xs text-gray-400">Starts at {formatOffsetTime(s.start_offset_seconds)}</span>
                      )}
                    </span>
                    <span className="text-xs shrink-0">{statusLabel(s.status)}</span>
                    {s.status === 'ready' && (
                      <button
                        onClick={() => setExpandedId(id => id === s.id ? null : s.id)}
                        className="text-xs text-gray-400 hover:text-gray-700 shrink-0"
                        title="Pick where the song starts"
                      >
                        {expandedId === s.id ? '▲ Scrub' : '🎚 Scrub'}
                      </button>
                    )}
                    {s.status === 'failed' && (
                      <button onClick={() => handleDeleteFailed(s.id)} className="text-xs text-gray-400 hover:text-red-500 shrink-0" title="Delete and try again">🗑</button>
                    )}
                  </div>
                  {expandedId === s.id && <BendleOffsetScrubber song={s} />}
                </li>
              ))}
```

- [ ] **Step 4: Update `BendleAdmin.test.jsx`**

The real file today is only 20 lines and never renders the component — it mocks `supabase.channel`/`removeChannel` just enough that importing `BendleAdmin.jsx` doesn't throw, then tests the pure `statusLabel` export in isolation. There is no existing render harness to match; this step adds one. Replace the entire file with:

```jsx
// client/src/components/host/BendleAdmin.test.jsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

// Importing BendleAdmin.jsx pulls in ../../lib/supabase.js, which throws at
// module init without VITE_SUPABASE_URL/ANON_KEY — mock it per the house
// pattern (see BendleSongSearch.test.jsx) so the pure statusLabel export can
// be tested without a real client. `from` is new here (Step 1 above added
// the SONG_LIST_COLUMNS query this mock answers) — songsFixture is mutated
// per-test before rendering.
let songsFixture = []
vi.mock('../../lib/supabase.js', () => ({
  supabase: {
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: () => {},
    from: () => ({
      select: () => ({ order: () => Promise.resolve({ data: songsFixture }) }),
    }),
  },
}))

const { default: BendleAdmin, statusLabel } = await import('./BendleAdmin.jsx')

describe('statusLabel', () => {
  it('labels requested', () => expect(statusLabel('requested')).toBe('⏳ Queued'))
  it('labels processing', () => expect(statusLabel('processing')).toBe('⚙️ Processing'))
  it('labels ready', () => expect(statusLabel('ready')).toBe('✅ Ready'))
  it('labels failed', () => expect(statusLabel('failed')).toBe('❌ Failed'))
})

describe('<BendleAdmin> song list', () => {
  const settle = () => act(async () => { await new Promise(r => setTimeout(r, 0)) })

  it('shows a Scrub toggle only for ready songs, and the saved start time', async () => {
    songsFixture = [
      { id: 'bnd_1', title: 'Hey Jude', status: 'ready', artist: 'The Beatles',
        drums_url: 'd.mp3', bass_url: 'b.mp3', other_url: 'o.mp3', start_offset_seconds: 42 },
      { id: 'bnd_2', title: 'Yesterday', status: 'processing', artist: 'The Beatles',
        drums_url: null, bass_url: null, other_url: null, start_offset_seconds: 0 },
    ]
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => { root.render(<BendleAdmin onClose={() => {}} />) })
    await settle()

    expect(container.textContent).toContain('Starts at 0:42')
    const scrubButtons = [...container.querySelectorAll('button')].filter(b => b.textContent.includes('Scrub'))
    expect(scrubButtons).toHaveLength(1) // only the ready song gets one

    act(() => root.unmount())
    container.remove()
  })
})
```

No separate `import React` line is needed for the JSX in the second `describe` block — this repo's Vite/Vitest config auto-injects the JSX runtime, confirmed by every other `.test.jsx` file in this codebase using JSX with no React import.

- [ ] **Step 5: Run the tests**

Run: `npm run test:unit -- BendleAdmin`
Expected: all PASS, including pre-existing tests (adjusted fixtures aside, no existing behavior changes).

- [ ] **Step 6: Commit**

```bash
git add client/src/components/host/BendleAdmin.jsx client/src/components/host/BendleAdmin.test.jsx
git commit -m "feat(bendle): surface the start-offset scrubber in BendleAdmin"
```

---

## Self-Review Notes (for the controller, not a task)

- Spec coverage: start-offset column (Task 1), offset applied to playback with clamping (Task 3), vocals removed from in-round tiers + played at reveal (Task 2 + Task 3), scrubber UI with the 3-stem envelope graph the host asked for (Task 4), wired into the existing admin panel (Task 5). Nothing from the discussion is unaddressed.
- No placeholders: every step above has real, complete code.
- Type/name consistency checked: `ROUND_LENGTH_SECONDS` and `clampBendleOffset` are defined once (Task 2) and only ever imported elsewhere; `formatOffsetTime` is defined once (Task 4) and only ever imported (Task 5); `SONG_LIST_COLUMNS` is defined once and reused four times in the same file.
- Deliberately out of scope (per Ben, keep this bounded): no auto-detected "suggested" start point — the envelope graph is the whole assist, the host's eye does the rest, per Fable's critique of the earlier auto-detection idea. No changes to the worker. No YouTube-embed anything.
- Post-critique fixes (Fable's second pass, on this plan's actual diffs against the real files): the round-playing effect now only fetches drums/bass/other (never vocals — it was never scheduled anyway, so loading it was a wasted download); both the round and reveal effects compute ONE shared offset from the shortest loaded stem's buffer, applied to every stem, instead of clamping each stem independently (independent clamping risked stems starting at different offsets and drifting out of sync if their encoded lengths ever differ); the reveal effect loads its stems in parallel (`Promise.all`) instead of one at a time, since by the time reveal renders the round is already over and a slow serial load would be an audible dead gap before the payoff; Task 5's test-file step now gives the actual replacement file (the real `BendleAdmin.test.jsx` had no render harness at all to "adapt") instead of hand-waving; the range-input test uses the native-setter workaround inline rather than as a maybe-needed footnote; `webkitAudioContext` fallback dropped (dead weight on the actual deployment target); the scrubber's analysis loop now decodes-and-measures one stem at a time instead of holding all three decoded buffers in memory simultaneously.
