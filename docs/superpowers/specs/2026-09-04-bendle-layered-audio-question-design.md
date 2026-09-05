# Bendle (Layered Audio Reveal Question) — Design

Date: 2026-09-04
Status: design approved by Ben in chat, writing this doc to formalize before planning.

## Goal

A new shiny question format, **Bendle** (Ben + Bandle — Bandle is a Wordle-style
daily game that reveals a song from layered instrument stems). A song plays on
`/display` starting with drums only; bass, then "other" (guitar/piano/everything
non-drum/bass/vocal), then vocals fade in over the round. Teams guess the song on
their phone at any point — the earlier the correct guess, the more points, since
fewer layers is a harder guess. Mirrors the two live mechanics Ben has responded
to well this session: **wagering/tiered risk** (`ShinyWagerQuestion`) and **the
idea of finding a fact hidden in something familiar** — here the "fact" is the
song, hidden under fewer and fewer layers of obscuring instrumentation.

Explicitly rejected during brainstorming (don't resurrect): showing all teams'
guesses on `/display` for a room-wide vote (breaks past ~8-10 teams, Baynes runs
20-30); opinion/vote-based scoring of any kind; per-instrument stem isolation
(harmonica/sax/etc. — Demucs only ever produces drums/bass/vocals/other, "other"
is the catch-all regardless of what's actually in the mix, and that's fine — the
mechanic reveals texture layers, not named instruments).

## Content pipeline (offline, NOT part of the live app)

Stem separation does not run in Trivia OS or on any server the app calls live.
It is a **local, one-time-per-song, off-show-night** step Ben runs on his own
machine:

1. `yt-dlp <youtube-url> -x --audio-format wav -o song.wav` — pull audio from a
   YouTube URL (Spotify is DRM-locked, not usable as a source).
2. `demucs song.wav` — free, open-source (Meta), splits into
   `drums.wav` / `bass.wav` / `other.wav` / `vocals.wav`. No API key, no cost,
   no network call once installed. Ben already has a Moises app subscription as
   a manual fallback if he'd rather not run Demucs locally for a given song.
3. Upload the 4 resulting files through a new admin panel in Trivia OS (below)
   — this is the ONLY point where Bendle content touches the live app.

Rejected: wiring stem separation into the app itself (Replicate/Music AI hosted
APIs, or a self-hosted Demucs worker). At Ben's realistic volume (a handful of
new songs a month, one operator), every automated path trades ~5 minutes of his
time per song for a second hosted service, async job/webhook plumbing, and a new
failure mode in a live-show app. Not worth it. `bendle_songs.source_url` (below)
exists so a hosted-separation path can be added later behind the same table
without touching the round type, if volume ever changes that calculus.

## Data model

Bendle is **not** a new top-level table for show content — it follows the
existing shiny-format pattern exactly (`shiny_formats` + `slide.data`), the same
way Wager/Matching/Order do. One new reference table for reusable song content,
since a song's 4 stems are prep work meant to be reused across shows (unlike a
one-off wager question's text):

```sql
create table public.bendle_songs (
  id           text primary key,   -- 'bnd_' + nanoid(8), generated client-side before insert —
                                    -- same convention as shiny_formats.id ('fmt_'+nanoid8) and
                                    -- shinyGroupId ('sgrp_'+nanoid8) in shinyWizardKinds.jsx, not a SQL default
  title        text not null,
  answer       text not null,       -- canonical answer, same free-text convention as questions.answer
  aliases      text[] not null default '{}',  -- alternate accepted spellings/titles
  source_url   text,                -- the YouTube URL it came from, for re-processing/attribution — not called live
  drums_url    text not null,
  bass_url     text not null,
  other_url    text not null,
  vocals_url   text not null,
  created_at   timestamptz not null default now()
);
-- RLS: SELECT public; INSERT/UPDATE/DELETE require host_verified JWT claim —
-- same pattern as shiny_formats/questions/scoreboard_teams (host-authored content).
```

Stem files themselves live in the existing `trivia-show-media` Storage bucket
(public read, anon insert — same precedent every other uploaded slide asset
uses; no new bucket needed).

A `shiny_formats` row gets created once via FormatLibrary ("✨ Add Shiny"),
`input_schema: { type: 'bendle', slots: 1 }` — a fixed-shape format, added to
`FIXED_SHAPE_KINDS` in `shinyWizardKinds.jsx` alongside `matching`/`wager`/`order`
(`hasOwnControls: false`, since picking a song is a single flat asset — no
count/relationship UI needed, same reasoning wager gets a free ride through the
generic wizard path once `slots` is pinned to 1).

