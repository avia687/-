import { chromium } from 'playwright-core';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fileUrl = 'file://' + path.join(__dirname, 'index.html');

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

await page.goto(fileUrl);
await page.waitForTimeout(300);

// Empty state should show
const emptyTitle = await page.textContent('.empty-title').catch(() => null);
console.log('Empty state title:', emptyTitle);

// Load demo data
await page.click('text=טען נתוני דוגמה');
await page.waitForTimeout(500);
const heroAmount = await page.textContent('.hero-amount').catch(() => null);
console.log('Hero amount after demo:', heroAmount);

await page.screenshot({ path: path.join(__dirname, 'shot-home.png') });

// Insights
await page.click('[data-nav="insights"]');
await page.waitForTimeout(500);
const chartCount = await page.locator('.chart-card').count();
console.log('Charts rendered:', chartCount);
await page.screenshot({ path: path.join(__dirname, 'shot-insights.png') });

// Goals
await page.click('[data-nav="goals"]');
await page.waitForTimeout(400);
const goalCount = await page.locator('.goal-card').count();
console.log('Goals rendered:', goalCount);
await page.screenshot({ path: path.join(__dirname, 'shot-goals.png') });

// Add a job via FAB
await page.click('#fabAdd');
await page.waitForTimeout(400);
await page.fill('#f-title', 'בדיקה');
await page.fill('#f-amount', '1234');
await page.fill('#f-client', 'לקוח בדיקה');
await page.click('#f-save');
await page.waitForTimeout(500);

// Jobs list
await page.click('[data-nav="jobs"]');
await page.waitForTimeout(400);
const jobCount = await page.locator('.job-row').count();
console.log('Jobs rendered:', jobCount);
await page.screenshot({ path: path.join(__dirname, 'shot-jobs.png') });

// Add a goal
await page.click('[data-nav="goals"]');
await page.waitForTimeout(300);
await page.click('text=+ מטרה');
await page.waitForTimeout(300);
await page.fill('#g-name', 'אופניים');
await page.fill('#g-target', '3000');
await page.fill('#g-value', '20');
await page.click('#g-save');
await page.waitForTimeout(400);
const goalCount2 = await page.locator('.goal-card').count();
console.log('Goals after add:', goalCount2);

// Reload to verify persistence
await page.reload();
await page.waitForTimeout(400);
const heroAfterReload = await page.textContent('.hero-amount').catch(() => null);
console.log('Hero amount after reload (persistence):', heroAfterReload);

console.log('\n=== ERRORS ===');
console.log(errors.length ? errors.join('\n') : 'none');

await browser.close();
process.exit(errors.length ? 1 : 0);
