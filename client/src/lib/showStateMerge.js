// The live-state slice of a `shows` row, merged onto the host's copy of the
// show. Shared by the realtime handler and the catch-up refetch in useShow so
// they can never disagree. Only showState fields: slides/rounds are never
// touched here, or a catch-up would clobber unsaved edits on the laptop.
export const SHOW_STATE_COLUMNS =
  'id, current_slide_index, current_slide_id, is_live, scoreboard_visible, scores_revealed, answer_reveal, audio_playing'

// keepNav: inside the 1.5s window after a local action, skip the nav fields so
// our own echo can't overwrite an index we already moved past.
export function mergeShowStateRow(prev, row, { keepNav = false } = {}) {
  if (!prev || !row || prev.id !== row.id) return prev
  const ps = prev.showState
  // audio_playing: /display can write it too (its Next plays an owed clip), so
  // the host must read it or its own "Next plays audio" gate and its stale-mark
  // clear both run off a copy that never saw the TV's write. A small jsonb, so
  // realtime always carries it (no TOAST omission). null IS a value (cleared);
  // only undefined (column absent) keeps ours. keepNav also protects it: our
  // own just-written value must not be clobbered by an older echo.
  const audio = !keepNav && row.audio_playing !== undefined ? { audio_playing: row.audio_playing } : {}
  return {
    ...prev,
    ...audio,
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
