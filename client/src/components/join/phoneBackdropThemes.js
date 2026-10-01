// Tiny, statically imported by Join.jsx: decides forest-ness WITHOUT loading
// any world data, so a non-forest phone downloads and runs nothing extra.
// PhoneBackdrop.jsx (and the ringWorldFor/forest world data it pulls in) is
// only ever reached through phoneBackdropLoader.load(), a dynamic import.
// PhoneBackdrop.test.jsx pins this list to RING_WORLDS' renderer:'forest' ids.

export const FOREST_THEME_IDS = ['haunted-october']

// A cosmetic chunk must never reload a live phone. main.jsx's global 'vite:preloadError' handler
// reloads the page once per session to heal a stale chunk after a deploy; Vite's preload helper fires
// that event synchronously when this import's chunk (or one of its deps) fails, BEFORE the promise
// settles. So a counter held across the load lets main.jsx skip the reload for this import only
// (critique of 3d-3: flaky bar wifi reloaded a phone mid-answer, and spent the one-shot guard).
export function trackOptionalLoad(start) {
  globalThis.__optionalChunkLoads = (globalThis.__optionalChunkLoads || 0) + 1
  const done = () => { globalThis.__optionalChunkLoads -= 1 }
  let p
  try { p = Promise.resolve(start()) } catch (e) { done(); throw e }
  return p.finally(done)
}

// Object method (not a bare function) so tests can spy on it.
export const phoneBackdropLoader = {
  load: () => trackOptionalLoad(() => import('./PhoneBackdrop.jsx')),
}
