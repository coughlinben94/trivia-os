// The shiny SIGNAL is a fixed gold, constant across all 21 themes — gold IS
// the shiny signal, not the per-theme `shinyAccent`. See references/themes.md.
//
//   SHINY_GOLD      — solid fills: text, icon glyphs, badge/chip backgrounds,
//                     hairline accent borders.
//   SHINY_GOLD_GLOW — glows & drop-shadows: radial glow bursts, box-shadow
//                     halos, text shadows.
//
// Backdrops stay theme-flavored: the container background of a shiny slide
// remains `theme.colors.shinyBg`. Gold governs the signal, not the backdrop.
export const SHINY_GOLD      = '#f0d890'
export const SHINY_GOLD_GLOW = '#d4820c'
