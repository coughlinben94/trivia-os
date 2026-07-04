// Stampers: pure functions (format, filledSlots) => slideObject[]
//
// Each returned slide object matches addSiblingSlides()'s slide shape from useShow.js:
//   { type, roundId, order, data }
// roundId and order are null/0 — the caller MUST overwrite them at insert time.
// questionNumber / questionLabel are 0 / 'Q0' — caller sets real values.
//
// filledSlots shape per layout:
//   sequential-images:     [{ mediaUrl, text? }, ...]          one per slot
//   single-image:          [{ mediaUrl, text? }]
//   sequential-audio:      [{ mediaUrl, text?, startMs?,
//                             stopMs?, audioGainDb? }, ...]    one per clip
//   grid-images-one-slide: [{ color } | { mediaUrl }, ...]     column-major (cols×rows)
//   text-one-slide / custom:
//     tri-bond              [{ clue1, clue2, clue3, answer }]
//     did-you-tape-…        [{ text }]
//   text-one-slide / multi-question:
//     order-up              [{ item1, item2, item3, item4, item5? }]

import { LAYOUTS } from './shinyFormatDictionary.js'

// ─── Internal helpers ─────────────────────────────────────────────────────────

function shinyInputSchema(format) {
  return {
    type:   format.media === 'image' ? 'visual' : format.media,
    slots:  typeof format.count === 'number' ? format.count : null,
    layout: format.layout,
  }
}

function baseShinySlide(format, slotIndex, slotTotal) {
  const isSeries = slotTotal > 1
  return {
    type:    'question',
    roundId: null,
    order:   0,
    data: {
      questionNumber:   0,      // ← caller sets real value at insert time
      questionLabel:    'Q0',   // ← caller sets real value at insert time
      questionMode:     'shiny',
      isShiny:          true,
      shinyFormatId:    format.id,
      shinyFormatName:  format.name,
      shinyFormatIcon:  format.icon,
      shinyInputSchema: { ...shinyInputSchema(format), slots: 1 },
      isSeries,
      ...(isSeries && {
        seriesTheme: format.name,
        seriesLabel: `${slotIndex} of ${slotTotal}`,
        slotIndex,
        slotTotal,
      }),
      text:       '',
      mediaSlots: [],
    },
  }
}

// titleCard: prepends a 'custom' announce slide (CustomSlide renders data.title
// + data.body; does not require a roundId). TitleSlide was considered but is
// semantically the show's opening — CustomSlide is the correct generic target.
function titleCardSlide(format) {
  return {
    type:    'custom',
    roundId: null,
    order:   0,
    data: {
      title:     `${format.icon}  ${format.name}`,
      body:      format.blurb,
      mediaUrl:  null,
      mediaType: null,
    },
  }
}

function withTitleCard(format, slides) {
  return format.titleCard ? [titleCardSlide(format), ...slides] : slides
}

// ─── Layout stampers ──────────────────────────────────────────────────────────

function stampSequentialImages(format, filledSlots) {
  const total = filledSlots.length
  const slides = filledSlots.map((slot, i) => {
    const base = baseShinySlide(format, i + 1, total)
    return { ...base, data: { ...base.data, shinyType: 'visual', mediaUrl: slot.mediaUrl ?? null, text: slot.text ?? '' } }
  })
  return withTitleCard(format, slides)
}

function stampSingleImage(format, filledSlots) {
  const slot = filledSlots[0] ?? {}
  const base = baseShinySlide(format, 1, 1)
  const slide = { ...base, data: { ...base.data, shinyType: 'visual', mediaUrl: slot.mediaUrl ?? null, text: slot.text ?? '' } }
  return withTitleCard(format, [slide])
}

function stampSequentialAudio(format, filledSlots) {
  const total = filledSlots.length
  const slides = filledSlots.map((slot, i) => {
    const base = baseShinySlide(format, i + 1, total)
    return {
      ...base,
      data: {
        ...base.data,
        shinyType:   'audio',
        mediaUrl:    slot.mediaUrl    ?? null,
        startMs:     slot.startMs    ?? null,
        stopMs:      slot.stopMs     ?? null,
        audioGainDb: slot.audioGainDb ?? 0,
        text:        slot.text        ?? '',
      },
    }
  })
  return withTitleCard(format, slides)
}

function stampGridImagesOneSlide(format, filledSlots) {
  const cols = format._meta?.columns ?? 1
  const rows = format._meta?.rows ?? filledSlots.length
  // filledSlots is a flat array of tiles in column-major order:
  // [c0r0, c0r1, c0r2, c1r0, c1r1, c1r2, ...]. Each tile = { color } | { mediaUrl }.
  const columns = []
  for (let c = 0; c < cols; c++) {
    columns.push(filledSlots.slice(c * rows, c * rows + rows).map(t => ({
      color:    t?.color    ?? null,
      mediaUrl: t?.mediaUrl ?? null,
    })))
  }
  const slide = {
    type:    'grid',
    roundId: null,
    order:   0,
    data: {
      questionNumber:  0,
      questionLabel:   'Q0',
      questionMode:    'shiny',
      isShiny:         true,
      shinyFormatId:   format.id,
      shinyFormatName: format.name,
      shinyFormatIcon: format.icon,
      columns,
      intraGap:     0,
      interGap:     84,
      columnLabels: true,
      text:         '',
    },
  }
  return withTitleCard(format, [slide])
}

// text-one-slide dispatches on format.slideType ('custom' | 'multi-question')
function stampTextOneSlide(format, filledSlots) {
  const f = filledSlots[0] ?? {}
  let slide

  if (format.slideType === 'custom') {
    // tri-bond:             f = { clue1, clue2, clue3, answer }
    // did-you-tape-…:       f = { text }
    const body = f.text
      ?? [f.clue1, f.clue2, f.clue3].filter(Boolean).join('  ·  ')
      ?? ''
    slide = {
      type:    'custom',
      roundId: null,
      order:   0,
      data:    { title: '', body, mediaUrl: null, mediaType: null },
    }
  } else if (format.slideType === 'multi-question') {
    // order-up: f = { item1, item2, item3, item4, item5? }
    const questions = ['item1', 'item2', 'item3', 'item4', 'item5']
      .map(k => f[k])
      .filter(Boolean)
      .map(text => ({ text }))
    slide = {
      type:    'multi-question',
      roundId: null,
      order:   0,
      data:    { title: format.name, questions },
    }
  } else {
    throw new Error(`Unknown slideType "${format.slideType}" for text-one-slide format "${format.name}"`)
  }

  return withTitleCard(format, [slide])
}

// ─── Layout → stamper registry ────────────────────────────────────────────────

export const LAYOUT_STAMPERS = {
  [LAYOUTS.SEQUENTIAL_IMAGES]:     stampSequentialImages,
  [LAYOUTS.SINGLE_IMAGE]:          stampSingleImage,
  [LAYOUTS.SEQUENTIAL_AUDIO]:      stampSequentialAudio,
  [LAYOUTS.GRID_IMAGES_ONE_SLIDE]: stampGridImagesOneSlide,
  [LAYOUTS.TEXT_ONE_SLIDE]:        stampTextOneSlide,
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function stampSlides(format, filledSlots) {
  const stamper = LAYOUT_STAMPERS[format.layout]
  if (!stamper) throw new Error(`No stamper registered for layout: "${format.layout}"`)
  return stamper(format, filledSlots)
}
