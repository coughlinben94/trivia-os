// Theme audit script — uses playwright-cli via shell commands
// Captures screenshots of all 29 themes at 1920x1080

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const BASE_URL = 'http://localhost:5174'
const SCREENSHOT_DIR = path.join(__dirname, '..', 'theme-screenshots')
const SESSION = 'audit'

const THEMES = [
  'pure-michigan', 'midnight-galaxy', 'autumn-harvest', 'northern-lights',
  'medieval-tavern', 'sunset-boulevard', 'retro-arcade', 'sand-dune-chill',
  'halloween', 'jazz-club', 'speakeasy', 'dive-bar', 'rooftop-party',
  'solar-flare', 'nebula-dreams', 'christmas-eve', 'drive-in-movie',
  'vinyl-night', 'western-showdown', 'under-the-sea', 'neon-tokyo',
  'haunted-mansion', 'firefly-summer', 'karaoke-night', 'wine-cellar',
  'aurora-borealis', 'meteor-shower', 'oktoberfest', 'eighties-night',
]

function run(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', timeout: 30000 })
  } catch (e) {
    return e.stdout || e.message
  }
}

fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })

console.log('Opening browser session...')
run(`playwright-cli -s=${SESSION} open "${BASE_URL}/ambient" --browser=chrome`)
run(`playwright-cli -s=${SESSION} resize 1920 1080`)

const results = []

for (const themeId of THEMES) {
  console.log(`Auditing: ${themeId}`)
  const url = `${BASE_URL}/ambient?theme=${themeId}`
  run(`playwright-cli -s=${SESSION} goto "${url}"`)

  // Wait 500ms for initial state
  run(`playwright-cli -s=${SESSION} screenshot --filename="${SCREENSHOT_DIR}/${themeId}-initial.png"`)

  // Wait 3s for animations to settle
  execSync('sleep 3')
  run(`playwright-cli -s=${SESSION} screenshot --filename="${SCREENSHOT_DIR}/${themeId}.png"`)

  // Check console errors
  const consoleOut = run(`playwright-cli -s=${SESSION} console`)
  const errors = consoleOut.split('\n').filter(l => l.includes('error') || l.includes('Error'))

  results.push({ themeId, errors: errors.filter(Boolean) })
}

run(`playwright-cli -s=${SESSION} close`)

// Write report
const report = results.map(r => `## ${r.themeId}\n- Screenshot: theme-screenshots/${r.themeId}.png\n- Errors: ${r.errors.length ? r.errors.join('\n  ') : 'none'}`).join('\n\n')
fs.writeFileSync(path.join(__dirname, '..', 'theme-audit-report.md'), `# Theme Audit Report\n\n${report}\n`)
console.log('Done! Report written to theme-audit-report.md')
