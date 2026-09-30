import { execFile as nodeExecFile } from 'node:child_process'
import { createReadStream } from 'node:fs'
import { promisify } from 'node:util'
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chooseTarget, offsetFromLufs, validateMeasurement } from '../../client/src/jukebox/lib/loudness.js'

const execFile = promisify(nodeExecFile)
const HERE = dirname(fileURLToPath(import.meta.url))

async function readResults(resultsPath) {
  try {
    const parsed = JSON.parse(await readFile(resultsPath, 'utf8'))
    return Array.isArray(parsed) ? parsed : (parsed.results ?? [])
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }
}

async function writeResults(resultsPath, results, targetLufs) {
  await mkdir(dirname(resolve(resultsPath)), { recursive: true })
  const tempPath = `${resultsPath}.tmp`
  await writeFile(tempPath, `${JSON.stringify({ targetLufs, results }, null, 2)}\n`)
  await rename(tempPath, resultsPath)
}

function printReport(songs, results, target, report) {
  const byId = new Map(results.map(row => [row.songId, row]))
  report(`Target: ${target.targetLufs.toFixed(1)} LUFS | Headroom: ${target.headroomDb.toFixed(1)} dB | Clipped quiet songs: ${target.clippedQuietCount}`)
  report('Song | Before LUFS | Gain dB | After LUFS')
  for (const song of songs) {
    const row = byId.get(song.songId)
    const after = row ? (row.measuredLufs + row.gainDb).toFixed(1) : '—'
    report(`${song.title} | ${row?.measuredLufs ?? 'not measured'} | ${row?.gainDb?.toFixed?.(1) ?? '—'} | ${after}`)
  }
}

export async function runLevelPass({
  songs,
  resultsPath,
  measure,
  masterVolume = 0.8,
  dryRun = false,
  report = console.log,
  now = () => new Date(),
}) {
  if (!Array.isArray(songs)) throw new TypeError('songs must be an array')
  const existing = await readResults(resultsPath)
  const byId = new Map(existing.map(row => [row.songId, row]))
  let baselineSystemVolume = existing.find(row => Number.isFinite(row.systemVolume))?.systemVolume

  if (!dryRun) {
    if (typeof measure !== 'function') throw new TypeError('measure(song) is required unless dryRun is true')
    for (const song of songs) {
      if (byId.has(song.songId)) continue
      const measurement = await measure(song)
      if (!Number.isFinite(measurement.systemVolume)) {
        throw new Error(`System volume unavailable for ${song.songId}; pass aborted`)
      }
      if (baselineSystemVolume != null && measurement.systemVolume !== baselineSystemVolume) {
        throw new Error(`System volume changed between measurements (${baselineSystemVolume} to ${measurement.systemVolume}); pass aborted`)
      }
      baselineSystemVolume ??= measurement.systemVolume
      const validation = validateMeasurement(measurement)
      if (!validation.ok) throw new Error(`Rejected ${song.songId}: ${validation.reason}`)
      byId.set(song.songId, {
        songId: song.songId,
        title: song.title,
        uri: song.uri,
        startMs: song.startMs,
        frames: measurement.frames,
        nonZeroFrames: measurement.nonZeroFrames,
        sampleRate: measurement.sampleRate,
        peak: measurement.peak,
        measuredLufs: measurement.lufs,
        measuredAt: now().toISOString(),
        systemVolume: measurement.systemVolume,
      })
      await writeResults(resultsPath, [...byId.values()], null)
    }
  }

  const measurements = [...byId.values()].filter(row => Number.isFinite(row?.measuredLufs))
  const target = chooseTarget(measurements.map(row => row.measuredLufs), { masterVolume })
  const results = [...byId.values()].map(row => ({
    ...row,
    gainDb: offsetFromLufs(row.measuredLufs, target.targetLufs),
  }))
  printReport(songs, results, target, report)
  if (!dryRun) await writeResults(resultsPath, results, target.targetLufs)
  return { results, target }
}

