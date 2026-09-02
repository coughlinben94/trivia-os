# Standalone Shiny Title Slide

## Why

Every shiny question format currently bakes its "announce" beat (series
title, subtitle, host photo) into the FIRST content slide as a swap: that
slide renders `<ShinyIntroScreen>` while `data.introDone` is false, then
swaps to its real content once introDone flips true (first Next press).

Ben (the host), live, repeatedly, across multiple shows: this swap is
unnecessary friction and a recurring source of bugs — stale `introDone`
flags from rehearsal leave the intro stuck showing or stuck skipped, the
sidebar conflates the lead slide's role as BOTH group header AND first
content item (so a 3-item series only shows 2 clean "subslide" rows), and
editing/previewing a slide requires manually toggling between an "Intro"
and "Content" view.

Ben's explicit ask: "main slide is just title slide. then three subslides."
Applies to ALL shiny question formats (audio, visual, list, video, matching,
wager, order, venn, concurrent — everything under `data.isShiny`), not one
format. He's asked for this many times.

## Target architecture

- A NEW slide type, `'shiny-title'`. Its `data` carries exactly what
  `ShinyIntroScreen` already reads today: `seriesTheme`, `shinyFormatName`,
  `subtitle` (optional), `hostPhotoUrl` (optional/random), `isShiny: true`,
  and the group's `shinyGroupId` (same id as its content siblings — it's a
  member of the group, just the first thing in it).
- A NEW display component, `ShinyTitleSlide.jsx`, under
  `client/src/components/display/slides/`. Visually: reuse
  `ShinyIntroScreen.jsx`'s existing look (it's already exactly the right
  screen) — either render `<ShinyIntroScreen>` directly with `isClosing`
  hardcoded false, or lift its content into the new component if that reads
  cleaner. This is a PERMANENT slide now, not a swap state — no introDone
  concept applies to it at all. Wire it into `SlideRenderer.jsx`'s type
  dispatch map, `FULL_BLEED_SLIDE_TYPES` (Display.jsx), and
  `skipsLockedBackground()` (SlideRenderer.jsx) the same way `round-intro`
  is wired — it's a full-bleed announcement screen, same family.
- EVERY existing shiny content renderer stops gating on
  `data.introDone` — no more `if (data.isShiny && !data.introDone) return
  <ShinyIntroScreen ... />`. Content just always renders. Search for this
  exact pattern (or its equivalent) in every shiny renderer:
  `QuestionSlide.jsx` (ShinyAudioQuestion, ShinyVisualQuestion,
  ShinyMatchingQuestion, ShinyWagerQuestion, ShinyOrderQuestion, any others
  in that file), `VennDiagramSlide.jsx`, `GridContent`/concurrent paths,
  and anywhere else `ShinyIntroScreen` is currently imported for this swap
  (grep `ShinyIntroScreen` across `client/src/components/display/slides/`
  to find every consumer — do not rely on this list being exhaustive).
- `AddSlideWizard.jsx`: every path that creates a shiny series (single
  content slide OR multi-slide/multi-part series, any format) must now
  ALSO create one `shiny-title` slide, inserted immediately before the
  first content slide, sharing the same `shinyGroupId` the content slides
  get. The content slides themselves stop being seeded with
  `introDone: false` — that field no longer means anything for them.
- `slideStepping.js` (`computeNextStep`, `computePrevStep`,
  `withEntryState`, `isShinySeriesSibling` consumers): strip the
  introDone-dismiss-on-first-Next special case and the
  skip-intro-for-siblings special case for CONTENT slides — a shiny content
  slide is just a normal slide in the sequence now, Next advances past it
  like any other. A `shiny-title` slide is ALSO just a normal slide — Next
  on it advances to the first content slide, nothing special. Read the
  whole file before touching it; `isShinySeriesSibling` and
  `shinyGroupId`/`isSeries` grouping still matter for OTHER things (sidebar
  grouping, atomic reorder) — only remove the introDone/outroShown swap
  machinery, not the sibling-detection primitive itself. The
  closing-beat feature (`CLOSING_BEAT_ENABLED`, `outroShown`) existed to
  show a second announce-style card when LEAVING a series — decide whether
  it still makes sense with a real title slide in the picture (it likely
  doesn't need to exist any more, since the title slide already gives the
  series a clear boundary) and note your reasoning in your report rather
  than guessing silently.
- `RoundSidebar.jsx`: a shiny group's sidebar row now shows the
  `shiny-title` slide as the group's header/lead (label = the series
  title, no "N of M" content association), with ALL content slides
  (including what used to be the absorbed "lead" content item) as clean
  numbered sub-rows underneath, 1 of N through N of N.
- A migration for EXISTING shows already built with the old swap
  architecture (including tonight's live show, `show_kCUJXcz1` — do NOT
  run this against production, just build it, ready to run after tonight's
  show ends): for every existing `shinyGroupId` in a show's `slides` array,
  insert a new `shiny-title` slide before the group's first member (title
  text pulled from that member's `seriesTheme`/`shinyFormatName`,
  subtitle/hostPhotoUrl carried over if present), and strip
  `introDone`/`outroShown` from every member of the group. Write it as a
  plain runnable script (Node, using `@supabase/supabase-js` with the
  project's env vars — see `client/.env` for the pattern other scripts in
  this repo use) that takes a show id and is idempotent (safe to re-run).
  Do not wire it into any UI button — a manually-run script is enough.

## Constraints

- This is a genuine architecture change spanning many files. Read the
  actual current code before writing anything — do not assume the pattern
  above is verbatim what's in every file; verify against each file's real
  content.
- Existing tests: `npx vitest run` from the repo root. Every task must
  leave the suite green (update/add tests as needed for what you change —
  this project uses vitest + React Testing patterns already established in
  `*.test.jsx` files sitting next to the components they test; follow the
  existing conventions rather than inventing new ones).
- `npx vite build` must stay clean.
- Do not touch Supabase/production data. Everything here is code + a
  standalone migration script that is NOT executed as part of this work.
- Commit as you go with clear messages. Do not push (this worktree is
  isolated on purpose).
