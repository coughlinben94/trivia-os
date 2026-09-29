#!/usr/bin/env node
// certify-host-saves.mjs — carries real host-saved custom palettes forward
// across a RING_VERSION bump: reads every certified host save (source='manual',
// seed=null) under FROM_VERSION and re-runs each through the real Playwright
// gate under the CURRENT RING_VERSION. Same shape as certify-duos.mjs.
//
// Usage: node concepts/tools/certify-host-saves.mjs <FROM_VERSION>
//
// seed stays null, exactly like saveAsPending in ringPalettesClient.js. The
// (source, seed, ring_version) unique index treats NULLs as distinct, so an
// upsert on it would never conflict — rows are inserted plainly and then
// updated by id. Identical (colors, weights, drift) saves collapse to one
// row, and a tuple already present under the new version is skipped, so a
// re-run doesn't pile up duplicates.
import { chromium } from 'playwright'
import { certifyPalette, knownAnswerProbe, sb, elevateIfNeeded, startServers, stopServers } from './palette-sweep.mjs'
import { RING_VERSION } from '../../client/src/lib/ringCertification.js'

const key = p => JSON.stringify([p.colors, p.weights, p.drift])

async function hostSaves(version, status) {
  let q = sb.from('ring_palettes').select('id, colors, weights, drift')
    .eq('source', 'manual').is('seed', null).eq('ring_version', version)
  if (status) q = q.eq('status', status)
  const { data, error } = await q
  if (error) throw new Error(`certify-host-saves: read ${version} failed: ${error.message}`)
  return data
}

async function main() {
  const from = process.argv[2]
  if (!from) throw new Error('usage: certify-host-saves.mjs <FROM_VERSION>')
  if (from === RING_VERSION) throw new Error(`FROM_VERSION equals current RING_VERSION (${RING_VERSION})`)
  await elevateIfNeeded()

  const old = await hostSaves(from, 'certified')
  const already = new Set((await hostSaves(RING_VERSION)).map(key))
  const todo = [...new Map(old.map(p => [key(p), p])).values()].filter(p => !already.has(key(p)))
  console.log(`${old.length} certified host saves under ${from}; ${todo.length} distinct left to certify under ${RING_VERSION}.`)
  if (!todo.length) return

  await startServers()
  const browser = await chromium.launch()
  let certified = 0
  try {
    await knownAnswerProbe(browser) // plumbing broken = every row would be a lie
    for (const p of todo) {
      const { passed, summary } = await certifyPalette(browser, p)
      // INSERT RLS only allows status='pending'; UPDATE may set the real one.
      const { data, error: insErr } = await sb.from('ring_palettes').insert({
        colors: p.colors, weights: p.weights, drift: p.drift, stations: null,
        source: 'manual', seed: null, ring_version: RING_VERSION, status: 'pending',
        gate_summary: summary, checked_at: new Date().toISOString(),
      }).select('id').single()
      if (insErr) throw new Error(`certify-host-saves: insert failed for ${key(p)}: ${insErr.message}`)
      const { error: updErr } = await sb.from('ring_palettes')
        .update({ status: passed ? 'certified' : 'failed' }).eq('id', data.id)
      if (updErr) throw new Error(`certify-host-saves: status update failed for ${key(p)}: ${updErr.message}`)
      if (passed) certified++
      console.log(`${key(p)} (from ${p.id}): ${passed ? 'CERTIFIED' : 'FAILED — ' + summary.regression_fail_names.join(', ')}`)
    }
  } finally {
    await browser.close()
    await stopServers()
  }
  console.log(`\n${certified}/${todo.length} host saves certified under ${RING_VERSION}.`)
  if (certified !== todo.length) process.exitCode = 1
}

main().catch(err => { console.error(err); process.exit(1) })
