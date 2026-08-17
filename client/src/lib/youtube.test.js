import { describe, it, expect } from 'vitest'
import { extractYoutubeId, youtubeEmbedUrl } from './youtube.js'

// extractYoutubeId is the trust boundary for host-supplied video ids — it
// feeds both the IFrame Player API (YoutubeClipEditor.jsx, PreShowSlide.jsx)
// and a raw <iframe src> (QuestionSlide.jsx). No existing test coverage
// before this file, despite being a pure function with real edge cases.

describe('extractYoutubeId', () => {
  it('passes a bare 11-char id straight through', () => {
    expect(extractYoutubeId('dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })

  it('parses a standard watch URL', () => {
    expect(extractYoutubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(extractYoutubeId('https://youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })

  it('parses a watch URL with extra query params', () => {
    expect(extractYoutubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s&list=PL123')).toBe('dQw4w9WgXcQ')
  })

  it('parses a youtu.be short link', () => {
    expect(extractYoutubeId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })

  it('parses a youtu.be short link with trailing query/path', () => {
    expect(extractYoutubeId('https://youtu.be/dQw4w9WgXcQ?t=10')).toBe('dQw4w9WgXcQ')
    expect(extractYoutubeId('https://youtu.be/dQw4w9WgXcQ/extra')).toBe('dQw4w9WgXcQ')
  })

  it('parses an embed URL', () => {
    expect(extractYoutubeId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })

  it('parses a shorts URL', () => {
    expect(extractYoutubeId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })

  it('strips www. and m. host prefixes', () => {
    expect(extractYoutubeId('https://m.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })

  it('accepts music.youtube.com and youtube-nocookie.com hosts', () => {
    expect(extractYoutubeId('https://music.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(extractYoutubeId('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })

  it('rejects a non-YouTube host even with a plausible-looking path', () => {
    expect(extractYoutubeId('https://evil.com/watch?v=dQw4w9WgXcQ')).toBe(null)
    expect(extractYoutubeId('https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ')).toBe(null)
  })

  it('rejects a watch URL with no v param, or a malformed id', () => {
    expect(extractYoutubeId('https://www.youtube.com/watch')).toBe(null)
    expect(extractYoutubeId('https://www.youtube.com/watch?v=tooshort')).toBe(null)
    expect(extractYoutubeId('https://www.youtube.com/watch?v=way-too-long-to-be-an-id')).toBe(null)
  })

  it('rejects a bare id of the wrong length', () => {
    expect(extractYoutubeId('short')).toBe(null)
    expect(extractYoutubeId('waytoolongtobeavalidid')).toBe(null)
  })

  it('rejects garbage, non-URL strings', () => {
    expect(extractYoutubeId('not a url at all')).toBe(null)
    expect(extractYoutubeId('just some random text with spaces')).toBe(null)
  })

  it('rejects a youtube.com URL that is neither watch, embed, nor shorts', () => {
    expect(extractYoutubeId('https://www.youtube.com/channel/UCsomechannel')).toBe(null)
    expect(extractYoutubeId('https://www.youtube.com/')).toBe(null)
  })

  it('handles empty/null/undefined input without throwing', () => {
    expect(extractYoutubeId('')).toBe(null)
    expect(extractYoutubeId(null)).toBe(null)
    expect(extractYoutubeId(undefined)).toBe(null)
  })

  it('trims whitespace around a pasted id or URL', () => {
    expect(extractYoutubeId('  dQw4w9WgXcQ  ')).toBe('dQw4w9WgXcQ')
    expect(extractYoutubeId('  https://youtu.be/dQw4w9WgXcQ  ')).toBe('dQw4w9WgXcQ')
  })
})

describe('youtubeEmbedUrl', () => {
  it('builds a privacy-enhanced nocookie embed URL with the standard params', () => {
    const url = youtubeEmbedUrl('dQw4w9WgXcQ')
    expect(url).toContain('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?')
    expect(url).toContain('rel=0')
    expect(url).toContain('modestbranding=1')
    expect(url).toContain('playsinline=1')
  })

  it('defaults controls on and autoplay off', () => {
    const url = youtubeEmbedUrl('dQw4w9WgXcQ')
    expect(url).toContain('controls=1')
    expect(url).not.toContain('autoplay')
  })

  it('can disable controls and enable autoplay', () => {
    const url = youtubeEmbedUrl('dQw4w9WgXcQ', { autoplay: true, controls: false })
    expect(url).toContain('controls=0')
    expect(url).toContain('autoplay=1')
  })

  it('includes start/end only when given a truthy value greater than 0', () => {
    const url = youtubeEmbedUrl('dQw4w9WgXcQ', { start: 30, end: 90 })
    expect(url).toContain('start=30')
    expect(url).toContain('end=90')
  })

  it('omits start when 0 or falsy — 0 means "from the beginning", not a real trim point', () => {
    expect(youtubeEmbedUrl('dQw4w9WgXcQ', { start: 0 })).not.toContain('start=')
    expect(youtubeEmbedUrl('dQw4w9WgXcQ', { start: null })).not.toContain('start=')
    expect(youtubeEmbedUrl('dQw4w9WgXcQ')).not.toContain('start=')
  })

  it('omits end when 0 or falsy — means "play to the end of the video"', () => {
    expect(youtubeEmbedUrl('dQw4w9WgXcQ', { end: 0 })).not.toContain('end=')
    expect(youtubeEmbedUrl('dQw4w9WgXcQ', { end: null })).not.toContain('end=')
  })

  it('floors fractional seconds', () => {
    const url = youtubeEmbedUrl('dQw4w9WgXcQ', { start: 30.9, end: 90.1 })
    expect(url).toContain('start=30')
    expect(url).toContain('end=90')
  })
})
