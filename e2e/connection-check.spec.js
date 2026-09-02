/**
 * Connection health checks — runs against the live deploy.
 *
 * Tests that Supabase data loads, realtime channel connects, and the
 * new winner-reveal slide type doesn't break the host or display.
 *
 *   npx playwright test e2e/connection-check.spec.js
 *
 * Uses SHOW_ID to seed localStorage so tests reach HostInner directly.
 */

import { test, expect } from '@playwright/test'

// show_fQtKIq7M no longer exists in the DB (2026-09-02) — was silently breaking
// global-setup.js for every spec in this suite. show_NyRe6x2Q is real, verified.
const SHOW_ID = process.env.PLAYWRIGHT_SHOW_ID || 'show_NyRe6x2Q'

function attachErrors(page) {
  const errors = []
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`))
  page.on('console', m => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`) })
  return errors
}

async function seedShow(page) {
  await page.addInitScript((id) => {
    localStorage.setItem('trivia-os:activeShowId', id)
  }, SHOW_ID)
}

// ── 1. Supabase query: show list loads on cold /host ─────────────────────────
test('Supabase: show list loads on /host (no show seeded)', async ({ page }) => {
  const errors = attachErrors(page)
  await page.goto('/host', { waitUntil: 'networkidle' })
  await expect(page.locator('text=Loading…')).not.toBeVisible({ timeout: 8000 })
  expect(errors, `JS errors:\n${errors.join('\n')}`).toHaveLength(0)
})

// ── 2. Supabase: show data hydrates HostInner ────────────────────────────────
test('Supabase: show data hydrates host editor', async ({ page }) => {
  const errors = attachErrors(page)
  await seedShow(page)
  await page.goto('/host', { waitUntil: 'networkidle' })
  // Go Live → only renders after useShow() resolves with data
  await expect(page.getByText('Go Live →')).toBeVisible({ timeout: 10000 })
  expect(errors, `JS errors:\n${errors.join('\n')}`).toHaveLength(0)
})

// ── 3. Supabase realtime: no disconnect banner after subscribe ────────────────
test('Supabase realtime: reconnect banner absent after host loads', async ({ page }) => {
  await seedShow(page)
  await page.goto('/host', { waitUntil: 'networkidle' })
  await expect(page.getByText('Go Live →')).toBeVisible({ timeout: 10000 })
  // Give the realtime channel time to complete subscribe handshake
  await page.waitForTimeout(3000)
  await expect(page.getByText('Connection lost')).not.toBeVisible()
})

// ── 4. Dashboard: all key type cards visible (smoke for new winner-reveal) ───
test('Dashboard: type cards render including Winner Reveal', async ({ page }) => {
  const errors = attachErrors(page)
  await seedShow(page)
  await page.goto('/host', { waitUntil: 'networkidle' })
  await expect(page.getByText('Go Live →')).toBeVisible({ timeout: 10000 })
  // Scoped to main (2026-09-02, fallout of the show_NyRe6x2Q default swap, fix A above):
  // that show's sidebar already has a real "State of the Union" slide, so an unscoped
  // getByText now matches it too and trips Playwright's strict-mode duplicate check.
  // main is where the dashboard's own type-card grid actually lives.
  const dashboard = page.locator('main')
  await expect(dashboard.getByText('State of the Union')).toBeVisible()
  await expect(dashboard.getByText('Winner Reveal')).toBeVisible()
  await expect(dashboard.getByText('Grading Break')).toBeVisible()
  await expect(dashboard.getByText('Question Database')).toBeVisible()
  await expect(dashboard.getByText('Music Library')).toBeVisible()
  await expect(dashboard.getByText('Album Transitions')).toBeVisible()
  expect(errors, `JS errors:\n${errors.join('\n')}`).toHaveLength(0)
})

// ── 5. Display: renders without JS errors ────────────────────────────────────
test('Display: /display loads and renders without errors', async ({ page }) => {
  const errors = attachErrors(page)
  await page.goto(`/display?show=${SHOW_ID}`, { waitUntil: 'networkidle' })
  await expect(page.locator('body')).toBeVisible()
  await expect(page.locator('text=Loading…')).not.toBeVisible({ timeout: 8000 })
  expect(errors, `JS errors:\n${errors.join('\n')}`).toHaveLength(0)
})

// ── 6. Display: no connection-lost state after realtime subscribe ─────────────
// FIXED 2026-09-02 (review): the pageerror listener used to attach AFTER goto +
// a 3s settle, then watch only a 1s window — any error during load or the
// realtime subscribe handshake itself was already gone before anyone was
// listening. Structurally could not fail. attachErrors() now runs before
// navigation, same as every other test in this file, and the wait covers the
// actual subscribe handshake instead of an already-quiet tail end.
test('Display: no disconnect state after realtime subscribe', async ({ page }) => {
  const errors = attachErrors(page)
  await page.goto(`/display?show=${SHOW_ID}`, { waitUntil: 'networkidle' })
  await expect(page.locator('body')).toBeVisible()
  // Give the realtime channel time to complete its subscribe handshake.
  await page.waitForTimeout(3000)
  expect(errors, `JS errors:\n${errors.join('\n')}`).toHaveLength(0)
})
