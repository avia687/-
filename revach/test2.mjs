import { chromium } from 'playwright-core';
import path from 'path'; import { fileURLToPath } from 'url';
const dir = path.dirname(fileURLToPath(import.meta.url));
const fileUrl = 'file://' + path.join(dir, 'index.html');

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
const ok = [];

await page.goto(fileUrl);
await page.waitForTimeout(200);
await page.click('text=טען נתוני דוגמה');
await page.waitForTimeout(400);

// Home: payment alert card present + overdue badge
ok.push(['payment alert', await page.locator('.alert-card').count()]);
ok.push(['late badge', await page.locator('.late-badge').count()]);
ok.push(['hourly insight', await page.locator('text=/שכר שעתי/').count()]);
ok.push(['net insight', await page.locator('text=/רווח נטו/').count()]);
await page.screenshot({ path: path.join(dir, 's2-home.png') });

// Mark a payment paid from home
const unpaidBefore = await page.locator('.pay-row').count();
await page.locator('.pay-btn').first().click();
await page.waitForTimeout(300);
const unpaidAfter = await page.locator('.pay-row').count();
ok.push(['mark paid reduced list', `${unpaidBefore} -> ${unpaidAfter}`]);

// Insights: net strip + monthly report
await page.click('[data-nav="insights"]');
await page.waitForTimeout(300);
ok.push(['monthly report card', await page.locator('text=דוח חודשי').count()]);
ok.push(['csv button', await page.locator('#mr-csv').count()]);
ok.push(['share button', await page.locator('#mr-share').count()]);
ok.push(['net strip', await page.locator('text=לשעה').count()]);
await page.screenshot({ path: path.join(dir, 's2-insights.png') });

// Month navigation (prev)
await page.click('#mr-prev');
await page.waitForTimeout(200);
ok.push(['month nav works', await page.locator('.mr-month').textContent()]);

// Share sheet opens with WhatsApp link
await page.click('#mr-prev'); // go to a month
await page.waitForTimeout(150);
// go back to current month twice
await page.click('#mr-next'); await page.waitForTimeout(100);
await page.click('#mr-next'); await page.waitForTimeout(100);
await page.click('#mr-share');
await page.waitForTimeout(300);
const waHref = await page.getAttribute('#sh-wa', 'href');
ok.push(['whatsapp link', waHref && waHref.startsWith('https://wa.me/?text=') ? 'OK' : 'BAD']);
await page.screenshot({ path: path.join(dir, 's2-share.png') });
await page.click('#sheetBackdrop', { position: { x: 5, y: 5 } });
await page.waitForTimeout(200);
ok.push(['sheet closed on backdrop', await page.locator('#sheet.hidden').count()]);

// Add job with hours + expenses, check net hint
await page.click('#fabAdd');
await page.waitForTimeout(300);
await page.fill('#f-title', 'עבודת בדיקה');
await page.fill('#f-amount', '1000');
await page.fill('#f-hours', '4');
await page.fill('#f-expenses', '200');
await page.waitForTimeout(150);
ok.push(['net hint', await page.locator('#f-net-hint').textContent()]);
await page.click('#f-save');
await page.waitForTimeout(300);

// Jobs filter
await page.click('[data-nav="jobs"]');
await page.waitForTimeout(300);
const allCount = await page.locator('.job-row').count();
await page.click('[data-f="unpaid"]');
await page.waitForTimeout(300);
const unpaidCount = await page.locator('.job-row').count();
ok.push(['jobs filter all vs unpaid', `${allCount} / ${unpaidCount}`]);
await page.screenshot({ path: path.join(dir, 's2-jobs.png') });

// persistence
await page.reload();
await page.waitForTimeout(300);
ok.push(['persist hero', await page.textContent('.hero-amount')]);

console.log('CHECKS:');
ok.forEach(([k, v]) => console.log('  ', k, '=', v));
console.log('\nERRORS:', errors.length ? '\n' + errors.join('\n') : 'none');
await browser.close();
process.exit(errors.length ? 1 : 0);
