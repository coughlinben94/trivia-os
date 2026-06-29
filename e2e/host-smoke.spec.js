import { test, expect } from '@playwright/test'

// Collects pageerror (uncaught exceptions) and console.error on a given path.
async function loadAndCollect(page, path) {
  const errors = []
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`))
  page.on('console', m => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`) })
  await page.goto(path, { waitUntil: 'networkidle' })
  return errors
}

test('host loads with no uncaught errors', async ({ page }) => {
  const errors = await loadAndCollect(page, '/host')
  // Editor shell should be present — adjust selector if the host root differs.
  await expect(page.locator('body')).toBeVisible()
  expect(errors, `Errors on /host:\n${errors.join('\n')}`).toHaveLength(0)
})

test('display loads with no uncaught errors', async ({ page }) => {
  const errors = await loadAndCollect(page, '/display')
  expect(errors, `Errors on /display:\n${errors.join('\n')}`).toHaveLength(0)
})
