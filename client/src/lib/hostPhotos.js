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

// ShinyIntroScreen fully unmounts/remounts every time a host steps back or
// forward over the intro beat (data.introDone flips), re-running its fetch
// effect each time — without a cache that's a fresh Storage .list() call on
// every step, even though the shared pool almost never changes mid-show.
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

// Picks a random photo from `photos`, avoiding ones already returned by this
// function this page load. Once every photo in the pool has been shown, the
// "already shown" set resets and picking cycles again from the full pool —
// better than either hard-stopping or repeating immediately once the pool
// (which can be smaller than the number of shiny slides in a show) runs out.
export function pickUnshownRandomPhoto(photos) {
  if (photos.length === 0) return null
  let pool = photos.filter(p => !shownRandomPhotoUrls.has(p.url))
  if (pool.length === 0) {
    shownRandomPhotoUrls.clear()
    pool = photos
  }
  const pick = pool[Math.floor(Math.random() * pool.length)]
  shownRandomPhotoUrls.add(pick.url)
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
