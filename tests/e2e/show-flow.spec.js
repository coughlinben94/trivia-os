import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://qwtbgusqfoypvehnungr.supabase.co'
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF3dGJndXNxZm95cHZlaG51bmdyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNTg1NDIsImV4cCI6MjA5NzYzNDU0Mn0.qmXsrtsRf7VAvRInWlPB1F_8FPIIkn8Nhl4vHUL7p4g'

const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// All show IDs created during the run — wiped in afterAll
const createdShowIds = []

function uid(prefix = 'show') {
  return `${prefix}_e2e_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
}

async function seedShow(overrides = {}) {
  const id = uid('show')
  const { error } = await db.from('shows').insert({
    id,
    title: 'E2E Test Show',
    date: new Date().toISOString().split('T')[0],
    theme_id: 'midnight-galaxy',
    slides: [],
    rounds: [],
    powerups: [],
    is_live: false,
    scoreboard_visible: false,
    scores_revealed: false,
    ticker_messages: [],
    ...overrides,
  })
  if (error) throw new Error(`seedShow failed: ${error.message}`)
  createdShowIds.push(id)
  return id
}

function gradingBreakSlide(id) {
  return {
    id,
    type: 'grading-break',
    roundId: null,
    order: 0,
    data: {
      message: "Now, please sit back, relax, and enjoy each other's company as Ben grades papers 😊",
      hostPhotoUrl: null,
      backLinkSlideId: null,
    },
  }
}

test.afterAll(async () => {
  if (createdShowIds.length > 0) {
    await db.from('shows').delete().in('id', createdShowIds)
  }
})

// ── 1: Pre-show screen ──────────────────────────────────────────────────────

test('pre-show screen shows ambient background, QR code, ticker, and Ben photo', async ({ page }) => {
  const showId = await seedShow({ ticker_messages: ['E2E ticker test'] })

  // Mock /api/ben-photos — this Vercel serverless route doesn't exist in Vite dev
  const BEN_PHOTO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
  await page.route('/api/ben-photos', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify([BEN_PHOTO]),
  }))

  await page.goto(`/display?show=${showId}`)
  await page.waitForLoadState('networkidle')
  await expect(page.locator('h1:has-text("Trivia Night")')).toBeVisible({ timeout: 15000 })

  // QR code — img only mounts once QRCode.toDataURL resolves
  await expect(page.locator('img[alt="Scan to join trivia"]')).toBeVisible()

  // Ticker scrolling container
  await expect(page.locator('.ticker-track')).toBeVisible()
  await expect(page.locator('.ticker-track')).toContainText('E2E ticker test')

  // Ben photo — rendered once /api/ben-photos responds
  await expect(page.locator('img[alt="Ben"]')).toBeVisible({ timeout: 8000 })
})

// ── 2: /join registration ───────────────────────────────────────────────────

test('/join: registration form appears, team registers, waiting screen shows team name', async ({ page }) => {
  const showId = await seedShow()
  const teamName = `Test Team ${Date.now()}`

  const BEN_PHOTO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
  await page.route('/api/ben-photos', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify([BEN_PHOTO]),
  }))

  await page.goto(`/join?show=${showId}`)

  await expect(page.locator('input[placeholder="Quiz Khalifa, etc."]')).toBeVisible()
  await expect(page.locator('img[alt="Ben"]')).toBeVisible({ timeout: 8000 })

  await page.fill('input[placeholder="Quiz Khalifa, etc."]', teamName)
  await page.locator('button:has-text("Join the Show")').click()

  await expect(page.locator('text=Waiting for Ben')).toBeVisible()
  await expect(page.locator(`text=${teamName}`)).toBeVisible()
})

// ── 3: Pre-show team count ──────────────────────────────────────────────────

test('pre-show screen reflects registered team count', async ({ page }) => {
  const showId = await seedShow()

  const { error } = await db.from('teams').insert({
    id: uid('team'),
    show_id: showId,
    name: 'Seeded Test Team',
    color: '#f5c842',
    is_connected: false,
    powerup_used: false,
  })
  if (error) throw new Error(`team insert failed: ${error.message}`)

  await page.goto(`/display?show=${showId}`)

  // PreShowScreen renders "{teams.length} team in" for count === 1
  await expect(page.locator('text=team in')).toBeVisible()
})

// ── 4: Grading break Phase 1 ────────────────────────────────────────────────

test('grading break: Phase 1 shows message and iframe is not yet mounted', async ({ page }) => {
  const slideId = uid('slide')
  const showId = await seedShow({
    slides: [gradingBreakSlide(slideId)],
    is_live: true,
    current_slide_id: slideId,
    current_slide_index: 0,
  })

  await page.goto(`/display?show=${showId}`)

  await expect(page.locator('text=Ben grades papers')).toBeVisible()
  // iframeMounted is false initially — element should not be in the DOM at all
  await expect(page.locator('iframe[title="Jukebox"]')).not.toBeAttached()
})

// ── 5: Grading break auto-advance ──────────────────────────────────────────

test('grading break: auto-advances to Phase 2 after 10 seconds', async ({ page }) => {
  test.setTimeout(25000)

  const slideId = uid('slide')
  const showId = await seedShow({
    slides: [gradingBreakSlide(slideId)],
    is_live: true,
    current_slide_id: slideId,
    current_slide_index: 0,
  })

  await page.goto(`/display?show=${showId}`)
  await expect(page.locator('text=Ben grades papers')).toBeVisible()

  await page.waitForTimeout(11000)

  await expect(page.locator('iframe[title="Jukebox"]')).toBeVisible()
  await expect(page.locator('iframe[title="Jukebox"]')).toHaveAttribute(
    'src',
    'https://trivia-jukebox.vercel.app?embed=true'
  )
})

// ── 6: Grading break early advance via Space ────────────────────────────────

test('grading break: Space key advances to Phase 2 immediately', async ({ page }) => {
  const slideId = uid('slide')
  const showId = await seedShow({
    slides: [gradingBreakSlide(slideId)],
    is_live: true,
    current_slide_id: slideId,
    current_slide_index: 0,
  })

  await page.goto(`/display?show=${showId}`)
  await expect(page.locator('text=Ben grades papers')).toBeVisible()

  await page.keyboard.press('Space')

  // iframeMounted + phase='jukebox' set in same React batch → iframe mounts at opacity 1
  await expect(page.locator('iframe[title="Jukebox"]')).toBeVisible({ timeout: 600 })
})

// ── 7: No forward button on /join ───────────────────────────────────────────

test('/join: no forward or next button present after registration', async ({ page }) => {
  const showId = await seedShow()
  const teamName = `Gate Test ${Date.now()}`

  await page.goto(`/join?show=${showId}`)
  await page.fill('input[placeholder="Quiz Khalifa, etc."]', teamName)
  await page.locator('button:has-text("Join the Show")').click()

  await expect(page.locator('text=Waiting for Ben')).toBeVisible()

  await expect(page.locator('button:has-text("Next")')).toHaveCount(0)
  await expect(page.locator('button:has-text("Forward")')).toHaveCount(0)
  await expect(page.locator('button:has-text("→")')).toHaveCount(0)
})
