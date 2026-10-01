import { test, expect } from '@playwright/test'
import { authedClient, updateShowVerified } from './authed-client.js'

// Real-browser proof for the "TV Next plays an owed audio clip" fix
// (2026-10-01, fix/audio-fail-loud). A Stream Deck Right-Arrow that lands on
// the /display window used to step past an audio question silently.
//
// Data safety: creates ONE throwaway show row with a unique id (never touches a
// real show), drives only that id, and deletes it in afterAll. Run against a
// LOCAL dev server so the branch code is what's under test:
//   PLAYWRIGHT_BASE_URL=http://localhost:5199 npx playwright test e2e/audio-tv-next.spec.js
// Chromium is Playwright's bundled build, never Ben's Chrome.
// In a git worktree, symlink the two gitignored env files first (vite's root is
// client/, so it reads client/.env.local, not the repo-root one):
//   ln -sf <main>/.env.local .env.local && ln -sf <main>/client/.env.local client/.env.local
// Proven 2026-10-01: 7/7 pass on fix/audio-fail-loud; on origin/main (e6abd3c)
// test 2 fails the way 2026-09-29 did — the TV's Next stepped to the next slide
// with audio_playing still null (silent skip). Tests are serial; the first
// failure skips the rest.

test.use({ launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] } })

const ID = `show_e2eaudio_${Math.random().toString(36).slice(2, 8)}`
let sb

const slides = [
  { id: 't1', type: 'title', order: 0, data: { title: 'e2e start' } },
  {
    id: 'q1', type: 'question', order: 1,
    data: { text: 'e2e audio question', answer: 'x', mediaUrl: '/drum-roll.mp3', mediaType: 'audio/mpeg', audioTrigger: 'click' },
  },
  { id: 'q2', type: 'title', order: 2, data: { title: 'e2e end' } },
  // Multi-part audio series: ONE slide.id for all three parts.
  {
    id: 'm1', type: 'question', order: 3,
    data: {
      isShiny: true, shinyType: 'audio', introDone: true, currentPart: 0,
      parts: [0, 1, 2].map(n => ({ text: `part ${n}`, answer: `a${n}`, mediaSlots: [{ type: 'audio/mpeg', url: '/drum-roll.mp3' }] })),
    },
  },
  { id: 'z9', type: 'title', order: 4, data: { title: 'e2e after the series' } },
]

async function row() {
  const { data, error } = await sb.from('shows').select('current_slide_id, audio_playing, slides').eq('id', ID).single()
  if (error) throw new Error(error.message)
  return data
}
async function waitFor(pred, ms = 8000, label = 'condition') {
  const t0 = Date.now()
  let last
  while (Date.now() - t0 < ms) {
    last = await row()
    if (pred(last)) return last
    await new Promise(r => setTimeout(r, 150))
  }
  throw new Error(`timed out waiting for ${label}; last row = ${JSON.stringify(last)}`)
}
const partNow = r => r.slides.find(s => s.id === 'm1').data.currentPart ?? 0
const reset = async (slideId, audio_playing = null) => {
  const i = slides.findIndex(s => s.id === slideId)
  // a series always starts at part 0 on a fresh run
  const fresh = slides.map(s => s.id === 'm1' ? { ...s, data: { ...s.data, currentPart: 0 } } : s)
  return updateShowVerified(sb, ID, { slides: fresh, current_slide_id: slideId, current_slide_index: i, audio_playing })
}
const audioState = page => page.evaluate(() => {
  const a = document.querySelector('audio')
  return a ? { exists: true, paused: a.paused, t: a.currentTime, ended: a.ended } : { exists: false }
})

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  sb = authedClient()
  const { error } = await sb.from('shows').insert({
    id: ID, title: 'E2E audio throwaway (safe to delete)', date: '2026-10-01', theme_id: 'pure-michigan',
    slides, rounds: [], powerups: [], current_slide_id: 't1', current_slide_index: 0,
    is_live: true, scoreboard_visible: false, scores_revealed: false, late_team_qr_visible: false,
  })
  if (error) throw new Error(`could not create throwaway show: ${error.message}`)
})

test.afterAll(async () => {
  const { data, error } = await sb.from('shows').delete().eq('id', ID).select('id')
  if (error || !data?.length) console.error(`[e2e] CLEANUP FAILED for ${ID} — delete this row by hand`, error ?? '0 rows')
})

async function openTv(page) {
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto(`/display?show=${ID}`, { waitUntil: 'networkidle' })
  await page.locator('body').click({ position: { x: 5, y: 5 } }) // the real setup ritual: one click on the TV
  return errors
}

test('1 TV ArrowRight on a title steps to the audio question', async ({ page }) => {
  await reset('t1')
  await openTv(page)
  await page.keyboard.press('ArrowRight')
  await waitFor(r => r.current_slide_id === 'q1', 8000, 'step to q1')
})

test('2 TV ArrowRight on the audio question PLAYS it and does NOT advance', async ({ page }) => {
  await reset('q1')
  await openTv(page)
  await expect(page.locator('audio')).toHaveCount(1, { timeout: 8000 })
  await page.keyboard.press('ArrowRight')
  const r = await waitFor(x => x.audio_playing?.slideId === 'q1', 8000, 'audio_playing written')
  expect(r.current_slide_id).toBe('q1') // stayed put
  await expect.poll(async () => (await audioState(page)).paused, { timeout: 8000 }).toBe(false)
  await expect.poll(async () => (await audioState(page)).t, { timeout: 5000 }).toBeGreaterThan(0) // the clock really advances
})

test('3 next TV ArrowRight advances AND clears the stale mark', async ({ page }) => {
  await reset('q1', { slideId: 'q1', playing: true })
  await openTv(page)
  await page.keyboard.press('ArrowRight')
  const r = await waitFor(x => x.current_slide_id === 'q2', 8000, 'step to q2')
  expect(r.audio_playing).toBeNull()
})

