import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type()==='error') errors.push(m.text()); });
await page.goto('file://' + process.cwd() + '/concepts/sonora-balloons-depth.html');
await page.waitForTimeout(700);
await page.screenshot({ path: '/tmp/v6_round1.png' });
