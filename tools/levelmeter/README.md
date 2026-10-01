# Jukebox level pass

`level-pass.mjs` is a local, resumable helper. It writes only a results JSON file you choose. It never connects to Supabase. The runner accepts a measurement function so tests can use fixed measurements; the optional macOS recorder function is available only when you explicitly pass `--measure-levelmeter`.

## Build LevelMeter.app

From the repository root, compile the recorder source, put the existing `Info.plist` in the app bundle, then ad-hoc sign it:

```sh
mkdir -p tools/levelmeter/LevelMeter.app/Contents/MacOS
swiftc tools/levelmeter/main.swift -o tools/levelmeter/LevelMeter.app/Contents/MacOS/LevelMeter
cp tools/levelmeter/Info.plist tools/levelmeter/LevelMeter.app/Contents/Info.plist
codesign --force --sign - --identifier local.baynes.levelmeter tools/levelmeter/LevelMeter.app
```

macOS must already have granted the app audio-capture permission. The recorder captures the audio currently playing from Chrome. This Round 1 tool does not drive the jukebox page to select or play songs; that playback handoff is Round 2. For that reason, only use the measuring flag when the requested song is already playing through the normal Chrome jukebox route.

## Prepare and run

The songs file is a JSON array of objects with `songId`, `title`, `uri`, and `startMs`. Results are saved locally and the next run skips song IDs already present. Since Round 1 does not drive song playback, make a one-song JSON file for each explicit capture, start that song in the jukebox, and use the same results path each time:

```sh
node tools/levelmeter/level-pass.mjs one-song.json results.json --measure-levelmeter
```

The command accepts exactly one song when `--measure-levelmeter` is present, to avoid accidentally measuring the same active Chrome audio for a full list. The recorder measures 25 seconds by default, then ffmpeg calculates integrated LUFS. It checks macOS output volume before and after each capture and stops if it changes. Do not change system volume during measurement.

Print the proposed target and per-song before/after gain table from saved results without measuring or writing:

```sh
node tools/levelmeter/level-pass.mjs songs.json results.json --dry-run
```

The library backup helper is exported as `backupJukeboxState(rows, path)`. It writes the provided snapshot and creation timestamp to the local path supplied by the caller. It is not called by the measurement command and does not read from any database.
