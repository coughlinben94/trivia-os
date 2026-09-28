// The one slide label (spec §8): the laptop's Go Live picker (Host.jsx), and
// the iPad remote's snapshot, Up Next and Jump list all read this function.
export function slidePickerLabel(slide) {
  const { data, type } = slide
  if (type === 'question' || type === 'pixelate-series') {
    if (data.isShiny) return data.seriesTheme || data.shinyFormatName || '✨ Shiny'
    return data.questionLabel || `Q${data.questionNumber || '?'}`
  }
  if (type === 'shiny-title') return data.seriesTheme || data.shinyFormatName || '✨ Shiny'
  if (type === 'flip-em-down') return data.shinyFormatName || "Flip 'Em Down!"
  if (type === 'horse-race') return data.shinyFormatName || "And They're Off!"
  if (type === 'round-intro' || type === 'swing-round-intro') return data.roundTitle || 'Round Intro'
  if (type === 'grading-break') return 'Grading Break'
  if (type === 'scoreboard-reveal') return data.title || 'Scoreboard'
  if (type === 'biggest-climbers') return 'Biggest Climbers'
  if (type === 'awards') return 'Awards'
  if (type === 'last-call') return data.title || 'Last Call'
  if (type === 'title') return data.title || 'Title'
  if (type === 'rules') return 'Rules'
  if (type === 'multi-question') return data.seriesTitle || 'Multi-Q'
  if (type === 'team-picker') return 'Team Intro'
  if (type === 'pre-show') return 'Pre-Show'
  return type
}
