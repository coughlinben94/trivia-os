/**
 * AddSlideWizard audit — tests the BuildMode grid + modal overlay flow.
 *
 * Architecture (as of the 3-step shiny wizard rework):
 *   - BuildMode renders a flat 12-card grid in <main>
 *   - Clicking a TYPE_CARD opens AddSlideWizard inside a modal overlay
 *   - AddSlideWizard is a single-screen form (no multi-step wizard, no step counter)
 *   - For 'question' type: split-screen (plain left / shiny right)
 *   - For 'grading-break' / 'round-intro': single-column with round select gating
 *   - For 'title' / 'custom': single-column, Add Slide → enabled immediately
 *
 * TYPE_CARDS (5): State of the Union, Round Intro, Question, Grading Break, Custom
 * Extra grid cards (7): Theme, Swing Round, Press Your Luck!, Shiny Formats,
 *                       Question Database, Ticker, Data
 *
 * Tests are READ + CLICK-to-open-modal only. Nothing creates or mutates live data.
 */

import { test, expect } from '@playwright/test'

const SHOW_ID = process.env.PLAYWRIGHT_SHOW_ID

// ── Helpers ──────────────────────────────────────────────────────────────────

function attachErrors(page) {
  const errors = []
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`))
  page.on('console', m => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`) })
  return errors
}

function assertNoErrors(errors) {
  expect(errors, `JS errors:\n${errors.join('\n')}`).toHaveLength(0)
}

async function seedShowId(page) {
  await page.addInitScript((id) => {
    localStorage.setItem('trivia-os:activeShowId', id)
  }, SHOW_ID)
}

async function gotoEditor(page) {
  await seedShowId(page)
  await page.goto('/host', { waitUntil: 'networkidle' })
  await page.locator('aside').waitFor({ state: 'visible', timeout: 15000 })
}

/** Click a grid card by its card name (partial match). Opens the AddSlideWizard modal. */
async function openModal(page, cardName) {
  await page.locator('main').getByRole('button', { name: new RegExp(cardName) }).first().click()
}

/** Wait for the modal to appear (overlay with the given heading). */
async function waitForModal(page, heading) {
  await expect(page.getByRole('heading', { name: heading })).toBeVisible({ timeout: 5000 })
}

/** Close the open modal via the ✕ button.
 * Scoped to div.fixed.inset-0 to avoid matching sidebar delete-round/delete-slide ✕ buttons. */
async function closeModal(page) {
  await page.locator('div.fixed.inset-0').getByRole('button', { name: '✕' }).click()
}

// ── 1. Grid card inventory ────────────────────────────────────────────────────

test.describe('1. Grid card inventory', () => {

  test('1a: all 5 TYPE_CARDS are visible in the grid', async ({ page }) => {
    test.skip(!SHOW_ID, 'Set PLAYWRIGHT_SHOW_ID to run wizard audit tests')
    const errors = attachErrors(page)
    await gotoEditor(page)

    for (const name of [
      'State of the Union',
      'Round Intro',
      'Question',
      'Grading Break',
      'Custom',
    ]) {
      await expect(
        page.locator('main').getByRole('button', { name: new RegExp(name) }).first(),
        `TYPE_CARD "${name}" must be visible in the grid`,
      ).toBeVisible()
    }

    assertNoErrors(errors)
  })

  test('1b: all 7 tool cards are visible in the grid', async ({ page }) => {
    test.skip(!SHOW_ID, 'Set PLAYWRIGHT_SHOW_ID to run wizard audit tests')
    const errors = attachErrors(page)
    await gotoEditor(page)

    // "Ticker" was renamed "Team List" and repurposed to open the
    // team-preview add-modal — the old TickerMessageManager trigger no
    // longer exists in this grid (BuildMode.jsx's showTickerManager state
    // is now dead code, nothing sets it true anymore).
    for (const name of ['Theme', 'Swing Round', 'Press Your Luck', 'Shiny Formats', 'Question Database', 'Team List', 'Data']) {
      await expect(
        page.locator('main').getByRole('button', { name: new RegExp(name) }).first(),
        `Tool card "${name}" must be visible in the grid`,
      ).toBeVisible()
    }

    assertNoErrors(errors)
  })

  test('1c: no wizard heading visible at rest (wizard only opens via modal, not inline)', async ({ page }) => {
    test.skip(!SHOW_ID, 'Set PLAYWRIGHT_SHOW_ID to run wizard audit tests')
    const errors = attachErrors(page)
    await gotoEditor(page)

    // "Add a slide" was the old inline wizard heading — must be absent in the current UI
    await expect(page.getByRole('heading', { name: 'Add a slide' })).not.toBeVisible()

    assertNoErrors(errors)
  })

})

