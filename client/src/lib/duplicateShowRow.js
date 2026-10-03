import { withPhoneStateCleared } from './slideStepping.js'

// The row inserted when the host duplicates a show: the original's content with every
// piece of live state reset, so the copy starts fresh. special_event (the host timer)
// is reset too: a timer left paused would otherwise sit on every TV over slide 1 of
// next week's show, with nothing to expire it. Every slide's phone-mechanic
// lock/reveal/results are reset too (a rehearsed Bendle's answer would leak).
export function duplicateShowRow(original, { newId, now }) {
  return {
    ...original,
    id: newId,
    title: `${original.title} (copy)`,
    slides: withPhoneStateCleared(original.slides),
    is_live: false,
    scoreboard_visible: false,
    scores_revealed: false,
    answer_reveal: false,
    late_team_qr_visible: false,
    final_scores: null,
    player_count: null,
    current_slide_id: null,
    current_slide_index: 0,
    special_event: null,
    created_at: now,
    updated_at: now,
  }
}
