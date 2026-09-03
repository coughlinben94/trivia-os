#!/usr/bin/env node
// Recolor the ring world from one weighted palette.
//
//   node scripts/ring-recolor.mjs --colors '#ff0000,#ffea00' --weights '0.55,0.45'
//   node scripts/ring-recolor.mjs --colors '#ff0000,#ffea00' --weights '0.55,0.45' --write
//
// Without --write it prints the plan and touches nothing. With --write it
// computes all three new file contents first, then writes them in three
// sequential writeFileSync calls — not one atomic transaction. A crash
// between two writes leaves the tree half-recolored, which is recoverable
// rather than dangerous: the dirty-tree guard below refuses to run at all
// unless all three targets are clean, so `git checkout` on the targets is
// always the undo.
//
// The three files exist because the app and the verification gate read
// DIFFERENT sources: client/src/worlds/midnightGalaxy.ring.js is what
// /display renders, concepts/world-07-ring.html is what `npm run
// verify:ring` measures, and midnightGalaxy.ring.test.js pins the shipped
// values so neither can drift unnoticed. Every past recolor was a paste
// into two of them by hand; that is what this replaces.

import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { derivePalette } from '../client/src/lib/weightedPalette.js'
import { skyRegionHues, accentCompanionHue } from '../client/src/lib/ringPrimitives.js'
import { midnightGalaxyRing } from '../client/src/worlds/midnightGalaxy.ring.js'
import {
  readStationHues, rewriteRingJs, rewriteHtml, rewriteHuePin, rewriteSky,
  rewriteTints, deriveTints,
  formatPlan, blockedTargets, regionHueWarnings,
} from '../client/src/lib/ringRecolor.js'
import { BASE_TINTS } from '../client/src/lib/ringPrimitives.js'
import { THEMES } from '../client/src/themes/index.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const TARGETS = {
  ringJs: 'client/src/worlds/midnightGalaxy.ring.js',
  html: 'concepts/world-07-ring.html',
  pin: 'client/src/worlds/midnightGalaxy.ring.test.js',
}
const STATION_COUNT = 13
// Lightness reference for the derived sky, never its hue: derivePalette drops
// the folded palette onto THIS theme's bg/bgDeep lightness, so the sky keeps
// the near-black the world was tuned against and takes only its cast from the
// palette. Read from the shipped theme, not from the world file, so repeated
// recolours don't walk the sky somewhere darker each run.
const BASE_THEME = THEMES.find(t => t.id === 'midnight-galaxy')
if (!BASE_THEME) throw new Error('ring-recolor: no THEMES entry with id "midnight-galaxy"')

const read = rel => readFileSync(ROOT + rel, 'utf8')

function parseArgs(argv) {
  const flags = {}
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) throw new Error(`unexpected argument: ${argv[i]}`)
    const name = argv[i].slice(2)
    if (name === 'write') { flags.write = true; continue }
    if (name !== 'colors' && name !== 'weights') throw new Error(`unknown flag: --${name}`)
    const value = argv[++i]
    if (value === undefined) throw new Error(`--${name} needs a value`)
    flags[name] = value
  }

  if (!flags.colors) throw new Error("--colors is required, e.g. --colors '#ff0000,#ffea00'")
  const colors = flags.colors.split(',').map(s => s.trim())
  if (colors.length < 2 || colors.length > 3) {
    throw new Error(`--colors takes 2 or 3 colors, got ${colors.length}`)
  }
  for (const c of colors) {
    if (!/^#[0-9a-fA-F]{6}$/.test(c)) throw new Error(`not a #rrggbb color: ${c}`)
  }

  let weights = colors.map(() => 1)
  if (flags.weights) {
    weights = flags.weights.split(',').map(s => Number(s.trim()))
    if (weights.length !== colors.length) {
      throw new Error(`--weights has ${weights.length} values for ${colors.length} colors`)
    }
    if (weights.some(w => !(w > 0))) throw new Error('every weight must be a positive number')
  }
  const total = weights.reduce((a, b) => a + b, 0)
  weights = weights.map(w => w / total)

  return { colors, weights, write: !!flags.write }
}

