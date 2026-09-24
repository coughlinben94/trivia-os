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
//   node concepts/tools/palette-sweep.mjs --world-batch N  # draws N full worlds (noun + palette) and shelves them
//   node concepts/tools/palette-sweep.mjs --pending        # certifies whatever hosts saved as pending
//   node concepts/tools/palette-sweep.mjs --label X --colors '...' --weights '...' [--drift N]  # manual spot-check, prints only

import { runChecks, startStaticServer, ensureViteServer } from './ring-verify.mjs'
import { midnightGalaxyRing } from '../../client/src/worlds/midnightGalaxy.ring.js'
import { drawWorld } from '../../client/src/lib/drawWorld.js'
import { RING_POOL } from '../../client/src/worlds/ringPool.js'
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
  // Safe-box luminance detail (per-station mean/p99.5) is already computed
  // by ring-verify.mjs's check #15 and embedded in its `detail` string —
  // captured here (pass, warn, or fail) so a "failed by how much" question
  // doesn't require re-running the gate. Was previously discarded, keeping
  // only the fail/pass name.
  const safeBoxChecks = results.filter(r => r.name.includes('safe-box luminance cap'))
  return {
    passed: regressionFails.length === 0,
    summary: {
      regression_fail_count: regressionFails.length,
      regression_fail_names: regressionFails.map(r => r.name),
      spec_fail_count: results.filter(r => r.tier === 'spec' && r.status === 'FAIL').length,
      safe_box_detail: safeBoxChecks.map(r => ({ label: r.name, status: r.status, detail: r.detail })),
    },
  }
}

function worldStationsQuery(stations) {
  return `stations=${stations.map(s => encodeURIComponent(s.key)).join(',')}`
}