export async function measureWithLevelMeter(song, {
  durationSeconds = 25,
  appPath = process.env.LEVELMETER_APP ?? join(HERE, 'LevelMeter.app'),
  tempDir = tmpdir(),
} = {}) {
  const prefix = join(tempDir, `levelmeter-${Date.now()}-${basename(song.songId)}`)
  const startingSystemVolume = await readSystemVolume()
  await execFile('open', ['-n', '-W', '--stdout', '/dev/null', '--stderr', '/dev/null', appPath, '--args', 'google.chrome', String(durationSeconds), prefix])
  const rawPath = `${prefix}.f32`
  const { stderr = '', stdout = '' } = await execFile('ffmpeg', [
    '-hide_banner', '-f', 'f32le', '-ar', '48000', '-ac', '2', '-i', rawPath,
    '-af', 'ebur128=peak=true', '-f', 'null', '-'
  ], { maxBuffer: 4 * 1024 * 1024 })
  const output = `${stdout}\n${stderr}`
  const lufsMatch = output.match(/I:\s*(-?\d+(?:\.\d+)?)\s+LUFS/)
  const peakMatch = output.match(/Peak:\s*(-?\d+(?:\.\d+)?)\s+dBFS/)
  if (!lufsMatch) throw new Error(`ffmpeg did not report integrated LUFS for ${song.songId}`)
  const bytes = (await stat(rawPath)).size
  const frames = Math.floor(bytes / 8)
  const nonZeroFrames = await countNonZeroFrames(rawPath)
  const endingSystemVolume = await readSystemVolume()
  if (startingSystemVolume !== endingSystemVolume) {
    throw new Error(`System volume changed during measurement (${startingSystemVolume} to ${endingSystemVolume})`)
  }
  return {
    frames,
    nonZeroFrames,
    sampleRate: 48000,
    peak: peakMatch ? 10 ** (Number(peakMatch[1]) / 20) : null,
    lufs: Number(lufsMatch[1]),
    systemVolume: startingSystemVolume,
  }
}

async function countNonZeroFrames(path) {
  let remainder = Buffer.alloc(0)
  let count = 0
  for await (const chunk of createReadStream(path)) {
    const data = remainder.length ? Buffer.concat([remainder, chunk]) : chunk
    const completeBytes = data.length - data.length % 8
    for (let offset = 0; offset < completeBytes; offset += 8) {
      if (data.readFloatLE(offset) !== 0 || data.readFloatLE(offset + 4) !== 0) count += 1
    }
    remainder = data.subarray(completeBytes)
  }
  return count
}

async function readSystemVolume() {
  const { stdout } = await execFile('osascript', ['-e', 'output volume of (get volume settings)'])
  const volume = Number(stdout.trim())
  if (!Number.isFinite(volume)) throw new Error('Could not read macOS output volume')
  return volume
}

export async function backupJukeboxState(rows, path) {
  if (!path) throw new TypeError('A local backup path is required')
  await mkdir(dirname(resolve(path)), { recursive: true })
  const snapshot = { createdAt: new Date().toISOString(), rows }
  await writeFile(path, `${JSON.stringify(snapshot, null, 2)}\n`)
  return path
}

async function main(args) {
  const [songsPath, resultsPath, ...flags] = args
  if (!songsPath || !resultsPath) {
    throw new Error('Usage: node tools/levelmeter/level-pass.mjs <songs.json> <results.json> [--dry-run] [--measure-levelmeter]')
  }
  const songs = JSON.parse(await readFile(songsPath, 'utf8'))
  const dryRun = flags.includes('--dry-run')
  const useLevelMeter = flags.includes('--measure-levelmeter')
  if (useLevelMeter && songs.length !== 1) {
    throw new Error('--measure-levelmeter accepts one song at a time; this Round 1 tool does not drive song playback')
  }
  const measure = useLevelMeter ? song => measureWithLevelMeter(song) : undefined
  await runLevelPass({ songs, resultsPath, measure, dryRun })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => {
    console.error(error.message)
    process.exitCode = 1
  })
}
