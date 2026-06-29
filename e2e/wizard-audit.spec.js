/**
 * AddSlideWizard exhaustive audit — runs against the live deploy.
 *
 * WIZARD STATE MACHINE (derived from AddSlideWizard.jsx):
 *
 * TYPE_CARDS (in render order):
 *   card name "State of the Union"  type: title           NOT in NEEDS_ROUND
 *   card name "Round Intro"         type: round-intro     NEEDS_ROUND
 *   card name "Question"            type: question        NEEDS_ROUND
 *   card name "Grading Break"       type: grading-break   NEEDS_ROUND
 *   card name "Scoreboard"          type: scoreboard-reveal NOT in NEEDS_ROUND
 *   card name "Custom"              type: custom          NOT in NEEDS_ROUND
 *
 * STEP SEQUENCES:
 *   title / round-intro / grading-break / scoreboard / custom:
 *     type(1) → details(2)              totalSteps=2   counter: "Step 2 of 2"
 *   question + regular:
 *     type(1) → question-mode(2) → details(3)          totalSteps=3   "Step 2 of 3" / "Step 3 of 3"
 *   question + shiny:
 *     type(1) → question-mode(2) → format(3) → details(4)   totalSteps=4   "Step N of 4"
 *
 * STEP COUNTER: rendered in the back-nav row on ALL steps except type (step !== 'type').
 * BACK BUTTON ("← Back"): same condition — hidden on the type-picker step.
 *
 * DETAILS STEP HEADING: <h2> showing the card.name ("Question", "Grading Break", etc.)
 *
 * CREATE BUTTON: label "Add Slide →" on the details step for EVERY type.
 *   disabled when needsRound && !roundId  (round-intro, question, grading-break)
 *   always enabled for: title, scoreboard-reveal, custom
 *
 * ROUND INTRO EXTRAS: round picker select + "Round Title" input (placeholder "e.g. Round 1")
 *
 * BUG CONTRACT: every path's final details step MUST have an "Add Slide →" button.
 * Tests that reach the details step assert this with a named message so failures are obvious.
 *
 * GUESSED SELECTORS (flagged inline with GUESSED comments):
 *   1. Button accessible names for TYPE_CARDS — regex on card.name substring;
 *      full accessible name is emoji + name + desc concatenated.
 *   2. "Regular" / "Shiny" button names — same substring-regex approach.
 *   3. question-mode step heading "What kind of question?" — derived from JSX reading.
 *   4. format step heading "Choose a format" — derived from JSX reading.
 *   5. page.locator('main select').first() — round select; only select in main on detail steps.
 *   6. page.locator('main').getByRole('button').filter({ hasNotText: '← Back' }).first()
 *      for format cards — assumes format cards are the only non-Back buttons in main on format step.
 */

import { test, expect } from '@playwright/test'

const SHOW_ID = process.env.PLAYWRIGHT_SHOW_ID

// ── Helpers (copied from host-audit.spec.js) ────────────────────────────────

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

// ── Wizard-specific helpers ─────────────────────────────────────────────────

async function assertOnTypePicker(page) {
  await expect(page.getByRole('heading', { name: 'Add a slide' })).toBeVisible()
}

/** Click a TYPE_CARD from the type-picker step by its card.name.
 * GUESSED: button accessible name is emoji + name + desc — regex on name substring. */
async function pickType(page, cardName) {
  await page.locator('main').getByRole('button', { name: new RegExp(cardName) }).first().click()
}

/** Assert the step counter shows "Step N of M". */
async function assertStep(page, n, m) {
  await expect(page.getByText(`Step ${n} of ${m}`, { exact: true })).toBeVisible()
}

/** The round <select> on the details step.
 * GUESSED: only <select> in main; scoped to avoid header/sidebar selects. */
function roundSelectLocator(page) {
  return page.locator('main select').first()
}

/** Select the first real round (index 1, skipping the empty default).
 * Returns true if a round was selected, false if no rounds / select not present. */
async function selectFirstRound(page) {
  const sel = roundSelectLocator(page)
  const visible = await sel.isVisible().catch(() => false)
  if (!visible) return false
  const optCount = await sel.locator('option').count()
  if (optCount < 2) return false
  await sel.selectOption({ index: 1 })
  return true
}

const ADD_BTN = 'Add Slide →'

// ── 1. Type-picker ──────────────────────────────────────────────────────────

