/**
 * join-smoke.spec.js — /join phone-view smoke coverage, runs against the live deploy.
 *
 * /join had ZERO e2e coverage before this file. On 2026-09-01 a live-show bug shipped
 * here: reopening the scores drawer resubscribed a torn-down Supabase Realtime channel
 * and crashed every phone in the room ("cannot add `postgres_changes` callbacks for
 * realtime:scores-drawer:… after `subscribe()`", Sentry TRIVIA-OS-2/3, fixed in commit
 * 032c1bb). Test 2 below is that exact regression: open the drawer, close it, open it
 * again, assert nothing throws on the second open.
 *
 * READ-ONLY AGAINST PRODUCTION. Tests 1/3/4 never register a team, so Join.jsx never
 * sets team?.id and none of its team-presence effects fire. Test 2 needs a team already
 * in the 'waiting'/'live' phase to reach the scores drawer at all — registering a NEW
 * team would write a stray row to a real show (the exact problem that quarantined
 * wizard-create-verify.spec.js, see its header comment). Instead it seeds localStorage
 * with a REAL, already-registered team from a past show (found via a one-off read-only
 * query against `teams`, Aug 18 2026 show — the oldest of the three real show ids on
 * hand, chosen so a future live show is never touched) and restores that session the
 * same way a returning phone would. That alone isn't enough, though: the instant
 * Join.jsx sees team?.id it fires a presence heartbeat UPDATE against `teams` (see
 * Join.jsx's "Presence heartbeat" effect, ~line 2129) with no user action needed. To
 * keep this test honestly read-only, blockWrites() below intercepts every non-GET
 * request to Supabase's REST endpoint and fulfills it locally instead of letting it
 * reach the network — real reads (show fetch, team restore, scores fetch) and the real
 * Realtime websocket (needed to reproduce the actual regression) both pass through
 * untouched; only writes are swallowed.
 */

import { test, expect } from '@playwright/test'

const SHOW_ID = process.env.PLAYWRIGHT_SHOW_ID || 'show_NyRe6x2Q'

// Pinned to a specific real team, NOT the SHOW_ID above — the drawer regression test
// needs a team that actually exists for the show it navigates to. If PLAYWRIGHT_SHOW_ID
// is overridden for the other three tests, this one still targets its own known-good
// pair on purpose.
const DRAWER_SHOW_ID = 'show_NyRe6x2Q'
const DRAWER_TEAM = { id: 'team_hcInNlwM', name: 'Victorious Secret', color: '#60c000', showId: DRAWER_SHOW_ID }

function attachErrors(page) {
  const errors = []
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`))
  page.on('console', m => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`) })
  return errors
}

/** Swallow every write to Supabase's REST endpoint; let GETs and the Realtime websocket through. */
async function blockWrites(page) {
  await page.route('**/rest/v1/**', route => {
    if (route.request().method() === 'GET') return route.continue()
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })
}

async function seedTeam(page) {
  await page.addInitScript(team => {
    localStorage.setItem(`trivia-os:team:${team.showId}`, JSON.stringify(team))
  }, DRAWER_TEAM)
}

test('join loads with zero uncaught errors and renders the registration form', async ({ page }) => {
  const errors = attachErrors(page)
  await page.goto(`/join?show=${SHOW_ID}`, { waitUntil: 'networkidle' })

  await expect(page.getByRole('heading', { name: 'Trivia Night' })).toBeVisible()
  await expect(page.getByText('Enter your team name to join')).toBeVisible()
  await expect(page.getByPlaceholder('Quiz Khalifa, etc.')).toBeVisible()

  expect(errors, `Errors on /join:\n${errors.join('\n')}`).toHaveLength(0)
})

test('scores drawer opens, closes, and opens again without the resubscribe crash', async ({ page }) => {
  await blockWrites(page)
  await seedTeam(page)
  const errors = attachErrors(page)

  await page.goto(`/join?show=${DRAWER_SHOW_ID}`, { waitUntil: 'networkidle' })

  const scoresButton = page.getByRole('button', { name: '📊 Scores' })
  await expect(scoresButton).toBeVisible({ timeout: 15000 })

  // Open 1 — let the scores-drawer Realtime channel actually complete its subscribe handshake.
  await scoresButton.click()
  await expect(page.getByRole('heading', { name: '📊 Scores' })).toBeVisible()
  await page.waitForTimeout(1500)

  // Close — this is the teardown that used to leave an orphaned retry timer
  // (Join.jsx, "Null `channel` BEFORE removeChannel()", ~line 2090).
  await page.getByRole('button', { name: '✕' }).click()
  await expect(page.getByRole('heading', { name: '📊 Scores' })).not.toBeVisible()

  // Open 2 — the exact regression: resubscribing to a zombie channel used to throw
  // "cannot add postgres_changes callbacks ... after subscribe()", uncaught, phone-crashing.
  await scoresButton.click()
  await expect(page.getByRole('heading', { name: '📊 Scores' })).toBeVisible()
  await page.waitForTimeout(1500)

  const resubscribeErrors = errors.filter(e => /after .?subscribe/i.test(e))
  expect(resubscribeErrors, `Resubscribe crash reproduced:\n${resubscribeErrors.join('\n')}`).toHaveLength(0)
  expect(errors, `Errors on /join scores drawer:\n${errors.join('\n')}`).toHaveLength(0)
})

test('reconnecting banner is absent after the page settles', async ({ page }) => {
  await page.goto(`/join?show=${SHOW_ID}`, { waitUntil: 'networkidle' })
  await expect(page.getByPlaceholder('Quiz Khalifa, etc.')).toBeVisible()
  // Give the realtime channel time to complete its subscribe handshake.
  await page.waitForTimeout(3000)
  await expect(page.getByText('Reconnecting…')).not.toBeVisible()
})

test.describe('landscape-only rotate gate', () => {
  test('portrait viewport shows the rotate prompt', async ({ page }) => {
    await page.setViewportSize({ width: 400, height: 800 })
    await page.goto(`/join?show=${SHOW_ID}`, { waitUntil: 'networkidle' })
    await expect(page.locator('.join-rotate-gate')).toHaveCSS('opacity', '1')
    await expect(page.getByText('Turn your phone sideways')).toBeVisible()
  })

  test('landscape viewport hides the rotate prompt', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 400 })
    await page.goto(`/join?show=${SHOW_ID}`, { waitUntil: 'networkidle' })
    await expect(page.locator('.join-rotate-gate')).toHaveCSS('opacity', '0')
  })
})
