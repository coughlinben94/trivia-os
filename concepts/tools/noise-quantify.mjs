// TASK 1.5 step 1: quantify gate non-determinism across N runs of unchanged
// code. Parses N ring-verify.mjs CLI outputs (same format printTier() emits:
// "STATUS NAME<pad>  DETAIL", status always exactly 4 chars), groups by
// check name, extracts every numeric token from `detail` (regex, positional),
// and reports min/max/spread per numeric position where it's non-zero. Text-
// parsing rather than importing runChecks() directly because the 5 baseline
// runs were already kicked off via the real CLI before this script existed —
// this validates the actual `npm run verify:ring` output, not a reimplemented
// path.
//
// THIS IS THE FORMALIZED SENTINEL STEP (a) — "noise floor" — for the sweep
// driver queued as a later task (concepts/tools/ring-sweep.mjs, not built
// this round). Per the standing instruction from the 2026-08-09 session that
// found instrument eight (see FAILURE-LEDGER.md): "its noise-floor step is
// the control you just ran by hand [render baseline twice/N times unchanged,
// the delta is epsilon; if epsilon is large, the metric is unstable, abort]
// — formalise that exact procedure as step (a), and keep it even after the
// freeze — epsilon should come out at zero now, and if it ever doesn't,
// something regressed." When the sweep driver is built: run this (or an
// N=2 fast variant) against the CURRENT code before every sweep starts;
// non-zero spread on the target check/metric means abort before spending a
// single sweep iteration on a metric that can't hold still. As of the
// 2026-08-09 freeze fix, running this against `npm run verify:ring` output
// should report "0 show variance" every time — that IS the sentinel passing.
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

const dir = process.argv[2]
if (!dir) { console.error('Usage: node noise-quantify.mjs <dir-of-run-files>'); process.exit(2) }
const files = readdirSync(dir).filter(f => f.endsWith('.txt')).sort()
if (files.length < 2) { console.error('need >=2 run files'); process.exit(2) }

const LINE_RE = /^(PASS|FAIL|WARN) (.+?)\s{2,}(.*)$/

function parseRun(text) {
  const rows = new Map() // name -> detail
  for (const line of text.split('\n')) {
    const m = line.match(LINE_RE)
    if (!m) continue
    const [, status, name, detail] = m
    rows.set(name, { status, detail })
  }
  return rows
}

const runs = files.map(f => parseRun(readFileSync(path.join(dir, f), 'utf8')))
const allNames = new Set()
runs.forEach(r => r.forEach((_, name) => allNames.add(name)))

const NUM_RE = /-?\d+\.\d+|-?\d+/g

let anyVariance = false
const report = []
for (const name of allNames) {
  const details = runs.map(r => r.get(name)?.detail ?? null)
  const statuses = runs.map(r => r.get(name)?.status ?? null)
  const statusVaries = new Set(statuses).size > 1
  if (statusVaries) {
    report.push({ name, kind: 'STATUS FLIP', statuses })
    anyVariance = true
    continue
  }
  if (details.some(d => d === null)) {
    report.push({ name, kind: 'MISSING IN SOME RUN', statuses })
    anyVariance = true
    continue
  }
  const tokenLists = details.map(d => (d.match(NUM_RE) || []).map(Number))
  const lens = new Set(tokenLists.map(t => t.length))
  if (lens.size > 1) {
    report.push({ name, kind: 'TOKEN COUNT MISMATCH (can\'t align positionally)', detail0: details[0] })
    anyVariance = true
    continue
  }
  const n = tokenLists[0].length
  const spreads = []
  for (let i = 0; i < n; i++) {
    const vals = tokenLists.map(t => t[i])
    const min = Math.min(...vals), max = Math.max(...vals)
    if (max - min > 0) spreads.push({ i, vals, min, max, spread: +(max - min).toFixed(3) })
  }
  if (spreads.length > 0) {
    report.push({ name, kind: 'NUMERIC SPREAD', spreads, detail0: details[0] })
    anyVariance = true
  }
}

console.log(`${files.length} runs parsed: ${files.join(', ')}`)
console.log(`${allNames.size} distinct checks, ${report.length} show variance\n`)

for (const r of report) {
  console.log(`── ${r.name}`)
  if (r.kind === 'STATUS FLIP') { console.log(`   STATUS FLIP: ${r.statuses.join(' / ')}`); continue }
  if (r.kind === 'MISSING IN SOME RUN') { console.log(`   MISSING IN SOME RUN: ${r.statuses.join(' / ')}`); continue }
  if (r.kind.startsWith('TOKEN COUNT')) { console.log(`   ${r.kind}`); console.log(`   run0: ${r.detail0}`); continue }
  for (const s of r.spreads) {
    console.log(`   token[${s.i}]: values=[${s.vals.join(',')}] min=${s.min} max=${s.max} spread=${s.spread}`)
  }
}

if (!anyVariance) console.log('ZERO variance across all runs, all checks.')
