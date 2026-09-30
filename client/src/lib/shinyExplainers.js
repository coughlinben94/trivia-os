// Shiny formats that get a short "how it works" animation right after their
// title card. The title slide becomes a two-beat slide: beat 0 is the normal
// announce card, beat 1 is the explainer. Stepping is the generic
// data.parts/currentPart logic in slideStepping.js — Next goes beat 0 → 1,
// the next Next leaves the slide; Prev walks back — so there is no new slide
// type and no grouping change. ShinyTitleSlide.jsx maps format id → component
// (keep the two lists in sync; a format in only one does nothing).
// Only NEW title slides get the second beat (buildShinyTitleSlide); titles
// already stored in a show stay one-beat.
export const EXPLAINER_BEAT_PARTS = [{}, {}]

const EXPLAINER_FORMAT_IDS = new Set(['fmt_not_so_different'])

export const hasExplainer = formatId => EXPLAINER_FORMAT_IDS.has(formatId)
