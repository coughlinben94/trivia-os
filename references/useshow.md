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
  createdAt, updatedAt: ISO,
  slides: [],             // ordered array of slide objects
  rounds: [],             // ordered array of round objects
  powerups: [],
  tickerMessages: [],
  showState: {
    currentSlideId: string | null,
    currentSlideIndex: number,
    isLive: boolean,
    scoreboardVisible: boolean,
    scoresRevealed: boolean,
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
```js
// Show lifecycle
actions.createShow(title, date, themeId)
actions.loadShow(id)
actions.listShows()           // → [{ id, title, date, updatedAt, slideCount, roundCount }]
actions.unloadShow()
actions.updateShowMeta({ title, date, theme })
actions.exportShow()          // downloads JSON file
actions.exportShowById(id)
actions.importShow(json)      // creates new show from JSON
actions.duplicateShow(id)
actions.deleteShow(id)

// Slides
actions.addSlide(type, data)
actions.updateSlide(id, patch)
actions.deleteSlide(id)
actions.reorderSlides(newOrder)

// Rounds
actions.addRound(data)        // data = { roundType, roundNumber?, subtitle, title }
actions.updateRound(id, patch)
actions.deleteRound(roundId)  // also deletes all slides in that round

// Live control
actions.setLive(true/false)
actions.advanceSlide()
actions.previousSlide()
actions.setCurrentSlideId(id)
actions.toggleScoreboard()
actions.toggleScoresRevealed()

// Powerups + ticker
actions.setPowerups(array)
actions.setTickerMessages(array)
```

## Supabase Realtime Subscription
```js
supabase.channel(`show:${showId}`)
  .on('postgres_changes', { event: '*', table: 'shows', filter: `id=eq.${showId}` }, payload => {
    // payload.new = full updated show row
    // Updates: slides, rounds, theme_id, current_slide_id, is_live,
    //          scoreboard_visible, scores_revealed, ticker_messages
  })
  .subscribe()
```
Cleanup: `supabase.removeChannel(channel)` on unmount.

## localStorage
Key: `trivia-os:activeShowId` — restored on mount to auto-load last active show.

## Score Updates
Scores are separate from show state — written directly to `team_scores` table via upsert in ScorePanel. All views update via their own `team_scores` Realtime subscription.