test('4 ArrowLeft back to the question does NOT autoplay on arrival', async ({ page }) => {
  await reset('q2', null)
  await openTv(page)
  await page.keyboard.press('ArrowLeft')
  await waitFor(x => x.current_slide_id === 'q1', 8000, 'step back to q1')
  await expect(page.locator('audio')).toHaveCount(1, { timeout: 8000 })
  await page.waitForTimeout(1500)
  const a = await audioState(page)
  expect(a.paused).toBe(true)
  expect((await row()).audio_playing).toBeNull()
})

test('5 and Next plays it again (fresh press), then a second Next advances', async ({ page }) => {
  await reset('q1', null)
  await openTv(page)
  await page.keyboard.press('ArrowRight')
  await waitFor(x => x.audio_playing?.slideId === 'q1', 8000, 'play')
  await page.waitForTimeout(600)
  await page.keyboard.press('ArrowRight')
  await waitFor(x => x.current_slide_id === 'q2', 8000, 'advance after play')
})

test('6 two quick TV presses (150ms apart): exactly one play, then record where it ends', async ({ page }) => {
  await reset('q1', null)
  await openTv(page)
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(150)
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(2500)
  const r = await row()
  console.log('[e2e] after two presses 150ms apart:', JSON.stringify(r))
  expect(r.audio_playing?.slideId === 'q1' || r.current_slide_id === 'q2').toBe(true)
})

test('7 a play started from the host side is not replayed by a TV Next (advances)', async ({ page }) => {
  await reset('q1', { slideId: 'q1', playing: true })
  await openTv(page)
  await page.keyboard.press('ArrowRight')
  await waitFor(x => x.current_slide_id === 'q2', 8000, 'advance')
})

// Multi-part audio series. On main, stepping to the next part played it on arrival
// (by accident: every realtime update re-delivered audio_playing as a new object).
// That accident is fixed, so the part step now writes the mark itself — same sound,
// same press count: play, then ONE press per part (step + play), then leave.
test('8 multi-part series: Next plays part 0, then each Next steps AND plays the next part, then leaves', async ({ page }) => {
  await reset('m1')
  await openTv(page)
  await expect(page.locator('audio')).toHaveCount(1, { timeout: 8000 })

  await page.keyboard.press('ArrowRight') // press 1: plays part 0
  let r = await waitFor(x => x.audio_playing?.slideId === 'm1' && (x.audio_playing.part ?? 0) === 0, 8000, 'play part 0')
  expect(partNow(r)).toBe(0)
  await expect.poll(async () => (await audioState(page)).paused, { timeout: 8000 }).toBe(false)

  await page.waitForTimeout(500)
  await page.keyboard.press('ArrowRight') // press 2: steps to part 1 AND plays it, no silent step
  r = await waitFor(x => partNow(x) === 1 && x.audio_playing?.part === 1, 8000, 'step to part 1 + its mark')
  expect(r.current_slide_id).toBe('m1')
  await expect.poll(async () => (await audioState(page)).paused, { timeout: 8000 }).toBe(false)

  await page.waitForTimeout(500)
  await page.keyboard.press('ArrowRight') // press 3: steps to part 2 AND plays it
  r = await waitFor(x => partNow(x) === 2 && x.audio_playing?.part === 2, 8000, 'step to part 2 + its mark')
  await expect.poll(async () => (await audioState(page)).paused, { timeout: 8000 }).toBe(false)

  await page.waitForTimeout(500)
  await page.keyboard.press('ArrowRight') // press 4: last part done, leaves the slide
  r = await waitFor(x => x.current_slide_id === 'z9', 8000, 'leave the series')
  expect(r.audio_playing).toBeNull() // and the stale mark is cleared on the way out
})

test('9 multi-part series: ArrowLeft back to an earlier part plays it (as before this branch)', async ({ page }) => {
  await reset('m1', { slideId: 'm1', playing: true, part: 1 })
  await updateShowVerified(sb, ID, { slides: slides.map(s => s.id === 'm1' ? { ...s, data: { ...s.data, currentPart: 1 } } : s) })
  await openTv(page)
  await expect(page.locator('audio')).toHaveCount(1, { timeout: 8000 })
  await page.keyboard.press('ArrowLeft')
  const r = await waitFor(x => partNow(x) === 0 && x.audio_playing?.part === 0, 8000, 'back to part 0 + its mark')
  expect(r.current_slide_id).toBe('m1')
  await expect.poll(async () => (await audioState(page)).paused, { timeout: 8000 }).toBe(false)
})

// Review of ad52e56 (2026-10-01): every live UPDATE re-delivers audio_playing as a
// fresh object, so an effect keyed on object identity re-ran on every show update
// and a FINISHED clip restarted when the host pressed A (answer reveal).
test('10 a finished clip is not replayed by an unrelated update (the host pressing A)', async ({ page }) => {
  await reset('q1', null)
  await openTv(page)
  await expect(page.locator('audio')).toHaveCount(1, { timeout: 8000 })
  await page.waitForTimeout(2500) // let the live-update subscription come up
  await updateShowVerified(sb, ID, { audio_playing: { slideId: 'q1', playing: true, part: 0 } })
  await expect.poll(async () => (await audioState(page)).ended, { timeout: 20000 }).toBe(true) // played through
  await updateShowVerified(sb, ID, { answer_reveal: true }) // host presses A: a flag-only write
  await page.waitForTimeout(3000)
  const a = await audioState(page)
  console.log('[e2e] after A press on a finished clip:', JSON.stringify(a))
  expect(a.paused).toBe(true) // still finished, not restarted
})
