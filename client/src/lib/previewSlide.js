// Preview mode (/display?preview=true&slide=<id>) targets whichever slide the
// host had selected in the editor, not whatever the show's real live position
// happens to be. Order is the slide's `order` field, not its array position.
import { sortSlides } from './slideStepping.js'

// Preview must always show the slide the host is editing, never a live-show
// overlay left on from a real session — without this, a show whose
// scoreboard_visible flag is still true renders ScoreboardOverlay on top of
// (Display.jsx L1056) instead of the slide Preview was asked to show
// (design-audit finding, 2026-09-15: broke a real preview walkthrough until
// switching to a show with that flag off).
export function resolvePreviewShow(show, previewSlideId) {
  const withoutScoreboard = {
    ...show,
    scoreboard_visible: false,
    showState: show.showState ? { ...show.showState, scoreboardVisible: false } : show.showState,
  }
  if (!previewSlideId) return withoutScoreboard
  const sorted = sortSlides(show.slides)
  const targetIndex = sorted.findIndex(s => s.id === previewSlideId)
  return targetIndex >= 0 ? { ...withoutScoreboard, current_slide_index: targetIndex } : withoutScoreboard
}
