import { supabase } from './supabase.js'

// Host-photo storage convention, shared by the host editors (via
// useShow.getHostPhotos) and the display's ShinyIntroScreen — one place
// owns the bucket name, path shape, and extension filter.
export const HOST_PHOTOS_BUCKET = 'trivia-host-photos'

// Shared, cross-show "laugh folder" prefix — Ben's explicit call (2026-08-16):
// the shiny-intro random photo should draw from ONE pool used every show,
// not a per-show folder (which also silently loses its photos whenever a
// show is duplicated, since storage objects aren't copied with the row).
// Per-show host-photo picking (listHostPhotos below) is untouched and still
// used by the other slide types (round intro, grading break, etc.) that
// let a host hand-pick one fixed photo per show.
const SHARED_PREFIX = '_shared/host-photos'

function listAt(path) {
  return supabase.storage
    .from(HOST_PHOTOS_BUCKET)
    .list(path, { sortBy: { column: 'created_at', order: 'desc' } })
    .then(({ data, error }) => {
      if (error || !data) return []
      return data
        .filter(f => f.name && /\.(jpg|jpeg|png|gif|webp)$/i.test(f.name))
        .map(f => ({
          url: supabase.storage.from(HOST_PHOTOS_BUCKET).getPublicUrl(`${path}/${f.name}`).data.publicUrl,
          filename: f.name,
        }))
    })
}

export async function listHostPhotos(showId) {
  if (!showId) return []
  return listAt(`${showId}/host-photos`)
}

// ShinyIntroScreen fully unmounts/remounts every time a host steps onto the
// announce card — since 2026-09-01 that's the `shiny-title` slide's own
// mount, not a data.introDone flip — re-running its fetch effect each time.
// Without a cache that's a fresh Storage .list() call on every step, even
// though the shared pool almost never changes mid-show.
// ponytail: plain in-memory cache, no TTL/invalidation — worst case is a
// stale list until the next page load, fine for a "laugh folder"; add
// invalidation if photos ever need to update live during a show.
let sharedPhotosCache = null

export async function listSharedHostPhotos() {
  if (!sharedPhotosCache) sharedPhotosCache = listAt(SHARED_PREFIX)
  return sharedPhotosCache
}

// Which shared-pool photos ShinyIntroScreen has already randomly shown THIS
// PAGE LOAD (module-scoped, like sharedPhotosCache above — resets on reload,
// which is fine: a fresh page load is a fresh show/session in practice).
// Ben, 2026-08-17: don't repeat a random photo that's already been shown.
const shownRandomPhotoUrls = new Set()

// Picks a random photo from `photos`, avoiding (in priority order):
//  1. `excludeUrls` — photos explicitly pinned to another slide in THIS show
//     (from getUsedHostPhotoUrls below). Bug fixed 2026-08-17 (caught by
//     review, not live): this function only ever tracked what IT had shown
//     this page load — it had no idea a host had hand-picked one of these
//     same photos for, say, a Round Intro slide, so the random picker could
//     hand a shiny question the exact photo already sitting on a different
//     slide. Wired to getUsedHostPhotoUrls's result at the call site.
//  2. ones already returned by this function this page load (shownRandomPhotoUrls).
// Neither exclusion is allowed to return nothing, though — a repeat (or a
// photo pinned elsewhere) is better than a blank intro screen, so each
// filter falls back to the wider set if it would leave zero candidates.
export function pickUnshownRandomPhoto(photos, excludeUrls = new Set()) {
  if (photos.length === 0) return null
  const notPinnedElsewhere = photos.filter(p => !excludeUrls.has(p.url))
  const candidates = notPinnedElsewhere.length > 0 ? notPinnedElsewhere : photos
  let pool = candidates.filter(p => !shownRandomPhotoUrls.has(p.url))
  if (pool.length === 0) {
    shownRandomPhotoUrls.clear()
    pool = candidates
  }
  const pick = pool[Math.floor(Math.random() * pool.length)]
  shownRandomPhotoUrls.add(pick.url)
  return pick
}

// One STABLE pick per slide, for the life of the page load.
//
// Bug fixed 2026-08-18 (caught by review, not live): ShinyIntroScreen fully
// unmounts and remounts every time the host lands on the announce card —
// today that's the `shiny-title` slide mounting, and stepping BACK onto it
// with prevSlide() is a normal thing to do (it was a data.introDone flip
// under the old swap architecture). Calling pickUnshownRandomPhoto directly
// on each mount meant that step-back re-showed the SAME title card wearing a
// DIFFERENT Ben, which reads as the card mutating under the audience rather
// than as the host correcting a mis-advance.
//
// It also quietly ate the don't-repeat budget: every step-back burned another
// photo into shownRandomPhotoUrls, so on a small pool the Set exhausted and
// self-cleared early, losing the no-repeats guarantee Ben asked for
// (2026-08-17) for the rest of the night. Re-showing one card is not showing
// a new card, so it should not consume a photo.
//
// Keyed on slide id, so a genuinely NEW shiny question still picks fresh —
// this stabilises per-question, not per-render.
// ponytail: plain Map, no eviction — bounded by the shiny-slide count in one
// show (tens), and it resets on reload like the two caches above.
const pickedPhotoBySlide = new Map()

export function pickPhotoForSlide(slideId, photos, excludeUrls = new Set()) {
  if (slideId && pickedPhotoBySlide.has(slideId)) return pickedPhotoBySlide.get(slideId)
  const pick = pickUnshownRandomPhoto(photos, excludeUrls)
  if (slideId && pick) pickedPhotoBySlide.set(slideId, pick)
  return pick
}

// Every slide type that carries a host photo stores it under one of these
// two field names (RoundIntro/ShinyIntro/GridIntro use hostPhotoUrl,
// StateOfUnion uses photoUrl — pre-existing split, not something to unify
// here). Scans the WHOLE show so the picker/random-fallback can steer away
// from a photo already showing elsewhere in the same show (Ben, 2026-08-17:
// "show if the ben photo is used... and don't pull one that's been used").
// excludeSlideId skips the slide currently being edited, so its own already-
// assigned photo doesn't count as a collision against itself.
export function getUsedHostPhotoUrls(show, excludeSlideId) {
  const used = new Set()
  for (const s of show?.slides ?? []) {
    if (s.id === excludeSlideId) continue
    const url = s.data?.hostPhotoUrl ?? s.data?.photoUrl
    if (url) used.add(url)
  }
  return used
}