function main() {
  const { colors, weights, write } = parseArgs(process.argv.slice(2))

  const ringJs = read(TARGETS.ringJs)
  const rows = readStationHues(ringJs)
  const currentHues = rows.map(r => r.hue)

  // baseTheme is passed for its bg/bgDeep LIGHTNESS only — the two values
  // this writes are the sky's own source hexes (SKY_BG/SKY_BG_DEEP in both
  // world files). accent/highlight from derived.themeColors are ignored:
  // those are host-UI surface colors and stay the theme's job.
  const derived = derivePalette({
    colors, weights, stationCount: STATION_COUNT, currentHues, baseTheme: BASE_THEME,
  })
  const sky = { bg: derived.themeColors.bg, bgDeep: derived.themeColors.bgDeep }
  const tints = deriveTints(BASE_TINTS, colors)

  const plan = rows.map((r, i) => ({ key: r.key, from: r.hue, to: derived.hues[i] }))
  const stations = rows.map((r, i) => ({ key: r.key, hue: derived.hues[i] }))

  console.log(`\nRing recolor — ${colors.length} colors`)
  colors.forEach((c, i) => {
    console.log(`  ${c}  weight ${weights[i].toFixed(2)}  anchor ${derived.hueAnchors[i].deg}°  ${derived.counts[i]} stations`)
  })
  console.log()

  // The sky regions and accent companions are DERIVED from the station hues
  // (Task 1), not authored — printing them is the only way to see, before
  // writing, what the new palette does to the parts of the world nobody
  // edits by hand. Derived before the plan so a region that lands outside
  // every anchor window prints in the same Warnings: block as the palette's.
  const byKey = new Map(stations.map(s => [s.key, s.hue]))
  const withMeta = midnightGalaxyRing.stations.map(s => ({ ...s, hue: byKey.get(s.key) ?? s.hue }))
  const regions = skyRegionHues(withMeta)

  console.log(formatPlan(plan, [
    ...derived.warnings,
    ...regionHueWarnings(regions, derived.hueAnchors),
  ]))

  console.log('\nSky regions (derived from the new hues):')
  for (const [key, hue] of Object.entries(regions)) {
    const src = withMeta.find(s => s.region === key && s.regionSource) ?? withMeta.find(s => s.region === key)
    console.log(`  ${key.padEnd(7)} ${hue}°  (from ${src.key} at ${src.hue}°)`)
  }

  console.log(`\nBase sky: ${sky.bg} → ${sky.bgDeep}  (was ${BASE_THEME.colors.bg} → ${BASE_THEME.colors.bgDeep})`)

  console.log('\nNear-white tints:')
  for (const [key, hex] of Object.entries(tints)) {
    console.log(`  ${key.padEnd(10)} ${BASE_TINTS[key]} → ${hex}`)
  }

  console.log('\nAccent companions:')
  for (const s of withMeta.filter(s => s.accent)) {
    console.log(`  ${s.key.padEnd(14)} ${s.hue}° → companion ${accentCompanionHue(s.hue, derived.hueAnchors)}°`)
  }

  if (!write) {
    console.log('\nDry run — nothing written. Add --write to apply.')
  console.log('\nNext:\n  npm run test:unit && npm run verify:ring')
  console.log(
    '  verify:ring exits 2 while the pre-existing spec-tier deviations stand —\n' +
    '  read the `regression tier:` line; it must say all checks green.\n',
  )
    return
  }

  const porcelain = execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' })
  const blocked = blockedTargets(porcelain, Object.values(TARGETS))
  if (blocked.length) {
    throw new Error(
      `refusing to write — already modified in the working tree:\n  ${blocked.join('\n  ')}\n` +
      'Commit or revert those first (another session may be mid-edit).',
    )
  }

  // All three strings first, then all three writes. That narrows the window
  // to the writes themselves — a throw in the transforms cannot leave the
  // app recolored and the gate's file on the old palette — but the writes
  // are still three separate calls, so recovery after a crash mid-loop is
  // `git checkout` on the targets, which the clean-tree guard above keeps
  // available.
  const next = {
    [TARGETS.ringJs]: rewriteTints(rewriteSky(rewriteRingJs(ringJs, derived.hues, derived.hueAnchors), sky, TARGETS.ringJs), tints, TARGETS.ringJs),
    [TARGETS.html]: rewriteTints(rewriteSky(rewriteHtml(read(TARGETS.html), stations, derived.hueAnchors), sky, TARGETS.html), tints, TARGETS.html),
    [TARGETS.pin]: rewriteHuePin(read(TARGETS.pin), stations),
  }
  for (const [rel, text] of Object.entries(next)) writeFileSync(ROOT + rel, text)

  console.log(`\nWrote:\n  ${Object.keys(next).join('\n  ')}`)
  console.log('\nNext:\n  npm run test:unit && npm run verify:ring')
  console.log(
    '  verify:ring exits 2 while the pre-existing spec-tier deviations stand —\n' +
    '  read the `regression tier:` line; it must say all checks green.\n',
  )
}

try {
  main()
} catch (err) {
  console.error(`ring-recolor: ${err.message}`)
  process.exit(1)
}
