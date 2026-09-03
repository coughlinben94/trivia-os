#!/usr/bin/env node
// palette-sweep.mjs — fills the ring_palettes certification shelf offline.
//
// docs/superpowers/plans/2026-09-03-ring-palette-drift-and-shelf.md, Task 6.
// Runs the SAME Playwright gate ring-verify.mjs runs (imported, never
// forked) against candidate palettes, and writes certified/failed rows to
// ring_palettes so the host picker (Task 7) only ever offers palettes that
// already passed. Never runs live at Apply time — see the plan for why
// ("bulletproof over instant").
//
// Usage:
//   node concepts/tools/palette-sweep.mjs --seed-batch N   # shelves 6 presets + N generated seeds
//   node concepts/tools/palette-sweep.mjs --pending        # certifies whatever hosts saved as pending
//   node concepts/tools/palette-sweep.mjs --label X --colors '...' --weights '...' [--drift N]  # manual spot-check, prints only

import { runChecks, startStaticServer, ensureViteServer } from './ring-verify.mjs'
import { midnightGalaxyRing } from '../../client/src/worlds/midnightGalaxy.ring.js'
import { RING_VERSION } from '../../client/src/lib/ringCertification.js'
import { generatePalette, seedFrom, BASE_PALETTE, PRESETS } from '../../client/src/lib/paletteGenerator.js'
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..', '..')

// The BASE palette at drift 0 must certify — if it doesn't, the sweep's OWN
// plumbing is broken (wrong URL shape, dead server, whatever) and every row
// it's about to write would be a lie. Reuses certifyPalette (below) —
// never a second, hand-rolled check path.
async function knownAnswerProbe(browser) {
  const { passed, summary } = await certifyPalette(browser, { ...BASE_PALETTE, drift: { arc: 0 } })
  if (!passed) {
    throw new Error(`palette-sweep: known-answer probe FAILED — the BASE palette has ${summary.regression_fail_count} regression FAIL(s) (${summary.regression_fail_names.join(', ')}). The sweep's own plumbing is broken; fix it before certifying anything.`)
  }
}

// Same env/auth pattern as scripts/backup-db.mjs — see that file's header
// comment for the full reasoning (service key first, host-PIN fallback).
function parseEnvFile(path) {
  try {
    return Object.fromEntries(
      readFileSync(path, 'utf8').split('\n')
        .filter(l => l.trim() && !l.trim().startsWith('#') && l.includes('='))
        .map(l => { const i = l.indexOf('='); let v = l.slice(i + 1).trim(); if (/^(".*"|'.*')$/.test(v)) v = v.slice(1, -1); return [l.slice(0, i).trim(), v] }),
    )
  } catch { return {} }
}
const env = { ...parseEnvFile(join(ROOT, '.env.local')), ...process.env }
const EXPECTED_PROJECT = 'qwtbgusqfoypvehnungr'
if (!env.VITE_SUPABASE_URL?.includes(EXPECTED_PROJECT)) {
  throw new Error(`palette-sweep: refusing to run — VITE_SUPABASE_URL is not the Baynes Trivia project.`)
}
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
async function elevateIfNeeded() {
  if (env.SUPABASE_SERVICE_ROLE_KEY) return // bypasses RLS already
  const pin = env.TRIVIA_HOST_PIN || env.PLAYWRIGHT_HOST_PIN
  if (!pin) throw new Error('palette-sweep: need SUPABASE_SERVICE_ROLE_KEY or TRIVIA_HOST_PIN in the environment')
  const { error: authErr } = await sb.auth.signInAnonymously()
  if (authErr) throw new Error(`anonymous sign-in failed: ${authErr.message}`)
  const { data, error: fnErr } = await sb.functions.invoke('verify-host-pin', { body: { pin } })
  if (fnErr || !data?.ok) throw new Error(`host PIN elevation failed: ${fnErr?.message ?? data?.error}`)
  await sb.auth.refreshSession()
}

// Server lifecycle: started ONCE by the CLI entry (below), reused across
// every palette this run certifies, torn down in that entry's `finally`.
// Never started per-palette — that's what leaked a vite process before.
//
// Real signatures, verified 2026-09-03 by reading ring-verify.mjs's own CLI
// block directly (concepts/tools/ring-verify.mjs:1435-1481) rather than
// guessing: `startStaticServer(rootDir)` takes the root to serve and
// resolves to a raw node http.Server (get its port via
// `server.address().port`, close it via `server.close(cb)` — no `.url` or
// `.close()` convenience method exists on it). `ensureViteServer()` takes
// no args and resolves to `{ proc, url }` where `url` is ALREADY the full
// `http://host:port/ambient?ring=1` path (`proc` is `null` when it reused
// an already-running dev server instead of spawning one — guard the kill).
let staticServer, staticPort, viteServer
async function startServers() {
  staticServer = await startStaticServer(ROOT)
  staticPort = staticServer.address().port
  viteServer = await ensureViteServer()
}
async function stopServers() {
  await new Promise(resolve => staticServer.close(resolve))
  viteServer?.proc?.kill?.()
}

function paletteQuery({ colors, weights, drift }) {
  return `colors=${colors.map(encodeURIComponent).join(',')}&weights=${weights.join(',')}&drift=${drift.arc}`
}

