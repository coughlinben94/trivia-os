import { test, expect } from '@playwright/test'
import { authedClient, updateShowVerified } from './authed-client.js'

// Real-browser proof that the other /display sounds (race, rules alert, team-intro theme) go
// through the audio director: they appear as hidden <audio> elements the director owns, play,
// and are gone when the slide is left. Same data-safety rules as audio-tv-next.spec.js: ONE
// throwaway show, deleted in afterAll. Run against a LOCAL dev server started from the repo
// root with `npx vite --port 54xx --strictPort`:
//   PLAYWRIGHT_BASE_URL=http://localhost:5291 npx playwright test e2e/audio-slides.spec.js
// Chromium is Playwright's bundled build, never Ben's Chrome. YouTube walkouts, the synth bell and
// the drum roll (no scoreboard data in a throwaway show) are covered by unit tests with fakes.

test.use({ launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] } })

const ID = `show_e2eaudio_${Math.random().toString(36).slice(2, 8)}`
let sb

const race = raceStartedAt => ({
  id: 'r1', type: 'horse-race', order: 1,
  data: {
    text: 'e2e race question',
    contenders: ['A', 'B', 'C', 'D'].map((n, i) => ({ id: `c${i}`, name: `Lane ${n}`, imageUrl: null })),
    beats: [{ label: 'W1', values: [9, 5, 4, 3] }, { label: 'W2', values: [4, 8, 3, 2] }],
    raceStartedAt, answer: 'Lane A',
  },
})
const slidesFor = raceStartedAt => [
  { id: 't0', type: 'title', order: 0, data: { title: 'e2e start' } },
  race(raceStartedAt),
  { id: 't1', type: 'title', order: 2, data: { title: 'e2e after race' } },
  { id: 'ru1', type: 'rules', order: 3, data: { title: 'E2E RULES', rules: ['e2e rule one'] } },
  { id: 't2', type: 'title', order: 4, data: { title: 'e2e after rules' } },
  { id: 'tp1', type: 'team-picker', order: 5, data: { openingText: 'e2e opening', closingText: 'e2e closing', currentPart: 0 } },
]

async function go(slideId, raceStartedAt = null) {
  const slides = slidesFor(raceStartedAt)
  return updateShowVerified(sb, ID, {
    slides, current_slide_id: slideId, current_slide_index: slides.findIndex(s => s.id === slideId), audio_playing: null,
  })
}
const audios = page => page.evaluate(() => [...document.querySelectorAll('audio')].map(a => ({ src: a.getAttribute('src'), paused: a.paused, t: a.currentTime, loop: a.loop, vol: a.volume })))
const bySrc = (list, frag) => list.find(a => (a.src ?? '').includes(frag))

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  sb = authedClient()
  const { error } = await sb.from('shows').insert({
    id: ID, title: 'E2E audio slides throwaway (safe to delete)', date: '2026-10-01', theme_id: 'pure-michigan',
    slides: slidesFor(null), rounds: [], powerups: [], current_slide_id: 't0', current_slide_index: 0,
    is_live: true, scoreboard_visible: false, scores_revealed: false, late_team_qr_visible: false,
  })
  if (error) throw new Error(`could not create throwaway show: ${error.message}`)
})

test.afterAll(async () => {
  const { data, error } = await sb.from('shows').delete().eq('id', ID).select('id')
  if (error || !data?.length) console.error(`[e2e] CLEANUP FAILED for ${ID} — delete this row by hand`, error ?? '0 rows')
})

async function openTv(page, waitUntil = 'networkidle') {
  await page.goto(`/display?show=${ID}`, { waitUntil })
  await page.locator('body').click({ position: { x: 5, y: 5 } }) // the real setup ritual: one click on the TV
}

test('1 race: starting the race rings the gate bell + starts the crowd loop; leaving cuts them', async ({ page }) => {
  await go('r1', null)
  await openTv(page)
  await expect(page.getByText('e2e race question')).toBeVisible({ timeout: 8000 })
  expect(await audios(page)).toHaveLength(0)
  await updateShowVerified(sb, ID, { slides: slidesFor(Date.now()) }) // the host presses Start Race
  await expect.poll(async () => bySrc(await audios(page), 'gate-bell.mp3')?.paused, { timeout: 10000 }).toBe(false)
  const list = await audios(page)
  expect(bySrc(list, 'crowd-hoofbeats-loop.mp3')).toMatchObject({ paused: false, loop: true })
  await go('t1', null) // leave the slide
  await expect.poll(async () => (await audios(page)).length, { timeout: 8000 }).toBe(0)
})

test('2 rules: three beeps, then the voice line plays from /rules-psa.mp3 and the rules reveal when it ends', async ({ page }) => {
  await go('ru1')
  await openTv(page)
  await expect.poll(async () => bySrc(await audios(page), 'rules-psa.mp3')?.paused, { timeout: 15000 }).toBe(false)
  // The voice line ends for real (the director removes a finished clip's element), and the rules are
  // visible. (The rules text sits in the DOM from the start; the strobe overlay is what covers it.)
  await expect.poll(async () => bySrc(await audios(page), 'rules-psa.mp3'), { timeout: 20000 }).toBeUndefined()
  await expect(page.getByText('e2e rule one')).toBeVisible()
})

test('3 rules: leaving mid-voice-line cuts it (nothing plays over the next slide)', async ({ page }) => {
  await go('ru1')
  await openTv(page)
  await expect.poll(async () => bySrc(await audios(page), 'rules-psa.mp3')?.paused, { timeout: 15000 }).toBe(false)
  await go('t2')
  // Gone quickly: the voice line has ~3s left, so a slow cleanup (or none) would still be sounding.
  await expect.poll(async () => (await audios(page)).length, { timeout: 1800 }).toBe(0)
})

test('4 team intro: the theme starts after the reveal at 3:01 and is cut on leaving', async ({ page }) => {
  await go('tp1')
  await openTv(page, 'load') // the team picker animates constantly: the network never goes idle
  await expect.poll(async () => bySrc(await audios(page), 'team-intro-theme.mp3')?.paused, { timeout: 15000 }).toBe(false)
  await expect.poll(async () => bySrc(await audios(page), 'team-intro-theme.mp3')?.t, { timeout: 8000 }).toBeGreaterThan(180)
  await go('t0')
  await expect.poll(async () => (await audios(page)).length, { timeout: 8000 }).toBe(0)
})
