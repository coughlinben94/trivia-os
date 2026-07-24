// global-setup.js — authenticates past HostPinGate once, saves the resulting
// Supabase session (anonymous auth + app_metadata.host_verified claim,
// persisted in localStorage per HostPinGate.jsx's own comment) to disk so
// every spec that needs /host can reuse it via playwright.config.js's
// `use.storageState`, instead of re-running the PIN flow per test.
//
// HostPinGate only renders once a show is "loaded" — Host.jsx shows an
// in-page ShowPicker otherwise, not a redirect — so this seeds the same
// Test show (show_fQtKIq7M) every other spec in this suite already defaults to.

import { chromium } from '@playwright/test'

const SHOW_ID = process.env.PLAYWRIGHT_SHOW_ID || 'show_fQtKIq7M'
const STORAGE_STATE_PATH = 'e2e/.auth/host.json'

export default async function globalSetup(config) {
  const PIN = process.env.PLAYWRIGHT_HOST_PIN
  if (!PIN) {
    throw new Error('PLAYWRIGHT_HOST_PIN env var not set — add it to .env.local (gitignored, never commit the real PIN)')
  }

  const baseURL = config.projects[0].use.baseURL
  const browser = await chromium.launch()
  const page = await browser.newPage()

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
