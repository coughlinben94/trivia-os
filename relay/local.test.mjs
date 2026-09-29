// The relay's laptop-local commands (spec §17.3-§17.6) with a FAKE runner:
// no test here ever runs osascript or afplay, so the real volume never moves
// and no sound plays.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createLocal, findSounds, SOUND_NAMES } from './local.mjs'
import { fakeRunner } from './fake-runner.mjs'

const quiet = { log() {}, warn() {}, error() {} }
let dir
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-local-')) })
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

function writeSounds(list) {
  fs.writeFileSync(path.join(dir, 'sounds.json'), JSON.stringify(list))
}
function audio(name) {
  const p = path.join(dir, name)
  fs.writeFileSync(p, 'not really audio')
  return p
}
const make = (runner, extra = {}) => createLocal({ configDir: dir, runner, log: quiet, ...extra })

describe('volume', () => {
  it('vol.up / vol.down move by 10 through osascript with a fixed argument array', async () => {
    const r = fakeRunner({ volume: 60 })
    const local = make(r)
    expect(await local.run('vol.up')).toEqual({ ok: true })
    expect(r.volume).toBe(70)
    expect(await local.run('vol.down')).toEqual({ ok: true })
    expect(await local.run('vol.down')).toEqual({ ok: true })
    expect(r.volume).toBe(50)
    for (const [file, args] of r.calls) {
      expect(file).toBe('/usr/bin/osascript')
      expect(Array.isArray(args)).toBe(true)
      expect(args[0]).toBe('-e')
    }
    expect(local.state()).toMatchObject({ type: 'local-state', volume: 50, ducked: false, available: true })
  })
  it('clamps to 0-100', async () => {
    const hi = fakeRunner({ volume: 95 })
    await make(hi).run('vol.up')
    expect(hi.volume).toBe(100)
    const lo = fakeRunner({ volume: 4 })
    await make(lo).run('vol.down')
    expect(lo.volume).toBe(0)
  })
  it('osascript failing is refused as local-failed, not thrown', async () => {
    const local = make(fakeRunner({ failWith: 'execution error' }))
    expect(await local.run('vol.up')).toEqual({ refuse: 'local-failed' })
    expect(await local.run('duck')).toEqual({ refuse: 'local-failed' })
    expect(local.state().ducked).toBe(false)
  })
  it('with no runner the commands are unavailable', async () => {
    const local = make(null)
    expect(await local.run('vol.up')).toEqual({ refuse: 'local-unavailable' })
    expect(local.state().available).toBe(false)
  })
})