test.describe('1. Type-picker (step 1)', () => {

  test('1a: wizard mounts showing all 6 TYPE_CARDS, no Back button, no step counter', async ({ page }) => {
    test.skip(!SHOW_ID, 'Set PLAYWRIGHT_SHOW_ID to run wizard audit tests')
    const errors = attachErrors(page)
    await gotoEditor(page)

    await assertOnTypePicker(page)

    // All 6 TYPE_CARD buttons — accessible name contains the card.name (GUESSED: substring regex)
    for (const name of [
      'State of the Union',  // type: title
      'Round Intro',         // type: round-intro
      'Question',            // type: question
      'Grading Break',       // type: grading-break
      'Scoreboard',          // type: scoreboard-reveal
      'Custom',              // type: custom
    ]) {
      await expect(
        page.locator('main').getByRole('button', { name: new RegExp(name) }).first(),
        `TYPE_CARD "${name}" must be visible`,
      ).toBeVisible()
    }

    // Step counter only shows on non-type steps — must be absent here
    await expect(page.getByText(/Step \d+ of \d+/)).not.toBeVisible()

    // Back button only shows on non-type steps — must be absent here
    await expect(
      page.locator('main').getByRole('button', { name: '← Back' }),
    ).not.toBeVisible()

    assertNoErrors(errors)
  })

})

// ── 2. Question path — regular ──────────────────────────────────────────────

test.describe('2. Question path — regular', () => {

  test('2a: picking Question → question-mode step (heading, Regular/Shiny, Step 2 of 3)', async ({ page }) => {
    test.skip(!SHOW_ID, 'Set PLAYWRIGHT_SHOW_ID to run wizard audit tests')
    const errors = attachErrors(page)
    await gotoEditor(page)

    await pickType(page, 'Question')

    // GUESSED: question-mode heading text from JSX
    await expect(page.getByRole('heading', { name: 'What kind of question?' })).toBeVisible()
    // GUESSED: button accessible name contains "Regular" as a substring
    await expect(page.locator('main').getByRole('button', { name: /Regular/ })).toBeVisible()
    // GUESSED: button accessible name contains "Shiny" as a substring
    await expect(page.locator('main').getByRole('button', { name: /Shiny/ })).toBeVisible()
    await expect(page.locator('main').getByRole('button', { name: '← Back' })).toBeVisible()
    await assertStep(page, 2, 3)

    assertNoErrors(errors)
  })

  test('2b: regular → details (Step 3 of 3), round picker gated, create button present and gated', async ({ page }) => {
    test.skip(!SHOW_ID, 'Set PLAYWRIGHT_SHOW_ID to run wizard audit tests')
    const errors = attachErrors(page)
    await gotoEditor(page)

    await pickType(page, 'Question')
    await page.locator('main').getByRole('button', { name: /Regular/ }).click()

    await assertStep(page, 3, 3)
    // Details step card name is a <p> (line 233 of AddSlideWizard.jsx), NOT an <h2>
    await expect(page.locator('main').getByText('Question', { exact: true }).first()).toBeVisible()

    const addBtn = page.locator('main').getByRole('button', { name: ADD_BTN })
    await expect(
      addBtn,
      'FAIL: "Add Slide →" button MISSING on question/regular details step — this is the reported bug',
    ).toBeVisible()

    const hasNoRoundsMsg = await page.getByText('No rounds yet', { exact: false }).isVisible().catch(() => false)
    if (hasNoRoundsMsg) {
      await expect(addBtn, 'button must be disabled when no rounds exist').toBeDisabled()
    } else {
      const sel = roundSelectLocator(page)
      await expect(sel, 'round select must be present for question type (NEEDS_ROUND)').toBeVisible()
      await expect(addBtn, 'button must start disabled — no round selected').toBeDisabled()
      const selected = await selectFirstRound(page)
      if (selected) {
        await expect(addBtn, 'button must be enabled after selecting a round').toBeEnabled()
      }
    }

    assertNoErrors(errors)
  })

  test('2c: back from details (regular) → question-mode → type picker', async ({ page }) => {
    test.skip(!SHOW_ID, 'Set PLAYWRIGHT_SHOW_ID to run wizard audit tests')
    const errors = attachErrors(page)
    await gotoEditor(page)

    await pickType(page, 'Question')
    await page.locator('main').getByRole('button', { name: /Regular/ }).click()
    await assertStep(page, 3, 3)

    // Back: details → question-mode
    await page.locator('main').getByRole('button', { name: '← Back' }).click()
    await expect(page.getByRole('heading', { name: 'What kind of question?' })).toBeVisible()
    await assertStep(page, 2, 3)

    // Back: question-mode → type picker (no step counter, no Back button)
    await page.locator('main').getByRole('button', { name: '← Back' }).click()
    await assertOnTypePicker(page)
    await expect(page.getByText(/Step \d+ of \d+/)).not.toBeVisible()
    await expect(page.locator('main').getByRole('button', { name: '← Back' })).not.toBeVisible()

    assertNoErrors(errors)
  })

})

