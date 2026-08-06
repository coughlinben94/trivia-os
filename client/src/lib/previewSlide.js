// Preview mode (/display?preview=true&slide=<id>) targets whichever slide the
// host had selected in the editor, not whatever the show's real live position
// happens to be. Order is the slide's `order` field, not its array position.
export function resolvePreviewShow(show, previewSlideId) {
  if (!previewSlideId) return show
  const sorted = [...(show.slides ?? [])].sort((a, b) => a.order - b.order)
  const targetIndex = sorted.findIndex(s => s.id === previewSlideId)
  return targetIndex >= 0 ? { ...show, current_slide_index: targetIndex } : show
}