describe('duck', () => {
  it('first press saves the volume to memory and duck.json and drops to 20%; second restores exactly and deletes it', async () => {
    const r = fakeRunner({ volume: 60 })
    const local = make(r)
    await local.run('duck')
    expect(r.volume).toBe(12)
    const saved = JSON.parse(fs.readFileSync(path.join(dir, 'duck.json'), 'utf8'))
    expect(saved.pre).toBe(60)
    expect(Math.abs(Date.now() - saved.at)).toBeLessThan(5000)
    expect(local.state()).toMatchObject({ ducked: true, volume: 12 })
    await local.run('duck')
    expect(r.volume).toBe(60)
    expect(fs.existsSync(path.join(dir, 'duck.json'))).toBe(false)
    expect(local.state()).toMatchObject({ ducked: false, volume: 60 })
  })
  it('rounds the ducked level (pre 55 -> 11, pre 7 -> 1)', async () => {
    const a = fakeRunner({ volume: 55 })
    await make(a).run('duck')
    expect(a.volume).toBe(11)
    fs.rmSync(path.join(dir, 'duck.json'))
    const b = fakeRunner({ volume: 7 })
    await make(b).run('duck')
    expect(b.volume).toBe(1)
  })
  it('a relay restart reloads duck.json, so one press still restores the saved volume', async () => {
    const r = fakeRunner({ volume: 80 })
    await make(r).run('duck')
    expect(r.volume).toBe(16)
    const after = make(r) // the "restarted" relay
    expect(after.state().ducked).toBe(true)
    r.volume = 30 // someone nudged the volume while ducked
    await after.run('duck')
    expect(r.volume).toBe(80)
    expect(fs.existsSync(path.join(dir, 'duck.json'))).toBe(false)
  })
  it('reads duckRatio from config.json', async () => {
    fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ duckRatio: 0.5 }))
    const r = fakeRunner({ volume: 60 })
    await make(r).run('duck')
    expect(r.volume).toBe(30)
  })
  const writeDuck = obj => fs.writeFileSync(path.join(dir, 'duck.json'), JSON.stringify(obj))
  it('a fresh duck.json restores on the next press', async () => {
    writeDuck({ pre: 70, at: Date.now() - 60 * 60 * 1000 })
    const r = fakeRunner({ volume: 14 })
    const local = make(r)
    expect(local.state().ducked).toBe(true)
    await local.run('duck')
    expect(r.volume).toBe(70)
  })
  it('a duck.json older than 6 hours is ignored and deleted; the next press ducks normally', async () => {
    writeDuck({ pre: 95, at: Date.now() - 7 * 60 * 60 * 1000 })
    const r = fakeRunner({ volume: 40 })
    const local = make(r)
    expect(local.state().ducked).toBe(false)
    expect(fs.existsSync(path.join(dir, 'duck.json'))).toBe(false)
    await local.run('duck')
    expect(r.volume).toBe(8)
  })
  it('a legacy duck.json with no timestamp counts as stale', async () => {
    writeDuck({ pre: 95 })
    const r = fakeRunner({ volume: 40 })
    const local = make(r)
    expect(local.state().ducked).toBe(false)
    expect(fs.existsSync(path.join(dir, 'duck.json'))).toBe(false)
    await local.run('duck')
    expect(r.volume).toBe(8)
  })
  it('if the drop fails, duck state and duck.json are rolled back', async () => {
    const r = fakeRunner({ volume: 60 })
    const run = r.run
    r.run = async (file, args) => { if (args[1].startsWith('set ')) throw new Error('boom'); return run(file, args) }
    const local = make(r)
    expect(await local.run('duck')).toEqual({ refuse: 'local-failed' })
    expect(local.state().ducked).toBe(false)
    expect(fs.existsSync(path.join(dir, 'duck.json'))).toBe(false)
    r.run = run
    await local.run('duck')
    expect(r.volume).toBe(12)
  })
  it('commands run one at a time: two quick Duck presses end back at the original volume', async () => {
    const r = fakeRunner({ volume: 60 })
    const run = r.run
    r.run = async (file, args) => { await new Promise(f => setTimeout(f, 30)); return run(file, args) }
    const local = make(r)
    await Promise.all([local.run('duck'), local.run('duck')])
    expect(local.state().ducked).toBe(false)
    expect(r.volume).toBe(60)
    r.calls.length = 0
    await Promise.all([local.run('duck'), local.run('vol.up'), local.run('duck')])
    const sets = r.calls.map(c => c[1][1]).filter(s => s.startsWith('set ')).map(s => Number(s.split(' ').at(-1)))
    expect(sets).toEqual([12, 22, 60]) // vol.up waits for the drop, never lands inside it
  })
  it('a junk duck.json is ignored rather than crashing', () => {
    fs.writeFileSync(path.join(dir, 'duck.json'), '{nope')
    expect(make(fakeRunner()).state().ducked).toBe(false)
  })
})

