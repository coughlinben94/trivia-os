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
// from the environment.
//
// `questions` and `phone_answers` restrict SELECT to a host_verified JWT.
// With the plain anon key they come back as ZERO ROWS AND NO ERROR —
// measured, not assumed: `select id, head:true` returns count 0 before
// verification and 1,998 after. That silent-empty shape is why those two
// are reported as SKIPPED rather than written as `[]`, which would look
// like a real backup of an empty table.
//
// Two ways to unlock them, in the order this script tries them:
//   1. SUPABASE_SERVICE_ROLE_KEY in the environment — bypasses RLS.
//   2. The host PIN (TRIVIA_HOST_PIN, or PLAYWRIGHT_HOST_PIN which is
//      already in .env.local). The script signs in anonymously and calls
//      the verify-host-pin Edge Function, which elevates that session's
//      app_metadata exactly as the browser's PIN gate does. No key to go
//      find, so this is the path a cron job can actually use.
//      Side effect worth knowing: each run creates one anonymous auth
//      user. Supabase's own guidance is to prune anonymous users
//      periodically; a nightly backup adds ~365 a year.
//
// Exit codes: 0 every attempted table was captured (tables skipped for a
// missing service key still count as 0 — the summary line names them); 1
// bad arguments or config (no url/key, wrong Supabase project, --out with
// no value); 2 anything that went wrong once the run had started,
// including an unwritable destination, so a cron job can alert on it.
//
// What this does NOT capture, so a restore is planned with open eyes:
// storage buckets (trivia-host-photos / trivia-show-media / trivia-fonts —
// every uploaded image, clip and font), the schema itself (replay
// supabase/migrations/ first, then load these rows), RLS policies and
// RPCs, and auth.users (teams.owner_uid would point at users that no
// longer exist). There is no restore script; these files are the raw
// material for one, and manifest.json says which tables are trustworthy.

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
// Deliberately absent: host_pin_attempts and team_reauth_tokens. Both are
// short-lived security state (brute-force counters, 15-minute tokens),
// deny-all to every client, and worth nothing in a restore.
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
const hostPin = env.TRIVIA_HOST_PIN || env.PLAYWRIGHT_HOST_PIN
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

// Returns true once this client's session carries host_verified, which is
// what the RLS policies on questions/phone_answers actually check. Same
// two steps HostPinGate.jsx performs in the browser: invoke the Edge
// Function, then refresh so the new app_metadata lands in the JWT.
async function elevateWithPin(pin) {
  const { error: authErr } = await sb.auth.signInAnonymously()
  if (authErr) throw new Error(`anonymous sign-in failed: ${authErr.message}`)
  const { data, error: fnErr } = await sb.functions.invoke('verify-host-pin', { body: { pin } })
  if (fnErr) throw new Error(`verify-host-pin unreachable: ${fnErr.message}`)
  if (!data?.ok) throw new Error(`host PIN rejected: ${data?.error ?? 'unknown reason'}`)
  const { data: refreshed } = await sb.auth.refreshSession()
  if (refreshed?.session?.user?.app_metadata?.host_verified !== true) {
    throw new Error('PIN accepted but the session is still not host_verified')
  }
  return true
}

async function fetchAll(table) {
  // .order('id') is load-bearing, not tidiness: Postgres guarantees no row
  // order between two separate range requests, so an unordered scan can
  // repeat one row across a page boundary and drop another — a silently
  // corrupt backup. Every table here has an `id`. fetchAllPages also
  // throws if it ever sees a duplicate id, so a future table without one
  // fails loudly instead of quietly.
  return fetchAllPages(
    (from, to) => sb.from(table).select('*').order('id').range(from, to),
    PAGE,
  )
}

const log = (...a) => { if (!quiet) console.log(...a) }

async function main() {
  mkdirSync(outDir, { recursive: true })
  log(`Trivia OS backup -> ${outDir}`)

  // Decide up front whether the RLS-locked tables are reachable, so the
  // per-table loop below never has to guess.
  let unlocked = !!serviceKey
  let how = serviceKey ? 'service role' : 'anon'
  if (!unlocked && hostPin) {
    try {
      await elevateWithPin(hostPin)
      unlocked = true
      how = 'anon + host PIN'
    } catch (e) {
      // Not fatal: the five open tables are still worth capturing, and the
      // two locked ones will be reported as skipped rather than emptied.
      log(`  note: host PIN elevation failed (${e.message}) — locked tables will be skipped`)
    }
  }
  log(`  auth: ${how}${unlocked ? ' (all tables)' : ' (questions/phone_answers will be skipped)'}`)
  log('')

  const results = []
  for (const { name, rlsLocked } of TABLES) {
    if (rlsLocked && !unlocked) {
      log(`  SKIP  ${name.padEnd(17)} needs SUPABASE_SERVICE_ROLE_KEY or the host PIN`)
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
    auth: how,
    tables: results,
  }, null, 2))

  console.log(
    `${failed.length ? 'INCOMPLETE' : 'Backup complete'}: ` +
    `${ok.length}/${TABLES.length} tables, ${totalRows} rows -> ${outDir}` +
    (skipped.length ? ` (${skipped.length} skipped: no service key or host PIN)` : '') +
    (failed.length ? ` — FAILED: ${failed.map(f => f.name).join(', ')}` : '')
  )
  if (failed.length) process.exit(2)
}

main().catch(e => { console.error(e.message); process.exit(2) })
