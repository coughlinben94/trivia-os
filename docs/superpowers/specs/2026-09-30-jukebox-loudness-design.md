# Jukebox loudness leveling — build brief

Status: READY TO BUILD, 2026-09-30. Branch `feat/jukebox-loudness` (worktree
`.claude/worktrees/jukebox-loudness`, cut from origin/main `d185210`). Do not
push, deploy, or write to the live database without the owner's explicit OK.

## Goal (owner: Ben, non-technical; "if I don't have to do anything I'm good")

Songs played by the jukebox (Spotify Web Playback SDK in Chrome on the show Mac,
`client/src/jukebox/`) come out at very different loudness (~8-12 dB spread).
Ben rides the Mac volume by hand while grading. Make every song play at about the
same level with NO ongoing effort from Ben.

## Verified facts (2026-09-30)

- Spotify web players/3rd-party devices do NOT normalize loudness. The SDK plays
  DRM audio in a cross-origin iframe: no Web Audio GainNode; the only control is
  `player.setVolume(0..1)`.
- Spotify audio-features/audio-analysis are blocked for dev-mode apps (2024-11-27).
  Apple Music web has no Sound Check either and FairPlay blocks Web Audio gain.
- The Spotify MAC APP normalizes by default (no `normalize` key in its prefs file),
  so measuring through it would read every song ~ -14 LUFS. Measure ONLY the route
  the show uses: the jukebox page in Chrome (real Chrome, Widevine).
- A driver-free recorder already works on this Mac: `tools/levelmeter/main.swift`
  (Core Audio process tap; built as `LevelMeter.app`, ad-hoc signed, bundle id
  `local.baynes.levelmeter`, Info.plist has NSAudioCaptureUsageDescription). It was
  verified to capture a test tone AND the jukebox playing in Chrome
  (`levelmeter google.chrome 8 <prefix>` -> `<prefix>.f32` raw float32 48 kHz stereo
  + `<prefix>.json`; run as `open -n -W --stdout f --stderr f LevelMeter.app --args
  google.chrome 8 <prefix>`). Loudness is computed with
  `ffmpeg -f f32le -ar 48000 -ac 2 -i x.f32 -af ebur128=peak=true -f null -`
  (integrated LUFS). Permission is already granted to LevelMeter.app.
- Songs live in `jukebox_state.sets.items[setId].songs[]` (JSON with startMs/stopMs/
  gradientOverride); the save path whitelists fields in TWO places in
  `Jukebox.jsx` (~lines 643 and 1068): add the new field to both or it is silently
  dropped. Master volume is `useState(0.8)` in `useSpotifyPlayer.js` (~line 129) with
  gen-guarded fades (~295-362, 496, 679, 698, 705, 743-747). Duck (relay) changes Mac
  system volume only; independent.

## Design

1. **Per-song `gainDb`** (number, default 0) stored with each song; pure helper
   `songGain(s) = 10 ** ((clamp(s.gainDb ?? 0, -8, +6)) / 20)` beside `hasTrim` in
   `client/src/jukebox/lib/track.js`. Effective SDK volume = `clamp01(master * gain)`,
   computed in ONE function (`eff()`), used by the monitor tick, fade-in, fadeAndPause,
   and setVolume. `playTrack` takes the gain and stores it in a ref right after the
   generation bump, before `setVolume(0)`. Never exceed 1.0 at the player. Volume 0
   stays 0. Do NOT blindly lower the master (SDK volume is not a calibrated dB scale);
   instead measure at a FIXED known master and choose offsets relative to a target so
   that the LOUDEST songs get negative offsets and quiet songs stay <= +6 dB, then
   verify clamp headroom (master 0.8 -> only ~+1.9 dB of boost exists, so the target
   must sit at the level of the quiet songs, pulling loud songs down).
2. **Target**: about -18 LUFS integrated (matches the question clips, ~ -17/-18),
   adjust so the quietest 10% of songs still need <= +1.9 dB at master 0.8 (or choose
   a master default and document it). Reject measurements with < 20 s of non-silent
   audio (nonZeroFrames ratio) or > 0 clipped frames from a silent capture; never write
   an offset beyond the clamp; keep a record of measured LUFS per song next to gainDb
   (`measuredLufs`, `measuredAt`) so results can be audited and re-derived.
3. **Measuring pass** (one-time, then lazy): the jukebox page itself plays each song
   from its trim start for ~25 s at a FIXED player volume (master forced to a known
   value, e.g. 0.8, restore after), while `LevelMeter.app` records Chrome; a small
   local runner (Node script under `tools/levelmeter/`) orchestrates: it tells the page
   which song to play (how: choose the simplest reliable channel that exists — e.g. the
   existing relay websocket to /display, or a `?levelpass=1` mode in the page that
   reads a queue — and explain the trade-off), waits, runs LevelMeter + ffmpeg, computes
   LUFS, and posts `{songId, lufs}` back. The page (not the runner) saves `gainDb`/
   `measuredLufs` through the normal save path so the whitelist and debounce apply.
   Output level of the Mac must be left alone during the pass; detect and abort if
   system volume changes mid-pass (read via `osascript -e 'output volume of (get volume
   settings)'`) and record the system volume in the results.
4. **Lazy leveling** for new songs: the same measurement runs automatically the first
   time a song plays at a real break if the recorder is available, else falls back to
   gain 0 (never blocks playback).
5. **Safety**: snapshot `jukebox_state` (a dated JSON backup file under the scratchpad/
   tools output, not in git) BEFORE any write; print a before/after diff summary; write
   nothing to the live DB without the owner's OK (the owner asked for hands-off, but a
   one-time "about to save 161 levels" confirmation is required). The pass must be
   resumable and idempotent. Tests first (see below).

## Tests (owner's bar: failing test first, mutation check, real engine)

- Unit: `songGain`/clamp; `eff()` composition; fade endpoints scale; gain 0 -> same as
  today; volume 0 handoff stays 0; superseded play uses the new gain; whitelist
  round-trips `gainDb`; measurement rejection rules; LUFS->offset math incl. clamps;
  resumability.
- Mutation checks: break the clamp, drop `gainDb` from one whitelist spot, scale only
  the fade-in and not the monitor tick: each must fail a test.
- Real engine: a verification script that plays 3 songs of different loudness at offsets
  0 and at the computed offsets through the real jukebox page in real Chrome (owner's
  normal Chrome session; do NOT launch a second Chrome on the owner's profile) and
  re-measures with LevelMeter: spread must drop from ~8-12 dB to <= 3 dB.
- Existing suites stay green: `npx vitest run jukebox`, then full `npx vitest run`
  from the worktree root (config root includes client/src/**). Check real exit codes.

## Out of scope

Question clips, Bendle, YouTube parts, relay Duck behavior, any visual change, any
push/deploy. Report anything noticed but not fixed.
