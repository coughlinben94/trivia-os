// Pure decisions for Go Live / Live Mode entry, so a refresh or "Edit" mid-show
// never drops the host back to Build Mode with no way to resume.

// Old shows can sit at is_live=true forever, so "live" only counts when the
// row was touched recently (updatedAt is DB-trigger fresh on every write).
export const LIVE_WINDOW_MS = 12 * 60 * 60 * 1000
export function isRecentlyLive(show, now = Date.now()) {
  if (!show?.showState?.isLive) return false
  const t = Date.parse(show.updatedAt)
  return Number.isFinite(t) && now - t <= LIVE_WINDOW_MS
}

// Live Mode auto-resumes only for a genuinely mid-session show.
export const initialLiveMode = (show, now) => isRecentlyLive(show, now)

// What the Go Live picker's primary button does. Already-live shows resume at
// the current slide; others start from the top.
export function goLiveAction(showState, slides) {
  if (!showState?.isLive) return { resume: false }
  const index = Math.max(0, Math.min(showState.currentSlideIndex ?? 0, Math.max(0, slides.length - 1)))
  return { resume: true, index, number: index + 1, slide: slides[index] ?? null }
}