describe('sounds', () => {
  it('plays an allowlisted id with afplay and the configured path; missing files are marked', async () => {
    const ok = audio('turtles.mp3')
    writeSounds([{ id: 'turtles', label: 'I Like Turtles', path: ok }, { id: 'gone', label: 'Gone', path: path.join(dir, 'nope.mp3') }])
    const r = fakeRunner()
    const local = make(r)
    expect(local.state().sounds).toEqual([
      { id: 'turtles', label: 'I Like Turtles', missing: false },
      { id: 'gone', label: 'Gone', missing: true },
    ])
    expect(await local.run('sound.play', { id: 'turtles', path: '/etc/passwd' })).toEqual({ ok: true })
    expect(r.calls.at(-1)).toEqual(['/usr/bin/afplay', [ok]])
    expect(await local.run('sound.play', { id: 'gone' })).toEqual({ refuse: 'sound-missing' })
  })
  it('an unknown id is refused and nothing runs', async () => {
    writeSounds([{ id: 'turtles', label: 'T', path: audio('t.mp3') }])
    const r = fakeRunner()
    const local = make(r)
    expect(await local.run('sound.play', { id: 'rm -rf' })).toEqual({ refuse: 'unknown-sound' })
    expect(await local.run('sound.play', {})).toEqual({ refuse: 'unknown-sound' })
    expect(r.calls).toEqual([])
  })
  it('overlapping plays are allowed; stopAll kills only the relay-spawned children still running', async () => {
    writeSounds([{ id: 'a', label: 'A', path: audio('a.mp3') }])
    const r = fakeRunner()
    const local = make(r)
    await local.run('sound.play', { id: 'a' })
    await local.run('sound.play', { id: 'a' })
    r.children[0].exits.forEach(f => f()) // the first one finished on its own
    await local.run('sound.stopAll')
    expect(r.children.map(c => c.killed)).toEqual([false, true])
  })
  it('a sound path that is a directory is marked missing', () => {
    const d = path.join(dir, 'folder.mp3')
    fs.mkdirSync(d)
    writeSounds([{ id: 'd', label: 'D', path: d }])
    const local = make(fakeRunner())
    expect(local.state().sounds).toEqual([{ id: 'd', label: 'D', missing: true }])
    return local.run('sound.play', { id: 'd' }).then(res => expect(res).toEqual({ refuse: 'sound-missing' }))
  })
  it('no sounds.json: empty list, any id refused', async () => {
    const local = make(fakeRunner())
    expect(local.state().sounds).toEqual([])
    expect(await local.run('sound.play', { id: 'x' })).toEqual({ refuse: 'unknown-sound' })
  })
  it('bad sounds.json entries (no id, relative path, not a list) are dropped', () => {
    writeSounds([{ label: 'no id', path: '/x.mp3' }, { id: 'rel', label: 'Rel', path: 'x.mp3' }, { id: 'ok', label: 'OK', path: audio('ok.mp3') }])
    expect(make(fakeRunner()).state().sounds.map(s => s.id)).toEqual(['ok'])
    writeSounds({ id: 'nope' })
    expect(make(fakeRunner()).state().sounds).toEqual([])
  })
})

describe('findSounds (--init-sounds)', () => {
  it('matches Ben\'s ten Stream Deck sounds by name in the given folders, only if they exist', () => {
    const a = path.join(dir, 'Desktop', 'Trivia Sounds')
    fs.mkdirSync(a, { recursive: true })
    const docs = path.join(dir, 'Documents')
    fs.mkdirSync(docs)
    fs.writeFileSync(path.join(a, 'I Like Turtles.mp3'), '')
    fs.writeFileSync(path.join(docs, 'ya-jackass.m4a'), '')
    fs.writeFileSync(path.join(docs, 'ya jackass notes.txt'), '')
    const { sounds, missing } = findSounds([a, docs, path.join(dir, 'Downloads')])
    expect(sounds).toEqual([
      { id: 'i-like-turtles', label: 'I Like Turtles', path: path.join(a, 'I Like Turtles.mp3') },
      { id: 'ya-jackass', label: 'Ya Jackass', path: path.join(docs, 'ya-jackass.m4a') },
    ])
    expect(missing).toHaveLength(SOUND_NAMES.length - 2)
  })
})