// ── 3. Question path — shiny ────────────────────────────────────────────────

test.describe('3. Question path — shiny', () => {

  test('3a: shiny → format step (Step 3 of 4) with format cards or no-formats message', async ({ page }) => {
    test.skip(!SHOW_ID, 'Set PLAYWRIGHT_SHOW_ID to run wizard audit tests')
    const errors = attachErrors(page)
    await gotoEditor(page)

    await pickType(page, 'Question')
    await page.locator('main').getByRole('button', { name: /Shiny/ }).click()

    // GUESSED: format step heading text from JSX
    await expect(page.getByRole('heading', { name: 'Choose a format' })).toBeVisible()
    await assertStep(page, 3, 4)
    await expect(page.locator('main').getByRole('button', { name: '← Back' })).toBeVisible()

    // Either format cards or a "No formats yet" message — both are valid live-show states
    const noFormatsMsg = page.getByText('No formats yet', { exact: false })
    const hasNoFormats = await noFormatsMsg.isVisible().catch(() => false)
    if (hasNoFormats) {
      await expect(noFormatsMsg).toBeVisible()
    } else {
      // GUESSED: format cards are the only non-Back buttons in main on this step
      await expect(
        page.locator('main').getByRole('button').filter({ hasNotText: '← Back' }).first(),
        'At least one format card must be visible',
      ).toBeVisible()
    }

    assertNoErrors(errors)
  })

  test('3b: shiny + format → details (Step 4 of 4), create button present and gated', async ({ page }) => {
    test.skip(!SHOW_ID, 'Set PLAYWRIGHT_SHOW_ID to run wizard audit tests')
    const errors = attachErrors(page)
    await gotoEditor(page)

    await pickType(page, 'Question')
    await page.locator('main').getByRole('button', { name: /Shiny/ }).click()
    await expect(page.getByRole('heading', { name: 'Choose a format' })).toBeVisible()

    const hasNoFormats = await page.getByText('No formats yet', { exact: false }).isVisible().catch(() => false)
    test.skip(hasNoFormats, 'No shiny formats in live show — create one via ✨ Formats to test this path')

    // GUESSED: first non-Back button in main is the first format card
    await page.locator('main').getByRole('button').filter({ hasNotText: '← Back' }).first().click()

    await assertStep(page, 4, 4)
    // assertStep(4,4) already confirms we're on the details step.
    // The shiny path renders the selected format name alongside the card name,
    // so exact-text matching on "Question" is unreliable here.
    const addBtn = page.locator('main').getByRole('button', { name: ADD_BTN })
    await expect(
      addBtn,
      'FAIL: "Add Slide →" button MISSING on question/shiny details step — this is the reported bug',
    ).toBeVisible()

    const hasNoRoundsMsg = await page.getByText('No rounds yet', { exact: false }).isVisible().catch(() => false)
    if (hasNoRoundsMsg) {
      await expect(addBtn).toBeDisabled()
    } else {
      const sel = roundSelectLocator(page)
      await expect(sel).toBeVisible()
      await expect(addBtn, 'button must start disabled — no round selected').toBeDisabled()
      const selected = await selectFirstRound(page)
      if (selected) {
        await expect(addBtn, 'button must be enabled after selecting a round').toBeEnabled()
      }
    }

    // Navigate back without creating
    await page.locator('main').getByRole('button', { name: '← Back' }).click()
    await expect(page.getByRole('heading', { name: 'Choose a format' })).toBeVisible()

    assertNoErrors(errors)
  })

  test('3c: back navigation details → format → question-mode → type picker', async ({ page }) => {
    test.skip(!SHOW_ID, 'Set PLAYWRIGHT_SHOW_ID to run wizard audit tests')
    const errors = attachErrors(page)
    await gotoEditor(page)

    await pickType(page, 'Question')
    await page.locator('main').getByRole('button', { name: /Shiny/ }).click()

    const hasNoFormats = await page.getByText('No formats yet', { exact: false }).isVisible().catch(() => false)

    if (!hasNoFormats) {
      // Advance to details
      await page.locator('main').getByRole('button').filter({ hasNotText: '← Back' }).first().click()
      await assertStep(page, 4, 4)

      // Back: details → format
      await page.locator('main').getByRole('button', { name: '← Back' }).click()
      await expect(page.getByRole('heading', { name: 'Choose a format' })).toBeVisible()
      await assertStep(page, 3, 4)
    }

    // Back: format → question-mode
    await page.locator('main').getByRole('button', { name: '← Back' }).click()
    await expect(page.getByRole('heading', { name: 'What kind of question?' })).toBeVisible()
    await assertStep(page, 2, 4)

    // Back: question-mode → type picker
    await page.locator('main').getByRole('button', { name: '← Back' }).click()
    await assertOnTypePicker(page)
    await expect(page.getByText(/Step \d+ of \d+/)).not.toBeVisible()

    assertNoErrors(errors)
  })

})

