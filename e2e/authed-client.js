// authed-client.js — the Supabase client e2e specs must use for DB writes.
//
// WHY THIS EXISTS
//
// Writes to `shows` are RLS-gated on a host_verified JWT. A bare anon client
// (`createClient(url, ANON_KEY)`) gets its UPDATE silently dropped: PostgREST
// answers an unauthorized-but-well-formed UPDATE with "0 rows changed", NOT an
// error, and supabase-js does not treat "matched nothing" as a failure. So a
// spec's beforeAll seeding write and its afterAll restore-to-snapshot write
// both no-op without a peep, while the drag/click the TEST performs — running
// in the browser context, which global-setup.js HAS authenticated — succeeds.
//
// Net effect: the mutation lands and the cleanup doesn't, permanently
// rewriting whatever show the spec pointed at. That defect quarantined both
// wizard-create-verify.spec.js (2026-07-03) and drag-reorder.spec.js
// (2026-09-02); both named this file's job as their exit criteria.
//
// Two things fix it, and specs need BOTH:
//   1. authedClient() — reuses the host session global-setup.js already mints,
//      so the write is actually permitted.
//   2. updateShowVerified() — asserts a row came back, so a future silent
//      0-row write fails loudly instead of rotting into another lost cleanup.
//
// Self-check (does not touch the DB):  node e2e/authed-client.js

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const STORAGE_STATE_PATH = join(__dirname, '.auth', 'host.json')

// HostPinGate persists the verified session in localStorage under Supabase's
// own `sb-<project-ref>-auth-token` key, and global-setup.js snapshots that
// into storageState. Pull the access token back out of it.
export function hostAccessToken(statePath = STORAGE_STATE_PATH) {
  let state
  try {
    state = JSON.parse(readFileSync(statePath, 'utf8'))
  } catch {
    throw new Error(
      `[e2e] no saved host session at ${statePath}. Run the suite normally once ` +
      `(global-setup.js mints it), or check PLAYWRIGHT_HOST_PIN in .env.local.`
    )
  }

  for (const origin of state.origins ?? []) {
    for (const { name, value } of origin.localStorage ?? []) {
      if (!name.startsWith('sb-') || !name.endsWith('-auth-token')) continue
      const token = JSON.parse(value)?.access_token
      if (token) return token
    }
  }
  throw new Error(
    `[e2e] ${statePath} has no sb-*-auth-token entry — the PIN flow did not ` +
    `complete. Delete the file and re-run so global-setup.js re-mints it.`
  )
}

// Seconds until the JWT expires; negative once it has. Reading `exp` off the
// payload is enough — we are not verifying the signature, just refusing to
// start a run whose writes would 401 halfway through and strand a cleanup.
export function tokenSecondsRemaining(token) {
  const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'))
  return payload.exp - Math.floor(Date.now() / 1000)
}

// Env comes from playwright.config.js's process.loadEnvFile('.env.local'),
// which every worker re-runs — the same way global-setup.js and
// join-smoke.spec.js already read these.
export function authedClient() {
  const token = hostAccessToken()
  const left = tokenSecondsRemaining(token)
  if (left <= 0) {
    throw new Error(
      `[e2e] the saved host session expired ${-left}s ago. Delete e2e/.auth/host.json ` +
      `and re-run so global-setup.js mints a fresh one — do NOT run writes with a ` +
      `dead token, the cleanup write is what fails.`
    )
  }
  return createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
}

// Every `shows` write a spec makes must go through here. Returns the updated
// row; throws if RLS silently matched nothing — the exact failure that made
// both quarantined specs unsafe.
export async function updateShowVerified(sb, showId, patch) {
  const { data, error } = await sb.from('shows').update(patch).eq('id', showId).select('id')
  if (error) throw new Error(`[e2e] shows UPDATE failed for ${showId}: ${error.message}`)
  if (!data?.length) {
    throw new Error(
      `[e2e] shows UPDATE for ${showId} affected 0 rows — RLS rejected it, or the ` +
      `show does not exist. The write did NOT land; treat any cleanup as failed.`
    )
  }
  return data[0]
}

// node e2e/authed-client.js — reports session health without touching the DB.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    const token = hostAccessToken()
    const left = tokenSecondsRemaining(token)
    console.log(
      left > 0
        ? `OK — host session valid for ${Math.floor(left / 60)}m ${left % 60}s.`
        : `EXPIRED ${-left}s ago — delete e2e/.auth/host.json and re-run the suite.`
    )
    process.exit(left > 0 ? 0 : 1)
  } catch (err) {
    console.error(err.message)
    process.exit(1)
  }
}