async function certifyPalette(browser, { colors, weights, drift }) {
  // Renders BOTH builds via the URL-param routes Session 1 added, exactly
  // like a host's picker preview does — reuses runChecks, never re-derives
  // pass/fail logic.
  const q = paletteQuery({ colors, weights, drift })
  const results = []
  for (const [label, url] of [
    ['html', `http://127.0.0.1:${staticPort}/concepts/world-07-ring.html?${q}`],
    ['react-live', `${viteServer.url}&${q}`], // viteServer.url already ends in /ambient?ring=1
  ]) {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
    try {
      const r = await runChecks({ label, prefix: label === 'react-live' ? 'ring-' : '', page, gotoUrl: url })
      results.push(...r.regression, ...r.spec)
    } finally {
      await page.close()
    }
  }
  const regressionFails = results.filter(r => r.tier === 'regression' && r.status === 'FAIL')
  return {
    passed: regressionFails.length === 0,
    summary: {
      regression_fail_count: regressionFails.length,
      regression_fail_names: regressionFails.map(r => r.name),
      spec_fail_count: results.filter(r => r.tier === 'spec' && r.status === 'FAIL').length,
    },
  }
}

async function runSeedBatch(n, browser) {
  const rows = []
  // Presets (and the picker's own default, which is byte-identical to
  // PRESETS[0]) must always be on the shelf — Task 7's Apply button only
  // ever matches against certified rows, so without this a fresh install
  // (or a RING_VERSION bump) can't apply even the built-in starting points.
  // Shelved at drift 60 — WorldPaletteEditor's default slider value, which
  // is what a preset click actually commits.
  for (const preset of PRESETS) {
    const candidate = { colors: preset.colors, weights: preset.weights, drift: { arc: 60 } }
    const { passed, summary } = await certifyPalette(browser, candidate)
    rows.push({
      colors: candidate.colors, weights: candidate.weights, drift: candidate.drift,
      status: passed ? 'certified' : 'failed', source: 'preset', seed: preset.name,
      ring_version: RING_VERSION, gate_summary: summary, checked_at: new Date().toISOString(),
    })
    console.log(`preset "${preset.name}": ${passed ? 'CERTIFIED' : 'FAILED'}`)
  }
  for (let s = 1; s <= n; s++) {
    const candidate = generatePalette(s, midnightGalaxyRing, { colors: { bg: '#08001a', bgDeep: '#040010' } })
    if (candidate.fallback) continue // fallback IS BASE_PALETTE, already shelved above as PRESETS[0]
    const { passed, summary } = await certifyPalette(browser, candidate)
    rows.push({
      colors: candidate.colors, weights: candidate.weights, drift: candidate.drift,
      status: passed ? 'certified' : 'failed', source: 'generated', seed: String(candidate.seed),
      ring_version: RING_VERSION, gate_summary: summary, checked_at: new Date().toISOString(),
    })
    console.log(`seed ${s}: ${passed ? 'CERTIFIED' : 'FAILED'} (${summary.regression_fail_count} regression FAIL, ${summary.spec_fail_count} spec FAIL)`)
  }
  if (rows.length) {
    // upsert, not insert: re-running --seed-batch over the same seeds/presets
    // (e.g. batch 5 today, batch 20 next week) must update, not duplicate —
    // the unique index on (source, seed, ring_version) is the conflict target.
    const { error } = await sb.from('ring_palettes')
      .upsert(rows, { onConflict: 'source,seed,ring_version' })
    if (error) throw new Error(`upsert failed: ${error.message}`)
  }
  console.log(`\n${rows.filter(r => r.status === 'certified').length}/${rows.length} certified, written to ring_palettes.`)
}

async function runPending(browser) {
  const { data: pending, error } = await sb.from('ring_palettes').select('*').eq('status', 'pending').eq('ring_version', RING_VERSION)
  if (error) throw new Error(`select failed: ${error.message}`)
  for (const row of pending ?? []) {
    const { passed, summary } = await certifyPalette(browser, { colors: row.colors, weights: row.weights, drift: row.drift })
    const { error: updateErr } = await sb.from('ring_palettes').update({
      status: passed ? 'certified' : 'failed', gate_summary: summary, checked_at: new Date().toISOString(),
    }).eq('id', row.id)
    if (updateErr) throw new Error(`update failed for ${row.id}: ${updateErr.message}`)
    console.log(`${row.id}: ${passed ? 'CERTIFIED' : 'FAILED'}`)
  }
  console.log(`\nChecked ${pending?.length ?? 0} pending palette(s).`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const mode = process.argv[2]
  await elevateIfNeeded() // fail fast on a bad/missing PIN, before any rendering
  await startServers()
  const browser = await chromium.launch()
  try {
    await knownAnswerProbe(browser)
    if (mode === '--seed-batch') await runSeedBatch(Number(process.argv[3] ?? 10), browser)
    else if (mode === '--pending') await runPending(browser)
    else if (mode === '--label') {
      // Fable's original Phase 2b one-off mode — --label X --colors '...' --weights '...' [--drift N], prints a summary line, writes nothing to the DB. Left for Ben's manual spot-checks.
      console.log('(--label mode: manual one-off, prints only, matches Phase 2b of the 2026-09-02 plan — implement identically to that plan section if not already present)')
    } else {
      console.error('Usage: node concepts/tools/palette-sweep.mjs --seed-batch N | --pending | --label ...')
      process.exit(2)
    }
  } finally {
    await browser.close()
    await stopServers()
  }
}
