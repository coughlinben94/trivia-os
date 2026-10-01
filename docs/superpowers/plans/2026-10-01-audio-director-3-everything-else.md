# Audio Director 3: Every Other Sound on /display

> **STATUS 2026-10-01: BUILT** on `feat/audio-director` (tasks 1-9 below, with the changes noted under "As built"). Unit tests with fakes plus real-Chromium e2e for race, rules and team intro. YouTube walkouts are unit-tested only.

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox syntax. Build test-first, mutation-check, run the real-Chromium e2e, get an independent review before anything ships. Plans 1-2 are the base (`client/src/audio/director.js`, `useClipPlayback.js`).

**Goal:** Every sound /display makes (walkout songs, team-intro theme, rules alert, last-call bell, winner drum roll, race sounds) goes through the audio director, so the tab has ONE AudioContext, ONE unlock state, ONE "Click for sound" cue and ONE Sentry trail. Delete the per-slide `new Audio` / `new AudioContext` / YouTube-claim code.

**Architecture:** Slides describe a clip and call the hook or director; the director owns elements, the shared context, YouTube players, fades, loops and reporting. Small additions to the director (below), each test-first. Visible-iframe video (CustomSlide, ShinyVideoQuestion) and the jukebox (Spotify) stay OUT: they are not audio-only playback.

**Tech Stack:** React 18, vitest (+jsdom), Web Audio, YouTube IFrame API via `lib/youtubeWarmAudio.js`, Playwright (real Chromium, local vite on a private port).

**Base:** Plans 1-2 plus the critic round (2026-10-01): files preload via `warm`, a buffering file is not "sounding", a dead clip FAILS (own Sentry event, no cue), an unheard end is reported, unused API deleted (pause/resume, stopSlide, setPreview, snapshot.playing). Main also gained the host timer chime (`lib/timerChime.js`, `TimerOverlay.jsx`), another synth on its own context: it joins Task 6 and `reportBlocked` in `lib/audioBlocked.js` is deleted with it.

**Spec:** docs/superpowers/specs/2026-09-29-audio-pipeline-design.md. Inventory of the old paths: PreShowSlide, StateOfUnionSlide (YouTube walkouts), TeamPickerSlide (16-min file), RulesSlide (beeps + PSA), LastCallSlide (synth bell), WinnerRevealSlide (drum roll), RaceSlide (3 clips).

## Global Constraints
- No behavior change a host or room would notice, except what is listed under "Deliberate changes".
- Preview panes (`isPreview`) never play on their own; an explicit host press still can where it does today.
- The director never throws into the show; every slide keeps its own "reveal anyway" watchdog where one exists today (Rules 12 s, Winner 8 s).
- A sound's slide leaving the screen stops its sound (director `release`).
- Mutation-check every new director behavior and every slide migration; gate on exit codes, never on grep.

## Deliberate changes (tell Ben)
1. Walkouts, Rules, Last Call, Winner, Race now show the shared "Click for sound" cue if the tab is locked (they used to fail silently).
2. Leaving Winner / Race while their sound plays now cuts it (before: the clip played out over the next slide).
3. One AudioContext in the tab (before: Rules and Last Call each built throwaway ones, TeamPicker its own).