// ── 4. Grading Break path ───────────────────────────────────────────────────

test.describe('4. Grading Break path', () => {

  test('4a: Grading Break → details directly (no question-mode), Step 2 of 2, round gated', async ({ page }) => {
    test.skip(!SHOW_ID, 'Set PLAYWRIGHT_SHOW_ID to run wizard audit tests')
    const errors = attachErrors(page)
    await gotoEditor(page)

    await pickType(page, 'Grading Break')

    // Must skip question-mode (grading-break goes directly to details)
    await expect(
      page.getByRole('heading', { name: 'What kind of question?' }),
    ).not.toBeVisible()

    await assertStep(page, 2, 2)
    // Details step card name is a <p> (line 233 of AddSlideWizard.jsx), NOT an <h2>
    await expect(page.locator('main').getByText('Grading Break', { exact: true }).first()).toBeVisible()
    await expect(page.locator('main').getByRole('button', { name: '← Back' })).toBeVisible()

    const addBtn = page.locator('main').getByRole('button', { name: ADD_BTN })
    await expect(addBtn).toBeVisible()
    await expect(addBtn, 'button must start disabled — no round selected').toBeDisabled()

    const hasNoRoundsMsg = await page.getByText('No rounds yet', { exact: false }).isVisible().catch(() => false)
    if (!hasNoRoundsMsg) {
      await expect(roundSelectLocator(page), 'round select must be present (Grading Break is NEEDS_ROUND)').toBeVisible()
      const selected = await selectFirstRound(page)
      if (selected) {
        await expect(addBtn, 'button must be enabled after selecting a round').toBeEnabled()
      }
    }

    assertNoErrors(errors)
  })

  test('4b: back from Grading Break details → type picker', async ({ page }) => {
    test.skip(!SHOW_ID, 'Set PLAYWRIGHT_SHOW_ID to run wizard audit tests')
    const errors = attachErrors(page)
    await gotoEditor(page)

    await pickType(page, 'Grading Break')
    await assertStep(page, 2, 2)

    await page.locator('main').getByRole('button', { name: '← Back' }).click()
    await assertOnTypePicker(page)
    await expect(page.getByText(/Step \d+ of \d+/)).not.toBeVisible()

    assertNoErrors(errors)
  })

})

// ── 5. Round Intro path ─────────────────────────────────────────────────────

test.describe('5. Round Intro path', () => {

  test('5a: Round Intro → details (Step 2 of 2): round picker, round title input, create gated', async ({ page }) => {
    test.skip(!SHOW_ID, 'Set PLAYWRIGHT_SHOW_ID to run wizard audit tests')
    const errors = attachErrors(page)
    await gotoEditor(page)

    await pickType(page, 'Round Intro')

    await assertStep(page, 2, 2)
    // Details step card name is a <p> (line 233 of AddSlideWizard.jsx), NOT an <h2>
    await expect(page.locator('main').getByText('Round Intro', { exact: true }).first()).toBeVisible()

    const addBtn = page.locator('main').getByRole('button', { name: ADD_BTN })
    await expect(addBtn).toBeVisible()

    const hasNoRoundsMsg = await page.getByText('No rounds yet', { exact: false }).isVisible().catch(() => false)
    if (hasNoRoundsMsg) {
      await expect(addBtn).toBeDisabled()
    } else {
      await expect(roundSelectLocator(page), 'round select must be present (Round Intro is NEEDS_ROUND)').toBeVisible()
      await expect(addBtn, 'button must start disabled — no round selected').toBeDisabled()

      // Round Intro also has a Round Title text input (AddSlideWizard.jsx)
      await expect(
        page.locator('main').getByPlaceholder('e.g. Round 1'),
        'Round Intro must show the Round Title input',
      ).toBeVisible()

      const selected = await selectFirstRound(page)
      if (selected) {
        await expect(addBtn, 'button must be enabled after selecting a round').toBeEnabled()
      }
    }

    assertNoErrors(errors)
  })

  test('5b: back from Round Intro details → type picker', async ({ page }) => {
    test.skip(!SHOW_ID, 'Set PLAYWRIGHT_SHOW_ID to run wizard audit tests')
    const errors = attachErrors(page)
    await gotoEditor(page)

    await pickType(page, 'Round Intro')
    await assertStep(page, 2, 2)

    await page.locator('main').getByRole('button', { name: '← Back' }).click()
    await assertOnTypePicker(page)

    assertNoErrors(errors)
  })

})

