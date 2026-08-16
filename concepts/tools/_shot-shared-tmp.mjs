import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
const vite = spawn('npx', ['vite', '--port', '5355'], { cwd: process.cwd() })
await new Promise(r => setTimeout(r, 2500))
const browser = await chromium.launch({ headless: true })
const results = []
for (let i = 0; i < 6; i++) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
  await page.goto(`http://localhost:5355/display?show=show_shinyT2test&r=${i}`, { waitUntil: 'networkidle', timeout: 15000 }).catch(()=>{})
  await page.waitForTimeout(2500)
  const src = await page.locator('img[alt="Host"]').first().getAttribute('src').catch(() => null)
  results.push(src)
  await page.close()
}
console.log(JSON.stringify(results, null, 2))
await browser.close(); vite.kill()
