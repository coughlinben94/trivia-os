import { test, expect } from '@playwright/test'
import { authedClient, updateShowVerified } from './authed-client.js'

// The first REAL YouTube run of the audio director (every other YouTube test uses a fake player).
// A Pre-Show walkout song, a real embedded clip, Chromium's DEFAULT autoplay policy (no flag) and
// a /display tab nobody has clicked. Reads what the director and the real player are doing via
// `window.__audioDirector.debug()`. Needs internet (the YouTube IFrame API + video).
//
// HONEST LIMIT: Playwright's Chromium may or may not block unmuted autoplay on an unclicked tab
// (it granted activation inconsistently in earlier runs), so test 1 accepts BOTH outcomes and
// logs which one happened: playing at once, or blocked with the cue (then one real click must
// recover it). Headless Chromium has no speakers: "playing" means the player reports state 1,
// unmuted, with the clock advancing, not that sound was heard by a person.
//
// Run against a PRODUCTION build from the repo root (StrictMode in dev double-runs effects):
//   npx vite build && npx vite preview --port 5431 --strictPort &
//   PLAYWRIGHT_BASE_URL=http://localhost:5431 npx playwright test e2e/audio-youtube.spec.js
// One throwaway show, deleted in afterAll. Bundled Chromium, never Ben's Chrome.

const ID = `show_e2eaudio_${Math.random().toString(36).slice(2, 8)}`
const VIDEO = 'dQw4w9WgXcQ'
let sb

const slides = [
  { id: 't0', type: 'title', order: 0, data: { title: 'e2e start' } },
  { id: 'ps1', type: 'pre-show', order: 1, data: { walkoutSong: { videoId: VIDEO, start: 10, end: 22, volume: 100 } } },
  { id: 't1', type: 'title', order: 2, data: { title: 'e2e after' } },
]
const go = id => updateShowVerified(sb, ID, {
  current_slide_id: id, current_slide_index: slides.findIndex(s => s.id === id), audio_playing: null,
})
const dbg = page => page.evaluate(() => window.__audioDirector?.debug?.() ?? null)
const yt = rows => rows?.find(r => r.kind === 'youtube')
const soundingNow = rows => { const r = yt(rows); return !!r && r.state === 'playing' && r.yt?.state === 1 && r.yt?.muted === false }
const cue = page => page.locator('button', { hasText: 'Click for sound' })
const ytFrames = page => page.locator('iframe[src*="youtube"]')

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  sb = authedClient()
  const { error } = await sb.from('shows').insert({
    id: ID, title: 'E2E youtube audio throwaway (safe to delete)', date: '2026-10-01', theme_id: 'pure-michigan',
    slides, rounds: [], powerups: [], current_slide_id: 't0', current_slide_index: 0,
    is_live: true, scoreboard_visible: false, scores_revealed: false, late_team_qr_visible: false,
  })
  if (error) throw new Error(`could not create throwaway show: ${error.message}`)
})

test.afterAll(async () => {
  const { data, error } = await sb.from('shows').delete().eq('id', ID).select('id')
  if (error || !data?.length) console.error(`[e2e] CLEANUP FAILED for ${ID} — delete this row by hand`, error ?? '0 rows')
})

async function openUnclicked(page, throttle = 1) {
  if (throttle > 1) {
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle })
  }
  await page.goto(`/display?show=${ID}`, { waitUntil: 'load' }) // deliberately NO click
}
const click = async page => page.mouse.click(300, 300) // a real gesture, on empty stage

for (const throttle of [1, 6]) {
  test(`1 never-clicked tab, ${throttle}x CPU: the walkout is sounding or the cue shows; one click recovers; exactly one claimed player`, async ({ page }) => {
    test.setTimeout(90_000)
    await go('ps1')
    await openUnclicked(page, throttle)
    // The handle is created at mount; give the real player time to load, claim and settle.
    await expect.poll(async () => yt(await dbg(page))?.state ?? null, { timeout: 30_000, message: 'a youtube handle should exist' }).not.toBeNull()
    await expect.poll(async () => {
      const rows = await dbg(page)
      return soundingNow(rows) || (await cue(page).count()) > 0
    }, { timeout: 40_000, message: 'either sounding or the Click-for-sound cue' }).toBe(true)
    const first = await dbg(page)
    const blocked = !soundingNow(first)
    console.log(`[e2e youtube ${throttle}x] unclicked outcome:`, blocked ? `BLOCKED (${yt(first)?.reason}) cue shown` : 'PLAYING without a click', JSON.stringify(yt(first)))
    if (blocked) {
      expect(await cue(page).count()).toBeGreaterThan(0)
      await click(page) // one real gesture
    }
    await expect.poll(async () => soundingNow(await dbg(page)), { timeout: 15_000, message: 'sounding after at most one click' }).toBe(true)
    const row = yt(await dbg(page))
    expect(row.yt.state).toBe(1)
    expect(row.yt.muted).toBe(false)
    await expect.poll(async () => yt(await dbg(page))?.yt?.time ?? 0, { timeout: 8000, message: 'the clock advances' }).toBeGreaterThan(10.5)
    expect(await ytFrames(page).count()).toBe(1) // one claimed player, not a pile of rebuilds
    await expect(cue(page)).toHaveCount(0, { timeout: 5000 })
    await go('t1') // reset for the next run
  })
}

test('2 the walkout fades over its last 2.5s of the trim, then stops (the host advances by hand)', async ({ page }) => {
  test.setTimeout(90_000)
  await go('ps1')
  await openUnclicked(page)
  await expect.poll(async () => soundingNow(await dbg(page)) || (await cue(page).count()) > 0, { timeout: 40_000 }).toBe(true)
  if (!soundingNow(await dbg(page))) await click(page)
  await expect.poll(async () => soundingNow(await dbg(page)), { timeout: 15_000 }).toBe(true)
  // out-point 22: fade starts at 19.5. Volume must come down from 100 and reach 0, then the clip ends.
  await expect.poll(async () => { const r = yt(await dbg(page)); return !r || (r.yt?.volume ?? 100) < 100 }, { timeout: 40_000, message: 'volume ramps below 100' }).toBe(true)
  await expect.poll(async () => yt(await dbg(page)), { timeout: 20_000, message: 'the handle ends after the fade' }).toBeUndefined()
  expect(await cue(page).count()).toBe(0)
})

test('3 leaving the slide destroys the player at once', async ({ page }) => {
  test.setTimeout(90_000)
  await go('ps1')
  await openUnclicked(page)
  await expect.poll(async () => soundingNow(await dbg(page)) || (await cue(page).count()) > 0, { timeout: 40_000 }).toBe(true)
  if (!soundingNow(await dbg(page))) await click(page)
  await expect.poll(async () => soundingNow(await dbg(page)), { timeout: 15_000 }).toBe(true)
  await go('t1')
  await expect.poll(async () => (await dbg(page)).length, { timeout: 4000 }).toBe(0)
  await expect.poll(async () => ytFrames(page).count(), { timeout: 4000 }).toBe(0)
})
