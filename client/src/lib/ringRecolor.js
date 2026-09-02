// Pure text transforms for a ring recolor. String in, string out — no fs,
// no process, no fetch. scripts/ring-recolor.mjs is the only caller that
// touches disk, so every rule about WHAT a recolor may change is testable
// here without writing a byte.
//
// Why text and not "import the module and re-serialize it": the station
// hues live in TWO independent files — client/src/worlds/midnightGalaxy.ring.js
// (what the app renders) and concepts/world-07-ring.html (what
// `npm run verify:ring` actually reads). They are not generated from each
// other, and every past recolor was a hand-transcribed paste into both. The
// failure mode this replaces is a hue that changed in one file only: the
// app looks recolored, the gate still measures the old world.

const GENERATED = '// written by scripts/ring-recolor.mjs — do not hand-edit'

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// The `stations: [ ... ],` body, matched by its own indentation so the first
// line that is exactly `<indent>],` closes it. Both files indent the key at
// 2 and its entries at 4.
function stationsBlock(src, what) {
  const m = src.match(/^([ \t]*)stations: \[\r?\n([\s\S]*?)^\1\],$/m)
  if (!m) throw new Error(`${what}: no "stations: [ ... ]," block found`)
  return m[2]
}

function replaceAnchors(src, anchors, what) {
  const m = src.match(/^([ \t]*)hueAnchors: \[\r?\n[\s\S]*?^\1\],$/m)
  if (!m) throw new Error(`${what}: no "hueAnchors: [ ... ]," block found`)
  const pad = m[1]
  const body = anchors
    .map(a => `${pad}  { deg: ${a.deg}, window: ${a.window} },`)
    .join('\n')
  return src.replace(m[0], `${pad}hueAnchors: [\n${pad}  ${GENERATED}\n${body}\n${pad}],`)
}

// → [{ key, constName, hue }] x13, in station order. Throws rather than
// returning a short list: a silent partial parse is exactly the bug a
// hand-edit already makes, and rewriting from one would leave the other
// stations on the old palette.
export function readStationHues(ringJsSource) {
  const consts = new Map()
  for (const m of ringJsSource.matchAll(/export const (\w+_HUE)\s*=\s*(\d+)/g)) {
    consts.set(m[1], Number(m[2]))
  }
  const rows = []
  for (const m of stationsBlock(ringJsSource, 'midnightGalaxy.ring.js').matchAll(
    /key:\s*'([^']+)'[^\n]*?hue:\s*(\w+)/g,
  )) {
    const [, key, constName] = m
    if (!consts.has(constName)) {
      throw new Error(`midnightGalaxy.ring.js: station '${key}' reads ${constName}, which is not declared`)
    }
    rows.push({ key, constName, hue: consts.get(constName) })
  }
  if (rows.length !== 13) {
    throw new Error(`midnightGalaxy.ring.js: parsed ${rows.length} stations, expected 13`)
  }
  const used = new Set(rows.map(r => r.constName))
  for (const name of consts.keys()) {
    if (!used.has(name)) {
      throw new Error(`midnightGalaxy.ring.js: ${name} is declared but no station reads it`)
    }
  }
  return rows
}

// `hues` is 13 numbers in station order. Only the digits of each constant
// move, so the alignment padding in `export const RINGED_PLANET_HUE  = 256`
// survives untouched.
export function rewriteRingJs(ringJsSource, hues, anchors) {
  const rows = readStationHues(ringJsSource)
  if (hues.length !== rows.length) {
    throw new Error(`rewriteRingJs: got ${hues.length} hues for ${rows.length} stations`)
  }
  let out = ringJsSource
  rows.forEach((r, i) => {
    const re = new RegExp(`(export const ${r.constName}\\s*=\\s*)\\d+`)
    out = out.replace(re, `$1${hues[i]}`)
  })
  return replaceAnchors(out, anchors, 'midnightGalaxy.ring.js')
}

// `stations` is [{ key, hue }]. Matched by key, not by index: this file's
// station array is independent of the .js one and has drifted in order
// before.
export function rewriteHtml(htmlSource, stations, anchors) {
  const lines = htmlSource.split('\n')
  const start = lines.findIndex(l => /^[ \t]*stations: \[/.test(l))
  if (start === -1) throw new Error('world-07-ring.html: no "stations: [" found')
  const indent = lines[start].match(/^[ \t]*/)[0]
  const end = lines.findIndex((l, i) => i > start && l === `${indent}],`)
  if (end === -1) throw new Error('world-07-ring.html: unterminated "stations: [" block')

  for (const { key, hue } of stations) {
    const needle = `key:'${key}'`
    const idx = lines.findIndex((l, i) => i > start && i < end && l.includes(needle))
    if (idx === -1) throw new Error(`world-07-ring.html: no station line for key '${key}'`)
    let hit = false
    // Keep the field width constant so the `accent:` column stays aligned.
    lines[idx] = lines[idx].replace(/hue:(\s*)\d+,(\s*)/, (whole, pre) => {
      hit = true
      const head = `hue:${pre}${hue},`
      return head + ' '.repeat(Math.max(1, whole.length - head.length))
    })
    if (!hit) throw new Error(`world-07-ring.html: station '${key}' has no "hue:" to rewrite`)
  }
  return replaceAnchors(lines.join('\n'), anchors, 'world-07-ring.html')
}

// The `toEqual([...])` pin in midnightGalaxy.ring.test.js. Rewrites each
// pair's number in place, so the hand-laid-out literal keeps its shape.
export function rewriteHuePin(testSource, stations) {
  let out = testSource
  for (const { key, hue } of stations) {
    const re = new RegExp(`(\\['${escapeRe(key)}',\\s*)\\d+(\\])`)
    if (!re.test(out)) {
      throw new Error(`midnightGalaxy.ring.test.js: no pinned pair for '${key}'`)
    }
    out = out.replace(re, `$1${hue}$2`)
  }
  return out
}

// Which of `targets` `git status --porcelain` already reports as changed.
// Non-empty means another session is mid-edit in a file this would clobber.
//
// Porcelain v1 is two status chars, a space, then the path. Renames and
// copies (R/C in either status column, so `R `, `RM`, `C ` ...) instead
// carry `old -> new`, and the DESTINATION is the path that exists on disk
// now — checking the left side would let a target renamed into place slip
// past the guard and get clobbered.
export function blockedTargets(porcelain, targets) {
  const dirty = new Set(porcelain.split('\n').filter(Boolean).map(line => {
    const field = line.slice(3)
    const path = /[RC]/.test(line.slice(0, 2)) ? field.split(' -> ').pop() : field
    return path.trim().replace(/^"|"$/g, '')
  }))
  return targets.filter(t => dirty.has(t))
}

// rows: [{ key, from, to }]
export function formatPlan(rows, warnings) {
  const w = Math.max(...rows.map(r => r.key.length))
  const table = rows
    .map((r, i) => `  st${String(i).padEnd(2)} ${r.key.padEnd(w)}  ${String(r.from).padStart(3)} → ${r.to}`)
    .join('\n')
  const warned = warnings.length
    ? warnings.map(x => `  ! ${x}`).join('\n')
    : '  no warnings'
  return `${table}\n\nWarnings:\n${warned}`
}
