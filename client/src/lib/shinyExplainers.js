import { BENDLE_STEP_POINTS } from './bendleScoring.js'
import { HUES_CUES_SCORE_BANDS } from './huesCuesScoring.js'
import { PIN_MIN_ROOM_FOR_FRACTION, PIN_POINTS, PIN_WINNER_FRACTION } from './pinScoring.js'
import { WAGER_TIERS } from './wagerScoring.js'

// The title card becomes a two-beat slide: announce, then explain. Existing
// title slides stay unchanged; buildShinyTitleSlide stamps these parts only
// when a new title resolves to a definition below.
export const EXPLAINER_BEAT_PARTS = [{}, {}]

const notSoDifferentPhotos = ['harry', 'niall', 'louis', 'zayn']
  .map(name => `/explainers/not-so-different/${name}.jpg`)

const wagerPercents = WAGER_TIERS.map(tier => `${Math.round(tier.threshold * 100)}%`).join(' / ')
const wagerPoints = WAGER_TIERS.map(tier => `+${tier.points}`).join(' / ')

const pinPercent = Math.round(100 * PIN_WINNER_FRACTION.numerator / PIN_WINNER_FRACTION.denominator)

// This is the only eligibility/catalog list. Interactive formats match by
// their stable schema type (their database IDs are generated); the existing
// sample-only format keeps its fixed ID.
export const SHINY_EXPLAINERS = Object.freeze([
  Object.freeze({
    formatId: 'fmt_not_so_different',
    mode: 'sample',
    rendererKey: 'notSoDifferent',
    assets: notSoDifferentPhotos,
  }),
  Object.freeze({
    inputType: 'bendle',
    mode: 'rules',
    rendererKey: 'bendle',
    action: 'Write down the song title as each mix step plays. No phone entry.',
    scoring: [`Earlier guesses score more: ${BENDLE_STEP_POINTS.join(' / ')} points by step.`],
    assets: [],
  }),
  Object.freeze({
    inputType: 'pin',
    mode: 'rules',
    rendererKey: 'pinIt',
    action: 'Place one pin on the map on your phone, then lock it in.',
    scoring: [
      `Top ${pinPercent}% (rounded up) earn +${PIN_POINTS} points.`,
      `Under ${PIN_MIN_ROOM_FOR_FRACTION} teams: closest pin only. Ties at the rounded-mile cutoff also score.`,
    ],
    assets: [],
    preloadMapData: true,
  }),
  Object.freeze({
    inputType: 'hues-cues',
    mode: 'rules',
    rendererKey: 'huesCues',
    action: 'Choose a color square on your phone and lock it in.',
    scoring: [
      `Exact +${HUES_CUES_SCORE_BANDS[0].points} · one square +${HUES_CUES_SCORE_BANDS[1].points} · two squares +${HUES_CUES_SCORE_BANDS[2].points}.`,
      'Diagonal neighbors count as one square.',
    ],
    assets: [],
  }),
  Object.freeze({
    inputType: 'wager',
    mode: 'rules',
    rendererKey: 'wager',
    action: 'Pick a wager before you see the question, then enter a number on your phone and lock it in.',
    scoring: [
      `Be closer than ${wagerPercents} of the other teams to win ${wagerPoints}.`,
      'Miss your bar and score 0. Your phone shows how many teams you need to beat.',
    ],
    assets: [],
  }),
  // Points per Order slide are host-set (pointsForOrder), so the card states
  // the all-or-nothing rule, never a number.
  Object.freeze({
    inputType: 'order',
    mode: 'rules',
    rendererKey: 'order',
    action: 'Tap the pictures on your phone in order, then lock it in.',
    scoring: [
      'All or nothing: every item in the right spot scores.',
      'One out of place scores 0.',
    ],
    assets: [],
  }),
])

export function getShinyExplainer(selector, inputType) {
  const normalized = typeof selector === 'string'
    ? { formatId: selector, inputType }
    : (selector ?? {})
  return SHINY_EXPLAINERS.find(definition =>
    (definition.formatId && definition.formatId === normalized.formatId)
    || (definition.inputType && definition.inputType === normalized.inputType)
  ) ?? null
}

// Keep the original helpers available to the existing build and warm-up
// callers. Passing the schema type adds lookup for generated format IDs.
export const hasExplainer = (formatId, inputType) => !!getShinyExplainer(formatId, inputType)
export const explainerImageUrls = (formatId, inputType) => getShinyExplainer(formatId, inputType)?.assets ?? []
