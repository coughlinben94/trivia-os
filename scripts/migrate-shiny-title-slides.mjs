#!/usr/bin/env node
// One-time migration: give every shiny group in an EXISTING show its own
// standalone `shiny-title` slide (SPEC.md "Standalone Shiny Title Slide",
// 2026-09-01) and strip the old introDone/outroShown swap flags.
//
// Dry run by default — prints what it would do and writes nothing.
//
//   cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os
//   node scripts/migrate-shiny-title-slides.mjs show_kCUJXcz1            # preview
//   node scripts/migrate-shiny-title-slides.mjs show_kCUJXcz1 --write    # apply
//
// Env: VITE_SUPABASE_URL is read from .env.local at the repo root (same
// file the e2e specs read). Writes to `shows` are RLS-gated on a
// host_verified JWT ("host write shows" policy), so the anon key cannot
// apply this — set SUPABASE_SERVICE_ROLE_KEY in the environment (or add it
// to .env.local; it is NOT there today). Dry runs work with the anon key.
//
// Refuses to write to a show touched in the last 2 hours unless --force is
// also passed: inserting slides shifts current_slide_index under a running
// show. The guard is recency (shows.updated_at), NOT is_live — nothing in
// the app ever writes is_live back to false (LiveMode's exit is local UI
// state), so every show that has ever gone live reads as live forever and
// an is_live guard would refuse every write, making --force the habit.
// Run it after the show ends.
//
// Idempotent — re-running on a migrated show reports "nothing to do".
// The transform itself is client/src/lib/shinyTitleMigration.js (unit
// tested); this file is only the Supabase plumbing around it.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { migrateShinyTitleSlides } from '../client/src/lib/shinyTitleMigration.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const showId = args.find(a => !a.startsWith('--'))
const write = args.includes('--write')
const force = args.includes('--force')
if (!showId) {
  console.error('Usage: node scripts/migrate-shiny-title-slides.mjs <show_id> [--write] [--force]')
  process.exit(1)
}

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
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY
if (!url || !key) { console.error('Missing VITE_SUPABASE_URL / key — see header comment.'); process.exit(1) }
if (write && !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('--write needs SUPABASE_SERVICE_ROLE_KEY (shows writes are RLS-gated on host_verified; the anon key cannot apply this).')
  process.exit(1)
}
const sb = createClient(url, key, { auth: { persistSession: false } })

const { data: show, error } = await sb.from('shows').select('id, title, updated_at, slides, current_slide_id').eq('id', showId).single()
if (error || !show) { console.error('Could not load show:', error?.message ?? 'not found'); process.exit(1) }

const RECENT_MS = 2 * 60 * 60 * 1000
const updatedAgoMs = show.updated_at ? Date.now() - new Date(show.updated_at).getTime() : Infinity
const recentlyTouched = updatedAgoMs < RECENT_MS

const result = migrateShinyTitleSlides(show.slides ?? [])
console.log(`${show.title ?? show.id} (${show.id}) — ${show.slides?.length ?? 0} slides, last updated: ${show.updated_at ?? 'unknown'}`)
if (!result.changed) { console.log('Already migrated — nothing to do.'); process.exit(0) }
for (const t of result.inserted) console.log(`  + shiny-title "${t.title}" before ${t.before} (${t.members} member${t.members === 1 ? '' : 's'})`)
console.log(`  ${result.inserted.length} title slide(s) to insert, ${result.stripped} slide(s) to strip introDone/outroShown from, ${result.stamped} legacy slide(s) to stamp a shinyGroupId on`)

if (!write) { console.log('Dry run — pass --write to apply.'); process.exit(0) }
if (recentlyTouched && !force) {
  console.error(`Show was updated ${Math.round(updatedAgoMs / 60000)} min ago (< 2h) — it may be mid-show. Refusing to write. Pass --force to override.`)
  process.exit(1)
}

// Keep current_slide_index pointing at the same slide it did before the
// inserts shifted everything after them.
const patch = { slides: result.slides }
if (show.current_slide_id) {
  const idx = result.slides.findIndex(s => s.id === show.current_slide_id)
  if (idx !== -1) patch.current_slide_index = idx
}
const { error: writeErr } = await sb.from('shows').update(patch).eq('id', showId)
if (writeErr) { console.error('Write failed:', writeErr.message); process.exit(1) }
console.log(`Wrote ${result.slides.length} slides.`)
