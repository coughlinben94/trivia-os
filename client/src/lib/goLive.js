// Pure decisions for Go Live / Live Mode entry, so a refresh or "Edit" mid-show
// never drops the host back to Build Mode with no way to resume.

// Live Mode is on whenever the loaded show is already live.
export const initialLiveMode = show => !!show?.showState?.isLive

// What the Go Live picker's primary button does. Already-live shows resume at
// the current slide; others start from the top.
export function goLiveAction(showState, slides) {
  if (!showState?.isLive) return { resume: false }
  const index = Math.max(0, Math.min(showState.currentSlideIndex ?? 0, Math.max(0, slides.length - 1)))
  return { resume: true, index, number: index + 1, slide: slides[index] ?? null }
}
