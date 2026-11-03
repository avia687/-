// Browser E2E against the real local server + engine (no mocks).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { startServer } from '../server/server.js';

const mediaDir = process.argv[2];
const shots = process.argv[3] || fs.mkdtempSync(path.join(os.tmpdir(), 'shots-'));
fs.mkdirSync(shots, { recursive: true });
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ae-e2e-'));
const exportDir = path.join(dataDir, 'Videos');
const srv = await startServer({ port: 0, dataDir, exportDir });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const shot = (n) => page.screenshot({ path: path.join(shots, `${n}.png`) });
const step = (s) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${s}`);

await page.goto(srv.url);
// Onboarding
await page.getByText('ברוכים הבאים ל-AutoEdit').waitFor();
await page.getByText('מנוע הווידאו מוכן').waitFor();
await shot('01-onboarding');
await page.getByRole('button', { name: 'הבא' }).click();
await page.getByRole('button', { name: 'אחר כך' }).click();
await page.getByRole('button', { name: 'אחר כך' }).click();
await page.getByRole('button', { name: 'בואו נתחיל' }).click();
await page.getByText('מה ניצור היום?').waitFor();
await shot('02-home');
step('home ok');

// Goal: Social Reel → project page
await page.getByRole('button', { name: /רילס לרשתות/ }).click();
await page.getByText('החומר שלכם').waitFor();
// Folder upload (keeps folder structure → role hints)
const folderInput = page.locator('input[webkitdirectory]');
try { await folderInput.setInputFiles(mediaDir); step('folder upload'); }
catch {
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  await page.locator('input[type=file][multiple]').setInputFiles(walk(mediaDir));
  step('files upload');
}
const total = 13;
await page.waitForFunction((n) => document.querySelectorAll('.media:not(.uploading)').length >= n, total, { timeout: 120000 });
step('uploaded');
await shot('03-uploaded');
// Wait until analysis finishes (all tiles have thumbs or audio icon)
await page.waitForFunction(() => document.querySelectorAll('.media .spinner').length === 0, null, { timeout: 300000 });
step('analyzed');
await page.getByRole('button', { name: /ויראלי/ }).first().click();
await page.getByRole('button', { name: '30 שנ׳' }).click();
await page.getByRole('button', { name: 'אינסטגרם' }).click();
await shot('04-setup');
await page.getByRole('button', { name: 'צור סרטון' }).click();
await page.locator('.processing').waitFor({ timeout: 20000 });
await page.waitForTimeout(1500);
await shot('05-processing');
step('processing');
await page.getByText('הסרטון שלכם מוכן').waitFor({ timeout: 600000 });
step('READY');
await page.waitForTimeout(800);
await shot('06-ready');

// Natural-language edit
await page.getByPlaceholder(/יותר מהיר/).fill('תקצר ל-15 שניות');
await page.getByRole('button', { name: 'בצע', exact: true }).click();
await page.locator('.player-overlay').waitFor({ timeout: 20000 });
await shot('07-editing');
await page.locator('.player-overlay').waitFor({ state: 'detached', timeout: 600000 });
await page.getByText('v2 ·').first().waitFor();
step('edit v2 ok');
await shot('08-v2');

// Undo → v1, redo → v2
await page.getByRole('button', { name: /בטל/ }).click();
await page.getByText(/^v1 ·/).first().waitFor();
await page.getByRole('button', { name: /בצע שוב/ }).click();
await page.getByText(/^v2 ·/).first().waitFor();
step('undo/redo ok');

// Export
await page.getByRole('button', { name: 'Instagram Reel' }).click();
await page.getByText(/נשמר!/).waitFor({ timeout: 600000 });
step('exported');
await shot('09-exported');

// Pro mode
await page.getByRole('button', { name: 'מקצועי' }).click();
await page.getByText('החלטות העריכה').waitFor();
await page.locator('.pro').scrollIntoViewIfNeeded();
await shot('10-pro');

// My projects + settings
await page.getByRole('button', { name: 'הפרויקטים שלי' }).first().click();
await page.locator('.pcard').first().waitFor();
await shot('11-projects');
await page.getByRole('button', { name: 'הגדרות' }).first().click();
await shot('12-settings');
await page.getByRole('tab', { name: 'פרטיות' }).click();
await shot('13-privacy');
await page.getByRole('button', { name: 'EN' }).click();
await page.getByRole('tab', { name: 'Instagram' }).click();
await shot('14-instagram-en');

const exported = fs.readdirSync(exportDir);
console.log('EXPORTS', exported);
console.log('PAGE ERRORS', errors.filter((e) => !/media|video|MEDIA_ERR|Failed to load resource/i.test(e)));
console.log('SHOTS', shots);
await browser.close();
await srv.close();
process.exit(0);
