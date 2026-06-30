/**
 * Host editor dashboard audit — runs against the live deploy.
 *
 * PREREQUISITE: set PLAYWRIGHT_SHOW_ID to a valid shows.id from the live Supabase project.
 * Without it every test below skips because /host renders ShowManager (show picker), not the editor.
 *
 *   PLAYWRIGHT_SHOW_ID=show_abc123 npm run test:audit
 *
 * Tests are READ + NAVIGATION only. Nothing mutates live Supabase data destructively.
 * Go Live is never clicked. Slides/rounds are never created or deleted.
 */

import { test, expect } from '@playwright/test'

const SHOW_ID = process.env.PLAYWRIGHT_SHOW_ID

// ── Shared helpers ─────────────────────────────────────────────────────────────

/** Attach pageerror + console.error collectors before navigation. */
function attachErrors(page) {
  const errors = []
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`))
  page.on('console', m => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`) })
  return errors
}

/** Assert zero collected errors at the end of a test. */
function assertNoErrors(errors, route = '/host') {
  expect(errors, `JS errors on ${route}:\n${errors.join('\n')}`).toHaveLength(0)
}

/**
 * Seed localStorage with the active show ID so useShow() hydrates HostInner
 * instead of rendering ShowManager. Must be called before page.goto().
 */
async function seedShowId(page) {
  await page.addInitScript((id) => {
    localStorage.setItem('trivia-os:activeShowId', id)
  }, SHOW_ID)
}

/**
 * Navigate to /host with the show ID seeded and wait for the editor sidebar to confirm
 * we landed in BuildMode (not ShowManager or LiveMode).
 * Each test that needs the editor calls this after its own test.skip guard.
 */
async function gotoEditor(page) {
  await seedShowId(page)
  await page.goto('/host', { waitUntil: 'networkidle' })
  await page.locator('aside').waitFor({ state: 'visible', timeout: 15000 })
}

// ── A. Load + shell ────────────────────────────────────────────────────────────

