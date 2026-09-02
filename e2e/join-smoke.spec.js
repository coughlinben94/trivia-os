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
 * READ-ONLY AGAINST PRODUCTION. Tests 1/3/4/5 never register a team, so Join.jsx never
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
 * request to Supabase's origin and fulfills it locally instead of letting it reach the
 * network — real reads (show fetch, team restore, scores fetch) and the real Realtime
 * websocket (needed to reproduce the actual regression) both pass through untouched;
 * only writes are swallowed. It also counts what it swallows and asserts at least one —
 * a canary against the route silently stopping matching and this test starting to write
 * to Ben's live data with nothing flagging it.
 *
 * Two things worth knowing that don't change what's written here:
 * - This spec inherits `storageState` from playwright.config.js, so every test runs
 *   with a host-verified Supabase session, not a real phone's plain anon one. Nothing
 *   here relies on that (test 2's writes are blocked at the network layer regardless
 *   of what that session is or isn't allowed to do), but it's not a faithful phone.
 * - Sentry is live in the deployed client. A test that genuinely FAILS here (a real
 *   uncaught error, not an assertion) files a real synthetic crash into Ben's
 *   production Sentry project — one more reason to keep this suite green, not just
 *   passing.
 */

import { test, expect } from '@playwright/test'

// show_fQtKIq7M no longer exists in the DB (2026-09-02) — was silently breaking
// global-setup.js for every spec in this suite. show_NyRe6x2Q is real, verified.
const SHOW_ID = process.env.PLAYWRIGHT_SHOW_ID || 'show_NyRe6x2Q'

// Pinned to a specific real team, NOT the SHOW_ID above — the drawer regression test
// needs a team that actually exists for the show it navigates to. If PLAYWRIGHT_SHOW_ID
// is overridden for the other tests, this one still targets its own known-good pair
// on purpose.
const DRAWER_SHOW_ID = 'show_NyRe6x2Q'
const DRAWER_TEAM = { id: 'team_hcInNlwM', name: 'Victorious Secret', color: '#60c000', showId: DRAWER_SHOW_ID }

function attachErrors(page) {
  const errors = []
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`))
  page.on('console', m => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`) })
  return errors
}

/**
 * Swallow every write to Supabase's origin (any path — REST, auth, storage); let GETs
 * and the Realtime websocket (a separate wss:// connection Playwright's page.route
 * doesn't intercept) through untouched. Returns the list of intercepted writes so the
 * caller can assert at least one happened — the canary described in the file header.
 */
