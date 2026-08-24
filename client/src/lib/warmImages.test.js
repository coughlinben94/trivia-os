import { describe, it, expect } from 'vitest'
import { slideImageUrls } from './warmImages.js'

describe('slideImageUrls', () => {
  it('collects every part image, in step order — the shared-answer image series shape', () => {
    // "We're not so different, you and I..." as it actually lives in the
    // show row: one slide, four parts, one image slot each.
    const data = {
      isShiny: true,
      isSeries: true,
      parts: [
        { text: '', mediaSlots: [{ type: 'image/jpeg', url: 'a.jpg' }] },
        { text: '', mediaSlots: [{ type: 'image/jpeg', url: 'b.jpg' }] },
        { text: '', mediaSlots: [{ type: 'image/webp', url: 'c.webp' }] },
        { text: '', mediaSlots: [{ type: 'image/jpeg', url: 'd.jpg' }] },
      ],
    }
    expect(slideImageUrls(data)).toEqual(['a.jpg', 'b.jpg', 'c.webp', 'd.jpg'])
  })

  it('collects both slots of the legacy Swing Round two-image pan reveal', () => {
    const data = { shinyType: 'visual', mediaSlots: [{ url: 'heads.jpg' }, { url: 'weapons.jpg' }] }
    expect(slideImageUrls(data)).toEqual(['heads.jpg', 'weapons.jpg'])
  })

  it('reads the fully legacy flat mediaUrl shape', () => {
    expect(slideImageUrls({ mediaUrl: 'legacy.jpg', mediaType: 'image/jpeg' })).toEqual(['legacy.jpg'])
  })

  it('never warms a YouTube slot — there is no image to fetch', () => {
    const data = {
      parts: [
        { mediaSlots: [{ type: 'youtube', videoId: 'abc123', url: 'https://youtu.be/abc123' }] },
        { mediaSlots: [{ type: 'image/jpeg', url: 'real.jpg' }] },
      ],
      mediaUrl: 'https://youtu.be/xyz', mediaType: 'youtube',
    }
    expect(slideImageUrls(data)).toEqual(['real.jpg'])
  })

  it('dedupes a url reused across parts and skips empty/missing slots', () => {
    const data = {
      parts: [
        { mediaSlots: [{ type: 'image/jpeg', url: 'same.jpg' }] },
        { mediaSlots: [] },
        {},
        { mediaSlots: [{ type: 'image/jpeg', url: 'same.jpg' }] },
        { mediaSlots: [{ type: 'image/jpeg', url: null }] },
      ],
    }
    expect(slideImageUrls(data)).toEqual(['same.jpg'])
  })

  it('is a safe no-op for a slide with no media at all', () => {
    expect(slideImageUrls({ text: 'a plain question' })).toEqual([])
    expect(slideImageUrls(undefined)).toEqual([])
  })
})