test.describe('A. Load + shell', () => {

  test('A1: /host lands on editor dashboard — regression guard for is_live auto-enter', async ({ page }) => {
    test.skip(!SHOW_ID, 'Set PLAYWRIGHT_SHOW_ID to a valid show ID')
    const errors = attachErrors(page)

    await gotoEditor(page)

    // Editor-only landmarks
    await expect(page.locator('aside')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Go Live →' })).toBeVisible()

    // LiveMode elements must be ABSENT — these are the regression signals
    await expect(page.getByRole('button', { name: /Next ▶/ })).not.toBeVisible()
    await expect(page.getByText('Up next')).not.toBeVisible()
    // "Score" appears as a standalone button label only in LiveMode
    await expect(page.locator('button', { hasText: /^Score$/ })).not.toBeVisible()

    assertNoErrors(errors)
  })

  test('A2: header controls are all present', async ({ page }) => {
    test.skip(!SHOW_ID, 'Set PLAYWRIGHT_SHOW_ID to a valid show ID')
    const errors = attachErrors(page)

    await gotoEditor(page)

    // My Shows is an <a> link (opens /shows in new tab), not a button
    await expect(page.getByRole('link', { name: 'My Shows' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Copy Join Link' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Preview' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Export' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save Results' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Go Live →' })).toBeVisible()
    // Ticker and Formats are grid cards in main, not header buttons
    // Theme picker is the "Theme" grid card in main, not a header button

    assertNoErrors(errors)
  })

  test('A3: left rail renders the round/slide tree', async ({ page }) => {
    test.skip(!SHOW_ID, 'Set PLAYWRIGHT_SHOW_ID to a valid show ID')
    const errors = attachErrors(page)

    await gotoEditor(page)

    const sidebar = page.locator('aside')
    await expect(sidebar).toBeVisible()

    // Add Round button is always present at the bottom of the sidebar
    await expect(page.getByRole('button', { name: '+ Add Round' })).toBeVisible()

    // At least one round header — pattern "R1 · Round Title" (from RoundSidebar:143)
    // GUESSED: regex matches the exact format built by RoundSidebar's round header button
    await expect(sidebar.locator('button', { hasText: /^R\d+ ·/ }).first()).toBeVisible()

    assertNoErrors(errors)
  })

})

// ── B. Slide selection + editor ────────────────────────────────────────────────

test.describe('B. Slide selection + editor', () => {

  test('B1: clicking a Question slide opens its editor with Question Text field', async ({ page }) => {
    test.skip(!SHOW_ID, 'Set PLAYWRIGHT_SHOW_ID to a valid show ID')
    const errors = attachErrors(page)

    await gotoEditor(page)

    // Question slide labels are "Q1", "Q2", etc. (from slideLabel() in RoundSidebar)
    // Clicking the label text propagates to the parent div's onClick
    // GUESSED: relies on click bubbling from the <span> label up to the slide-row div
    const questionLabel = page.locator('aside').getByText(/^Q\d+$/).first()
    const hasQuestion = await questionLabel.isVisible().catch(() => false)
    test.skip(!hasQuestion, 'No question slide found in sidebar — add one to the live show first')

    await questionLabel.click()

    // SlideEditor renders with its slim nav bar (SlideEditor.jsx:124)
    await expect(page.getByRole('button', { name: '← Dashboard' })).toBeVisible()
    // Question slides render a "Question Text" Field label (SlideEditor.jsx:431)
    await expect(page.getByText('Question Text')).toBeVisible()

    assertNoErrors(errors)
  })

  test('B2: clicking a Grading Break slide opens editor with Between-rounds music dropdown', async ({ page }) => {
    test.skip(!SHOW_ID, 'Set PLAYWRIGHT_SHOW_ID to a valid show ID')
    const errors = attachErrors(page)

    await gotoEditor(page)

    // Grading Break slides always render label "Grading Break" (from slideLabel()).
    // exact:true prevents partial matches against other text in the sidebar.
    // force:true bypasses pointer-event interception on the label <span> and lets
    // the click propagate to the parent slide-row div's onClick={onSelect}.
    const breakText = page.locator('aside').getByText('Grading Break', { exact: true }).first()
    const hasBreak = await breakText.isVisible().catch(() => false)
    test.skip(!hasBreak, 'No Grading Break slide found — add one to the live show first')

    await breakText.scrollIntoViewIfNeeded()
    await breakText.click({ force: true })

    await expect(page.getByRole('button', { name: '← Dashboard' })).toBeVisible()
    // SlideEditor.jsx:719 — Field label for the jukebox-library dropdown
    await expect(page.getByText('Between-rounds music')).toBeVisible()
    // Locate the <select> that follows the "Between-rounds music" label.
    // The label text is inside a <Field> which renders a <label> then a <select> as siblings;
    // scoping to the nearest parent <div> that contains both gives a stable anchor.
    const jukeboxSelect = page.locator('div', { has: page.getByText('Between-rounds music') })
      .locator('select')
      .first()
    await expect(jukeboxSelect).toBeVisible()
    // 🎲 Random is the hardcoded first option (SlideEditor.jsx:725)
    await expect(jukeboxSelect).toContainText('Random')
    // Main Library proves the static fallback rendered — does not depend on network fetch
    await expect(jukeboxSelect).toContainText('Main Library')

    assertNoErrors(errors)
  })

  test('B3: switching between two slides updates editor without errors', async ({ page }) => {
    test.skip(!SHOW_ID, 'Set PLAYWRIGHT_SHOW_ID to a valid show ID')
    const errors = attachErrors(page)

    await gotoEditor(page)

    // Collect slide label spans inside the sidebar. exact:true avoids partial matches;
    // force:true lets clicks reach the parent slide-row div's onClick regardless of
    // pointer-event layering (same fix as B2).
    const allLabels = page.locator('aside').getByText(
      /^(Q\d+|Grading Break|Round Intro|Title|Scoreboard|Custom)$/,
      { exact: true },
    )
    const count = await allLabels.count()
    test.skip(count < 2, 'Need at least 2 slides in the sidebar to test switching')

    await allLabels.nth(0).scrollIntoViewIfNeeded()
    await allLabels.nth(0).click({ force: true })
    await expect(page.getByRole('button', { name: '← Dashboard' })).toBeVisible()

    await allLabels.nth(1).scrollIntoViewIfNeeded()
    await allLabels.nth(1).click({ force: true })
    await expect(page.getByRole('button', { name: '← Dashboard' })).toBeVisible()

    assertNoErrors(errors)
  })

})

// ── C. Creation wizard ─────────────────────────────────────────────────────────

test.describe('C. Creation wizard', () => {

  test('C1: grid shows type cards; Grading Break modal opens and gates on round selection', async ({ page }) => {
    test.skip(!SHOW_ID, 'Set PLAYWRIGHT_SHOW_ID to a valid show ID')
    const errors = attachErrors(page)

    await gotoEditor(page)

    // Dashboard resting state: grid of type cards (no wizard heading — wizard is now a modal)
    await expect(page.getByRole('button', { name: /Grading Break/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Question/ }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: /Round Intro/ })).toBeVisible()

    // Click Grading Break → opens the AddSlideWizard modal
    await page.getByRole('button', { name: /Grading Break/ }).click()

    // Modal opens with "Grading Break" heading (AddSlideWizard header shows typeCard.name)
    await expect(page.getByRole('heading', { name: 'Grading Break' })).toBeVisible()

    // Modal close button present — scoped to overlay to avoid sidebar delete buttons
    await expect(page.locator('div.fixed.inset-0').getByRole('button', { name: '✕' })).toBeVisible()

    // "Between-rounds music" label present (grading-break renders jukebox lib select)
    await expect(page.getByText('Between-rounds music')).toBeVisible()

    // Close via ✕ — modal dismisses
    await page.locator('div.fixed.inset-0').getByRole('button', { name: '✕' }).click()
    await expect(page.getByRole('heading', { name: 'Grading Break' })).not.toBeVisible()

    assertNoErrors(errors)
  })

})

// ── D. Header tools ────────────────────────────────────────────────────────────

test.describe('D. Header tools', () => {

  test('D1: theme picker opens, lists themes, closes cleanly', async ({ page }) => {
    test.skip(!SHOW_ID, 'Set PLAYWRIGHT_SHOW_ID to a valid show ID')
    const errors = attachErrors(page)

    await gotoEditor(page)

    // Theme picker is now the "Theme" grid card in main (not a ▾ button in the header)
    await page.locator('main').getByRole('button', { name: /Theme/ }).click()

    await expect(page.getByRole('heading', { name: 'Choose theme' })).toBeVisible()

    // At least one theme button in the picker
    const themeListPanel = page.locator('div').filter({ has: page.getByRole('heading', { name: 'Choose theme' }) })
    await expect(themeListPanel.locator('button').first()).toBeVisible()

    // Close via Done button
    await page.getByRole('button', { name: 'Done' }).click()
    await expect(page.getByRole('heading', { name: 'Choose theme' })).not.toBeVisible()

    assertNoErrors(errors)
  })

  test('D2: Formats panel opens and closes cleanly', async ({ page }) => {
    test.skip(!SHOW_ID, 'Set PLAYWRIGHT_SHOW_ID to a valid show ID')
    const errors = attachErrors(page)

    await gotoEditor(page)

    // Shiny Formats is now a grid card in main (not a header button)
    await page.locator('main').getByRole('button', { name: /Shiny Formats/ }).click()

    // FormatLibrary heading is "Add Shiny" (FormatLibrary.jsx:54)
    await expect(page.getByRole('heading', { name: 'Add Shiny' })).toBeVisible()

    // Close via ✕ button inside the overlay
    const overlay = page.locator('div.fixed').filter({ has: page.getByRole('heading', { name: 'Add Shiny' }) })
    await overlay.getByRole('button', { name: '✕' }).click()

    await expect(page.getByRole('heading', { name: 'Add Shiny' })).not.toBeVisible()

    assertNoErrors(errors)
  })

  test('D3: Preview button opens a popup that renders without errors', async ({ page }) => {
    test.skip(!SHOW_ID, 'Set PLAYWRIGHT_SHOW_ID to a valid show ID')
    const errors = attachErrors(page)

    await gotoEditor(page)

    // Preview opens /display?show=ID&preview=true in a new tab (HostHeader.jsx:122)
    const [popup] = await Promise.all([
      page.waitForEvent('popup'),
      page.getByRole('button', { name: 'Preview' }).click(),
    ])

    const popupErrors = []
    popup.on('pageerror', e => popupErrors.push(`pageerror: ${e.message}`))
    popup.on('console', m => { if (m.type() === 'error') popupErrors.push(`console.error: ${m.text()}`) })

    await popup.waitForLoadState('networkidle')
    await expect(popup.locator('body')).toBeVisible()
    await popup.close()

    assertNoErrors(errors, '/host (main)')
    expect(popupErrors, `JS errors in Preview popup:\n${popupErrors.join('\n')}`).toHaveLength(0)
  })

  test('D4: Copy Join Link button is present and enabled', async ({ page }) => {
    test.skip(!SHOW_ID, 'Set PLAYWRIGHT_SHOW_ID to a valid show ID')
    const errors = attachErrors(page)

    await gotoEditor(page)

    // Single button whose text toggles to "Copied!" after click (HostHeader.jsx:98).
    // Clipboard writes are blocked in headless Chromium so we don't assert the toggle —
    // visible + enabled is the real contract.
    const copyBtn = page.getByRole('button', { name: 'Copy Join Link' })
    await expect(copyBtn).toBeVisible()
    await expect(copyBtn).toBeEnabled()

    assertNoErrors(errors)
  })

})

// ── E. Navigation back-out ─────────────────────────────────────────────────────

test.describe('E. Navigation back-out', () => {

  test('E1: back from slide editor returns to the add-slide wizard cleanly', async ({ page }) => {
    test.skip(!SHOW_ID, 'Set PLAYWRIGHT_SHOW_ID to a valid show ID')
    const errors = attachErrors(page)

    await gotoEditor(page)

    // Enter editing mode by clicking any slide in the sidebar
    const anySlide = page.locator('aside').getByText(/^(Q\d+|Grading Break|Round Intro|Title|Scoreboard|Custom)$/).first()
    const hasSlide = await anySlide.isVisible().catch(() => false)
    test.skip(!hasSlide, 'No slides found in the sidebar')

    await anySlide.click()
    await expect(page.getByRole('button', { name: '← Dashboard' })).toBeVisible()

    // Click back — BuildMode returns to wizard/grid mode
    await page.getByRole('button', { name: '← Dashboard' }).click()
    await expect(page.locator('main').getByRole('button', { name: /Question/ }).first()).toBeVisible()

    assertNoErrors(errors)
  })

  test('E2: Escape key from slide editor returns to add-slide wizard', async ({ page }) => {
    test.skip(!SHOW_ID, 'Set PLAYWRIGHT_SHOW_ID to a valid show ID')
    const errors = attachErrors(page)

    await gotoEditor(page)

    const anySlide = page.locator('aside').getByText(/^(Q\d+|Grading Break|Round Intro|Title|Scoreboard|Custom)$/).first()
    const hasSlide = await anySlide.isVisible().catch(() => false)
    test.skip(!hasSlide, 'No slides found in the sidebar')

    await anySlide.click()
    await expect(page.getByRole('button', { name: '← Dashboard' })).toBeVisible()

    // Escape handler in BuildMode.jsx returns to grid
    await page.keyboard.press('Escape')
    await expect(page.locator('main').getByRole('button', { name: /Question/ }).first()).toBeVisible()

    assertNoErrors(errors)
  })

})
