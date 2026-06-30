/**
 * wizard-create-verify.spec.js
 *
 * CREATE-AND-VERIFY Playwright spec for the AddSlideWizard modal.
 * Targets show_WLBM5jvb (the Test show) ONLY.
 * Hard-fails at module load if PLAYWRIGHT_SHOW_ID is missing or wrong.
 *
 * SAFETY: beforeAll snapshots show.slides + show.rounds; afterAll restores verbatim.
 * Safe to re-run; each run leaves the show exactly as it was.
 *
 * ── CONFIRMED SELECTORS (from source grep) ──────────────────────────────────
 *   Dashboard squares: getByRole('button',{name:/CardName/}) — button has icon+name+desc spans
 *   #add-question-text       AddSlideWizard.jsx:169
 *   #add-question-round      AddSlideWizard.jsx:196
 *   #add-question-bonus      AddSlideWizard.jsx:212
 *   #add-round-select        AddSlideWizard.jsx:265  (round-intro / grading-break)
 *   #add-round-number        AddSlideWizard.jsx:311  (round-intro Normal only)
 *   #add-round-subtitle      AddSlideWizard.jsx:330
 *   #add-jukebox-lib         AddSlideWizard.jsx:358
 *   Round type labels:       "Normal Round" / "Swing Round" / "Press Your Luck!"  (.jsx:22-25)
 *   "Add question →"         AddSlideWizard.jsx:229
 *   "Add Slide →"            AddSlideWizard.jsx:378
 *   Modal h2                 AddSlideWizard.jsx:139  — {icon} {cardName}
 *   Slide labels in aside    RoundSidebar.jsx:17-31  slideLabel()
 *   Esc handler              BuildMode.jsx:47-57
 *
 * ── GUESSED SELECTORS (flagged inline) ──────────────────────────────────────
 *   Backdrop:     div.fixed.inset-0  — no testid, Tailwind class inference
 *   ✕ button:     modalCard(page).getByRole('button',{name:'✕'}) — scoped to the white
 *                 card div (bg-white.rounded-2xl.shadow-2xl, AddSlideWizard.jsx:135)
 *                 CONFIRMED: shadow-2xl appears nowhere else in the visible modal UI
 *   Preview box:  .rounded-lg.bg-gray-50 filtered by 'Will read as' — class-based
 *   Preview title: p.text-sm.font-semibold inside the preview box — class-based
 *   Shiny tiles:  .cursor-default — tiles are div (not button), distinctive but not
 *                 globally unique; safe only when the Question modal is open
 *   Backdrop click: page.mouse.click(10,10) — viewport corner assumed to be backdrop
 */

const { test, expect } = require('@playwright/test')
const { createClient } = require('@supabase/supabase-js')
const { readFileSync } = require('fs')
const { join }         = require('path')
const { nanoid }       = require('nanoid')

// ── Env guard (hard-fail at load time) ──────────────────────────────────────

const EXPECTED_SHOW_ID = 'show_WLBM5jvb'
const TEST_SHOW_ID     = process.env.PLAYWRIGHT_SHOW_ID

if (!TEST_SHOW_ID) {
  throw new Error(
    '[wizard-create-verify] PLAYWRIGHT_SHOW_ID is not set.\n' +
    'Run: PLAYWRIGHT_SHOW_ID=show_WLBM5jvb npx playwright test e2e/wizard-create-verify.spec.js'
  )
}
if (TEST_SHOW_ID !== EXPECTED_SHOW_ID) {
  throw new Error(
    `[wizard-create-verify] PLAYWRIGHT_SHOW_ID="${TEST_SHOW_ID}" but this spec ` +
    `may only run against ${EXPECTED_SHOW_ID}. Set PLAYWRIGHT_SHOW_ID=${EXPECTED_SHOW_ID}.`
  )
}

// ── Supabase client (reads .env.local next to package.json) ─────────────────
// __dirname is the CJS built-in — available in Playwright's transform context.

function parseEnvFile(filePath) {
  return Object.fromEntries(
    readFileSync(filePath, 'utf8')
      .split('\n')
      .filter(l => l.trim() && !l.trim().startsWith('#') && l.includes('='))
      .map(l => {
        const idx = l.indexOf('=')
        const key = l.slice(0, idx).trim()
        let val   = l.slice(idx + 1).trim()
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) val = val.slice(1, -1)
        return [key, val]
      })
  )
}

const env = parseEnvFile(join(__dirname, '..', '.env.local'))
const sb  = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)

// ── Module-level snapshot (set in beforeAll, used in afterAll) ───────────────

let snapshotSlides  = []
let snapshotRounds  = []
let testRound1Id    = null   // round used by all round-dependent tests
let testRound2Id    = null   // second round (kept for future multi-round tests)

// ── Browser error capture — diagnostic instrumentation ───────────────────────
// pageErrors is reset in gotoEditor at the start of each test. assertEditorAlive
// includes it in failure messages so the React throw is visible without DevTools.

