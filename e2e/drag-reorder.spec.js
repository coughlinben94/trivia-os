// drag-reorder.spec.js — tests slide + round reordering in the sidebar
import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { nanoid } from 'nanoid'
import { readFileSync } from 'fs'
import { join } from 'path'

function parseEnvFile(filePath) {
  return Object.fromEntries(
    readFileSync(filePath, 'utf8').split('\n')
      .filter(l => l.trim() && !l.trim().startsWith('#') && l.includes('='))
      .map(l => { const idx = l.indexOf('='); const key = l.slice(0, idx).trim(); let val = l.slice(idx + 1).trim(); if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1); return [key, val] })
  )
}
const env = parseEnvFile(join(__dirname, '..', '.env.local'))
const TEST_SHOW_ID = process.env.PLAYWRIGHT_SHOW_ID || 'show_WLBM5jvb'
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)

test.describe.configure({ mode: 'serial' })
test.use({ viewport: { width: 1280, height: 720 }, baseURL: 'https://trivia-os.vercel.app' })

let originalSlides, originalRounds

// Set up a clean show with known slide order: StateOfUnion (general) AFTER Round1/Q1
test.beforeAll(async () => {
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

  await sb.from('shows').update({ is_live: false, current_slide_id: null, slides, rounds }).eq('id', TEST_SHOW_ID)
})

test.afterAll(async () => {
  await sb.from('shows').update({ slides: originalSlides, rounds: originalRounds }).eq('id', TEST_SHOW_ID)
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
