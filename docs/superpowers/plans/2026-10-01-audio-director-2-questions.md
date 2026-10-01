# Audio Director 2: Question Clips Implementation Record

> Built inline (not via the task extractor), test-first with mutation checks, same day as Plan 1.

**Goal:** Plain, shiny and multi-part question audio, the "Click for sound" cue, and Bendle's Tone context all run on the audio director; nothing else in /display changes.

**Spec:** docs/superpowers/specs/2026-09-29-audio-pipeline-design.md. **Builds on:** docs/superpowers/plans/2026-10-01-audio-director-1-foundation.md.

## What changed after the Plan 1 review (director)
- Replaying a clip from an `onEnded` callback no longer loses the new handle (key freed before callbacks).
- YouTube end backstop starts when sound STARTS; `end <= start` means no end; a blocked or sub-2s clip is still reported.
- A late `play()` rejection cannot move a playing/paused clip to blocked.
- Cold YouTube load reports reason `not-ready` (slow load) vs `not-sounding` (policy).
- Sentry label for files is `(upload)`, as the old slide code filed it.
- Gesture handler calls `retryBlocked()` (unlock AND replay); Escape is ignored.
- New API: `handle.pause()/resume()`, `handle.release()`, `snapshot.playing`, `getContext()`, `stopSlide(id)`, `stopAll()`, `_internals.reset()` (test seam).
- `stop()` and natural end PARK the YouTube player (instant replay, no pool slot); `release()` destroys it; a stale handle cannot destroy a player a newer handle owns.
- File clips: `crossOrigin='anonymous'` when cross-origin (Supabase storage sends `access-control-allow-origin: *`), else Web Audio can output silence. Element is hidden but in the DOM, removed on stop.
- Trigger rule: a plain question autoplays only when `audioTrigger === 'advance'` exactly; `resolveSlideClip` and `audioPlayPending` now agree with the TV on odd values.

## Tasks
1. `client/src/audio/useClipPlayback.js` hook: warm at mount (not in preview), play/stop/toggle, release on clip change or unmount, `blocked` from the director snapshot, mount-only autoplay. 13 tests, 8 mutations killed.
2. `lib/slideClip.js` `clipFromPart(part, gainDb, partIdx)`; QuestionAudio and ShinyAudioQuestion rebuilt on the hook; mark effects stay keyed on VALUES (slideId, playing, part, at).
3. Deleted `useBlockedCue`, `watchPlayStart`, `reportBlocked` (the director owns the check, cue state and report).
4. `Display.jsx`: `director.installGestureUnlock(window)`; advance-clip warm goes through `director.warm(resolveSlideClip(...))`.
5. `ShinyBendleQuestion.jsx`: `Tone.setContext(director.getContext())` before any Tone node exists.
6. e2e (real Chromium, local vite): 14/14. Specs wait on slide text (the `<audio>` exists only after a play request). Cue spec flips its refusal simulation on `pointerdown` (Chrome's activation moment) and clicks with the raw mouse. Mutation-checked in a real browser: mark effect keyed on the object (test 10 fails), `retryBlocked` not retrying (reject-mode cue test fails), no release on part change (test 8 fails).

## Not covered (Plan 3 / needs a real TV)
Walkouts (fade, loop, duck), TeamPicker, Rules, LastCall, WinnerReveal, Race, visible-iframe video shinies, real YouTube clips, Safari, a never-clicked real TV tab.
