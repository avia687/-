/**
 * Dev tool: capture full-page + section + mobile screenshots of the running
 * site. Playwright is NOT a project dependency (to keep installs lean) —
 * install it on demand before running:
 *
 *   npm i -D playwright && npx playwright install chromium
 *   npm run build && npm start &        # serve on :3100
 *   BASE=http://localhost:3100 node scripts/screenshots.mjs
 *
 * Output is written to /tmp/shots. Set EXEC to override the Chromium binary.
 */
import { chromium } from "playwright";
import { mkdirSync, existsSync } from "node:fs";

const BASE = process.env.BASE || "http://localhost:3100";
const OUT = process.env.OUT || "/tmp/shots";
// Use an explicit Chromium if provided/known, else let Playwright resolve its own.
const EXEC = process.env.EXEC || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const executablePath = existsSync(EXEC) ? EXEC : undefined;

mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function settleReveals(page) {
  // Scroll through the whole page so every IntersectionObserver fires.
  await page.evaluate(async () => {
    const step = 350;
    const h = document.body.scrollHeight;
    for (let y = 0; y <= h; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 90));
    }
    window.scrollTo(0, 0);
  });
  await sleep(900);
}

async function shootSection(page, selector, file) {
  const el = page.locator(selector).first();
  await el.scrollIntoViewIfNeeded();
  await sleep(700);
  await el.screenshot({ path: `${OUT}/${file}` });
  console.log("✓", file);
}

const browser = await chromium.launch({
  executablePath,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--force-color-profile=srgb"],
});

/* ----------------------------- Desktop ----------------------------- */
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  locale: "he-IL",
});
const page = await ctx.newPage();
await page.goto(BASE, { waitUntil: "networkidle", timeout: 60000 });
await page.evaluate(() => document.fonts.ready);
await sleep(1200);

// Hero (top of viewport)
await page.evaluate(() => window.scrollTo(0, 0));
await sleep(800);
await page.screenshot({ path: `${OUT}/01-hero.png` });
console.log("✓ 01-hero.png");

await settleReveals(page);

await shootSection(page, "#about", "02-about.png");
await shootSection(page, "#services", "03-services.png");
await shootSection(page, "#gallery", "04-gallery.png");
await shootSection(page, "#team", "05-team.png");
await shootSection(page, "#booking", "06-booking-services.png");
await shootSection(page, "#reviews", "08-reviews.png");
await shootSection(page, "#contact", "09-contact.png");

/* --------------------- Booking flow interaction -------------------- */
try {
  const booking = page.locator("#booking");
  await booking.scrollIntoViewIfNeeded();
  await sleep(400);
  // 1) pick a service -> advances to barber step
  await booking.getByRole("button", { name: /Skin Fade/ }).click();
  await page.getByText("בחר/י את הספר").waitFor({ timeout: 8000 });
  await sleep(500);
  // 2) pick barber (no preference) -> advances to date step
  await booking.getByRole("button", { name: /ללא העדפה/ }).click();
  await page.getByText("בחר/י תאריך").waitFor({ timeout: 8000 });
  await sleep(500);
  // 3) pick a date (second available chip) -> advances to time step
  const dateChips = booking.locator('button:has-text("יוני"), button:has-text("יולי")');
  const n = await dateChips.count();
  await dateChips.nth(Math.min(1, n - 1)).click();
  // wait for time slots to load
  await page.locator('#booking button:has-text(":")').first().waitFor({ timeout: 10000 });
  await sleep(700);
  await shootSection(page, "#booking", "07-booking-times.png");
} catch (e) {
  console.log("booking flow skipped:", e.message);
}

await ctx.close();

/* ------------------------------ Mobile ----------------------------- */
const mctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  locale: "he-IL",
  isMobile: true,
  hasTouch: true,
});
const mpage = await mctx.newPage();
await mpage.goto(BASE, { waitUntil: "networkidle", timeout: 60000 });
await mpage.evaluate(() => document.fonts.ready);
await sleep(1200);
await mpage.screenshot({ path: `${OUT}/10-mobile-hero.png` });
console.log("✓ 10-mobile-hero.png");

try {
  await mpage.getByRole("button", { name: /פתח תפריט/ }).click();
  await sleep(700);
  await mpage.screenshot({ path: `${OUT}/11-mobile-menu.png` });
  console.log("✓ 11-mobile-menu.png");
} catch (e) {
  console.log("mobile menu skipped:", e.message);
}

await mctx.close();
await browser.close();
console.log("DONE");