// ── 2. Modal open / close mechanics ──────────────────────────────────────────

test.describe('2. Modal open / close mechanics', () => {

  test('2a: clicking a type card opens the modal overlay', async ({ page }) => {
    test.skip(!SHOW_ID, 'Set PLAYWRIGHT_SHOW_ID to run wizard audit tests')
    const errors = attachErrors(page)
    await gotoEditor(page)

    await openModal(page, 'Grading Break')
    await waitForModal(page, 'Grading Break')

    // Overlay backdrop is present
    await expect(page.locator('div.fixed.inset-0')).toBeVisible()

    assertNoErrors(errors)
  })

  test('2b: ✕ button closes the modal', async ({ page }) => {
    test.skip(!SHOW_ID, 'Set PLAYWRIGHT_SHOW_ID to run wizard audit tests')
    const errors = attachErrors(page)
    await gotoEditor(page)

    await openModal(page, 'Custom')
    await waitForModal(page, 'Custom')

    await closeModal(page)
    await expect(page.getByRole('heading', { name: 'Custom' })).not.toBeVisible()

    assertNoErrors(errors)
  })

  test('2c: Escape key closes the modal', async ({ page }) => {
    test.skip(!SHOW_ID, 'Set PLAYWRIGHT_SHOW_ID to run wizard audit tests')
    const errors = attachErrors(page)
    await gotoEditor(page)

    await openModal(page, 'Custom')
    await waitForModal(page, 'Custom')

    await page.keyboard.press('Escape')
    await expect(page.getByRole('heading', { name: 'Custom' })).not.toBeVisible()

    assertNoErrors(errors)
  })

  test('2d: clicking the backdrop closes the modal', async ({ page }) => {
    test.skip(!SHOW_ID, 'Set PLAYWRIGHT_SHOW_ID to run wizard audit tests')
    const errors = attachErrors(page)
    await gotoEditor(page)

    await openModal(page, 'Custom')
    await waitForModal(page, 'Custom')

    // Click the backdrop div (the dark overlay), not the card
    await page.locator('div.fixed.inset-0').first().click({ position: { x: 10, y: 10 } })
    await expect(page.getByRole('heading', { name: 'Custom' })).not.toBeVisible()

    assertNoErrors(errors)
  })

})

// ── 3. Question modal (split-screen) ─────────────────────────────────────────

