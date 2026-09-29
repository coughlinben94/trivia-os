// The relay's laptop-local commands (spec §17.3-§17.6): system volume, Duck
// and the soundboard. Fixed programs with fixed argument arrays only, run
// through an injectable `runner` (tests pass a fake one, so they never move
// the real volume or play a sound). No shell, and nothing from the iPad ever
// becomes a path or script text: volume scripts are built here from a
// clamped integer, and sounds are looked up by id in sounds.json.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'

export const DEFAULT_CONFIG_DIR = path.join(os.homedir(), '.config', 'trivia-relay')
const OSASCRIPT = '/usr/bin/osascript'
const AFPLAY = '/usr/bin/afplay'
const VOL_STEP = 10
const DUCK_MAX_AGE_MS = 6 * 60 * 60 * 1000 // an older duck.json is from a past night, not tonight
const GET_VOLUME = 'output volume of (get volume settings)'

// The real runner: execFile never goes through a shell.
export const realRunner = {
  run: (file, args) => new Promise((resolve, reject) => {
    execFile(file, args, { timeout: 5000 }, (err, stdout) => (err ? reject(err) : resolve(String(stdout))))
  }),
  spawn(file, args) {
    const child = execFile(file, args, () => {})
    return { kill: () => child.kill(), onExit: f => child.once('exit', f) }
  },
}

const clamp = n => Math.max(0, Math.min(100, Math.round(n)))
const readJson = file => { try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return null } }
const isFile = p => { try { return fs.statSync(p).isFile() } catch { return false } }

function loadSounds(file) {
  const list = readJson(file)
  if (!Array.isArray(list)) return []
  return list
    .filter(s => s && typeof s.id === 'string' && s.id && typeof s.path === 'string' && path.isAbsolute(s.path))
    .map(s => ({ id: s.id, label: typeof s.label === 'string' && s.label ? s.label : s.id, path: s.path, missing: !isFile(s.path) }))
}

export function createLocal({ configDir = DEFAULT_CONFIG_DIR, runner = realRunner, log = console } = {}) {
  const duckFile = path.join(configDir, 'duck.json')
  const ratio = Number(readJson(path.join(configDir, 'config.json'))?.duckRatio)
  const duckRatio = ratio >= 0 && ratio <= 1 ? ratio : 0.2
  const sounds = loadSounds(path.join(configDir, 'sounds.json'))
  const saved = readJson(duckFile)
  // Reloaded on start, so a relay restart while ducked can still restore;
  // a file with no timestamp or older than DUCK_MAX_AGE_MS is stale: drop it.
  const fresh = Number.isFinite(saved?.pre) && Number.isFinite(saved?.at) && Date.now() - saved.at < DUCK_MAX_AGE_MS
  if (!fresh) fs.rmSync(duckFile, { force: true })
  let pre = fresh ? clamp(saved.pre) : null
  let volume = null
  const playing = new Set()
  let chain = Promise.resolve() // local commands run one at a time, in arrival order

  const getVolume = async () => {
    const v = parseInt(await runner.run(OSASCRIPT, ['-e', GET_VOLUME]), 10)
    if (!Number.isFinite(v)) throw new Error('no volume reading')
    return (volume = clamp(v))
  }
  const setVolume = async n => {
    const v = clamp(n)
    await runner.run(OSASCRIPT, ['-e', `set volume output volume ${v}`])
    volume = v
  }

  async function duck() {
    if (pre == null) {
      const now = await getVolume()
      fs.mkdirSync(configDir, { recursive: true, mode: 0o700 })
      fs.writeFileSync(duckFile, JSON.stringify({ pre: now, at: Date.now() })) // saved before the drop
      pre = now
      try {
        await setVolume(now * duckRatio)
      } catch (e) {
        pre = null
        fs.rmSync(duckFile, { force: true })
        throw e
      }
    } else {
      await setVolume(pre)
      fs.rmSync(duckFile, { force: true })
      pre = null
    }
  }

  function play(id) {
    const s = sounds.find(x => x.id === id)
    if (!s) return { refuse: 'unknown-sound' }
    if (!isFile(s.path)) return { refuse: 'sound-missing' }
    const child = runner.spawn(AFPLAY, [s.path])
    playing.add(child)
    child.onExit(() => playing.delete(child))
    return { ok: true }
  }

  return {
    state: () => ({
      type: 'local-state', available: !!runner, volume, ducked: pre != null,
      sounds: sounds.map(({ id, label, missing }) => ({ id, label, missing })),
    }),
    async refresh() {
      if (!runner) return
      try { await getVolume() } catch (e) { log.error('[relay] volume read failed', e.message) }
    },
    // Returns { ok: true } or { refuse: reason }; never throws. Queued on one
    // chain so two Duck presses or a vol.up can never interleave mid-command.
    run(cmd, args = {}) {
      const result = chain.then(() => runOnce(cmd, args))
      chain = result.catch(() => {})
      return result
    },
    stopAll: () => [...playing].forEach(c => c.kill()),
  }

  async function runOnce(cmd, args) {
    if (!runner) return { refuse: 'local-unavailable' }
    try {
      if (cmd === 'vol.up' || cmd === 'vol.down') await setVolume((await getVolume()) + (cmd === 'vol.up' ? VOL_STEP : -VOL_STEP))
      else if (cmd === 'duck') await duck()
      else if (cmd === 'sound.play') return play(args.id)
      else if (cmd === 'sound.stopAll') [...playing].forEach(c => c.kill())
      else return { refuse: 'unknown-command' }
      return { ok: true }
    } catch (e) {
      log.error(`[relay] ${cmd} failed`, e.message)
      return { refuse: 'local-failed' }
    }
  }
}

// Ben's Stream Deck soundboard page (spec §17.4). --init-sounds looks for
// each by name; it never copies audio, it only records paths that exist.
export const SOUND_NAMES = [
  'Doug Dimadome', 'Oh Brother', 'Big Summer Blowout', 'Weather Boy', 'I Like Turtles',
  'Cows Outside', "I'm tired of this grandpa", 'Do Roar', 'Ya Jackass', 'Boy have ya lost your mind',
]
const AUDIO = /\.(mp3|m4a|wav|aiff?|aac|caf)$/i
const squash = s => s.toLowerCase().replace(/[^a-z0-9]/g, '')
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

export function findSounds(dirs) {
  const files = dirs.flatMap(d => {
    try { return fs.readdirSync(d).filter(f => AUDIO.test(f)).map(f => path.join(d, f)) } catch { return [] }
  })
  const sounds = []
  const missing = []
  for (const label of SOUND_NAMES) {
    const hit = files.find(f => squash(path.basename(f).replace(AUDIO, '')).includes(squash(label)))
    if (hit) sounds.push({ id: slug(label), label, path: hit })
    else missing.push(label)
  }
  return { sounds, missing }
}

export function initSounds(configDir = DEFAULT_CONFIG_DIR, { force = false, home = os.homedir() } = {}) {
  const file = path.join(configDir, 'sounds.json')
  if (fs.existsSync(file) && !force) throw new Error(`${file} already exists — pass --force to rebuild it`)
  const found = findSounds([path.join(home, 'Desktop', 'Trivia Sounds'), path.join(home, 'Documents'), path.join(home, 'Downloads')])
  fs.mkdirSync(configDir, { recursive: true, mode: 0o700 })
  fs.writeFileSync(file, JSON.stringify(found.sounds, null, 2) + '\n')
  return { file, ...found }
}