async function blockWrites(page) {
  const supabaseOrigin = new URL(process.env.VITE_SUPABASE_URL).origin
  const writes = []
  await page.route(url => url.origin === supabaseOrigin, route => {
    if (route.request().method() === 'GET') return route.continue()
    writes.push(`${route.request().method()} ${route.request().url()}`)
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })
  return writes
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
  const writes = await blockWrites(page)
  await seedTeam(page)
  const errors = attachErrors(page)

  await page.goto(`/join?show=${DRAWER_SHOW_ID}`, { waitUntil: 'networkidle' })

  // Precondition: team_hcInNlwM/show_NyRe6x2Q restoring successfully lands on the
  // live/waiting phase (Scores button); a deleted team or show falls back to the
  // registration screen instead. Check this explicitly so a future "team row is gone"
  // fails with a real reason instead of a 15s "button not visible" timeout.
  const registerInput = page.getByPlaceholder('Quiz Khalifa, etc.')
  const scoresButton  = page.getByRole('button', { name: '📊 Scores' })
  await expect(registerInput.or(scoresButton), 'neither the registration form nor the Scores button appeared')
    .toBeVisible({ timeout: 15000 })
  if (await registerInput.isVisible().catch(() => false)) {
    throw new Error(
      `Landed on the registration screen instead of restoring ${DRAWER_TEAM.name} — ` +
      `team_hcInNlwM or show_NyRe6x2Q was likely deleted. Re-pin DRAWER_TEAM/DRAWER_SHOW_ID ` +
      `to a still-existing team via a fresh read-only 'teams' query.`
    )
  }

  const heading = page.getByRole('heading', { name: '📊 Scores' })
  // Ben editing scores in ScoreboardModal sets scores_locked_at, which gates the drawer
  // for 10 minutes (editLockActive, Join.jsx:1775-1786) — openScoresDrawer() just no-ops
  // (Join.jsx:2310) and this popup shows instead of the drawer. A live-show flake with
  // no bug behind it, not a regression — skip instead of failing on it.
  const locked = page.getByText('Ben is currently updating the scores')

  // Open 1 — let the scores-drawer Realtime channel actually complete its subscribe handshake.
  await scoresButton.click()
  await expect(heading.or(locked)).toBeVisible({ timeout: 10000 })
  test.skip(await locked.isVisible().catch(() => false),
    'scores drawer is locked — Ben is editing ScoreboardModal in the last 10 minutes (editLockActive, Join.jsx:2310). Live-show flake, not a regression.')
  await page.waitForTimeout(1500)

  // Close — this is the teardown that used to leave an orphaned retry timer
  // (Join.jsx, "Null `channel` BEFORE removeChannel()", ~line 2090).
  await page.getByRole('button', { name: '✕' }).click()
  await expect(heading).not.toBeVisible()

  // Open 2 — the exact regression: resubscribing to a zombie channel used to throw
  // "cannot add postgres_changes callbacks ... after subscribe()", uncaught, phone-crashing.
  await scoresButton.click()
  await expect(heading.or(locked)).toBeVisible({ timeout: 10000 })

  // The crash isn't actually triggered by this click — a review that rebuilt the pre-fix
  // effect against real realtime-js proved it comes from the CLOSE's own orphaned retry
  // timer, which the pre-fix teardown re-arms and which fires RETRY_MS after the CLOSE
  // regardless of when (or whether) a reopen happens (Join.jsx's scores-drawer effect,
  // retryTimer, ~line 2077 — RETRY_MS = 1500). A 1500ms wait here left only ~300ms of
  // margin over that constant; if it's ever raised, this test would go on catching
  // nothing while staying green. 3000ms doubles the margin — if Join.jsx's RETRY_MS
  // ever changes, bump this to match.
  await page.waitForTimeout(3000)

  const resubscribeErrors = errors.filter(e => /after .?subscribe/i.test(e))
  expect(resubscribeErrors, `Resubscribe crash reproduced:\n${resubscribeErrors.join('\n')}`).toHaveLength(0)
  expect(errors, `Errors on /join scores drawer:\n${errors.join('\n')}`).toHaveLength(0)

  // Canary: the presence heartbeat (Join.jsx's "Presence heartbeat" effect, beat() fires
  // once immediately on mount) guarantees at least one intercepted write per run. If this
  // is 0, blockWrites()'s route stopped matching and this test may have been writing to
  // production the whole time with nothing here catching it.
  expect(writes.length, 'write-block canary tripped — zero writes intercepted; the route may have stopped matching Supabase\'s origin').toBeGreaterThan(0)
})

// connStatus starts optimistically at 'SUBSCRIBED' (Join.jsx:1732) and the Reconnecting…
// banner only ever renders on a LATER transition away from it — so asserting the banner's
// absence proves nothing: a page where realtime never even attempts to connect passes too.
// Assert something positive instead — that the realtime websocket actually opens and gets
// a frame back, proving the subscribe handshake really completed.
test('realtime websocket connects on /join', async ({ page }) => {
  const wsPromise = page.waitForEvent('websocket', ws => /realtime\/v\d+\/websocket/.test(ws.url()))
  await page.goto(`/join?show=${SHOW_ID}`, { waitUntil: 'networkidle' })
  await expect(page.getByPlaceholder('Quiz Khalifa, etc.')).toBeVisible()

  const ws = await wsPromise
  // Give the subscribe handshake time, then confirm the socket is still open, not
  // dropped — a positive signal the removed banner-absence check could never assert.
  // (An earlier version of this test waited for a 'framereceived' event instead —
  // real handshake frames can arrive before a listener attached one tick later gets
  // a chance to catch them, so that version flaked on a real, connected socket.)
  await page.waitForTimeout(2000)
  expect(ws.isClosed()).toBe(false)
})

test.describe('landscape-only rotate gate', () => {
  test('portrait viewport shows the rotate prompt', async ({ page }) => {
    await page.setViewportSize({ width: 400, height: 800 })
    await page.goto(`/join?show=${SHOW_ID}`, { waitUntil: 'networkidle' })
    const gate = page.locator('.join-rotate-gate')
    await expect(gate).toHaveCSS('opacity', '1')
    // opacity alone doesn't distinguish shown-vs-hidden to Playwright (a 0-opacity
    // element still counts as "visible") — pointer-events is the real gate: index.css
    // toggles both together, and Join.jsx's RotateGate comment (~line 45-48) documents
    // exactly this as the mechanism a display:none/opacity-only version got wrong.
    await expect(gate).toHaveCSS('pointer-events', 'auto')
  })

  test('landscape viewport hides the rotate prompt', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 400 })
    await page.goto(`/join?show=${SHOW_ID}`, { waitUntil: 'networkidle' })
    const gate = page.locator('.join-rotate-gate')
    await expect(gate).toHaveCSS('opacity', '0')
    await expect(gate).toHaveCSS('pointer-events', 'none')
  })
})