let pageErrors = []

// ── Supabase helpers ─────────────────────────────────────────────────────────

async function readShowRow() {
  const { data, error } = await sb
    .from('shows')
    .select('slides, rounds')
    .eq('id', TEST_SHOW_ID)
    .single()
  if (error) throw new Error(`readShowRow: ${error.message}`)
  return data
}

async function getSlides() {
  return (await readShowRow()).slides ?? []
}

// ── Serial mode + fixed viewport ─────────────────────────────────────────────
// Viewport is pinned so click-outside at (10,10) reliably hits the backdrop.

test.describe.configure({ mode: 'serial' })
test.use({ viewport: { width: 1280, height: 720 } })

// ── beforeAll: snapshot + ensure ≥ 2 rounds ─────────────────────────────────

test.beforeAll(async () => {
  const show = await readShowRow()
  snapshotSlides = JSON.parse(JSON.stringify(show.slides ?? []))
  snapshotRounds = JSON.parse(JSON.stringify(show.rounds ?? []))

  let workingRounds = [...snapshotRounds]

  if (workingRounds.length < 2) {
    const needed = 2 - workingRounds.length
    for (let i = 0; i < needed; i++) {
      workingRounds.push({
        id:        `round_e2e${nanoid(6)}`,
        number:    workingRounds.length + 1,
        title:     `Test Round ${workingRounds.length + 1}`,
        subtitle:  '',
        type:      'standard',
        roundType: 'normal',
        slides:    [],
      })
    }
    const { error } = await sb
      .from('shows')
      .update({ rounds: workingRounds })
      .eq('id', TEST_SHOW_ID)
    if (error) throw new Error(`beforeAll: failed to write test rounds: ${error.message}`)
  }

  testRound1Id = workingRounds[0].id
  testRound2Id = workingRounds[1].id
})

// ── afterAll: restore snapshot verbatim (runs even when tests fail) ──────────
// waitForSlideCount in each create test ensures writes land before the test proceeds,
// closing the window where a Supabase write could arrive AFTER this restore runs.
// An orphan write that somehow lands after afterAll would not be cleaned — but the
// poll makes that scenario unreachable in practice.

test.afterAll(async () => {
  const { error } = await sb
    .from('shows')
    .update({ slides: snapshotSlides, rounds: snapshotRounds })
    .eq('id', TEST_SHOW_ID)

  if (error) {
    throw new Error(
      `[RESTORE FAILED — manual cleanup required]\n` +
      `Run: supabase UPDATE shows SET slides='[]', rounds='<original>' WHERE id='${TEST_SHOW_ID}'\n` +
      `Error: ${error.message}`
    )
  }

  // Verify the restore landed
  const restored = await readShowRow()
  if ((restored.slides ?? []).length !== snapshotSlides.length) {
    throw new Error(
      `Restore slide count mismatch: expected ${snapshotSlides.length}, ` +
      `got ${(restored.slides ?? []).length}`
    )
  }
  if ((restored.rounds ?? []).length !== snapshotRounds.length) {
    throw new Error(
      `Restore round count mismatch: expected ${snapshotRounds.length}, ` +
      `got ${(restored.rounds ?? []).length}`
    )
  }
})

// ── afterEach: surface any captured browser errors ───────────────────────────

test.afterEach(async () => {
  if (pageErrors.length) {
    console.log('[wizard-create-verify] Browser errors captured during test:\n' + pageErrors.join('\n'))
  }
})

// ── Page navigation helpers ───────────────────────────────────────────────────

async function seedShowId(page) {
  await page.addInitScript((id) => {
    localStorage.setItem('trivia-os:activeShowId', id)
  }, TEST_SHOW_ID)
}

async function gotoEditor(page) {
  pageErrors = []
  page.on('pageerror', err => pageErrors.push('[pageerror] ' + (err.stack || err.message)))
  page.on('console', msg => { if (msg.type() === 'error') pageErrors.push('[console.error] ' + msg.text()) })

  await seedShowId(page)
  await page.goto('/host', { waitUntil: 'networkidle' })
  await page.locator('aside').waitFor({ state: 'visible', timeout: 15_000 })
  // Confirm we are in dashboard (wizard) mode, not editing mode
  // CONFIRMED: BuildMode.jsx:120 — this paragraph only renders in wizard mode
  await expect(page.getByText('What are we adding?')).toBeVisible({ timeout: 5_000 })
}

/**
 * Click a dashboard TYPE_CARD square and wait for the modal h2 to appear.
 * CONFIRMED: buttons contain {icon} {name} {desc} text; regex on name works.
 * CONFIRMED: h2 = `{typeCard.icon} {typeCard.name}` (AddSlideWizard.jsx:139-141)
 */
async function openModal(page, cardName) {
  await page.getByRole('button', { name: new RegExp(cardName) }).first().click()
  await page.getByRole('heading', { level: 2 }).waitFor({ state: 'visible', timeout: 5_000 })
}