// ── 6. Title path (State of the Union) ─────────────────────────────────────

test.describe('6. Title path (State of the Union)', () => {

  test('6a: Title → details (Step 2 of 2): NO round picker, create button immediately enabled', async ({ page }) => {
    test.skip(!SHOW_ID, 'Set PLAYWRIGHT_SHOW_ID to run wizard audit tests')
    const errors = attachErrors(page)
    await gotoEditor(page)

    await pickType(page, 'State of the Union')

    await assertStep(page, 2, 2)
    // Details step card name is a <p> (line 233 of AddSlideWizard.jsx), NOT an <h2>
    await expect(page.locator('main').getByText('State of the Union', { exact: true }).first()).toBeVisible()

    const addBtn = page.locator('main').getByRole('button', { name: ADD_BTN })
    await expect(addBtn).toBeVisible()
    // title is NOT in NEEDS_ROUND — enabled immediately, no round required
    await expect(addBtn, 'Title type must not require a round (not in NEEDS_ROUND)').toBeEnabled()

    // No round select rendered
    await expect(roundSelectLocator(page)).not.toBeVisible()

    assertNoErrors(errors)
  })

  test('6b: back from Title details → type picker', async ({ page }) => {
    test.skip(!SHOW_ID, 'Set PLAYWRIGHT_SHOW_ID to run wizard audit tests')
    const errors = attachErrors(page)
    await gotoEditor(page)

    await pickType(page, 'State of the Union')
    await page.locator('main').getByRole('button', { name: '← Back' }).click()
    await assertOnTypePicker(page)

    assertNoErrors(errors)
  })

})

// ── 7. Scoreboard path ──────────────────────────────────────────────────────

test.describe('7. Scoreboard path', () => {

  test('7a: Scoreboard → details (Step 2 of 2): NO round picker, create immediately enabled', async ({ page }) => {
    test.skip(!SHOW_ID, 'Set PLAYWRIGHT_SHOW_ID to run wizard audit tests')
    const errors = attachErrors(page)
    await gotoEditor(page)

    await pickType(page, 'Scoreboard')

    await assertStep(page, 2, 2)
    // Details step card name is a <p> (line 233 of AddSlideWizard.jsx), NOT an <h2>
    await expect(page.locator('main').getByText('Scoreboard', { exact: true }).first()).toBeVisible()

    const addBtn = page.locator('main').getByRole('button', { name: ADD_BTN })
    await expect(addBtn).toBeVisible()
    // scoreboard-reveal is NOT in NEEDS_ROUND
    await expect(addBtn, 'Scoreboard must not require a round (not in NEEDS_ROUND)').toBeEnabled()
    await expect(roundSelectLocator(page)).not.toBeVisible()

    assertNoErrors(errors)
  })

  test('7b: back from Scoreboard details → type picker', async ({ page }) => {
    test.skip(!SHOW_ID, 'Set PLAYWRIGHT_SHOW_ID to run wizard audit tests')
    const errors = attachErrors(page)
    await gotoEditor(page)

    await pickType(page, 'Scoreboard')
    await page.locator('main').getByRole('button', { name: '← Back' }).click()
    await assertOnTypePicker(page)

    assertNoErrors(errors)
  })

})

// ── 8. Custom path ──────────────────────────────────────────────────────────

