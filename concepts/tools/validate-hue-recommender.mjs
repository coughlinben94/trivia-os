#!/usr/bin/env node
// validate-hue-recommender.mjs — offline premise check for a hue-based
// pre-screen, before any recommender code gets built around it.
//
// 2026-09-15 root-cause session found the ring never renders a palette's
// lightness/saturation (derivePalette() only reads hue — weightedPalette.js
// hexToHslHue) and LB()'s +26 lightness boost is fill-gated (per-station
// loudness), NOT palette-weight-gated — so "pastel accent at low weight"
// was never the real failure mode. The real candidate signal is: which
// HUE each station actually lands on, per derivePalette()'s real station
// assignment (not just the raw input hex's hue) — Fable 5.1's critique on
// this session's plan named this as the untested premise before trusting
// any "smarter" recommender.
//
// This script tests ONLY that premise: does a per-station hue proxy
// (lumaProxy, already in weightedPalette.js) separate the 40 real labeled
// rows on the certification shelf (certified vs failed, safe-box luminance
// cap specifically)? Read-only — no writes, no Playwright, seconds not
// minutes. Run before writing a single line of recommender code.
//
// Usage: node concepts/tools/validate-hue-recommender.mjs

import { derivePalette, lumaProxy } from '../../client/src/lib/weightedPalette.js'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..', '..')

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
  throw new Error('validate-hue-recommender: VITE_SUPABASE_URL is not the Baynes Trivia project.')
}
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } })

// Same PIN-elevation fallback palette-sweep.mjs uses (ring_palettes SELECT
// requires host_verified, not public) — no service key needed locally.
if (!env.SUPABASE_SERVICE_ROLE_KEY) {
  const pin = env.TRIVIA_HOST_PIN || env.PLAYWRIGHT_HOST_PIN
  if (!pin) throw new Error('validate-hue-recommender: need SUPABASE_SERVICE_ROLE_KEY or TRIVIA_HOST_PIN/PLAYWRIGHT_HOST_PIN in the environment')
  const { error: authErr } = await sb.auth.signInAnonymously()
  if (authErr) throw new Error(`anonymous sign-in failed: ${authErr.message}`)
  const { data, error: fnErr } = await sb.functions.invoke('verify-host-pin', { body: { pin } })
  if (fnErr || !data?.ok) throw new Error(`host PIN elevation failed: ${fnErr?.message ?? data?.error}`)
  await sb.auth.refreshSession()
}

const { data: rows, error } = await sb.from('ring_palettes')
  .select('id, colors, weights, drift, status, source')
  .in('status', ['certified', 'failed'])
if (error) throw new Error(`fetch failed: ${error.message}`)

const scored = rows.filter(row => row.colors?.length > 0).map(row => {
  const derived = derivePalette({
    colors: row.colors,
    weights: row.weights,
    drift: row.drift ?? { arc: 0 },
  })
  const lumas = derived.hues.map(h => lumaProxy(h))
  return {
    id: row.id,
    status: row.status,
    colors: row.colors,
    maxLuma: Math.max(...lumas),
    meanLuma: lumas.reduce((a, b) => a + b, 0) / lumas.length,
  }
})

// Find the best single threshold on maxLuma (the more physically relevant
// stat — the cap is a per-station peak measurement, not a frame average)
// that separates certified from failed, and report how clean the split is.
if (scored.length === 0) throw new Error('no labeled rows with colors found — check the ring_palettes query')
const sorted = [...scored].sort((a, b) => a.maxLuma - b.maxLuma)
let best = { threshold: null, correct: 0 }
for (let i = 0; i <= sorted.length; i++) {
  const threshold = i === 0 ? sorted[0].maxLuma - 1 : i === sorted.length ? sorted[sorted.length - 1].maxLuma + 1 : (sorted[i - 1].maxLuma + sorted[i].maxLuma) / 2
  let correct = 0
  for (const s of scored) {
    const predictedFail = s.maxLuma > threshold
    if (predictedFail === (s.status === 'failed')) correct++
  }
  if (correct > best.correct) best = { threshold, correct }
}

console.log(`\n${scored.length} labeled rows (${scored.filter(s => s.status === 'certified').length} certified, ${scored.filter(s => s.status === 'failed').length} failed)\n`)
console.log('id'.padEnd(10), 'status'.padEnd(10), 'maxLuma'.padEnd(9), 'meanLuma'.padEnd(9), 'colors')
for (const s of sorted) {
  console.log(s.id.slice(0, 8).padEnd(10), s.status.padEnd(10), s.maxLuma.toFixed(1).padEnd(9), s.meanLuma.toFixed(1).padEnd(9), s.colors.join(' + '))
}

const accuracy = (best.correct / scored.length * 100).toFixed(1)
console.log(`\nBest single maxLuma threshold: ${best.threshold?.toFixed(1)} — ${best.correct}/${scored.length} correct (${accuracy}%)`)
if (accuracy >= 90) {
  console.log('VERDICT: hue-only maxLuma proxy separates the shelf cleanly. Safe to build a pre-screen recommender on this signal.')
} else if (accuracy >= 75) {
  console.log('VERDICT: hue-only proxy is directionally useful but not clean — station assignment (which hue lands on which station, not just which hues exist) likely matters too. Do not ship as a hard gate; use as a soft warning only.')
} else {
  console.log('VERDICT: hue-only maxLuma does NOT reliably separate certified from failed. Do not build a recommender on this signal alone — the missing variable Fable flagged (per-station assignment / actual rendered composition) is load-bearing, not noise.')
}
