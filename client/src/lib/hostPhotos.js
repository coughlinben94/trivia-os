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
