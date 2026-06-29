// Offline/fallback seed for the host's between-rounds music dropdown.
// SlideEditor fetches the live list from the Jukebox's Supabase project on mount
// and replaces this with the real data. This list is only used if that fetch fails.
export const JUKEBOX_LIBRARIES = [
  { id: 'main', label: 'Main Library' },
]
