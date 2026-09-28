// Team identity colors — picked on /join, shown as a mark next to the team
// name on the TV (TeamPreviewSlide, ScoreboardOverlay) and on the phone's own
// scores-drawer row. Stored in teams.color. Names are for aria-labels only.
export const TEAM_COLORS = [
  '#f5c842','#e02020','#60c000','#4a90d9','#c96fff',
  '#ff8c00','#00bcd4','#e91e8c','#8bc34a','#ff5722',
]

export const TEAM_COLOR_NAMES = {
  '#f5c842': 'Gold',   '#e02020': 'Red',  '#60c000': 'Green', '#4a90d9': 'Blue', '#c96fff': 'Purple',
  '#ff8c00': 'Orange', '#00bcd4': 'Teal', '#e91e8c': 'Pink',  '#8bc34a': 'Lime', '#ff5722': 'Flame',
}

// The one name key every surface matches on. Same trim+lowercase the phone's
// scores drawer, raceScoring, and the teams_show_id_lower_name_key index use.
export function normalizeTeamName(name) {
  return (name ?? '').trim().toLowerCase()
}

export function freeColors(taken = []) {
  const takenSet = new Set(taken.filter(Boolean).map(c => c.toLowerCase()))
  return TEAM_COLORS.filter(c => !takenSet.has(c))
}

// Preferred color if free, else the next free one after it in palette order
// (wrapping). No free color at all = repeats allowed, so keep the preference.
export function pickFreeColor(taken = [], preferred) {
  const start = Math.max(0, TEAM_COLORS.indexOf(preferred?.toLowerCase?.()))
  const free = new Set(freeColors(taken))
  for (let i = 0; i < TEAM_COLORS.length; i++) {
    const c = TEAM_COLORS[(start + i) % TEAM_COLORS.length]
    if (free.has(c)) return c
  }
  return TEAM_COLORS[start]
}

// teams rows -> Map(normalized name -> color). Used where a surface only
// knows the team by name (scoreboard_teams has no color column).
export function colorsByName(rows) {
  const map = new Map()
  for (const r of rows ?? []) {
    const key = normalizeTeamName(r?.name)
    if (key && r.color) map.set(key, r.color)
  }
  return map
}