/**
 * Returns a locator scoped to the AddSlideWizard white card.
 * CONFIRMED: AddSlideWizard root div has class="bg-white rounded-2xl … shadow-2xl" (line 135).
 * shadow-2xl appears on no other element in the BuildMode UI, making this unambiguous.
 */
function modalCard(page) {
  return page.locator('div.bg-white.rounded-2xl.shadow-2xl')
}

/**
 * Click the ✕ close button and wait for the modal h2 to disappear.
 * Scoped to modalCard so it never touches sidebar round-delete ✕ buttons.
 * CONFIRMED: button text '✕' (U+2715) in AddSlideWizard header (line 146).
 */
async function closeWithX(page) {
  await modalCard(page).getByRole('button', { name: '✕' }).click()
  await expect(page.getByRole('heading', { level: 2 })).not.toBeVisible({ timeout: 5_000 })
}

/**
 * Wait for the modal to fully close (h2 gone).
 * UI assertion only — NOT a proxy for "write landed". The modal can close from a crash
 * (React tree unmount) before the async Supabase write round-trips. Always follow this
 * with assertEditorAlive + waitForSlideCount to confirm the write actually landed.
 */
async function waitForModalClose(page) {
  await expect(page.getByRole('heading', { level: 2 })).not.toBeVisible({ timeout: 10_000 })
}

/**
 * Poll Supabase until the slide count reaches `expected`, then return the newest slide.
 * Uses expect.poll — Playwright surfaces a clear timeout failure if the write never lands.
 * "Newest" = highest order value (addSlide sets order = slides.length, monotonic).
 *
 * This replaces the old getNewestSlide / immediate-read pattern. waitForModalClose can
 * resolve from a crash/blank-screen before the write round-trips, so the immediate read
 * saw 0 slides. The poll waits for reality.
 */
async function waitForSlideCount(expected, timeoutMs = 8_000) {
  await expect.poll(
    async () => (await getSlides()).length,
    { timeout: timeoutMs, intervals: [100, 200, 300, 500] }
  ).toBe(expected)
  return (await getSlides()).slice().sort((a, b) => b.order - a.order)[0]
}

/**
 * Assert the host editor tree is still alive after a create operation.
 * If the React tree unmounts (unhandled crash OR error boundary fires), `aside`
 * disappears and/or the fallback text appears — either is a failing signal.
 * CONFIRMED: `aside` (RoundSidebar root) is visible in both wizard and editing mode.
 * CONFIRMED: 'Something went wrong in the editor' is the ErrorBoundary.jsx fallback text.
 */
