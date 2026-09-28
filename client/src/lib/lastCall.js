// "Last Call" — the host's L key flashes a neon sign + bar bell on every TV.
//
// Transport: shows.special_event jsonb (otherwise unused) carries
// { lastCall: <integer nonce> }. The TV reacts only to the nonce CHANGING
// after it first saw the row, so a reload or a late-joining TV never replays
// an old one, and no clock is compared anywhere (laptop/TV skew can't matter).

// How long the sign stays up. The host ignores a second press inside this
// window (one sign at a time, no restart-stutter on a double tap).
export const LAST_CALL_MS = 8000

export function nextLastCallNonce(prev) {
  return (Number.isInteger(prev) ? prev : 0) + 1
}

// Merge, never clobber: other special_event keys survive.
export function withLastCall(specialEvent, nonce) {
  return { ...(specialEvent ?? {}), lastCall: nonce }
}

// seen: { showId, nonce } | null — what this TV already knows about.
// First row for a show only seeds (no play); after that, a new non-null nonce
// plays. Switching shows re-seeds.
export function lastCallStep(seen, showId, nonce) {
  if (!seen || seen.showId !== showId) return { play: false, seen: { showId, nonce: nonce ?? null } }
  if (nonce == null || nonce === seen.nonce) return { play: false, seen }
  return { play: true, seen: { showId, nonce } }
}

export function canTriggerLastCall(lastAt, now) {
  return lastAt == null || now - lastAt >= LAST_CALL_MS
}
