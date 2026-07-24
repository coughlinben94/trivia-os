import { test, expect } from '@playwright/test'

const SHOW_ID = process.env.PLAYWRIGHT_SHOW_ID || 'show_fQtKIq7M'

async function loadAndCollect(page, path) {
  const errors = []
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`))
  page.on('console', m => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`) })
  await page.goto(path, { waitUntil: 'networkidle' })
  return errors
}

test('host loads with no uncaught errors', async ({ page }) => {
  const errors = await loadAndCollect(page, '/host')
  await expect(page.locator('body')).toBeVisible()
  expect(errors, `Errors on /host:\n${errors.join('\n')}`).toHaveLength(0)
})

test('display loads with no uncaught errors', async ({ page }) => {
  // /display requires a show ID — without one Supabase returns 406
  const errors = await loadAndCollect(page, `/display?show=${SHOW_ID}`)
  expect(errors, `Errors on /display:\n${errors.join('\n')}`).toHaveLength(0)
})