test.describe('3. Question modal', () => {

  test('3a: Question modal shows split-screen with plain left and shiny right', async ({ page }) => {
    test.skip(!SHOW_ID, 'Set PLAYWRIGHT_SHOW_ID to run wizard audit tests')
    const errors = attachErrors(page)
    await gotoEditor(page)

    await openModal(page, 'Question')
    await waitForModal(page, 'Question')

    // Left column: plain question
    await expect(page.getByText('📝 Plain question')).toBeVisible()
    await expect(page.getByLabel('Question text')).toBeVisible()
    await expect(page.getByLabel('Answer')).toBeVisible()

    // Right column: shiny formats
    await expect(page.getByText('✨ Shiny formats')).toBeVisible()

    await closeModal(page)
    assertNoErrors(errors)
  })

  test('3b: plain question Add button is disabled until round + text + answer are filled', async ({ page }) => {
    test.skip(!SHOW_ID, 'Set PLAYWRIGHT_SHOW_ID to run wizard audit tests')
    const errors = attachErrors(page)
    await gotoEditor(page)

    await openModal(page, 'Question')
    await waitForModal(page, 'Question')

    const addBtn = page.locator('main, div.fixed').getByRole('button', { name: 'Add question →' })
    await expect(addBtn).toBeDisabled()

    await closeModal(page)
    assertNoErrors(errors)
  })

  test('3c: shiny format selection advances to the shiny details step', async ({ page }) => {
    test.skip(!SHOW_ID, 'Set PLAYWRIGHT_SHOW_ID to run wizard audit tests')
    const errors = attachErrors(page)
    await gotoEditor(page)

    await openModal(page, 'Question')
    await waitForModal(page, 'Question')

    const noFormats = await page.getByText('No formats yet', { exact: false }).isVisible().catch(() => false)
    test.skip(noFormats, 'No shiny formats in DB — add one via Add Shiny to test this path')

    // Select the first shiny format tile.
    // Format tiles use type="button"; submit buttons don't, so this scopes correctly.
    const firstFmt = page.locator('div.fixed.inset-0').locator('button[type="button"]').first()
    await firstFmt.click()

    // "Add {name} →" proceed button appears in the shiny panel. The split-
    // screen layout keeps the plain-question column's "Add question →"
    // button visible at the same time (it doesn't hide when a shiny tile
    // is picked), so the generic pattern now matches both — exclude the
    // literal plain-question label to isolate the shiny one specifically.
    await expect(
      page.locator('div.fixed').getByRole('button', { name: /^Add (?!question →).+ →$/ }),
    ).toBeVisible()

    await closeModal(page)
    assertNoErrors(errors)
  })

})

// ── 4. Grading Break modal ────────────────────────────────────────────────────

test.describe('4. Grading Break modal', () => {

  test('4a: Grading Break modal shows round select and jukebox select', async ({ page }) => {
    test.skip(!SHOW_ID, 'Set PLAYWRIGHT_SHOW_ID to run wizard audit tests')
    const errors = attachErrors(page)
    await gotoEditor(page)

    await openModal(page, 'Grading Break')
    await waitForModal(page, 'Grading Break')

    // Round selector label
    await expect(page.getByText('End of which round?')).toBeVisible()

    // Jukebox library select label
    await expect(page.getByText('Between-rounds music')).toBeVisible()

    // "Add Slide →" button visible
    await expect(page.getByRole('button', { name: 'Add Slide →' })).toBeVisible()

    await closeModal(page)
    assertNoErrors(errors)
  })

  test('4b: Add Slide → is disabled when no round is selected', async ({ page }) => {
    test.skip(!SHOW_ID, 'Set PLAYWRIGHT_SHOW_ID to run wizard audit tests')
    const errors = attachErrors(page)
    await gotoEditor(page)

    await openModal(page, 'Grading Break')
    await waitForModal(page, 'Grading Break')

    const addBtn = page.getByRole('button', { name: 'Add Slide →' })

    const hasNoRounds = await page.getByText('No rounds yet', { exact: false }).isVisible().catch(() => false)
    if (hasNoRounds) {
      // Button disabled because no rounds exist
      await expect(addBtn).toBeDisabled()
    } else {
      // Rounds exist — button starts disabled with no round selected
      await expect(addBtn).toBeDisabled()
      // Select first round → button becomes enabled
      const sel = page.locator('#add-round-select')
      const optCount = await sel.locator('option').count()
      if (optCount >= 2) {
        await sel.selectOption({ index: 1 })
        await expect(addBtn).toBeEnabled()
      }
    }

    await closeModal(page)
    assertNoErrors(errors)
  })

})

