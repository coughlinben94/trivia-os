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

const SHOW_ID = process.env.PLAYWRIGHT_SHOW_ID || 'show_fQtKIq7M'

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
  await expect(page.getByText('State of the Union')).toBeVisible()
  await expect(page.getByText('Winner Reveal')).toBeVisible()
  await expect(page.getByText('Grading Break')).toBeVisible()
  await expect(page.getByText('Question Database')).toBeVisible()
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
test('Display: no disconnect state after realtime subscribe', async ({ page }) => {
  await page.goto(`/display?show=${SHOW_ID}`, { waitUntil: 'networkidle' })
  await expect(page.locator('body')).toBeVisible()
  await page.waitForTimeout(3000)
  // Display doesn't have the same banner, but should have no pageerrors
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.waitForTimeout(1000)
  expect(errors).toHaveLength(0)
})