## Director additions (Task 1-3), exact contract
- `handle.setLevel(x, rampMs = 0)`: animated 0..1 multiplier (fades, ducks). File clip: a dedicated `level` GainNode after the static gain node (so a late loudness analysis never jumps a fade). YouTube: `setVolume(round(clip.volume * x))` stepped every 50 ms. No context: `el.volume`.
- `handle.setGainDb(db)`: static loudness correction applied after the fact (TeamPicker analyses a 16-min file while it is already fading in).
- `handle.onBlocked(cb)`: fires on each transition into blocked (Winner reveals 2 s later if its drum roll is refused).
- Clip fields, YouTube: `outPoint` (seconds; default = duration once known), `onOut: 'end' | 'fade' | 'loop'`, `fadeMs`. The director polls the player every 250 ms (the old walkout cadence): at `outPoint`, `loop` seeks to `start`, `fade` ramps to 0 over `fadeMs` then pauses and ends the handle, `end` is today's behavior. A walkout clip is built WITHOUT the player's own `end` so the pool key stays `videoId:start:`.
- Clip fields, file: `loopTo` (seconds): on `ended`, seek to `loopTo` and play again instead of ending (TeamPicker's safety-net loop; native `loop` would restart at 0:00).
- `director.getContext()` already exists: Rules beeps and the Last Call synth schedule on the shared context instead of `new AudioContext()`. `director.unlock()` is called by the gesture handler already.

## Tasks (ordered lowest-risk first)

### Task 1: `setLevel`, `setGainDb`, `onBlocked`, `loopTo` (director)
Files: `client/src/audio/director.js`, `director.test.js`, `director.fakes.js`.
- [ ] Failing tests: level ramp calls `linearRampToValueAtTime` on the level node (fake gain needs `linearRampToValueAtTime`, `cancelScheduledValues`); level and static gain multiply and do not interfere; `setGainDb` mid-ramp does not move the level; no-context fallback sets `el.volume`; `onBlocked` fires once per transition and not for a late-ok clip; `loopTo` seeks and replays on `ended`, `stop()` ends it for good.
- [ ] Implement; mutation-check each behavior; commit.

### Task 2: YouTube `outPoint` / `onOut` / `fadeMs` (director)
- [ ] Failing tests: `loop` seeks to `start` at `outPoint`; `fade` ramps then pauses and ends; untrimmed (duration 0) never loops or fades early (the 250 ms-restart bug the old code comments describe); `getPlayerState` -1/5/2 while playing retries `playVideo` (cold-tab self-heal); key matches `warm(videoId, start)` with no `end`.
- [ ] Implement; mutation-check; commit.

### Task 3: hook support for effects (no new hook)
- [ ] `useClipPlayback` already covers one clip per slide. For slides needing several (Race: bell + loop + horn) use `director.play(...)` directly in the effect and `handle.release()` in cleanup. Add a small `useDirectorClips()` only if two slides repeat the same cleanup code (YAGNI until then).

### Task 4: RaceSlide (3 clips, no gating)
- [ ] Bell (gainDb = 20*log10(0.7)), crowd loop (`loop: true`, 0.32), finish horn (0.75) through `director.play`; release loop on finish and on unmount; reduced-motion and mid-race mount stay silent exactly as today.
- [ ] Update RaceSlide tests; real-Chromium e2e: start a race, bell element appears, finish plays horn; leaving the slide leaves no audio element.

### Task 5: WinnerRevealSlide (drum roll)
- [ ] `/drum-roll.mp3` through the director; `handle.onEnded` -> reveal; `handle.onBlocked` -> reveal after 2 s; keep the 8 s stall watchdog; release on unmount.
- [ ] Tests for all three outcomes (ended, blocked, stalled); e2e with a refused play (reuse the cue spec's refusal simulation).

### Task 6: LastCallSlide (synth bell), host timer chime, RulesSlide (beeps + PSA)
- [ ] `lib/timerChime.js` (host timer, built on main 2026-10-01) moves onto the shared context; `TimerOverlay` reports through the director's blocked path; then delete `reportBlocked` and its tests from `lib/audioBlocked.js`.
- [ ] All three use `director.getContext()` (no `new AudioContext`), schedule on it, and skip when it is null. Rules PSA becomes a file clip with `gainDb` from `loadGainDb`; `onEnded` drives the reveal; keep the 12 s watchdog.
- [ ] Beep scheduling stays on the audio clock (the 2026-08-18 "staggered" fix): the sources are scheduled on the shared context.
- [ ] Tests keep the existing assertions (sequence order, reveal on real end, watchdog); add: no second AudioContext constructed.

### Task 7: PreShowSlide and StateOfUnionSlide walkouts
- [ ] PreShow: `{kind:'youtube', videoId, start, volume, outPoint: end, onOut: 'fade', fadeMs: 2500}`, held until `invoked` when `trigger === 'invoke'`; StateOfUnion: `volume: round(75 * vol / 100)`, `onOut: 'loop'`. Replace the 250 ms poll and the manual fade loops; render `AudioBlockedCue`.
- [ ] Display.jsx warm effect: `director.warm(walkoutClip)` replaces `warmYoutubeAudio` for walkouts.
- [ ] Tests: fade starts 2.5 s before the out-point; loop seeks; hold-until-invoked silent on mount, plays after `invoked`; unmount stops. Real-Chromium e2e cannot play YouTube headlessly: cover with fakes plus the manual rehearsal item below.

### Task 8: TeamPickerSlide (16-min file, fades)
- [ ] File clip `{url, start: 181, loopTo: 181}`; delayed start timer kept; fade-in via `setLevel(1, FADE_IN_MS)` from level 0, fade-out `setLevel(0, REVEAL_S*1000)` then stop; back-out `setLevel(1)`; mid-roll remount resumes at `181 + currentPart * HOLD` at full level; `getTeamIntroGainDb().then(handle.setGainDb)`.
- [ ] Tests: each of the five behaviors above; e2e with a throwaway team-picker slide checks one element, start offset applied, fade ends paused.

### Task 9: delete dead code, final gate
- [ ] Delete per-slide `claimYoutubeAudio`/`warmYoutubeAudio` imports, `new Audio`, `new AudioContext`, manual volume loops. `grep` for each must return only `audio/director.js`, `lib/youtubeWarmAudio.js` and host editors.
- [ ] Full suite (exit code), build, all audio e2e, SKILL.md "Audio" section rewritten (one director, how to add a sound), spec status updated, memory note.

## Open from the critic (decide while building)
- Warm part N+1 of a series while part N plays (every later part starts cold today; main did too).
- Warmed-but-unplayed `<audio>` elements stay in the DOM (cap 4, oldest evicted); e2e helpers must prefer the sounding one.
- YouTube load errors (101/150 embedding disabled, removed video): the pool has no `onError` hook, so they end as "not-sounding". Add an error callback in `youtubeWarmAudio.js` and route it to `ctl.fail`. Unverified in a real player.
- Safari context state `interrupted` is read as sounding by `mediaIsSounding` (unverified).
- First real-browser YouTube test: default autoplay policy, never-clicked tab, real clip, then one click; assert `getPlayerState()===1 && !isMuted()` within 2 s; repeat under 6x CPU throttle.

## Not covered
Visible-iframe video slides, jukebox/Spotify, relay, host-side previews (YoutubeClipEditor, BendleOffsetScrubber, MediaUpload keep their own players). Needs a real TV: YouTube walkouts, Safari, a never-clicked tab, loudness by ear.

## As built (differences from the plan above)
- `lib/walkoutAudio.js` (not `walkoutClip.js`, which already holds the host editor's `mergeWalkoutClip`): `walkoutClip(song, onOut, volumeFactor)`.
- `director.audioContext({ label, waitMs })` is the synth-sound entry (last-call bell, rules beeps, host timer chime; chime keeps main's 1.5 s resume wait). A locked tab skips the sound and reports once per label.
- Rules: a locked tab reveals at once instead of strobing silent for the 12 s watchdog; `playAlertSequence`/`stopAlertSequence` are exported and unit-tested.
- Team intro: `audio/useTeamIntroAudio.js` (hook, fully unit-tested with a fake director) instead of inline slide code; `useClipPlayback.play(opts)` accepts `{ level }`.
- Race: no cue (decorative sounds; the director still reports). Winner: `playDrumRoll` exported; a refused/dead roll reveals after 2 s and the clip is released.
- Display's throwaway "prime" AudioContext and `analyzeAudioGain`'s own context are gone (OfflineAudioContext decode).
- Deleted: `reportBlocked`, per-slide `new Audio`/`new AudioContext`/YouTube claims on /display.
- e2e: `e2e/audio-slides.spec.js` runs against a production build (StrictMode double-effect cancels the Rules alert under the dev server, same as before this work).
