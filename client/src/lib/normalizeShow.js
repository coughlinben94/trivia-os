import { DEFAULT_THEME_ID } from '../themes/index.js'

// A fetched `shows` row -> the host's show object. Moved verbatim out of useShow.js
// so it can be tested; the one change is audio_playing (see normalizeShow.test.js).
export function normalizeShow(row) {
  return {
    id: row.id,
    title: row.title,
    date: row.date,
    theme: row.theme_id ?? DEFAULT_THEME_ID,
    themeOverrides: row.theme_overrides ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    slides: row.slides ?? [],
    rounds: row.rounds ?? [],
    powerups: row.powerups ?? [],
    tickerMessages: row.ticker_messages ?? [],
    // The TV can write this now (its Next plays an owed clip) and the host's gate and
    // stale-mark clear both read it, so a re-fetch (laptop reload) must not drop it.
    audio_playing: row.audio_playing ?? null,
    // Host countdown timer lives at special_event.timer (lib/showTimer.js); the TV
    // owns no copy of it that the host lacks, but a laptop reload must still see it.
    special_event: row.special_event ?? null,
    showState: {
      currentSlideId: row.current_slide_id ?? null,
      currentSlideIndex: row.current_slide_index ?? 0,
      isLive: row.is_live ?? false,
      scoreboardVisible: row.scoreboard_visible ?? false,
      scoresRevealed: row.scores_revealed ?? false,
      answerReveal: row.answer_reveal ?? false,
    },
  }
}