// ── 5. Round Intro modal ──────────────────────────────────────────────────────

test.describe('5. Round Intro modal', () => {

  test('5a: Round Intro modal shows round association and subtitle input', async ({ page }) => {
    test.skip(!SHOW_ID, 'Set PLAYWRIGHT_SHOW_ID to run wizard audit tests')
    const errors = attachErrors(page)
    await gotoEditor(page)

    await openModal(page, 'Round Intro')
    await waitForModal(page, 'Round Intro')

    // Subtitle input
    await expect(page.getByLabel(/Subtitle/)).toBeVisible()

    // "Add Slide →" button visible
    await expect(page.getByRole('button', { name: 'Add Slide →' })).toBeVisible()

    await closeModal(page)
    assertNoErrors(errors)
  })

  test('5b: Add Slide → is disabled when no round is associated', async ({ page }) => {
    test.skip(!SHOW_ID, 'Set PLAYWRIGHT_SHOW_ID to run wizard audit tests')
    const errors = attachErrors(page)
    await gotoEditor(page)

    await openModal(page, 'Round Intro')
    await waitForModal(page, 'Round Intro')

    const addBtn = page.getByRole('button', { name: 'Add Slide →' })
    await expect(addBtn).toBeDisabled()

    await closeModal(page)
    assertNoErrors(errors)
  })

})

// ── 6. Title modal ────────────────────────────────────────────────────────────

test.describe('6. Title modal (State of the Union)', () => {

  test('6a: Title modal opens with Add Slide → immediately enabled (no round required)', async ({ page }) => {
    test.skip(!SHOW_ID, 'Set PLAYWRIGHT_SHOW_ID to run wizard audit tests')
    const errors = attachErrors(page)
    await gotoEditor(page)

    await openModal(page, 'State of the Union')
    await waitForModal(page, 'State of the Union')

    const addBtn = page.getByRole('button', { name: 'Add Slide →' })
    await expect(addBtn).toBeVisible()
    await expect(addBtn, 'Title type does not require a round').toBeEnabled()

    // No round select rendered for title type
    await expect(page.locator('#add-round-select')).not.toBeVisible()

    await closeModal(page)
    assertNoErrors(errors)
  })

})

// ── 7. Custom modal ───────────────────────────────────────────────────────────

test.describe('7. Custom modal', () => {

  test('7a: Custom modal opens with Add Slide → immediately enabled (no round required)', async ({ page }) => {
    test.skip(!SHOW_ID, 'Set PLAYWRIGHT_SHOW_ID to run wizard audit tests')
    const errors = attachErrors(page)
    await gotoEditor(page)

    await openModal(page, 'Custom')
    await waitForModal(page, 'Custom')

    const addBtn = page.getByRole('button', { name: 'Add Slide →' })
    await expect(addBtn).toBeVisible()
    await expect(addBtn, 'Custom type does not require a round').toBeEnabled()

    await closeModal(page)
    assertNoErrors(errors)
  })

})

// ── 8. Multiple modal open/close cycles ──────────────────────────────────────

test.describe('8. Rapid open/close stress', () => {

  test('8a: opening different modals back-to-back produces no errors', async ({ page }) => {
    test.skip(!SHOW_ID, 'Set PLAYWRIGHT_SHOW_ID to run wizard audit tests')
    const errors = attachErrors(page)
    await gotoEditor(page)

    for (const [cardName, heading] of [
      ['State of the Union', 'State of the Union'],
      ['Grading Break',      'Grading Break'],
      ['Custom',             'Custom'],
      ['Round Intro',        'Round Intro'],
    ]) {
      await openModal(page, cardName)
      await waitForModal(page, heading)
      await closeModal(page)
      await expect(page.getByRole('heading', { name: heading })).not.toBeVisible()
    }

    assertNoErrors(errors)
  })

})
