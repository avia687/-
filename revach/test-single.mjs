import { chromium } from 'playwright-core';
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const dir = path.dirname(fileURLToPath(import.meta.url));

// Simulate the artifact skeleton: doctype + head + body wrapping our content
const content = fs.readFileSync(path.join(dir, 'revach-app.html'), 'utf8');
const wrapped = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{margin:0}</style></head><body>${content}</body></html>`;
fs.writeFileSync(path.join(dir, '_wrapped.html'), wrapped);

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

await page.goto('file://' + path.join(dir, '_wrapped.html'));
await page.waitForTimeout(300);
console.log('Empty title:', await page.textContent('.empty-title').catch(() => 'MISSING'));
await page.click('text=טען נתוני דוגמה');
await page.waitForTimeout(500);
console.log('Hero:', await page.textContent('.hero-amount').catch(() => 'MISSING'));
await page.screenshot({ path: path.join(dir, 'shot-single.png') });

// test dark via data-theme toggle
await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
await page.waitForTimeout(200);
await page.screenshot({ path: path.join(dir, 'shot-single-dark.png') });

console.log('ERRORS:', errors.length ? '\n' + errors.join('\n') : 'none');
fs.unlinkSync(path.join(dir, '_wrapped.html'));
await browser.close();
process.exit(errors.length ? 1 : 0);
