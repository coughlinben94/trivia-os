// HOW TO ADD A FORMAT
// ─────────────────────────────────────────────────────────────────────────────
// Reusing an existing layout → add ONE object to SHINY_FORMATS below.
//   Copy any entry with the same layout as a template. All fields are required.
//   'slideType' is only needed on 'text-one-slide' entries — set it to the
//   real slide type the stamper should produce ('custom' or 'multi-question').
//
// Brand-new shape → (1) add a value to LAYOUTS below + a matching stamper
//   function in shinyStampers.js, then (2) add the object here.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Layout enum ─────────────────────────────────────────────────────────────
// Each value maps to exactly one stamper in shinyStampers.js.
export const LAYOUTS = {
  SEQUENTIAL_IMAGES:     'sequential-images',
  SINGLE_IMAGE:          'single-image',
  SEQUENTIAL_AUDIO:      'sequential-audio',
  GRID_IMAGES_ONE_SLIDE: 'grid-images-one-slide',  // ← STUBBED (needs GridSlide)
  TEXT_ONE_SLIDE:        'text-one-slide',
}

// ─── Format dictionary ───────────────────────────────────────────────────────
// id          kebab-case stable key; used as DB id prefix on insert
// name        display name shown to host + on titleCard slides
// icon        emoji shorthand
// blurb       one sentence; shown in the format picker + on titleCard subtitle
// media       'image' | 'audio' | 'text'
// layout      one of LAYOUTS values
// count       number of media/text slots, or 'ask' (host picks count at create)
// titleCard   true → stamper prepends a 'custom' announce slide before questions
// slideType   'text-one-slide' formats only — the real slide type to produce
//             ('custom' or 'multi-question')
// _meta       optional bag for format-specific display hints (not used by stampers)
// ─────────────────────────────────────────────────────────────────────────────

export const SHINY_FORMATS = [
  // ── sequential-images ──────────────────────────────────────────────────────
  {
    id:        'not-so-different',
    name:      'Not So Different',
    icon:      '🔍',
    blurb:     'Four images with a hidden connection — what do they share?',
    media:     'image',
    layout:    LAYOUTS.SEQUENTIAL_IMAGES,
    count:     4,
    titleCard: false,
  },
  {
    id:        'pixelate',
    name:      'Pixelate',
    icon:      '🎨',
    blurb:     'Three reveals of the same image, each sharper — name it before the last.',
    media:     'image',
    layout:    LAYOUTS.SEQUENTIAL_IMAGES,
    count:     3,
    titleCard: false,
  },

  // ── single-image ───────────────────────────────────────────────────────────
  {
    id:        'single-image',
    name:      'Single Image',
    icon:      '📷',
    blurb:     'One image. One question. Go.',
    media:     'image',
    layout:    LAYOUTS.SINGLE_IMAGE,
    count:     1,
    titleCard: false,
  },

  // ── sequential-audio ───────────────────────────────────────────────────────
  {
    id:        'hear-me-roar',
    name:      'Hear Me Roar',
    icon:      '🎵',
    blurb:     'Song clips — name the track and artist.',
    media:     'audio',
    layout:    LAYOUTS.SEQUENTIAL_AUDIO,
    count:     'ask',
    titleCard: false,
  },

  // ── text-one-slide ─────────────────────────────────────────────────────────
  {
    id:        'tri-bond',
    name:      'Tri-Bond',
    icon:      '🔗',
    blurb:     'Three clues with one hidden connection — what links them?',
    media:     'text',
    layout:    LAYOUTS.TEXT_ONE_SLIDE,
    slideType: 'custom',
    count:     1,
    titleCard: false,
  },
  {
    id:        'order-up',
    name:      'Order Up',
    icon:      '📋',
    blurb:     'Put these items in the correct order.',
    media:     'text',
    layout:    LAYOUTS.TEXT_ONE_SLIDE,
    slideType: 'multi-question',
    count:     1,
    titleCard: false,
  },
  {
    id:        'did-you-tape-the-instructions',
    name:      'Did You Tape the Instructions?',
    icon:      '📼',
    blurb:     'A set of instructions — follow them exactly.',
    media:     'text',
    layout:    LAYOUTS.TEXT_ONE_SLIDE,
    slideType: 'custom',
    count:     1,
    titleCard: true,
  },

  // ── grid-images-one-slide — STUBBED (needs GridSlide) ─────────────────────
  {
    id:        'color-schemes',
    name:      'Color Schemes',
    icon:      '🌈',
    blurb:     'Four columns of three images each — name the theme of each column.',
    media:     'image',
    layout:    LAYOUTS.GRID_IMAGES_ONE_SLIDE,
    count:     12,
    titleCard: false,
    _meta:     { columns: 4, rows: 3 },
  },
  {
    id:        'band-by-album',
    name:      'Band by Album',
    icon:      '💿',
    blurb:     'Three album covers — name the band.',
    media:     'image',
    layout:    LAYOUTS.GRID_IMAGES_ONE_SLIDE,
    count:     3,
    titleCard: false,
  },
  {
    id:        'ai-property',
    name:      'AI Property',
    icon:      '🤖',
    blurb:     'AI-generated images — identify the subject or theme.',
    media:     'image',
    layout:    LAYOUTS.GRID_IMAGES_ONE_SLIDE,
    count:     'ask',
    titleCard: false,
  },
]
