import { chromium } from 'playwright';
import fs from 'fs';

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox']
});

const page = await browser.newPage();
page.setViewportSize({ width: 1280, height: 720 });

const baseUrl = 'http://localhost:3000';
const screenshotDir = '/tmp/bizos-real';
if (!fs.existsSync(screenshotDir)) {
  fs.mkdirSync(screenshotDir, { recursive: true });
}

try {
  // 1. Login page
  console.log('📸 1. דף התחברות');
  await page.goto(`${baseUrl}/login`);
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: `${screenshotDir}/01-login.png`, fullPage: true });

  // Sign in
  console.log('🔐 מתחברים...');
  await page.fill('input[type="email"]', 'avia@demo.bizos');
  await page.fill('input[type="password"]', 'demo1234');
  const button = page.locator('button[type="submit"]');
  await button.click();

  // Wait for navigation to dashboard (might be /dashboard or /app/dashboard)
  await page.waitForURL(/dashboard/, { timeout: 15000 });
  await page.waitForLoadState('networkidle');

  // 2. Dashboard
  console.log('📸 2. דשבורד');
  await page.screenshot({ path: `${screenshotDir}/02-dashboard.png`, fullPage: true });

  // 3. Customers
  console.log('📸 3. לקוחות');
  await page.goto(`${baseUrl}/app/customers`);
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: `${screenshotDir}/03-customers.png`, fullPage: true });

  // 4. Leads
  console.log('📸 4. לידים');
  await page.goto(`${baseUrl}/app/leads`);
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: `${screenshotDir}/04-leads.png`, fullPage: true });

  // 5. Quotes
  console.log('📸 5. הצעות מחיר');
  await page.goto(`${baseUrl}/app/quotes`);
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: `${screenshotDir}/05-quotes.png`, fullPage: true });

  // 6. Jobs
  console.log('📸 6. עבודות');
  await page.goto(`${baseUrl}/app/jobs`);
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: `${screenshotDir}/06-jobs.png`, fullPage: true });

  // 7. Payments
  console.log('📸 7. תשלומים');
  await page.goto(`${baseUrl}/app/payments`);
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: `${screenshotDir}/07-payments.png`, fullPage: true });

  // 8. Expenses
  console.log('📸 8. הוצאות');
  await page.goto(`${baseUrl}/app/expenses`);
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: `${screenshotDir}/08-expenses.png`, fullPage: true });

  // 9. Settings
  console.log('📸 9. הגדרות');
  await page.goto(`${baseUrl}/app/settings`);
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: `${screenshotDir}/09-settings.png`, fullPage: true });

  // 10. Calendar/Jobs detailed view
  console.log('📸 10. יומן/לוח זמנים');
  await page.goto(`${baseUrl}/app/calendar`);
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: `${screenshotDir}/10-calendar.png`, fullPage: true });

  console.log('\n✅ סיימנו! 10 תמונות');
  const files = fs.readdirSync(screenshotDir).sort();
  console.log('Files:', files);

} catch (error) {
  console.error('❌ Error:', error.message);
  console.error(error);
}

await browser.close();
