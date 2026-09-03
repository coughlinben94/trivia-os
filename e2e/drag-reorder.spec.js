// drag-reorder.spec.js — tests slide + round reordering in the sidebar
import { test, expect } from '@playwright/test'
import { nanoid } from 'nanoid'
import { authedClient, updateShowVerified } from './authed-client.js'
// OPT-IN — needs a THROWAWAY show. Not quarantined any more; history below.
//
// Two facts combine into a show-destroying bug:
//   1. `sb` below is an ANON client, and writes to `shows` are RLS-gated on a
//      host_verified JWT. PostgREST answers an unauthorized UPDATE with
//      "0 rows changed", not an error — so beforeAll's seeding write and
//      afterAll's restore-to-snapshot write BOTH silently no-op.
//   2. The drag itself runs in the browser context, which global-setup.js
//      HAS authenticated. That write succeeds.
// So the reorder lands and the restore doesn't. Whatever show this points at
// is left permanently reordered.
//
// It was harmless only by accident: the old default (show_WLBM5jvb, the
// deleted Test show) made beforeAll throw on `show.slides` of a null row.
// Now that global-setup works again, `PLAYWRIGHT_SHOW_ID=<a real show>` while
// running the suite would reorder one of Ben's actual shows.
//
// RESOLVED 2026-09-02 — `sb` is now the authenticated host session (see
// authed-client.js), and every `shows` write goes through updateShowVerified(),
// which throws on a 0-row result instead of letting a blocked write pass for
// success. The restore in afterAll can therefore actually land, and cannot
// fail silently if it ever stops landing.
//
// The ALLOW_DRAG_REORDER gate STAYS. It is no longer about the broken client:
// this spec reorders whatever show it points at, so it must be aimed at a
// throwaway, never at a show Ben intends to run. There is no dedicated test
// show right now (show_WLBM5jvb was deleted), so there is no safe default.
//
// To run:
//   ALLOW_DRAG_REORDER=1 PLAYWRIGHT_SHOW_ID=<throwaway> npx playwright test e2e/drag-reorder.spec.js
const TEST_SHOW_ID = process.env.PLAYWRIGHT_SHOW_ID

// Built lazily inside beforeAll, never at module scope: authedClient() throws
// when the saved session is missing or expired, and a module-scope throw
// aborts collection of the WHOLE playwright run (the 2026-09-02 defect this
// suite just dug itself out of). Behind the skip guard, it can only ever fail
// the run someone deliberately asked for.
let sb

test.describe.configure({ mode: 'serial' })
test.use({ viewport: { width: 1280, height: 720 }, baseURL: 'https://trivia-os.vercel.app' })

let originalSlides, originalRounds

// Set up a clean show with known slide order: StateOfUnion (general) AFTER Round1/Q1
test.beforeAll(async () => {
  test.skip(!process.env.ALLOW_DRAG_REORDER, 'Reorders whatever show it targets — set ALLOW_DRAG_REORDER=1 and PLAYWRIGHT_SHOW_ID=<throwaway>. See the header comment.')
  if (!TEST_SHOW_ID) throw new Error('[drag-reorder] set PLAYWRIGHT_SHOW_ID to a THROWAWAY show — this spec permanently reorders it.')
  sb = authedClient()
  const { data: show } = await sb.from('shows').select('*').eq('id', TEST_SHOW_ID).single()
  originalSlides = show.slides
  originalRounds = show.rounds

  // Force: is_live=false, and ensure we have exactly:
  // Round 1 with Q1 (order 0), State of Union general slide (order 1)
  const round1Id = `round_drag${nanoid(4)}`
  const q1Id     = `slide_drag_q${nanoid(4)}`
  const souId    = `slide_drag_s${nanoid(4)}`

  const rounds = [{ id: round1Id, number: 1, title: 'Round 1', subtitle: '', roundType: 'normal' }]
  const slides = [
    { id: q1Id,  type: 'question', roundId: round1Id, order: 0, data: { questionNumber: 1, questionLabel: 'Q1', text: 'Q1 drag test', isShiny: false, mediaSlots: [] } },
    { id: souId, type: 'title',    roundId: null,      order: 1, data: { title: 'State of Union', subtitle: '' } },
  ]

  await updateShowVerified(sb, TEST_SHOW_ID, { is_live: false, current_slide_id: null, slides, rounds })
})

