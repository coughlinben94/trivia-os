# useShow.js — Hook Reference

**Path:** `client/src/hooks/useShow.js`  
Master hook for all show state, CRUD, and Supabase Realtime. Every surface (host, display, join) uses this.

## Show Object Shape
```js
{
  id: string,
  title: string,
  date: date,
  theme: string,          // theme_id (e.g. 'midnight-galaxy')
  themeOverrides: {},     // per-show font/color overrides (see Theme System in SKILL.md)
  createdAt, updatedAt: ISO,
  slides: [],             // ordered array of slide objects
  rounds: [],             // ordered array of round objects
  powerups: [],
  tickerMessages: [],
  showState: {
    currentSlideId: string | null,
    currentSlideIndex: number,
    isLive: boolean,
    scoreboardVisible: boolean,  // drives ScoreboardOverlay on /display (S hotkey)
    scoresRevealed: boolean,
    answerReveal: boolean,       // Stream Deck A key — answer overlay on QuestionSlide
  }
}
```

## Slide Object Shape
```js
{
  id: string,        // nanoid
  type: string,      // 'question', 'round-intro', etc.
  roundId: string | null,
  order: number,
  data: { ... }      // type-specific fields (see references/slides.md)
}
```

## Round Object Shape
```js
{
  id: string,
  title: string,
  roundType: 'normal' | 'swing' | 'pyl',
  roundNumber: number | undefined,
  subtitle: string | undefined,
  order: number,
}
```

## All Actions

`Host.jsx` passes `actions = { ...showApi }` (full spread — NEVER a hand-curated list, that pattern caused `uploadFont` to go missing and crash on click in 2026-06-30).

```js
// Show lifecycle
actions.createShow(title, date, themeId)
actions.loadShow(id)
actions.listShows()           // → [{ id, title, date, updatedAt, slideCount, roundCount }]
actions.unloadShow()
actions.updateShowMeta({ title, date, theme, themeOverrides })
actions.exportShow()          // downloads JSON file
actions.exportShowById(id)
actions.importShow(json)      // creates new show from JSON
actions.duplicateShow(id)
actions.deleteShow(id)
actions.saveResults()         // aggregates team_scores → final_scores + player_count;
                               // auto-fires once when winner-reveal slide goes live

// Slides
actions.addSlide(type, data)
actions.addSiblingSlides(...)  // shiny series (multi-slot)
actions.updateSlide(id, patch)
actions.deleteSlide(id)
actions.reorderSlides(newOrder)

// Rounds
actions.addRound(data)         // data = { roundType, roundNumber?, subtitle, title }
actions.updateRound(id, patch)
actions.deleteRound(roundId)   // also deletes all slides in that round
actions.reorderRounds(newOrder)

// Powerups + ticker
actions.addPowerup(powerup)
actions.deletePowerup(id)
actions.updateTickerMessages(msgs)

// Media / fonts (Supabase Storage)
actions.uploadMedia(file, isHostPhoto?)  // → url string
actions.uploadFont(file)                  // .woff2/.woff/.ttf/.otf, 5MB cap → { familyName, url }
actions.getHostPhotos()                   // → [{ url, name }]

// Live control
actions.goLive()                  // start from current slide
actions.goLiveFrom(slideIndex)    // start from specific slide index (Go Live picker)
actions.nextSlide()
actions.prevSlide()
actions.setScoreboardVisible(bool)  // S hotkey in LiveMode → ScoreboardOverlay on /display
actions.setAnswerReveal(bool)       // A hotkey in LiveMode → answer overlay on QuestionSlide
actions.setScoresRevealed(bool)     // R hotkey in LiveMode → per-round scores revealed on /join
actions.updateRoundScore(...)       // per-round score update (ScorePanel old flow)
```

## Supabase Realtime Subscription
```js
supabase.channel(`show:${showId}`)
  .on('postgres_changes', { event: '*', table: 'shows', filter: `id=eq.${showId}` }, payload => {
    // payload.new = full updated show row
    // Updates: slides, rounds, theme_id, theme_overrides, current_slide_id, is_live,
    //          scoreboard_visible, scores_revealed, answer_reveal, ticker_messages
  })
  .subscribe()
```
Cleanup: `supabase.removeChannel(channel)` on unmount.

## localStorage
Key: `trivia-os:activeShowId` — restored on mount to auto-load last active show.

## Score Updates

Two parallel scoring systems:

**Old system (per-round, during show):** Scores written directly to `team_scores` table via upsert in ScorePanel. All views update via their own `team_scores` Realtime subscription.

**New system (admin scoreboard):** Scores written to `scoreboard_teams` table via ScoreboardModal / Quick Entry. Separate table, separate data model. See features.md → Scoreboard System.
