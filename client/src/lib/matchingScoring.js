// A matching submission is scored purely from its own shape — no answer-key
// lookup needed. Each pair in slide.data.pairs shares one `id` between its
// left and right column entries (see docs/superpowers/specs/2026-07-28-
// phone-answer-scoring-design.md and MatchingBoard.jsx, which only ever
// writes a connection as { leftId, rightId } pulled from the actual rendered
// items). A connection is correct exactly when leftId === rightId.

export function scoreMatchingSubmission(answer, pointsPerMatch) {
  if (!Array.isArray(answer)) return 0
  const correctCount = answer.filter(
    pair => pair && pair.leftId != null && pair.leftId === pair.rightId
  ).length
  return correctCount * (Number(pointsPerMatch) || 0)
}

// Deterministic string hash -> a seed number, used to drive the shuffle below.
// Same seed always produces the same shuffle for a given slide (stable across
// re-renders, different across slides) — deterministic, not just "sorted".
function hashSeed(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0
  }
  return h >>> 0
}

// mulberry32 — small, fast, seedable PRNG. Good enough for shuffling a
// question's right-hand column; not cryptographic, doesn't need to be.
function mulberry32(seed) {
  let a = seed
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Fisher-Yates, seeded by `seed` (typically a slide id) so the shuffle is
// stable per question but not a predictable mirror of the left column — the
// naive `sort().reverse()` this replaced produced an exact mirror for any
// 2-pair question, making it solvable without reading it.
export function seededShuffle(items, seed) {
  const rand = mulberry32(hashSeed(String(seed)))
  const arr = [...items]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}
