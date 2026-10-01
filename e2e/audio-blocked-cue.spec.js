import { test, expect } from '@playwright/test'
import { authedClient, updateShowVerified } from './authed-client.js'

// Real-browser proof for the "Click for sound" cue (2026-10-01, fix/audio-fail-loud).
// The 2026-09-29 runner-up cause: Chrome blocks UNMUTED playback on a /display
// tab that has had no click or key since it loaded (a reloaded TV), silently.
//
// HONEST LIMIT: headless Chromium under Playwright cannot be made to block
// autoplay reliably — automation grants activation, and the SAME script blocked
// on one run and allowed on the next. So this spec makes the page refuse exactly
// the way Chrome refuses, until a real click arrives, and tests everything the
// app does in a real browser (live-update delivery, React, DOM, the real click):
//   A) play() rejects with NotAllowedError            (the textbook block)
//   B) AudioContext.resume() never settles, so play() is never even reached
//      (what a real Chromium run showed: resume() hangs, no error, silence)
// It does NOT prove Chrome's own policy decision; the unit tests cover the logic
// and the first real show/rehearsal is the final proof.
//
// Same data-safety rules as audio-tv-next.spec.js: one throwaway show, deleted
// in afterAll. Run against a LOCAL dev server:
//   PLAYWRIGHT_BASE_URL=http://localhost:5287 npx playwright test e2e/audio-blocked-cue.spec.js
// Chromium is Playwright's bundled build, never Ben's Chrome.

const ID = `show_e2eaudio_${Math.random().toString(36).slice(2, 8)}`
let sb

const slides = [
  { id: 't1', type: 'title', order: 0, data: { title: 'e2e start' } },
  {
    id: 'q1', type: 'question', order: 1,
    data: { text: 'e2e audio question', answer: 'x', mediaUrl: '/drum-roll.mp3', mediaType: 'audio/mpeg', audioTrigger: 'click' },
  },
]

const audioState = page => page.evaluate(() => {
  const a = document.querySelector('audio')
  return a ? { paused: a.paused, t: a.currentTime } : null
})
const cue = page => page.locator('button', { hasText: 'Click for sound' })

test.beforeAll(async () => {
  sb = authedClient()
  const { error } = await sb.from('shows').insert({
    id: ID, title: 'E2E audio cue throwaway (safe to delete)', date: '2026-10-01', theme_id: 'pure-michigan',
    slides, rounds: [], powerups: [], current_slide_id: 'q1', current_slide_index: 1,
    is_live: true, scoreboard_visible: false, scores_revealed: false, late_team_qr_visible: false,
  })
  if (error) throw new Error(`could not create throwaway show: ${error.message}`)
})

test.afterAll(async () => {
  const { data, error } = await sb.from('shows').delete().eq('id', ID).select('id')
  if (error || !data?.length) console.error(`[e2e] CLEANUP FAILED for ${ID} — delete this row by hand`, error ?? '0 rows')
})

// Refuse until the page sees a real click, exactly as the autoplay policy does.
const refuseUntilClick = mode => {
  window.__gesture = false
  window.addEventListener('click', () => { window.__gesture = true }, true) // capture: runs before the app's handler
  if (mode === 'reject') {
    const orig = HTMLMediaElement.prototype.play
    HTMLMediaElement.prototype.play = function () {
      return window.__gesture ? orig.apply(this, arguments) : Promise.reject(new DOMException('play() failed because the user didn\'t interact with the document first.', 'NotAllowedError'))
    }
  } else {
    const R = window.AudioContext
    window.AudioContext = class extends R {
      get state() { return window.__gesture ? super.state : 'suspended' }
      resume() { return window.__gesture ? super.resume() : new Promise(() => {}) }
    }
  }
}

for (const mode of ['reject', 'hang']) {
  test(`blocked remote play (${mode === 'reject' ? 'play() rejects' : 'resume() hangs'}) shows "Click for sound"; tapping it plays and clears the cue`, async ({ page }) => {
    await page.addInitScript(refuseUntilClick, mode)
    await page.goto(`/display?show=${ID}`, { waitUntil: 'networkidle' }) // deliberately NO click on the TV
    await expect(page.locator('audio')).toHaveCount(1, { timeout: 8000 })
    expect(await cue(page).count()).toBe(0)

    // The host's Next press, as the database sees it. The TV's live-update
    // subscription takes a moment to come up (longer on a loaded machine). The TV
    // only acts on the first mark it RECEIVES (its play effect is keyed on the
    // mark's values, so a repeat of the same mark is a no-op), so re-send every
    // 3.2s until the cue shows: a write that landed before the subscription is
    // retried, and one that landed after is harmless.
    await expect.poll(async () => {
      await updateShowVerified(sb, ID, { audio_playing: { slideId: 'q1', playing: true, part: 0, n: Date.now() } })
      await page.waitForTimeout(3200)
      return await cue(page).count()
    }, { timeout: 40000, intervals: [0] }).toBeGreaterThan(0)
    await expect(cue(page)).toBeVisible()
    expect((await audioState(page)).paused).toBe(true) // nothing played

    await cue(page).click() // a real user gesture
    await expect.poll(async () => (await audioState(page))?.paused, { timeout: 8000 }).toBe(false)
    await expect(cue(page)).toHaveCount(0, { timeout: 5000 })
  })
}

test('a play that works shows no cue', async ({ page }) => {
  await updateShowVerified(sb, ID, { audio_playing: null })
  await page.goto(`/display?show=${ID}`, { waitUntil: 'networkidle' })
  await expect(page.locator('audio')).toHaveCount(1, { timeout: 8000 })
  await page.locator('body').click({ position: { x: 5, y: 5 } }) // the real setup ritual: one click on the TV
  await expect.poll(async () => {
    await updateShowVerified(sb, ID, { audio_playing: { slideId: 'q1', playing: true, part: 0, n: Date.now() } })
    await page.waitForTimeout(1200)
    return (await audioState(page))?.paused
  }, { timeout: 30000, intervals: [0] }).toBe(false)
  await page.waitForTimeout(3000)
  expect(await cue(page).count()).toBe(0)
})
