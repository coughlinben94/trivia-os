#!/usr/bin/env node
// Read-only snapshot of every Trivia OS table to dated JSON files.
//
// Why this exists: the only backup before this was "export one show's JSON
// from the host panel, by hand". The Supabase project is on a plan with no
// point-in-time recovery, so a bad migration or a mistaken delete had no
// undo — and a migration HAS already run against the wrong project once
// (SKILL.md, Critical Rule 7). This writes nothing to the database.
//
//   cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os
//   node scripts/backup-db.mjs                    # -> ~/Baynes-Backups/trivia-os/<date>/
//   node scripts/backup-db.mjs --out /some/dir    # somewhere else
//   node scripts/backup-db.mjs --quiet            # only the summary line (for cron)
//
// Default destination is OUTSIDE the repo on purpose: a `git clean -fdx`
// here would otherwise delete the backups along with the scratch files.
//
// Env: VITE_SUPABASE_URL + a key, read from .env.local at the repo root
// (same file the e2e specs and the migration script read), overridable
// from the environment. `questions` and `phone_answers` have RLS that
// restricts SELECT to a host_verified JWT, so the anon key returns zero
// rows for them rather than erroring — set SUPABASE_SERVICE_ROLE_KEY to
// capture those two. Every other table reads fine with the anon key.
//
// Exit codes: 0 every attempted table was captured (tables skipped for a
// missing service key still count as 0 — the summary line names them); 1
// could not start (no url/key, wrong Supabase project, bad --out); 2 at
// least one table errored, so a cron job can alert on it.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import { createClient } from '@supabase/supabase-js'
import { fetchAllPages } from '../client/src/lib/fetchAllPages.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const quiet = args.includes('--quiet')
const outFlag = args.indexOf('--out')
if (outFlag !== -1 && !args[outFlag + 1]) {
  console.error('--out needs a directory path')
  process.exit(1)
}

// Every table the app owns. `rlsLocked` marks the two whose SELECT policy
// requires a host_verified JWT (migrations 20260817171310 and
// 20260817193000) — with only the anon key those come back as zero rows,
// which is indistinguishable from an empty table, so they are reported as
// SKIPPED rather than silently written as `[]` over a good prior backup.
const TABLES = [
  { name: 'shows' },
  { name: 'teams' },
  { name: 'team_scores' },
  { name: 'scoreboard_teams' },
  { name: 'shiny_formats' },
  { name: 'questions', rlsLocked: true },
  { name: 'phone_answers', rlsLocked: true },
]

// Supabase caps a select at 1000 rows per request. `questions` alone is
// ~1,900, so paging is required for correctness, not politeness — a
// single select would silently truncate the most valuable table here.
const PAGE = 1000

function parseEnvFile(path) {
  try {
    return Object.fromEntries(
      readFileSync(path, 'utf8').split('\n')
        .filter(l => l.trim() && !l.trim().startsWith('#') && l.includes('='))
        .map(l => { const i = l.indexOf('='); let v = l.slice(i + 1).trim(); if (/^(".*"|'.*')$/.test(v)) v = v.slice(1, -1); return [l.slice(0, i).trim(), v] })
    )
  } catch { return {} }
}

const env = { ...parseEnvFile(join(__dirname, '..', '.env.local')), ...process.env }
const url = env.VITE_SUPABASE_URL
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
const key = serviceKey || env.VITE_SUPABASE_ANON_KEY
if (!url || !key) {
  console.error('Missing VITE_SUPABASE_URL / key — see the header comment.')
  process.exit(1)
}

// Guard against the mistake that already cost a production 404: this is
// the Baynes Trivia project, never Baynes Business Suite.
const EXPECTED_PROJECT = 'qwtbgusqfoypvehnungr'
if (!url.includes(EXPECTED_PROJECT)) {
  console.error(`Refusing to run: VITE_SUPABASE_URL is not the Baynes Trivia project (${EXPECTED_PROJECT}).`)
  console.error(`  got: ${url}`)
  process.exit(1)
}

const stamp = new Date().toISOString().slice(0, 10)
const baseDir = outFlag !== -1
  ? resolve(args[outFlag + 1])
  : join(homedir(), 'Baynes-Backups', 'trivia-os')
const outDir = join(baseDir, stamp)

const sb = createClient(url, key, { auth: { persistSession: false } })

async function fetchAll(table) {
  return fetchAllPages(
    (from, to) => sb.from(table).select('*').range(from, to),
    PAGE,
  )
}

const log = (...a) => { if (!quiet) console.log(...a) }

async function main() {
  mkdirSync(outDir, { recursive: true })
  log(`Trivia OS backup -> ${outDir}`)
  log(serviceKey ? '  key: service role (all tables)' : '  key: anon (questions/phone_answers will be skipped)')
  log('')

  const results = []
  for (const { name, rlsLocked } of TABLES) {
    if (rlsLocked && !serviceKey) {
      log(`  SKIP  ${name.padEnd(17)} needs SUPABASE_SERVICE_ROLE_KEY`)
      results.push({ name, status: 'skipped' })
      continue
    }
    try {
      const rows = await fetchAll(name)
      const file = join(outDir, `${name}.json`)
      writeFileSync(file, JSON.stringify(rows, null, 2))
      // Read back what landed on disk: a truncated or unwritable file is
      // worth catching here rather than the day the backup is needed.
      const back = JSON.parse(readFileSync(file, 'utf8'))
      if (back.length !== rows.length) throw new Error(`wrote ${rows.length} rows, read back ${back.length}`)
      log(`  ok    ${name.padEnd(17)} ${String(rows.length).padStart(5)} rows`)
      results.push({ name, status: 'ok', rows: rows.length })
    } catch (e) {
      log(`  FAIL  ${name.padEnd(17)} ${e.message}`)
      results.push({ name, status: 'failed', error: e.message })
    }
  }

  const ok = results.filter(r => r.status === 'ok')
  const failed = results.filter(r => r.status === 'failed')
  const skipped = results.filter(r => r.status === 'skipped')
  const totalRows = ok.reduce((n, r) => n + r.rows, 0)

  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify({
    takenAt: new Date().toISOString(),
    project: EXPECTED_PROJECT,
    keyKind: serviceKey ? 'service_role' : 'anon',
    tables: results,
  }, null, 2))

  console.log(
    `${failed.length ? 'INCOMPLETE' : 'Backup complete'}: ` +
    `${ok.length}/${TABLES.length} tables, ${totalRows} rows -> ${outDir}` +
    (skipped.length ? ` (${skipped.length} skipped: no service key)` : '') +
    (failed.length ? ` — FAILED: ${failed.map(f => f.name).join(', ')}` : '')
  )
  if (failed.length) process.exit(2)
}

main().catch(e => { console.error(e.message); process.exit(2) })
