import { supabase } from './supabase.js'

// Host-photo storage convention, shared by the host editors (via
// useShow.getHostPhotos) and the display's ShinyIntroScreen — one place
// owns the bucket name, path shape, and extension filter.
export const HOST_PHOTOS_BUCKET = 'trivia-host-photos'

export async function listHostPhotos(showId) {
  if (!showId) return []
  const { data, error } = await supabase.storage
    .from(HOST_PHOTOS_BUCKET)
    .list(`${showId}/host-photos`, { sortBy: { column: 'created_at', order: 'desc' } })
  if (error || !data) return []
  return data
    .filter(f => f.name && /\.(jpg|jpeg|png|gif|webp)$/i.test(f.name))
    .map(f => ({
      url: supabase.storage
        .from(HOST_PHOTOS_BUCKET)
        .getPublicUrl(`${showId}/host-photos/${f.name}`).data.publicUrl,
      filename: f.name,
    }))
}