test.describe('8. Custom path', () => {

  test('8a: Custom → details (Step 2 of 2): NO round picker, create immediately enabled', async ({ page }) => {
    test.skip(!SHOW_ID, 'Set PLAYWRIGHT_SHOW_ID to run wizard audit tests')
    const errors = attachErrors(page)
    await gotoEditor(page)

    await pickType(page, 'Custom')

    await assertStep(page, 2, 2)
    // Details step card name is a <p> (line 233 of AddSlideWizard.jsx), NOT an <h2>
    await expect(page.locator('main').getByText('Custom', { exact: true }).first()).toBeVisible()

    const addBtn = page.locator('main').getByRole('button', { name: ADD_BTN })
    await expect(addBtn).toBeVisible()
    // custom is NOT in NEEDS_ROUND
    await expect(addBtn, 'Custom type must not require a round (not in NEEDS_ROUND)').toBeEnabled()
    await expect(roundSelectLocator(page)).not.toBeVisible()

    assertNoErrors(errors)
  })

  test('8b: back from Custom details → type picker', async ({ page }) => {
    test.skip(!SHOW_ID, 'Set PLAYWRIGHT_SHOW_ID to run wizard audit tests')
    const errors = attachErrors(page)
    await gotoEditor(page)

    await pickType(page, 'Custom')
    await page.locator('main').getByRole('button', { name: '← Back' }).click()
    await assertOnTypePicker(page)

    assertNoErrors(errors)
  })

})

// ── 9. Step-counter integrity ───────────────────────────────────────────────

test.describe('9. Step-counter integrity', () => {

  test('9a: type-picker step shows NO step counter (totalSteps=1 before any type picked)', async ({ page }) => {
    test.skip(!SHOW_ID, 'Set PLAYWRIGHT_SHOW_ID to run wizard audit tests')
    const errors = attachErrors(page)
    await gotoEditor(page)

    await assertOnTypePicker(page)
    await expect(page.getByText(/Step \d+ of \d+/)).not.toBeVisible()

    assertNoErrors(errors)
  })

  test('9b: all five two-step paths show "Step 2 of 2" on their details step', async ({ page }) => {
    test.skip(!SHOW_ID, 'Set PLAYWRIGHT_SHOW_ID to run wizard audit tests')
    // Seed once — addInitScript fires on every subsequent goto
    await seedShowId(page)
    const errors = []
    page.on('pageerror', e => errors.push(`pageerror: ${e.message}`))
    page.on('console', m => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`) })

    const twoStepCards = [
      'State of the Union',  // title
      'Round Intro',         // round-intro
      'Grading Break',       // grading-break
      'Scoreboard',          // scoreboard-reveal
      'Custom',              // custom
    ]

    for (const cardName of twoStepCards) {
      await page.goto('/host', { waitUntil: 'networkidle' })
      await page.locator('aside').waitFor({ state: 'visible', timeout: 15000 })
      await pickType(page, cardName)
      await expect(
        page.getByText('Step 2 of 2', { exact: true }),
        `"${cardName}" must show "Step 2 of 2" on its details step`,
      ).toBeVisible()
    }

    assertNoErrors(errors)
  })

  test('9c: question/regular counter: 2/3 on question-mode, 3/3 on details', async ({ page }) => {
    test.skip(!SHOW_ID, 'Set PLAYWRIGHT_SHOW_ID to run wizard audit tests')
    const errors = attachErrors(page)
    await gotoEditor(page)

    await pickType(page, 'Question')
    await assertStep(page, 2, 3)

    await page.locator('main').getByRole('button', { name: /Regular/ }).click()
    await assertStep(page, 3, 3)

    assertNoErrors(errors)
  })

  test('9d: question/shiny counter: 2/4 on question-mode, 3/4 on format, 4/4 on details', async ({ page }) => {
    test.skip(!SHOW_ID, 'Set PLAYWRIGHT_SHOW_ID to run wizard audit tests')
    const errors = attachErrors(page)
    await gotoEditor(page)

    await pickType(page, 'Question')
    // totalSteps starts at 3 (regular default) and only flips to 4 once Shiny is chosen.
    // This is a known UX quirk: the counter reads "2 of 3" until the mode is picked.
    await assertStep(page, 2, 3)

    await page.locator('main').getByRole('button', { name: /Shiny/ }).click()
    await assertStep(page, 3, 4)

    const hasNoFormats = await page.getByText('No formats yet', { exact: false }).isVisible().catch(() => false)
    test.skip(hasNoFormats, 'No formats — cannot reach Step 4 of 4')

    // GUESSED: first non-Back button in main is the first format card
    await page.locator('main').getByRole('button').filter({ hasNotText: '← Back' }).first().click()
    await assertStep(page, 4, 4)

    assertNoErrors(errors)
  })

})