test.afterAll(async () => {
  await updateShowVerified(sb, TEST_SHOW_ID, { slides: originalSlides, rounds: originalRounds })
})

async function gotoEditor(page) {
  await page.addInitScript((id) => { localStorage.setItem('trivia-os:activeShowId', id) }, TEST_SHOW_ID)
  await page.goto('/host', { waitUntil: 'networkidle' })
  await page.locator('aside').waitFor({ state: 'visible', timeout: 15_000 })
}

async function getSlideOrder() {
  const { data } = await sb.from('shows').select('slides').eq('id', TEST_SHOW_ID).single()
  return [...(data.slides ?? [])].sort((a, b) => a.order - b.order).map(s => s.data?.title || s.data?.text || s.data?.questionLabel || s.type)
}

test('drag State of Union (general, order=1) above Q1 (Round 1, order=0)', async ({ page }) => {
  await gotoEditor(page)

  // Confirm initial order in sidebar: Round 1 section shows Q1, State of Union is below
  const aside = page.locator('aside')
  await expect(aside.getByText('Q1')).toBeVisible()
  await expect(aside.getByText('State of Union')).toBeVisible()

  // Get the bounding boxes
  const q1Row   = aside.getByText('Q1').locator('..')
  const souRow  = aside.getByText('State of Union').locator('..')

  const souBox = await souRow.boundingBox()
  const q1Box  = await q1Row.boundingBox()

  console.log('souBox:', JSON.stringify(souBox))
  console.log('q1Box:', JSON.stringify(q1Box))

  // Drag State of Union grip up to Q1
  await page.mouse.move(souBox.x + 6, souBox.y + souBox.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(100)
  // Move to Q1 position
  await page.mouse.move(q1Box.x + 6, q1Box.y + q1Box.height / 2, { steps: 10 })
  await page.waitForTimeout(100)
  await page.mouse.up()
  await page.waitForTimeout(1000)

  // Check Supabase order
  const order = await getSlideOrder()
  console.log('New order:', order)
  expect(order[0], 'State of Union should now be first').toMatch(/State of Union/)
  expect(order[1], 'Q1 should now be second').toMatch(/Q1/)
})

test('drag State of Union over Round 1 header drops before the round', async ({ page }) => {
  // Reset: ensure SOU is after Round 1 again (beforeAll may have been changed by prior test)
  const { data: show } = await sb.from('shows').select('slides').eq('id', TEST_SHOW_ID).single()
  const slides = show.slides.map(s => {
    if (s.type === 'title') return { ...s, order: 1 }
    return { ...s, order: 0 }
  })
  await updateShowVerified(sb, TEST_SHOW_ID, { slides })

  await gotoEditor(page)

  const aside = page.locator('aside')
  await expect(aside.getByText('State of Union')).toBeVisible()

  // Get the round header row (the "R1 · Round 1" label area)
  const roundHeader = aside.getByText(/R1\s*·/).locator('..')
  const souRow = aside.getByText('State of Union').locator('..')

  const souBox = await souRow.boundingBox()
  const rhdBox = await roundHeader.boundingBox()

  // Drag from State of Union to the round header
  await page.mouse.move(souBox.x + 6, souBox.y + souBox.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(100)
  await page.mouse.move(rhdBox.x + rhdBox.width / 2, rhdBox.y + rhdBox.height / 2, { steps: 10 })
  await page.waitForTimeout(100)
  await page.mouse.up()
  await page.waitForTimeout(1000)

  const order = await getSlideOrder()
  console.log('Header-drop order:', order)
  expect(order[0]).toMatch(/State of Union/)
})
