# Audio pipeline rebuild — design

Status: DRAFT for Ben's review, 2026-09-29. Next show: week of 2026-10-06.

## Status update, 2026-10-01 (late): the director is BUILT, not yet shipped

Branch `feat/audio-director` (unpushed at time of writing) implements this spec in three plans
(`docs/superpowers/plans/2026-10-01-audio-director-{1-foundation,2-questions,3-everything-else}.md`):
one `audio/director.js` owns every /display sound (question clips, walkouts, team intro, rules,
last-call bell, host timer chime, winner drum roll, race), `lib/slideClip.js` is the one "what clip
does this slide have" function, and failure is loud (blocked -> cue + Sentry, failed -> Sentry, ends
unheard -> Sentry). Four independent reviews found and fixed real bugs along the way. NOT done from
this spec: Display owning a single mark-reading trigger effect (both mark effects still live in
QuestionSlide), `audioPlayPending` calling `resolveSlideClip` (an agreement test pins them instead),
Bendle played through `director.play`, the Safari run, a 6x-CPU-throttle run, and a real-YouTube
Playwright test. Everything below this note is the original draft; where it disagrees, the plans win.

## Earlier status update, 2026-10-01

Shipped since this draft (main, PR #7 merge `f8e3468`, Bendle commit `e8c93fe`): Bendle-only fix for the
2026-09-22 stall. Range-loads only the played ~30 s of each stem, starts once
when the beat is ready AND the host pressed Next, aborts/retries fetches, and
reports slow loads and a suspended audio context to Sentry (`area:audio`).

This covers Bendle only. Not yet done, and still as described below:
- No `client/src/audio/director.js`, no `lib/slideClip.js`. All stages open.
- Plain and shiny YouTube clips (the 2026-09-29 failure) are untouched.
- Candidate causes 1-3 under Problem are still unproven for YouTube.
- Stage 2's Bendle item shrinks: Bendle already has start-once and Sentry
  reporting. Stage 2 only moves it onto the shared director and context.

Next show: week of 2026-10-06. Before then, the cheapest YouTube change is
the "failure is loud" part alone: breadcrumbs plus the locked-audio cue, with
no director refactor. Decision needed: ship that first, or go straight to
stage 1.

Plan 1 of 3 (foundation: `audio/director.js` + `lib/slideClip.js`, no slide changed)
is built on branch `feat/audio-director` (2026-10-01). Plan 2 moves the question
clips and the Next triggers onto it; Plan 3 moves everything else and deletes dead
code. Plan: `docs/superpowers/plans/2026-10-01-audio-director-1-foundation.md`.

## Problem

Tonight (2026-09-29) round 1: Next presses did not start sound, on both plain
and shiny YouTube clips. Sentry had no signal. Cause not proven; three
candidates, all in code every clip shares:

1. Chrome blocks the programmatic unmute if the /display tab got no click
   since load. Silent, no error.
2. `youtubeWarmAudio.js` gives up after 1.5s (`CLAIM_READY_TIMEOUT_MS`) and
   rebuilds cold. A starved laptop hits that easily; the rebuilt player then
   hits candidate 1.
3. The Next press (`shows.audio_playing` through Supabase) arrives late or never.

Root design fault: sound is played by ~12 separate code paths, none of which
report failure.

## Inventory today (client/src)

| Path | Files | Trigger |
|---|---|---|
| YouTube warm/claim player | `lib/youtubeWarmAudio.js`; used by `PreShowSlide`, `StateOfUnionSlide`, `QuestionSlide` (x2 copies: plain `QuestionAudio`, shiny `ShinyAudioQuestion`), `Display.jsx` | mount, `audio_playing`, on-screen button |
| Uploaded file + gain graph | `QuestionSlide` (own `AudioContext` per clip), `TeamPickerSlide` | same |
| Short effects | `RulesSlide`, `LastCallSlide`, `WinnerRevealSlide` (`/drum-roll.mp3`), `RaceSlide` (3 x `new Audio`) | slide mount / phase |
| Bendle stems | `ShinyBendleQuestion` (Tone.js, own transport) | `audio_playing` |
| Trigger writer | `LiveMode.jsx` `audioPlayPending()`, `useShow.js` `setAudioPlaying`, `withAudioReset` | host Next press |
| Trigger readers | `QuestionSlide` (2), `ShinyBendleQuestion`, `Display.jsx` | `show.audio_playing` |
| Host-only laptop sounds | `relay/` | out of scope, stays as is |

## Design

One module, `client/src/audio/director.js`, owns all playback on /display.
Slides describe a clip and never touch `AudioContext`, `Audio`, `YT.Player`,
or `audio_playing`.

### Clip description (data, not code)

```
{ kind: 'youtube', videoId, start, end, volume }
{ kind: 'file',    url, gainDb, loop, start }
{ kind: 'effect',  url }            // short, decoded once, near-zero latency
{ kind: 'bendle',  songId, ... }    // Tone.js, on the shared context
```

`resolveSlideClip(slide)` (new, `lib/slideClip.js`) is the ONE function that
answers "what clip does this slide have and when does it start" —
`{ clip, trigger: 'advance' | 'click' | 'phase' } | null`. It replaces
`resolveShinyPart` audio fields, `hasAudio` checks, and `audioPlayPending()`'s
private copy of that logic in `LiveMode.jsx`. Host and display can no longer
disagree about whether a slide has sound.

### Director API

- `warm(clip)` — preload (YouTube muted-park, effect decode). Idempotent.
- `play(clip, { slideId }) -> handle` — `handle.stop()`, `handle.onEnded(cb)`.
- `status` — `'locked' | 'unlocked'`; `subscribe(cb)`.
- `unlock()` — resume the single shared `AudioContext`; called from the first
  real gesture (replaces `Display.jsx` `onFirstInteraction` priming).
- `setPreview(true)` — host preview pane: every call is a no-op.

One shared `AudioContext` for the whole tab (Tone is pointed at it with
`Tone.setContext`). Chrome's sticky activation then applies to everything at
once instead of per context.

### One trigger pipeline

Display.jsx owns a single effect: when `show.audio_playing` names the current
slide (or the slide's trigger is `advance`/`phase`), call
`director.play(resolveSlideClip(slide).clip)`. Slides stop reading
`audio_playing`. Host still writes it via `setAudioPlaying`; `withAudioReset`
stays.

### Failure is loud

Every director step logs a Sentry breadcrumb: `requested`, `ready(ms)`,
`started`, `blocked(reason)`, `timeout-rebuild`. Any `blocked` or
`timeout-rebuild` also sends a Sentry event tagged `area:audio` so a bad night
shows up in the issue list. The 1.5s claim timeout stays but is logged.

If a play is requested while `status === 'locked'`, /display shows a small
"Tap the TV for sound" cue; the tap unlocks and replays the pending clip.

## Stages (each its own commit, each revertable alone)

1. Director + `resolveSlideClip` + unit tests (fake YT player, fake
   `AudioContext`). No slide changed yet. Existing behavior untouched.
2. Question clips onto director: plain, shiny, Bendle. Delete
   `QuestionAudio`/`ShinyAudioQuestion` playback code and the
   `audio_playing` readers. `LiveMode.audioPlayPending` calls
   `resolveSlideClip`.
3. Everything else: Rules, Race, Team Picker, Last Call, Winner Reveal,
   Pre-show and State-of-Union walkout songs, CustomSlide, Display warm calls.
4. Delete dead code (`youtubeWarmAudio.js` internals move into the director).

## Testing (Ben's bar: red first, mutation check, real engine)

- Unit: director state machine — locked/unlocked, timeout rebuild, stale
  handle, preview no-op. Failing test written before each stage's fix.
- Mutation check: break the unlock gate and the timeout path, confirm tests fail.
- Playwright (bundled Chromium, never Ben's Chrome): mock show through all 11
  round-1 slides, assert `started` breadcrumb per clip; run with
  `Emulation.setCPUThrottlingRate` 6x and with no prior click.
- Real Safari via `safaridriver` for the unlock cue.
- Two independent reviews (Codex + a Claude review) before stage 2 and stage 3
  merge, since /display is first-paint-critical.
- Full rehearsal on Ben's laptop, on battery and plugged in, before the show.

## Risks / open items

- Tone.js version must support `Tone.setContext` on the shared context.
  Verify in stage 1 with Context7 before writing the call.
- Walkout-song "invoke" gating (reveal press plays the song) must survive
  unchanged; covered by the existing Display/PreShow tests.
- YouTube can still refuse on a network stall; the director can only report it.
- Not solved here: laptop on battery. Separate small item (host-page
  "on battery" banner), needs Ben's yes.

## Out of scope

`relay/` laptop sounds, Jukebox (Spotify), question content, any visual change.

## Findings recovered from the 2026-09-29/30 audit (claude-mem, 2026-10-01)

Source: claude-mem session summaries 7528/7529 and observations 30090-30189.
These are the audit's own claims, not re-verified today. Check each against
the code before building on it.

1. `/display` Next bypasses the audio gate. If a Stream Deck leaves the TV
   window focused, Right-Arrow advances audio slides with no sound. Strong
   candidate for the 9/29 failure (this is candidate 3 under Problem, but via
   a different path than a late Supabase update).
2. Multi-part audio plays only part 0 on Next. Parts 1..N need a manual TV
   PLAY click, though the design says Next plays audio. Video questions have
   no Next-plays-audio wiring at all.
3. Host and `/display` disagree on what Next does: host checks lock, reveal
   and audio gates; `/display` skips them all.
4. `shows.audio_playing` is sticky. Nothing clears it on slide navigation, so
   revisiting a shiny-audio slide autoplays again.
5. On the 9/29 show the audio was fully configured (YouTube IDs, trim points,
   gain) but every slide had `audioTrigger: null`. Check whether this is the
   normal setup path or a builder gap.
6. About 50 `.catch(() => {})` / empty `catch {}` blocks swallow failures
   across audio, storage, network and state. `ErrorBoundary` only
   `console.error`s, so Sentry sees nothing.
7. Audio code is spread over 9 slide components using four stacks (Web Audio,
   HTML5 Audio, Tone.js, YouTube warm player) with no shared error handling.

Not audio, but found in the same audit and not yet fixed or confirmed fixed:
- Final scores saved with no error check. Data loss confirmed on 2026-08-24
  and 2026-09-22 (empty `final_scores` with 23-30 teams).
- Slide list written by three sources, causing rewinds. Host realtime has no
  rejoin or refetch.
- Tied teams sort differently on TV and phone. Seven phone boards duplicate
  answer-save logic.
- A realtime `fx:` authorization migration is written but not applied.
- About 30 applied DB migrations are not in the repo; the PIN function is
  missing from the repo.

## Corrections from review of the first telemetry commit (2026-10-01)

- `CustomSlide` does NOT use `youtubeWarmAudio`; it plays through a plain
  `youtubeEmbedUrl` iframe (`CustomSlide.jsx:6,27`). That is a separate audio
  path the inventory missed, and it has no telemetry. Stage 3 must cover it.
- `loadYoutubeIframeApi()` (`YoutubeClipEditor.jsx:16-28`) never rejects in a
  browser: a blocked or stalled script just hangs. So the claim timeout, not a
  load error, is the real stall signal, and the cold rebuild reuses the same
  hung promise (it cannot succeed). Candidate 2 therefore has two outcomes:
  rebuilt player blocked by autoplay (candidate 1), OR rebuilt player never
  loads at all. `c8a260b` + its follow-up report both.
