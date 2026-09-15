// Shared seeded-PRNG core, extracted from matchingScoring.js and orderScoring.js
// where it was byte-identical (both had their own hashSeed + mulberry32 copies).
// The per-mode shuffle/re-roll logic that USES this stays separate in each file —
// that duplication is intentional (see seededShuffle's comments in both files);
// only this domain-free math was collapsed.

// Deterministic string hash -> a seed number, used to drive a seeded shuffle.
// Same seed always produces the same output for a given input (stable across
// re-renders, different across slides) — deterministic, not just "sorted".
export function hashSeed(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0
  }
  return h >>> 0
}

// mulberry32 — small, fast, seedable PRNG. Good enough for shuffling a
// question's answer options; not cryptographic, doesn't need to be.
export function mulberry32(seed) {
  let a = seed
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
