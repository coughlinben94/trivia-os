import { BENDLE_STEP_POINTS } from './bendleScoring.js'
import { HUES_CUES_SCORE_BANDS } from './huesCuesScoring.js'
import { PIN_MIN_ROOM_FOR_FRACTION, PIN_POINTS, PIN_WINNER_FRACTION } from './pinScoring.js'
import { DEFAULT_TIER_ID, WAGER_TIERS, getWagerTier } from './wagerScoring.js'
import { MOVIE_CHAIN_POINTS } from './movieChainScoring.js'

// The title card becomes a two-beat slide: announce, then explain. Existing
// title slides stay unchanged; buildShinyTitleSlide stamps these parts only
// when a new title resolves to a definition below.
export const EXPLAINER_BEAT_PARTS = [{}, {}]

const notSoDifferentPhotos = ['harry', 'niall', 'louis', 'zayn']
  .map(name => `/explainers/not-so-different/${name}.jpg`)

// Thresholds in words, not percentages: wagerTierBar rounds bars up and bumps
// colliding tiers apart, so in a room of 10 or fewer answering teams the top
// tier means beating EVERY other team (from 11 up it is 90%+). "At least"
// keeps every word a true lower bound; the phone shows the exact head count
// and greys out tiers a tiny room can't reach.
const WAGER_THRESHOLD_WORDS = { 0.5: 'half the other teams', 0.75: 'three-quarters' }
const topTier = WAGER_TIERS[WAGER_TIERS.length - 1]
const wagerTierWords = tier => tier === topTier
  ? `all of them (${Math.round(tier.threshold * 100)}% in a big room)`
  : WAGER_THRESHOLD_WORDS[tier.threshold] ?? `${Math.round(tier.threshold * 100)}%`
export const wagerScoringLine = `Beat at least ${WAGER_TIERS.map(tier => `${wagerTierWords(tier)}: +${tier.points}`).join(' · ')}.`

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
    action: 'The mix adds a layer each step; write the song title down when you know it.',
    // Owner rule, 2026-10-02: ONE guess per team. The step a team guesses
    // on sets its points if right (30 / 20 / 10). No penalty and no way of
    // marking the step is defined in code, so the card states neither.
    scoring: [
      `One guess per team. Right on step 1: ${BENDLE_STEP_POINTS[0]}. Step 2: ${BENDLE_STEP_POINTS[1]}. Step 3: ${BENDLE_STEP_POINTS[2]}.`,
      'No phone entry. The host checks answers by hand.',
    ],
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
    action: 'Pick the letter and number of your color on your phone, then lock it in.',
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
      wagerScoringLine,
      // No number entered: scoreWagerRound scores 0 and leaves the team out of the pool.
      `Ties don't count as beating. Miss your bar or enter no number: 0. No wager = ${getWagerTier(DEFAULT_TIER_ID).label}.`,
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
  // The Drop's pool is host-set per slide (data.dropTotal, default
  // DEFAULT_DROP_TOTAL), so the card states the rule, never a number.
  Object.freeze({
    inputType: 'drop',
    mode: 'rules',
    rendererKey: 'drop',
    action: 'Split your points across the tiles on your phone, then lock it in.',
    scoring: [
      'You keep the points on the right tile. Points on the other tiles are lost.',
      'Every point must be placed. No split locked in scores 0.',
    ],
    assets: [],
  }),
  // Tiers are fixed in the scorer; the announced movie count is host-set
  // per slide, so the card never states a count.
  Object.freeze({
    inputType: 'movie-chain',
    mode: 'rules',
    rendererKey: 'movieChain',
    action: 'On your phone, link the two movies through shared actors, then lock it in.',
    scoring: [
      `Hit the shortest chain or beat it: +${MOVIE_CHAIN_POINTS.shortest} · one extra movie: +${MOVIE_CHAIN_POINTS.oneLonger}.`,
      'Count includes both end movies. A wrong link or a repeated movie or actor scores 0.',
    ],
    assets: [],
  }),
  // One 'choice' schema covers single-pick (Mandela Effect) and multi-pick
  // (Mixology). New titles stamp data.shinyMultiSelect (buildShinyTitleSlide),
  // and explainerCopy() picks the matching variant; older titles without the
  // stamp fall back to the generic action/scoring below. Points are host-set
  // (pointsForChoice): no number.
  Object.freeze({
    inputType: 'choice',
    mode: 'rules',
    rendererKey: 'choice',
    action: 'Tap your answer on your phone, then lock it in. Your phone says pick one or pick all.',
    scoring: [
      'All or nothing: only the exact right picks score.',
      'One wrong, missing or extra pick scores 0.',
    ],
    variants: Object.freeze({
      single: Object.freeze({
        action: 'Tap the one right answer on your phone, then lock it in.',
        scoring: ['Pick the right one and you score.', 'A wrong pick scores 0.'],
      }),
      multi: Object.freeze({
        action: 'Tap every answer that fits on your phone, then lock it in.',
        scoring: [
          'All or nothing: only the exact right picks score.',
          'One wrong, missing or extra pick scores 0.',
        ],
      }),
    }),
    assets: [],
  }),
  // Points per correct pair are host-set per slide (pointsPerMatch), so the
  // card states the per-pair rule, never a number.
  Object.freeze({
    inputType: 'matching',
    mode: 'rules',
    rendererKey: 'matching',
    action: 'Pair every item on your phone, one from each side, then lock it in.',
    scoring: [
      'Each correct pair scores points.',
      'Wrong pairs score 0. The others still count.',
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

// The action/scoring a card shows for this title. Only 'choice' has variants,
// chosen by the stamped boolean data.shinyMultiSelect; anything else (or an
// older title without the stamp) gets the definition's own copy.
export function choiceVariantKey(data) {
  return typeof data?.shinyMultiSelect === 'boolean' ? (data.shinyMultiSelect ? 'multi' : 'single') : null
}
export function explainerCopy(definition, data) {
  const variant = definition?.variants?.[choiceVariantKey(data)]
  return { action: variant?.action ?? definition?.action, scoring: variant?.scoring ?? definition?.scoring ?? [] }
}
