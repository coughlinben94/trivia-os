#!/usr/bin/env node
// certify-duos.mjs — re-certifies every DUO_PALETTES entry against the real
// Playwright gate under the CURRENT RING_VERSION. Run after any change to
// weightedPalette.js's drift algorithm or a RING_VERSION bump — duoGraph.js's
// own header comment requires every entry here to be a real certified shelf
// row, not just a plausible-looking one.
//
// Rows go in as source='manual', seed='duo:<name>': ring_palettes has a
// CHECK constraint limiting source to generated/manual/preset (verified live
// 2026-09-28), so a 'duo' source would be rejected. Nothing on the client
// filters by source, and the seed prefix keeps these distinct from host
// saves (which carry seed=null) under the (source, seed, ring_version)
// unique index.
import { chromium } from 'playwright'
import { certifyPalette, knownAnswerProbe, sb, elevateIfNeeded, startServers, stopServers } from './palette-sweep.mjs'
import { DUO_PALETTES } from '../../client/src/lib/duoGraph.js'
import { RING_VERSION } from '../../client/src/lib/ringCertification.js'

async function main() {
  await elevateIfNeeded()
  await startServers()
  const browser = await chromium.launch()
  let certified = 0
  const total = Object.keys(DUO_PALETTES).length
  try {
    await knownAnswerProbe(browser) // plumbing broken = every row would be a lie
    for (const [name, palette] of Object.entries(DUO_PALETTES)) {
      const { passed, summary } = await certifyPalette(browser, palette)
      const row = {
        colors: palette.colors, weights: palette.weights, drift: palette.drift, stations: null,
        source: 'manual', seed: `duo:${name}`, ring_version: RING_VERSION,
        gate_summary: summary, checked_at: new Date().toISOString(),
      }
      // Same two-step pattern as palette-sweep.mjs's runSeedBatch: the INSERT
      // RLS policy only allows status='pending'; UPDATE may set the real one.
      const { error: insErr } = await sb.from('ring_palettes')
        .upsert([{ ...row, status: 'pending' }], { onConflict: 'source,seed,ring_version' })
      if (insErr) throw new Error(`certify-duos: upsert (pending) failed for ${name}: ${insErr.message}`)
      const { error: updErr } = await sb.from('ring_palettes')
        .update({ status: passed ? 'certified' : 'failed' })
        .eq('source', row.source).eq('seed', row.seed).eq('ring_version', RING_VERSION)
      if (updErr) throw new Error(`certify-duos: status update failed for ${name}: ${updErr.message}`)
      if (passed) certified++
      console.log(`${name}: ${passed ? 'CERTIFIED' : 'FAILED — ' + summary.regression_fail_names.join(', ')}`)
    }
  } finally {
    await browser.close()
    await stopServers()
  }
  console.log(`\n${certified}/${total} duos certified under ${RING_VERSION}.`)
  if (certified !== total) process.exitCode = 1
}

main().catch(err => { console.error(err); process.exit(1) })