async function certifyWorld(browser, { colors, weights, drift, stations }) {
  const pq = paletteQuery({ colors, weights, drift })
  const sq = worldStationsQuery(stations)
  const results = []
  for (const [label, url] of [
    ['html', `http://127.0.0.1:${staticPort}/concepts/world-07-ring.html?${pq}&${sq}`],
    ['react-live', `${viteServer.url}&${pq}&${sq}`],
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
  const safeBoxChecks = results.filter(r => r.name.includes('safe-box luminance cap'))
  return {
    passed: regressionFails.length === 0,
    summary: {
      regression_fail_count: regressionFails.length,
      regression_fail_names: regressionFails.map(r => r.name),
      spec_fail_count: results.filter(r => r.tier === 'spec' && r.status === 'FAIL').length,
      safe_box_detail: safeBoxChecks.map(r => ({ label: r.name, status: r.status, detail: r.detail })),
    },
  }
}

// Draws N worlds against the LIVE RING_POOL and today's certified whole-ring
// shelf (rows with stations = null — a world needs a palette AND a station
// draw). Per this plan's Global Constraints: RING_POOL has 5 radial-mass
// members against LANE_CAP(13)=4, so drawWorld() throws
// "cannot fill 13 slots under the caps" for every showId here, deterministically,
// until step 6 (pool growth, a separate art-project plan) lands. Each
// showId's failure is caught and written as its own row — one bad/every draw
// must never crash the batch, same discipline runSeedBatch already has for a
// bad generated palette.
async function runWorldBatch(n, browser) {
  const { data: shelf, error: shelfErr } = await sb.from('ring_palettes')
    .select('colors, weights, drift')
    .eq('status', 'certified').eq('ring_version', RING_VERSION).is('stations', null)
  if (shelfErr) throw new Error(`world-batch: failed to read certified shelf: ${shelfErr.message}`)
  if (!shelf.length) {
    console.log('world-batch: no certified whole-ring palettes on the shelf — run --seed-batch first.')
    return
  }

  const rows = []
  for (let s = 1; s <= n; s++) {
    const showId = String(s)
    let drawn
    try {
      drawn = drawWorld({
        base: midnightGalaxyRing, pool: RING_POOL, shelf,
        showId, baseTheme: { colors: { bg: '#08001a', bgDeep: '#040010' } },
      })
    } catch (err) {
      rows.push({
        // colors/weights/drift are NOT NULL on ring_palettes (confirmed live) —
        // a draw failure has no palette to store, so use empty placeholders
        // rather than SQL NULL. stations stays null (that column IS nullable).
        colors: [], weights: [], drift: {}, stations: null,
        status: 'failed', source: 'generated', seed: `showSeed:${showId}`,
        ring_version: RING_VERSION,
        gate_summary: { stage: 'draw', error: err.message },
        checked_at: new Date().toISOString(),
      })
      console.log(`show ${showId}: DRAW FAILED (${err.message})`)
      continue
    }
    const { world, showSeed } = drawn
    const { passed, summary } = await certifyWorld(browser, {
      colors: world.palette.colors, weights: world.palette.weights, drift: world.palette.drift,
      stations: world.stations,
    })
    rows.push({
      colors: world.palette.colors, weights: world.palette.weights, drift: world.palette.drift,
      stations: world.stations.map(st => st.key),
      status: passed ? 'certified' : 'failed', source: 'generated', seed: `showSeed:${showSeed.toString(16)}`,
      ring_version: RING_VERSION, gate_summary: summary, checked_at: new Date().toISOString(),
    })
    console.log(`show ${showId}: ${passed ? 'CERTIFIED' : 'FAILED'} (stage: gate)`)
  }

  if (rows.length) {
    // Same two-step insert-pending-then-update pattern as runSeedBatch, and
    // the same reason (INSERT policy only allows status='pending'). See that
    // function's own comment for the full RLS explanation.
    const asPending = rows.map(r => ({ ...r, status: 'pending' }))
    const { error: insErr } = await sb.from('ring_palettes')
      .upsert(asPending, { onConflict: 'source,seed,ring_version' })
    if (insErr) throw new Error(`world-batch upsert (pending) failed: ${insErr.message}`)
    for (const r of rows) {
      const { error: updErr } = await sb.from('ring_palettes')
        .update({ status: r.status })
        .eq('source', r.source).eq('seed', r.seed).eq('ring_version', r.ring_version)
      if (updErr) throw new Error(`world-batch status update failed for seed=${r.seed}: ${updErr.message}`)
    }
  }
  console.log(`\n${rows.filter(r => r.status === 'certified').length}/${rows.length} worlds certified, written to ring_palettes.`)
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
  // 2026-09-24 (Ben: certified palettes kept clustering around violet/red —
  // "tired of current duos"). Root cause, found via Codex read-only review:
  // this loop used to spend its ENTIRE real-gate budget on the first
  // candidate generatePalette() handed back (already just the first one to
  // pass the generator's own cheap checks) — one real-gate failure sank the
  // whole seed slot, no retry with a different hue pairing. A generated
  // blue/green pair can clear the generator's cheap MIN_SEPARATION=60° check
  // and still fail the real gate's safe-box luminance cap (station 0's fixed
  // base hue disadvantages some hue families there — see "Plum & Ember" in
  // paletteGenerator.js) — so one roll per seed was never enough exploration
  // to find the surviving diverse pairs that DO exist (e.g. "Amazon Dusk").
  // Fix: each seed slot gets SEED_RETRIES independent candidates (distinct
  // sub-seeds, not re-tries of the same one) against the REAL gate before
  // giving up — multiplies the search without touching DEAD_BAND,
  // ANCHOR_WINDOW, or any certification threshold (all Ben's call, untouched
  // here). Only the seed slot's FIRST certified candidate is kept; if none
  // certify, the row records the last attempt's failure (same one-row-per-
  // slot shape as before, just backed by more real search per slot).
  const SEED_RETRIES = 5
  for (let s = 1; s <= n; s++) {
    let result = null
    for (let attempt = 1; attempt <= SEED_RETRIES; attempt++) {
      const subSeed = seedFrom(`${s}:${attempt}`)
      const candidate = generatePalette(subSeed, midnightGalaxyRing, { colors: { bg: '#08001a', bgDeep: '#040010' } })
      if (candidate.fallback) continue // fallback IS BASE_PALETTE, already shelved above as PRESETS[0]
      const { passed, summary } = await certifyPalette(browser, candidate)
      result = { candidate, passed, summary, attempt }
      console.log(`seed ${s} attempt ${attempt}/${SEED_RETRIES}: ${passed ? 'CERTIFIED' : 'FAILED'} (${summary.regression_fail_count} regression FAIL, ${summary.spec_fail_count} spec FAIL)`)
      if (passed) break
    }
    if (!result) continue // every attempt this slot tried was a fallback
    const { candidate, passed, summary, attempt } = result
    rows.push({
      colors: candidate.colors, weights: candidate.weights, drift: candidate.drift,
      status: passed ? 'certified' : 'failed', source: 'generated', seed: `${s}:${attempt}`,
      ring_version: RING_VERSION, gate_summary: summary, checked_at: new Date().toISOString(),
    })
  }
  if (rows.length) {
    // Two-step, not one upsert: the INSERT policy only allows status =
    // 'pending' (only UPDATE may flip to certified/failed), and there's no
    // SUPABASE_SERVICE_ROLE_KEY configured here to bypass RLS — elevateIfNeeded
    // always takes the host-PIN path. A brand-new row upserted with its real
    // computed status is an INSERT, so WITH CHECK rejects the whole
    // multi-row statement the instant one row fails it (confirmed live:
    // "new row violates row-level security policy for table ring_palettes").
    //
    // Step 1: insert every row as 'pending' first — satisfies the INSERT
    // policy. gate_summary/checked_at can already be the real computed
    // values here — the INSERT check only restricts `status`. Still an
    // upsert (not insert) so re-running --seed-batch over the same
    // seeds/presets updates, not duplicates — the unique index on
    // (source, seed, ring_version) is the conflict target.
    const asPending = rows.map(r => ({ ...r, status: 'pending' }))
    const { error: insErr } = await sb.from('ring_palettes')
      .upsert(asPending, { onConflict: 'source,seed,ring_version' })
    if (insErr) throw new Error(`upsert (pending) failed: ${insErr.message}`)

    // Step 2: flip each row to its REAL computed status — the UPDATE
    // policy has no status restriction, so a host-PIN-elevated session can
    // do this even though it couldn't INSERT a non-pending row.
    for (const r of rows) {
      const { error: updErr } = await sb.from('ring_palettes')
        .update({ status: r.status })
        .eq('source', r.source).eq('seed', r.seed).eq('ring_version', r.ring_version)
      if (updErr) throw new Error(`status update failed for source=${r.source} seed=${r.seed}: ${updErr.message}`)
    }
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
    else if (mode === '--world-batch') await runWorldBatch(Number(process.argv[3] ?? 10), browser)
    else if (mode === '--pending') await runPending(browser)
    else if (mode === '--label') {
      // Fable's original Phase 2b one-off mode — --label X --colors '...' --weights '...' [--drift N], prints a summary line, writes nothing to the DB. Left for Ben's manual spot-checks.
      console.log('(--label mode: manual one-off, prints only, matches Phase 2b of the 2026-09-02 plan — implement identically to that plan section if not already present)')
    } else {
      console.error('Usage: node concepts/tools/palette-sweep.mjs --seed-batch N | --world-batch N | --pending | --label ...')
      process.exit(2)
    }
  } finally {
    await browser.close()
    await stopServers()
  }
}