Slide `data` shape, following `data.wagerXxx` naming convention exactly:

```
{
  ...standard slide fields (questionNumber, questionLabel, isShiny, shinyFormatId, etc.)
  bendleSongId:        string          -- FK into bendle_songs, resolved once at slide-build time
  text:                string          -- optional flavor text/hook, shown pre-reveal like wager's data.text
  answer:              string          -- copied from bendle_songs at build time (same "copy don't join" pattern questions_data uses)
  bendleTiers:          [{ id, label, atSeconds, points }]  -- default 4-tier ladder, editable per-slide like wager's fixed tiers are NOT editable but this is closer to grid's per-slide config
  bendleGuessesLocked:  boolean
  bendleRevealed:       boolean
  bendleResults:        [{ teamId, teamName, guess, correct, tierId, points }]  -- written at lock time, same shape family as data.wagerResults
}
```

Default tier ladder (Ben can retune later, not exposed in this build's UI beyond
the defaults — mirrors wager's fixed-not-configurable WAGER_TIERS). Points roughly
halve rather than step down evenly — an even step rewards waiting one more layer,
since a wrong guess costs nothing (2026-09-05 retune, see `bendleScoring.js`'s
comment for the full incentive math):

```js
export const BENDLE_TIERS = [
  { id: 'drums',  label: 'Drums Only',        atSeconds: 0,  points: 30 },
  { id: 'bass',   label: '+ Bass',            atSeconds: 20, points: 15 },
  { id: 'other',  label: '+ Everything Else', atSeconds: 40, points: 10 },
  { id: 'vocals', label: '+ Vocals',          atSeconds: 60, points: 5  },
]
```

## Phone side (`/join` — `BendleBoard.jsx`)

New component, same file location/shape as `WagerBoard.jsx`. One text input +
submit. Once submitted, locked (no changing your guess — matches Wager's "no
take-backs" model, not Matching's editable-until-lock model, since Bendle's
whole tension is "how early did you commit").

Writes to the existing `phone_answers` table (no new table) —
`{ show_id, slide_id, team_id, answer: { guess, submittedAtSlideOpenMs } }`.
`submittedAtSlideOpenMs` is the client's `Date.now() - slideOpenedAtMs`, sent
alongside the guess so tier resolution doesn't trust client clock drift for
anything but *relative* ordering within one round — server/host lock-time
scoring is authoritative, this field is a tiebreak/audit trail only. Team's
own row read back the same way Wager reads its own submission back (localStorage
`team_id`, same ownership model every `/join` write already uses).

RLS: reuse `phone_answers`' existing tightened-since-2026-08-17 policy (owning
team or host_verified can SELECT) — do not weaken it for Bendle. Live aggregate
count on `/display` (how many teams have guessed) goes through a new
`bendle_answer_counts(p_slide_id)` SECURITY DEFINER RPC, same shape as
`wager_answer_counts` — returns only a count, never individual guesses, before
lock.

## Playback (`/display` — `ShinyBendleQuestion.jsx`)

New dependency: **Tone.js** (MIT, `tonejs/tone.js` on npm — confirmed real via
Context7 against the live docs, not from memory). Not currently in
`package.json`; this is the first thing Trivia OS uses it for.

Four `Tone.Player`s (drums/bass/other/vocals), each `.sync().start(0)` to one
shared `Tone.Transport` — the exact pattern Tone.js's own `examples/daw.html`
demonstrates for multi-stem sync. Layer-in via `gain.rampTo(1, fadeSeconds)` at
each tier's `atSeconds`, starting from `gain.value = 0` for every stem but
drums.

Same four-beat shape as `ShinyWagerQuestion`:

1. **Ready** — song armed but not started. `Tone.loaded()` gates a "ready"
   state; `/display` shows a loading spinner if any stem is still decoding.
   `Tone.start()` (the audio-context unlock) fires on an earlier, low-stakes
   gesture — the host selecting/arming this slide in Host build/live nav, not
   the actual "start playing" press — so the context is already `running`
   by the time playback needs to begin. Baynes's `/display` runs on real
   desktop Chrome (confirmed with Ben) — none of Tone.js's known iOS Safari
   lock-screen/interruption issues apply.
