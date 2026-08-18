import { describe, it, expect, vi } from 'vitest'

// hostPhotos.js imports the real Supabase client for its Storage .list()
// helpers. The pure picking/scanning logic under test never touches it, so
// stub the module rather than standing up a client in the node test env.
vi.mock('./supabase.js', () => ({ supabase: { storage: { from: () => ({}) } } }))

const { pickUnshownRandomPhoto, pickPhotoForSlide, getUsedHostPhotoUrls } =
  await import('./hostPhotos.js')

// `shownRandomPhotoUrls` is module-scoped and deliberately has no reset hook
// (it is meant to live for a whole page load). Give every test its own
// disjoint url namespace so one test's picks can never exhaust another's
// pool — without this, cases interfere and fail intermittently rather than
// on a real regression.
let ns = 0
const freshPhotos = n => {
  ns++
  return Array.from({ length: n }, (_, i) => ({
    url: `https://x/p${ns}-${i}.jpg`,
    filename: `p${ns}-${i}.jpg`,
  }))
}

describe('pickPhotoForSlide — stable per slide', () => {
  it('returns the SAME photo for repeated calls with one slide id', () => {
    // The regression this guards: ShinyIntroScreen unmounts/remounts every
    // time data.introDone flips, and prevSlide() flips it back to false so
    // the host can step back to the title card. A fresh pick per mount
    // changed the Ben on a card the audience was already looking at.
    const photos = freshPhotos(4)
    const first = pickPhotoForSlide('slide-1', photos)
    for (let i = 0; i < 25; i++) {
      expect(pickPhotoForSlide('slide-1', photos).url).toBe(first.url)
    }
  })

  it('does not burn extra photos out of the no-repeat pool on a re-show', () => {
    // 4 photos, 4 DISTINCT slides, each re-shown once in between. If a
    // re-show consumed a photo, the Set would exhaust and self-clear early,
    // handing out a duplicate before all 4 had been used.
    const photos = freshPhotos(4)
    const seen = new Set()
    for (const id of ['s1', 's2', 's3', 's4']) {
      const pick = pickPhotoForSlide(id, photos)
      pickPhotoForSlide(id, photos) // re-show — must be free
      seen.add(pick.url)
    }
    expect(seen.size).toBe(4)
  })

  it('still picks fresh for a genuinely new slide id', () => {
    const photos = freshPhotos(4)
    const a = pickPhotoForSlide('fresh-a', photos)
    const b = pickPhotoForSlide('fresh-b', photos)
    expect(a).not.toBeNull()
    expect(a.url).not.toBe(b.url)
  })

  it('falls back to the unstable picker when no slide id is given', () => {
    expect(pickPhotoForSlide(null, freshPhotos(4))).not.toBeNull()
    expect(pickPhotoForSlide(undefined, [])).toBeNull()
  })
})

describe('pickUnshownRandomPhoto — exclusion precedence', () => {
  it('avoids urls pinned to another slide', () => {
    const photos = freshPhotos(4)
    const exclude = new Set(photos.slice(0, 3).map(p => p.url))
    expect(pickUnshownRandomPhoto(photos, exclude).url).toBe(photos[3].url)
  })

  it('prefers a repeat over a blank screen when every photo is pinned', () => {
    const photos = freshPhotos(4)
    const all = new Set(photos.map(p => p.url))
    expect(pickUnshownRandomPhoto(photos, all)).not.toBeNull()
  })

  it('returns null only for an empty pool', () => {
    expect(pickUnshownRandomPhoto([], new Set())).toBeNull()
  })
})

describe('getUsedHostPhotoUrls', () => {
  it('collects both field names and skips the excluded slide', () => {
    const show = { slides: [
      { id: 's1', data: { hostPhotoUrl: 'u1' } },
      { id: 's2', data: { photoUrl: 'u2' } },
      { id: 's3', data: { hostPhotoUrl: 'u3' } },
      { id: 's4', data: {} },
    ] }
    expect(getUsedHostPhotoUrls(show, 's3')).toEqual(new Set(['u1', 'u2']))
  })

  it('tolerates a missing show', () => {
    expect(getUsedHostPhotoUrls(undefined, 'x').size).toBe(0)
  })
})
