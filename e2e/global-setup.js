// global-setup.js — authenticates past HostPinGate once, saves the resulting
// Supabase session (anonymous auth + app_metadata.host_verified claim,
// persisted in localStorage per HostPinGate.jsx's own comment) to disk so
// every spec that needs /host can reuse it via playwright.config.js's
// `use.storageState`, instead of re-running the PIN flow per test.
//
// HostPinGate only renders once a show is "loaded" — Host.jsx shows an
// in-page ShowPicker otherwise, not a redirect — so this seeds the same
// show every other spec in this suite already defaults to.
//
// 2026-09-02: the old default (show_fQtKIq7M) no longer exists in the DB.
// A dead id here means /host falls back to the ShowPicker instead of ever
// rendering HostPinGate, so this file timed out waiting for "Enter host
// PIN" — a mystery failure that blocked EVERY spec in e2e/, and silently
// made `npm run ship` exit SHIP_BLOCKED (scripts/ship.sh runs test:smoke
// with no PLAYWRIGHT_SHOW_ID set). Now defaults to show_NyRe6x2Q (Aug 18
// 2026 — the oldest of the three real shows on hand, so least likely to
// get deleted or moved mid-run) and the existence check below turns any
// future dead default into a clear error instead of a 15s timeout.

import { chromium } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

const SHOW_ID = process.env.PLAYWRIGHT_SHOW_ID || 'show_NyRe6x2Q'
const STORAGE_STATE_PATH = 'e2e/.auth/host.json'

export default async function globalSetup(config) {
  const PIN = process.env.PLAYWRIGHT_HOST_PIN
  if (!PIN) {
    throw new Error('PLAYWRIGHT_HOST_PIN env var not set — add it to .env.local (gitignored, never commit the real PIN)')
  }

  const baseURL = config.projects[0].use.baseURL
  const browser = await chromium.launch()
  const page = await browser.newPage()

  // Vercel Deployment Protection (SSO wall) blocks unauthenticated access to
  // every non-custom-domain deployment URL under this project — including
  // every preview/build URL, which is exactly what Davos's deploy-watchdog
  // tests pre-promotion (docs/superpowers/specs/2026-07-24-tier3-task5-
  // trivia-os-ship-pipeline-design.md, addenda 2 and 3). Bypass header goes
  // here, not in playwright.config.js's `use` block — config.use options
  // don't apply to a globalSetup-launched browser (addendum 2's original
  // mistake). Scoped to the deployment's own origin via page.route(), NOT
  // context-wide extraHTTPHeaders (addendum 2's second mistake, found live):
  // extraHTTPHeaders attaches to every request on every origin, including
  // this app's own Supabase calls — Supabase's CORS preflight then rejects
  // the unrecognized custom header outright (ERR_FAILED), breaking the PIN
  // verify round-trip entirely. Routing only intercepts same-origin requests,
  // so Supabase traffic is untouched. x-vercel-set-bypass-cookie sets a
  // cookie on the deployment host that storageState (below) then carries to
  // every spec, so this is the only place the header needs to be sent at all.
  const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
  if (bypassSecret) {
    const deploymentOrigin = new URL(baseURL).origin
    await page.route(
      (url) => url.origin === deploymentOrigin,
      (route) =>
        route.continue({
          headers: {
            ...route.request().headers(),
            'x-vercel-protection-bypass': bypassSecret,
            'x-vercel-set-bypass-cookie': 'true',
          },
        })
    )
  }

  // Fail fast with a real reason instead of a 15s "Enter host PIN" timeout
  // that gives no hint the actual problem is a dead show id (see note above).
  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
  const { data: showRow } = await supabase.from('shows').select('id').eq('id', SHOW_ID).maybeSingle()
  if (!showRow) {
    throw new Error(`PLAYWRIGHT_SHOW_ID "${SHOW_ID}" does not exist — pick a real show id.`)
  }

  await page.addInitScript((id) => {
    localStorage.setItem('trivia-os:activeShowId', id)
  }, SHOW_ID)

  await page.goto(`${baseURL}/host`, { waitUntil: 'networkidle' })

  const pinHeading = page.getByRole('heading', { name: 'Enter host PIN' })
  await pinHeading.waitFor({ state: 'visible', timeout: 15_000 })

  await page.getByPlaceholder('••••').fill(PIN)
  await page.getByRole('button', { name: 'Unlock' }).click()

  // Round-trips through verify-host-pin (Edge Function) + refreshSession —
  // give it real time rather than a fixed sleep.
  await pinHeading.waitFor({ state: 'hidden', timeout: 15_000 })

  await page.context().storageState({ path: STORAGE_STATE_PATH })
  await browser.close()
}