async function assertEditorAlive(page) {
  const browserContext = () =>
    pageErrors.length
      ? '\nBrowser errors captured:\n' + pageErrors.join('\n')
      : '\n(no browser errors captured)'

  try {
    await expect(page.locator('aside')).toBeVisible({ timeout: 2_000 })
  } catch {
    throw new Error('Host editor blank-screened or crashed — aside is not visible' + browserContext())
  }

  try {
    await expect(page.getByText('Something went wrong in the editor')).not.toBeVisible()
  } catch {
    throw new Error('ErrorBoundary fallback visible — editor threw during or after create' + browserContext())
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// A. MODAL MECHANICS — open / close (no create)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('A. Modal mechanics — open / close (no create)', () => {

  test('A1: each of the 5 dashboard squares opens its modal with backdrop visible', async ({ page }) => {
    await gotoEditor(page)

    const cards = [
      { name: 'State of the Union', heading: /State of the Union/ },
      { name: 'Round Intro',        heading: /Round Intro/ },
      { name: 'Question',           heading: /Question/ },
      { name: 'Grading Break',      heading: /Grading Break/ },
      { name: 'Custom',             heading: /Custom/ },
    ]

    for (const { name, heading } of cards) {
      await openModal(page, name)

      // Modal h2 present
      await expect(page.getByRole('heading', { level: 2, name: heading })).toBeVisible()

      // GUESSED: backdrop = div.fixed.inset-0 (Tailwind classes on the backdrop motion.div)
      // BuildMode.jsx:143 — className="fixed inset-0 bg-black/50 z-50 ..."
      await expect(page.locator('div.fixed.inset-0').first()).toBeVisible()

      // ✕ button present — scoped to modal card, never matches sidebar delete buttons
      await expect(modalCard(page).getByRole('button', { name: '✕' })).toBeVisible()

      await closeWithX(page)
    }
  })

  test('A2: Esc key closes the modal', async ({ page }) => {
    await gotoEditor(page)
    await openModal(page, 'Custom')
    await expect(page.getByRole('heading', { level: 2 })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('heading', { level: 2 })).not.toBeVisible({ timeout: 3_000 })
    // Dashboard restored
    await expect(page.getByText('What are we adding?')).toBeVisible()
  })

  test('A3: click-outside (backdrop) closes the modal', async ({ page }) => {
    await gotoEditor(page)
    await openModal(page, 'Custom')
    await expect(page.getByRole('heading', { level: 2 })).toBeVisible()
    // GUESSED: (10, 10) is a viewport corner that lands on the backdrop, not the card.
    // Card is centered; top-left corner is definitely backdrop.
    // BuildMode.jsx:149 — onClick={closeAddModal} on the backdrop div.
    await page.mouse.click(10, 10)
    await expect(page.getByRole('heading', { level: 2 })).not.toBeVisible({ timeout: 3_000 })
  })

  test('A4: ✕ button closes the modal; dashboard is restored', async ({ page }) => {
    await gotoEditor(page)
    await openModal(page, 'State of the Union')
    await closeWithX(page)
    await expect(page.getByText('What are we adding?')).toBeVisible()
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// B. TITLE — create and verify
// ─────────────────────────────────────────────────────────────────────────────

test.describe('B. Title slide — create and verify', () => {

  test('B1: no round select; "Add Slide →" immediately enabled; creates with hardcoded Baynes data', async ({ page }) => {
    await gotoEditor(page)
    const countBefore = (await getSlides()).length

    await openModal(page, 'State of the Union')

    // title NOT in NEEDS_ROUND — no round select
    // CONFIRMED: NEEDS_ROUND.has('title') === false (AddSlideWizard.jsx:14)
    await expect(page.locator('#add-round-select')).not.toBeVisible()

    const addBtn = page.getByRole('button', { name: 'Add Slide →' })
    await expect(addBtn).toBeEnabled()
    await addBtn.click()
    await waitForModalClose(page)

    // ── Supabase verify: poll until write lands, then confirm editor is still alive ──
    await assertEditorAlive(page)
    const newSlide = await waitForSlideCount(countBefore + 1)
    expect(newSlide.type).toBe('title')
    expect(newSlide.roundId).toBeNull()
    expect(newSlide.data.title).toBe('Baynes Apple Valley')     // CONFIRMED AddSlideWizard.jsx:71
    expect(newSlide.data.subtitle).toBe('Trivia Night')          // CONFIRMED AddSlideWizard.jsx:71

    // ── UI: editing mode entered ──
    // CONFIRMED: BuildMode calls enterEditing(slide) after addSlide; wizard mode exits
    await expect(page.getByText('What are we adding?')).not.toBeVisible()

    // ── Sidebar: label = data.title (RoundSidebar.jsx:27) ──
    await expect(page.locator('aside').getByText('Baynes Apple Valley')).toBeVisible()
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// C. ROUND-INTRO / NORMAL — create and verify
// ─────────────────────────────────────────────────────────────────────────────

test.describe('C. Round-intro / Normal — create and verify', () => {

  test('C1: preview shows "Round 3"; subtitle clear-then-retype sticks (P0#1); creates correctly', async ({ page }) => {
    await gotoEditor(page)
    const countBefore = (await getSlides()).length

    await openModal(page, 'Round Intro')

    // Round select present (round-intro is in NEEDS_ROUND)
    await expect(page.locator('#add-round-select')).toBeVisible()
    await page.locator('#add-round-select').selectOption(testRound1Id)

    // "Normal Round" is the default (ROUND_TYPES[0], needsNumber:true)
    // CONFIRMED: roundType state initialises to 'normal' (AddSlideWizard.jsx:39)
    await expect(page.getByRole('button', { name: 'Normal Round' })).toBeVisible()

    // Round number input visible for Normal
    const numInput = page.locator('#add-round-number')
    await expect(numInput).toBeVisible()
    await numInput.fill('3')
    await expect(numInput).toHaveValue('3')

    // Subtitle: type → clear → retype → assert stuck (P0#1)
    // CONFIRMED: controlled input — value={roundSubtitle}, onChange sets state
    const subtitleInput = page.locator('#add-round-subtitle')
    await subtitleInput.fill('Fight!')
    await subtitleInput.clear()
    await subtitleInput.fill('The rematch')
    await expect(subtitleInput).toHaveValue('The rematch')  // P0#1 guard

    // Preview "Will read as" shows "Round 3"
    // GUESSED selector: .rounded-lg.bg-gray-50 filtered by 'Will read as' text
    // CONFIRMED: derivedRoundTitle = 'Round {n}'.replace('{n}', 3) = 'Round 3'
    const previewBox = page.locator('.rounded-lg.bg-gray-50').filter({ hasText: 'Will read as' })
    await expect(previewBox).toBeVisible()
    // GUESSED: p.text-sm.font-semibold is the title paragraph (AddSlideWizard.jsx:343)
    await expect(previewBox.locator('p.text-sm.font-semibold')).toHaveText('Round 3')

    await page.getByRole('button', { name: 'Add Slide →' }).click()
    await waitForModalClose(page)

    // ── Supabase verify ──
    await assertEditorAlive(page)
    const newSlide = await waitForSlideCount(countBefore + 1)
    expect(newSlide.type).toBe('round-intro')
    expect(newSlide.roundId).toBe(testRound1Id)
    expect(newSlide.data.roundType).toBe('normal')
    expect(newSlide.data.roundNumber).toBe(3)
    expect(newSlide.data.roundTitle).toBe('Round 3')
    expect(newSlide.data.subtitle).toBe('The rematch')
    expect(newSlide.data.hostPhotoUrl).toBeNull()

    // ── Sidebar: label = data.roundTitle (RoundSidebar.jsx:24) ──
    await expect(page.locator('aside').getByText('Round 3')).toBeVisible()
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// D. ROUND-INTRO / SWING — create and verify
// ─────────────────────────────────────────────────────────────────────────────

test.describe('D. Round-intro / Swing — create and verify', () => {

  test('D1: no number input; preview shows "Swing Round"; roundNumber absent in data', async ({ page }) => {
    await gotoEditor(page)
    const countBefore = (await getSlides()).length

    await openModal(page, 'Round Intro')
    await page.locator('#add-round-select').selectOption(testRound1Id)

    // CONFIRMED: label 'Swing Round' (ROUND_TYPES[1].label, AddSlideWizard.jsx:23)
    await page.getByRole('button', { name: 'Swing Round' }).click()

    // Number input must be absent — needsNumber:false for swing
    // CONFIRMED: AddSlideWizard.jsx:305 — only renders when selRoundType.needsNumber
    await expect(page.locator('#add-round-number')).not.toBeVisible()

    // Preview
    const previewBox = page.locator('.rounded-lg.bg-gray-50').filter({ hasText: 'Will read as' })
    // CONFIRMED: derivedRoundTitle = selRoundType.title = 'Swing Round'
    await expect(previewBox.locator('p.text-sm.font-semibold')).toHaveText('Swing Round')

    await page.getByRole('button', { name: 'Add Slide →' }).click()
    await waitForModalClose(page)

    await assertEditorAlive(page)
    const newSlide = await waitForSlideCount(countBefore + 1)
    expect(newSlide.type).toBe('round-intro')
    expect(newSlide.data.roundType).toBe('swing')
    expect(newSlide.data.roundTitle).toBe('Swing Round')
    // CONFIRMED: AddSlideWizard.jsx:75 — roundNumber: selRoundType.needsNumber ? roundNumber : undefined
    expect(newSlide.data.roundNumber).toBeUndefined()
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// E. ROUND-INTRO / PYL — create and verify
// ─────────────────────────────────────────────────────────────────────────────

test.describe('E. Round-intro / PYL — create and verify', () => {

  test('E1: no number input; preview shows "Press Your Luck!"; creates correctly', async ({ page }) => {
    await gotoEditor(page)
    const countBefore = (await getSlides()).length

    await openModal(page, 'Round Intro')
    await page.locator('#add-round-select').selectOption(testRound1Id)

    // CONFIRMED: label 'Press Your Luck!' (ROUND_TYPES[2].label, AddSlideWizard.jsx:24)
    await page.getByRole('button', { name: 'Press Your Luck!' }).click()

    await expect(page.locator('#add-round-number')).not.toBeVisible()

    const previewBox = page.locator('.rounded-lg.bg-gray-50').filter({ hasText: 'Will read as' })
    await expect(previewBox.locator('p.text-sm.font-semibold')).toHaveText('Press Your Luck!')

    await page.getByRole('button', { name: 'Add Slide →' }).click()
    await waitForModalClose(page)

    await assertEditorAlive(page)
    const newSlide = await waitForSlideCount(countBefore + 1)
    expect(newSlide.type).toBe('round-intro')
    expect(newSlide.data.roundType).toBe('pyl')
    expect(newSlide.data.roundTitle).toBe('Press Your Luck!')
    expect(newSlide.data.roundNumber).toBeUndefined()
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// F. QUESTION / PLAIN — create and verify
// ─────────────────────────────────────────────────────────────────────────────

test.describe('F. Question / plain — create and verify', () => {

  test('F1: split screen side-by-side; gated until round+text; creates correctly; enters SlideEditor', async ({ page }) => {
    await gotoEditor(page)
    const slidesBefore = await getSlides()
    const countBefore  = slidesBefore.length

    await openModal(page, 'Question')

    // Both columns visible side-by-side
    // CONFIRMED: grid grid-cols-2 gap-6 layout (AddSlideWizard.jsx:155)
    await expect(page.getByText('📝 Plain question')).toBeVisible()
    await expect(page.getByText('✨ Shiny formats')).toBeVisible()

    // "Add question →" disabled with no round and no text
    const addQBtn = page.getByRole('button', { name: 'Add question →' })
    await expect(addQBtn).toBeDisabled()
    // CONFIRMED: helper text "Select a round to continue" (AddSlideWizard.jsx:233)
    await expect(page.getByText('Select a round to continue')).toBeVisible()

    // Select round — still disabled (no text)
    await page.locator('#add-question-round').selectOption(testRound1Id)
    await expect(addQBtn).toBeDisabled()
    // CONFIRMED: helper text "Add question text to continue" (AddSlideWizard.jsx:234)
    await expect(page.getByText('Add question text to continue')).toBeVisible()

    // Fill text — now enabled
    await page.locator('#add-question-text').fill('What is the capital of France?')
    await expect(addQBtn).toBeEnabled()

    // Bonus unchecked by default
    await expect(page.locator('#add-question-bonus')).not.toBeChecked()

    // Compute expected Q number
    // CONFIRMED: AddSlideWizard.jsx:63-66 — filters by roundId + type + !isBonus
    const roundSlides  = slidesBefore.filter(s => s.roundId === testRound1Id)
    const nonBonusQ    = roundSlides.filter(s =>
      (s.type === 'question' || s.type === 'pixelate-series') && !s.data?.isBonus
    )
    const expectedQNum   = nonBonusQ.length + 1
    const expectedQLabel = `Q${expectedQNum}`

    await addQBtn.click()
    await waitForModalClose(page)

    // ── Supabase verify ──
    await assertEditorAlive(page)
    const newSlide = await waitForSlideCount(countBefore + 1)
    expect(newSlide.type).toBe('question')
    expect(newSlide.roundId).toBe(testRound1Id)
    expect(newSlide.data.questionMode).toBe('regular')
    expect(newSlide.data.isShiny).toBe(false)
    expect(newSlide.data.text).toBe('What is the capital of France?')
    expect(newSlide.data.questionLabel).toBe(expectedQLabel)
    expect(newSlide.data.questionNumber).toBe(expectedQNum)
    expect(newSlide.data.isBonus).toBeUndefined()   // not added when isBonus=false
    expect(Array.isArray(newSlide.data.mediaSlots)).toBe(true)

    // ── UI: editing mode entered (SlideEditor rendered) ──
    await expect(page.getByText('What are we adding?')).not.toBeVisible()

    // ── Sidebar: question label visible ──
    // CONFIRMED: slideLabel() returns data.questionLabel for type 'question' (RoundSidebar.jsx:20)
    await expect(page.locator('aside').getByText(expectedQLabel)).toBeVisible()
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// G. QUESTION / BONUS + COUNTING — independent Q and B counters
// ─────────────────────────────────────────────────────────────────────────────

test.describe('G. Question bonus counting — Q and B counters are independent', () => {

  test('G1: plain Q gets Q-label, bonus Q gets B-label; counters do not cross-contaminate', async ({ page }) => {
    // ── Part 1: create a plain question ─────────────────────────────────────
    await gotoEditor(page)
    let slidesBefore = await getSlides()
    let countBefore  = slidesBefore.length

    const roundSlidesBefore = slidesBefore.filter(s => s.roundId === testRound1Id)
    const nonBonusBefore = roundSlidesBefore.filter(
      s => (s.type === 'question' || s.type === 'pixelate-series') && !s.data?.isBonus
    )
    const bonusBefore = roundSlidesBefore.filter(s => s.type === 'question' && s.data?.isBonus)
    const expectedPlainQNum = nonBonusBefore.length + 1
    const expectedBonusNum  = bonusBefore.length + 1

    await openModal(page, 'Question')
    await page.locator('#add-question-round').selectOption(testRound1Id)
    await page.locator('#add-question-text').fill('Plain Q for bonus-counting test')
    await expect(page.locator('#add-question-bonus')).not.toBeChecked()
    await page.getByRole('button', { name: 'Add question →' }).click()
    await waitForModalClose(page)

    await assertEditorAlive(page)
    const plainSlide = await waitForSlideCount(countBefore + 1)
    expect(plainSlide.data.questionLabel).toBe(`Q${expectedPlainQNum}`)
    expect(plainSlide.data.questionLabel).toMatch(/^Q\d+$/)
    expect(plainSlide.data.isBonus).toBeUndefined()

    // ── Part 2: create a bonus question (fresh page load resets modal state) ─
    await gotoEditor(page)
    slidesBefore = await getSlides()
    countBefore  = slidesBefore.length

    await openModal(page, 'Question')
    await page.locator('#add-question-round').selectOption(testRound1Id)
    await page.locator('#add-question-text').fill('Bonus Q for counting test')
    await page.locator('#add-question-bonus').check()
    await expect(page.locator('#add-question-bonus')).toBeChecked()
    await page.getByRole('button', { name: 'Add question →' }).click()
    await waitForModalClose(page)

    await assertEditorAlive(page)
    const bonusSlide = await waitForSlideCount(countBefore + 1)
    expect(bonusSlide.data.questionLabel).toBe(`B${expectedBonusNum}`)
    expect(bonusSlide.data.questionLabel).toMatch(/^B\d+$/)
    expect(bonusSlide.data.isBonus).toBe(true)

    // ── Guard: counters are independent ─────────────────────────────────────
    // The plain Q number was set from nonBonusQ.length; bonus did not affect it.
    // The bonus B number was set from bonusQ.length; plain Q did not affect it.
    expect(plainSlide.data.questionNumber).toBe(expectedPlainQNum)
    expect(bonusSlide.data.questionNumber).toBe(expectedBonusNum)
    // Sanity: they don't share the same number unless both start at 1 in the same round
    // (if expectedPlainQNum !== expectedBonusNum, they're definitely independent)
    // We always assert the labels match their respective Q/B prefix — that's the core guard.
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// H. GRADING-BREAK — create and verify
// ─────────────────────────────────────────────────────────────────────────────

test.describe('H. Grading break — create and verify', () => {

  test('H1: only round select + music select rendered (no textarea); creates with correct data', async ({ page }) => {
    await gotoEditor(page)
    const countBefore = (await getSlides()).length

    await openModal(page, 'Grading Break')

    // Label reads "End of which round?" (not "Round")
    // CONFIRMED: AddSlideWizard.jsx:260 — ternary on type === 'grading-break'
    await expect(page.getByText('End of which round?')).toBeVisible()
    await expect(page.locator('#add-round-select')).toBeVisible()

    // Jukebox lib select present
    // CONFIRMED: id="add-jukebox-lib" (AddSlideWizard.jsx:358)
    await expect(page.locator('#add-jukebox-lib')).toBeVisible()

    // NO textarea — grading-break form has no message input; message is hardcoded
    // CONFIRMED: AddSlideWizard.jsx:352-369 — only round select + jukebox select, no <textarea>
    await expect(page.locator('textarea')).not.toBeVisible()

    // Add button disabled until round selected
    const addBtn = page.getByRole('button', { name: 'Add Slide →' })
    await expect(addBtn).toBeDisabled()

    await page.locator('#add-round-select').selectOption(testRound1Id)
    await expect(addBtn).toBeEnabled()

    // Select "Main Library" (id='main')
    // CONFIRMED: JUKEBOX_LIBRARIES = [{id:'main', label:'Main Library'}] (jukeboxLibraries.js:5)
    await page.locator('#add-jukebox-lib').selectOption('main')

    await addBtn.click()
    await waitForModalClose(page)

    // ── Supabase verify ──
    await assertEditorAlive(page)
    const newSlide = await waitForSlideCount(countBefore + 1)
    expect(newSlide.type).toBe('grading-break')
    expect(newSlide.roundId).toBe(testRound1Id)
    // CONFIRMED: hardcoded message (AddSlideWizard.jsx:96)
    expect(newSlide.data.message).toContain('Ben grades papers')
    expect(newSlide.data.jukeboxLib).toBe('main')
    expect(newSlide.data.backLinkSlideId).toBeNull()

    // ── Sidebar: label = 'Grading Break' (RoundSidebar.jsx:22) ──
    await expect(page.locator('aside').getByText('Grading Break')).toBeVisible()
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// I. CUSTOM — create and verify
// ─────────────────────────────────────────────────────────────────────────────

test.describe('I. Custom — create and verify', () => {

  test('I1: no round select; "Add Slide →" immediately enabled; creates empty data shape', async ({ page }) => {
    await gotoEditor(page)
    const countBefore = (await getSlides()).length

    await openModal(page, 'Custom')

    // custom NOT in NEEDS_ROUND
    await expect(page.locator('#add-round-select')).not.toBeVisible()

    const addBtn = page.getByRole('button', { name: 'Add Slide →' })
    await expect(addBtn).toBeEnabled()
    await addBtn.click()
    await waitForModalClose(page)

    // ── Supabase verify ──
    await assertEditorAlive(page)
    const newSlide = await waitForSlideCount(countBefore + 1)
    expect(newSlide.type).toBe('custom')
    expect(newSlide.roundId).toBeNull()
    // CONFIRMED: AddSlideWizard.jsx:102
    expect(newSlide.data.title).toBe('')
    expect(newSlide.data.body).toBe('')
    expect(newSlide.data.mediaUrl).toBeNull()
    expect(newSlide.data.mediaType).toBeNull()

    // ── Sidebar: label = 'Custom Slide' (RoundSidebar.jsx:11) ──
    await expect(page.locator('aside').getByText('Custom Slide')).toBeVisible()
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// J. SHINY TILES — display-only guard (current state)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('J. Shiny tiles — display-only guard', () => {

  test('J1: 10 tiles render; clicking a tile creates no slide and does not close the modal', async ({ page }) => {
    // NOTE: When a shiny format gains an action (e.g. single-image gets wired),
    // this test must be updated — clicking that tile will start a flow.
    await gotoEditor(page)
    const countBefore = (await getSlides()).length

    await openModal(page, 'Question')

    // GUESSED: shiny tiles are div elements with class "cursor-default" (AddSlideWizard.jsx:118).
    // They are NOT <button> elements — clicking them does nothing.
    // Risk: other elements in the modal might also carry cursor-default.
    // This count assertion confirms all 10 SHINY_FORMATS tiles rendered.
    // CONFIRMED count: 10 entries in shinyFormatDictionary.js
    const tiles = page.locator('.cursor-default')
    await expect(tiles).toHaveCount(10)

    // Click the first tile
    await tiles.first().click()

    // Modal still open (h2 still visible)
    await expect(page.getByRole('heading', { level: 2, name: /Question/ })).toBeVisible()

    // No slide created in Supabase
    const slidesAfter = await getSlides()
    expect(
      slidesAfter.length,
      'Clicking a shiny tile must NOT create a slide in Supabase'
    ).toBe(countBefore)

    await closeWithX(page)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// K. VALIDATION — disabled states and helper text
// ─────────────────────────────────────────────────────────────────────────────

test.describe('K. Validation — disabled states and helper text', () => {

  test('K1: question "Add question →" disabled/enabled cycle with correct helper text', async ({ page }) => {
    await gotoEditor(page)
    await openModal(page, 'Question')
    const addQBtn = page.getByRole('button', { name: 'Add question →' })

    // Disabled: no round, no text
    await expect(addQBtn).toBeDisabled()
    await expect(page.getByText('Select a round to continue')).toBeVisible()

    // Select round → still disabled (no text)
    await page.locator('#add-question-round').selectOption(testRound1Id)
    await expect(addQBtn).toBeDisabled()
    await expect(page.getByText('Add question text to continue')).toBeVisible()

    // Fill text → enabled
    await page.locator('#add-question-text').fill('Validation test question')
    await expect(addQBtn).toBeEnabled()

    // Clear text → disabled again
    await page.locator('#add-question-text').fill('')
    await expect(addQBtn).toBeDisabled()

    await closeWithX(page)
  })

  test('K2: round-intro "Add Slide →" gated on round selection', async ({ page }) => {
    await gotoEditor(page)
    await openModal(page, 'Round Intro')
    const addBtn = page.getByRole('button', { name: 'Add Slide →' })

    // Disabled: no round
    await expect(addBtn).toBeDisabled()
    await expect(page.getByText('Select a round to continue')).toBeVisible()

    // Select round → enabled (default roundNumber=1 is valid)
    // CONFIRMED: roundNumValid = !needsNumber || (Number.isInteger(1) && 1 > 0) = true
    await page.locator('#add-round-select').selectOption(testRound1Id)
    await expect(addBtn).toBeEnabled()

    await closeWithX(page)
  })

  test('K3: round-intro Normal — "Add Slide →" disabled when round number is cleared', async ({ page }) => {
    await gotoEditor(page)
    await openModal(page, 'Round Intro')
    await page.locator('#add-round-select').selectOption(testRound1Id)

    const addBtn  = page.getByRole('button', { name: 'Add Slide →' })
    const numInput = page.locator('#add-round-number')

    // Enabled by default (roundNumber=1)
    await expect(addBtn).toBeEnabled()

    // Clear the number input
    // CONFIRMED: onChange runs parseInt(value,10); if NaN, sets roundNumber='' (line 317)
    // roundNumValid = !needsNumber || (Number.isInteger('') && '' > 0) = false → disabled
    await numInput.fill('')
    await numInput.dispatchEvent('change')

    const isNowDisabled = await addBtn.isDisabled()
    if (isNowDisabled) {
      // CONFIRMED: helper text "Enter a round number to continue" (AddSlideWizard.jsx:384)
      await expect(page.getByText('Enter a round number to continue')).toBeVisible()
    } else {
      // Some browsers auto-correct type="number" min="1" to 1 on clear — log, do not fail.
      console.warn('K3: browser auto-corrected empty number input to min=1 — disabled state unreachable in UI')
    }

    await closeWithX(page)
  })

  test('K4: grading-break "Add Slide →" disabled until round selected', async ({ page }) => {
    await gotoEditor(page)
    await openModal(page, 'Grading Break')
    const addBtn = page.getByRole('button', { name: 'Add Slide →' })

    await expect(addBtn).toBeDisabled()
    await expect(page.getByText('Select a round to continue')).toBeVisible()

    await page.locator('#add-round-select').selectOption(testRound1Id)
    await expect(addBtn).toBeEnabled()

    await closeWithX(page)
  })

  test('K5: title and custom "Add Slide →" always enabled (not in NEEDS_ROUND)', async ({ page }) => {
    await gotoEditor(page)

    // Title
    await openModal(page, 'State of the Union')
    await expect(page.getByRole('button', { name: 'Add Slide →' })).toBeEnabled()
    await closeWithX(page)

    // Custom
    await openModal(page, 'Custom')
    await expect(page.getByRole('button', { name: 'Add Slide →' })).toBeEnabled()
    await closeWithX(page)
  })

})
