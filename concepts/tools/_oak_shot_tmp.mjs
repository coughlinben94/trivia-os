import { chromium } from 'playwright';
import path from 'path';

const filePath = process.argv[2];
const outPath = process.argv[3];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto('file://' + path.resolve(filePath));
await page.waitForTimeout(300); // let layout settle, animation just started (t~0)
await page.screenshot({ path: outPath });
await browser.close();
console.log('saved', outPath);
