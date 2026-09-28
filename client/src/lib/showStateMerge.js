// The live-state slice of a `shows` row, merged onto the host's copy of the
// show. Shared by the realtime handler and the catch-up refetch in useShow so
// they can never disagree. Only showState fields: slides/rounds are never
// touched here, or a catch-up would clobber unsaved edits on the laptop.
export const SHOW_STATE_COLUMNS =
  'id, current_slide_index, current_slide_id, is_live, scoreboard_visible, scores_revealed, answer_reveal'

// keepNav: inside the 1.5s window after a local action, skip the nav fields so
// our own echo can't overwrite an index we already moved past.
export function mergeShowStateRow(prev, row, { keepNav = false } = {}) {
  if (!prev || !row || prev.id !== row.id) return prev
  const ps = prev.showState
  return {
    ...prev,
    showState: {
      ...(keepNav ? ps : {
        ...ps,
        currentSlideIndex: row.current_slide_index ?? ps.currentSlideIndex,
        currentSlideId: row.current_slide_id ?? ps.currentSlideId,
      }),
      isLive: row.is_live ?? ps.isLive,
      scoreboardVisible: row.scoreboard_visible ?? ps.scoreboardVisible,
      scoresRevealed: row.scores_revealed ?? ps.scoresRevealed,
      answerReveal: row.answer_reveal ?? ps.answerReveal,
    },
  }
}