2. **Playing** — Transport starts, progress bar + elapsed timer only, no song
   title, no per-team answers (this is the scale-safe design: nothing shown
   on `/display` depends on team count). `CountLine`-style "N of M teams
   guessed" reuses the exact pattern `ShinyWagerQuestion` already has.
3. **Locked** — host presses lock (same Stream Deck/hotkey pattern as
   Wager's guess-lock), same `AnswersLockedBadge` component Wager/Order reuse.
4. **Reveal** — song title + answer, then results list sorted by tier
   (earliest-correct first), same visual family as `WagerReveal` (gold winner
   rows, tier emoji, points column).

**Per-stem load failure**: each `Player`'s load wrapped with a timeout: if one
of the 4 stems fails/times out, skip that layer (never fade it in, never block
the other 3) rather than blocking `Tone.loaded()` indefinitely and hanging the
round on a live TV. Host build/upload flow should already prevent this in
practice (all 4 URLs required at upload time), so this is a live-show safety
net for a flaky asset load, not an expected path.

**Tier resolution at lock time**: for each `phone_answers` row on this slide,
fuzzy-match `answer.guess` against `bendleSongId`'s `answer` + `aliases`
(case-insensitive, trimmed — same bar `parseWagerNumber`-adjacent free-text
matching in this codebase already clears; no fuzzy-distance library needed,
exact-after-normalize is enough given aliases cover the real variants). Tier
awarded is whichever `bendleTiers[]` entry was active at
`submitted_at - slideOpenedAt` (server `submitted_at` timestamp, not the
client-reported field, which stays advisory).

## Scoring lib: `bendleScoring.js`

New file, sibling to `wagerScoring.js`, same conventions:

- `matchesBendleAnswer(guess, answer, aliases)` — pure, normalize-and-compare.
- `resolveBendleTier(elapsedSeconds, tiers)` — pure, walks `bendleTiers` and
  returns the tier active at that elapsed time (last tier whose `atSeconds <=`
  elapsed).
- `scoreBendleRound({ entries, song })` — mirrors `scoreWagerRound`'s shape:
  takes `phone_answers` rows + the resolved song, returns
  `[{ teamId, teamName, guess, correct, tierId, points }]`.
- `computeBendleScoreUpdates({ results, teams, scoreboardTeams, roundKey, slideId })`
  — same fold-in contract as `computeWagerScoreUpdates`, writes into
  `scores[roundKey].phone[slideId]`, dedupes by scoreboard team id the same way.

Full unit test coverage on all four pure functions before any UI work, per this
repo's TDD norm (`wagerScoring.test.js` is the template — tier-boundary edge
cases, alias matching, empty/no-answer teams, tie handling).

## Host build flow

1. **One-time**: create the `bendle_songs` content via a new admin panel (`/questions`
   area or a new `/bendle` panel — small upload form, 4 file inputs + title/answer/
   aliases, writes to `bendle_songs` + `trivia-show-media`). Launch set: ~15-20
   hand-picked songs, not a full jukebox-library migration — cheap to grow later.
2. **Per-show**: host picks "Bendle" from Add Shiny (same `FormatLibrary`-created
   format every other shiny type uses) in `AddSlideWizard`, picks a song from
   `bendle_songs` (searchable list, same UX weight as picking a jukebox track),
   optional flavor text — creates one `question`-type slide with `shinyFormatName:
   'Bendle'`.
3. **Live**: host arms the slide (triggers `Tone.start()` + preload), waits for
   ready state, presses start, watches the "N of M guessed" counter, locks
   guesses when ready, presses reveal.

## Testing

- `bendleScoring.test.js` — pure-function unit tests, written first (TDD).
- Component test for `ShinyBendleQuestion`'s beat transitions, following
  `ShinyTitleSlide.test.jsx`'s pattern.
- Live `/display` verification on a real show/slide before calling this done —
  standing Trivia OS rule (no claiming "shipped" off test-suite green alone).

## Explicitly out of scope for this build

- Auto stem separation wired into the app (Replicate/Music AI) — `source_url`
  column is the only hook left for a future add.
- A standalone "Bendle Daily" companion page (was floated during brainstorming
  as a separate track, not part of this live-round build).
- Per-slide editable tier timing/points in the host UI — ships with the
  `BENDLE_TIERS` default only; making it editable is a follow-up if the
  defaults don't hold up live.
