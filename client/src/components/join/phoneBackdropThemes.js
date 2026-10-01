// Tiny, statically imported by Join.jsx: decides forest-ness WITHOUT loading
// any world data, so a non-forest phone downloads and runs nothing extra.
// PhoneBackdrop.jsx (and the ringWorldFor/forest world data it pulls in) is
// only ever reached through phoneBackdropLoader.load(), a dynamic import.
// PhoneBackdrop.test.jsx pins this list to RING_WORLDS' renderer:'forest' ids.

export const FOREST_THEME_IDS = ['haunted-october']

// Object method (not a bare function) so tests can spy on it.
export const phoneBackdropLoader = {
  load: () => import('./PhoneBackdrop.jsx'),
}
