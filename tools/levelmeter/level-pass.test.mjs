import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runLevelPass, backupJukeboxState } from './level-pass.mjs'

let dir
const songs = [
  { songId: 'one', title: 'One', uri: 'spotify:track:one', startMs: 0 },
  { songId: 'two', title: 'Two', uri: 'spotify:track:two', startMs: 1000 },
]
const result = (lufs, systemVolume = 50) => ({ frames: 1_200_000, nonZeroFrames: 1_100_000, sampleRate: 48000, peak: 0.8, lufs, systemVolume })

afterEach(async () => { if (dir) await rm(dir, { recursive: true, force: true }); dir = null })

async function setup() {
  dir = await mkdtemp(join(tmpdir(), 'level-pass-'))
  return { resultsPath: join(dir, 'results.json'), report: vi.fn() }
}

describe('runLevelPass', () => {
  it('resumes existing results and is idempotent', async () => {
    const { resultsPath } = await setup()
    await runLevelPass({ songs, resultsPath, measure: vi.fn(async () => result(-18)) })
    const measure = vi.fn(async () => result(-20))
    const a = await runLevelPass({ songs, resultsPath, measure })
    const b = await runLevelPass({ songs, resultsPath, measure })
    expect(measure).not.toHaveBeenCalled()
    expect(a.results).toEqual(b.results)
    expect(a.results).toHaveLength(2)
  })
  it('keeps earlier captures when measurements arrive in one-song batches', async () => {
    const { resultsPath } = await setup()
    const first = await runLevelPass({ songs: [songs[0]], resultsPath, measure: async () => result(-20) })
    const next = await runLevelPass({ songs: [songs[1]], resultsPath, measure: async () => result(-16) })
    expect(next.results).toHaveLength(2)
    expect(next.target.targetLufs).toBe(-18.1)
    expect(next.results.find(row => row.songId === 'one').measuredLufs).toBe(-20)
    expect(first.results).toHaveLength(1)
  })
  it('dry-run prints before/after table, target and clipped count without writing', async () => {
    const { resultsPath, report } = await setup()
    await runLevelPass({ songs, resultsPath, measure: async song => result(song.songId === 'one' ? -22 : -16) })
    const before = await readFile(resultsPath, 'utf8')
    const out = await runLevelPass({ songs, resultsPath, dryRun: true, report })
    expect(out.results).toHaveLength(2)
    expect(report.mock.calls.flat().join('\n')).toMatch(/target/i)
    expect(report.mock.calls.flat().join('\n')).toMatch(/clipped/i)
    expect(await readFile(resultsPath, 'utf8')).toBe(before)
  })
  it('aborts before measuring next song if system output volume changes', async () => {
    const { resultsPath } = await setup()
    let calls = 0
    await expect(runLevelPass({ songs, resultsPath, measure: async () => result(-18, ++calls === 1 ? 50 : 51) })).rejects.toThrow(/system volume changed/i)
    expect(calls).toBe(2)
    expect(JSON.parse(await readFile(resultsPath, 'utf8')).results).toHaveLength(1)
  })
  it('aborts if the measurer cannot report system volume', async () => {
    const { resultsPath } = await setup()
    await expect(runLevelPass({ songs: [songs[0]], resultsPath, measure: async () => ({ ...result(-18), systemVolume: NaN }) })).rejects.toThrow(/system volume unavailable/i)
  })
  it('writes a dated local snapshot to requested backup path', async () => {
    const { resultsPath } = await setup()
    await backupJukeboxState([{ id: 'row' }], resultsPath)
    expect(JSON.parse(await readFile(resultsPath, 'utf8'))).toMatchObject({ rows: [{ id: 'row' }] })
  })
})
