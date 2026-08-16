import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
const vite = spawn('npx', ['vite', '--port', '5357'], { cwd: process.cwd() })
await new Promise(r => setTimeout(r, 2000))
const browser = await chromium.launch({ headless: true })
const results = []
for (let i = 0; i < 3; i++) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
  await page.goto(`http://localhost:5357/display?show=show_shinyT2test`, { waitUntil: 'domcontentloaded', timeout: 8000 }).catch(e=>console.log('nav err',e.message))
  await page.waitForTimeout(2200)
  const src = await page.locator('img[alt="Host"]').first().getAttribute('src').catch(() => 'NOELEM')
  results.push(src)
  await page.close()
}
console.log(JSON.stringify(results, null, 2))
await browser.close(); vite.kill()
