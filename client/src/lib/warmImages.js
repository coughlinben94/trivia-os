// Warm pool for slide images (2026-08-24, Ben: "the image slides within the
// not so different you and i arent transitioning smooth").
//
// The problem: a multi-part image question ("We're not so different, you and
// I..." — one slide, four parts, one image each) remounts its <img> on every
// part step, because ShinyVisualQuestion keys it on
// `${slide.id}:${data.currentPart}`. So the incoming photo only STARTS
// fetching at the moment its entrance animation starts. Measured against the
// real show data: the outgoing image is gone in 0.16s, the Pop & Settle
// spring runs 0.5s, and a cold fetch of those Supabase-storage photos takes
// 0.3-0.5s on a fast wired connection (405KB for the largest). The entrance
// therefore plays over an empty box and the photo appears fully-formed after
// the spring has already settled. That pop-in, not the animation, is what
// reads as "not transitioning smooth".
//
// The fix, same "warm ahead of need" shape as youtubeWarmAudio.js: fetch and
// decode every one of the slide's images at slide MOUNT, while the shiny
// intro card is still on screen (~2s of free lead time), so every part step
// paints on its first frame.
//
// The live HTMLImageElement references are held on purpose: the storage
// bucket serves `cache-control: no-cache`, so a URL the browser has dropped
// from memory costs a revalidation round-trip on the way back. A held,
// already-decoded image is reused from the in-memory resource instead.

const MAX_HELD = 16
const held = new Map() // url -> HTMLImageElement (Map keeps insertion order)

// Every non-YouTube media URL a slide's data can render, deduped, in the
// order the host steps through them. Covers all three shapes this codebase
// stores media in: per-part mediaSlots (concurrent formats), flat mediaSlots
// (single-shot + the legacy Swing Round two-image pan reveal), and the fully
// legacy flat mediaUrl. Pure — this is the test seam for the module.
export function slideImageUrls(data) {
  const slots = [
    ...(Array.isArray(data?.parts) ? data.parts.flatMap(p => p?.mediaSlots ?? []) : []),
    ...(data?.mediaSlots ?? []),
  ]
  const urls = slots.filter(m => m?.url && m.type !== 'youtube').map(m => m.url)
  if (data?.mediaUrl && data.mediaType !== 'youtube') urls.push(data.mediaUrl)
  return [...new Set(urls)]
}

// Idempotent: a URL already warmed is left alone.
export function warmImages(urls) {
  if (typeof Image === 'undefined') return
  for (const url of urls) {
    if (held.has(url)) continue
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    // Decode ahead of paint too — a fetched-but-undecoded 4000px JPEG can
    // still cost a frame on the first paint. Failures are irrelevant here:
    // the real <img> renders (or errors) on its own regardless.
    img.decode?.().catch(() => {})
    held.set(url, img)
    while (held.size > MAX_HELD) held.delete(held.keys().next().value)
  }
}
