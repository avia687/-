import { test, expect, type Page } from "@playwright/test";

// Critical end-to-end flows (§34.30). Runs against the seeded demo business
// (Avia Sofa Cleaning) plus a fresh signup for the onboarding flow. Selectors
// target input types / roles so they stay robust across markup tweaks.

const DEMO = { email: "avia@demo.bizos", password: "demo1234" };

async function login(page: Page) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(DEMO.email);
  await page.locator('input[type="password"]').fill(DEMO.password);
  await page.getByRole("button", { name: "התחבר" }).click();
  await page.waitForURL("**/dashboard");
}

test("Flow 1 — new business: signup → onboarding → dashboard", async ({ page }) => {
  const email = `owner_${Date.now()}@test.co`;
  await page.goto("/signup");
  await page.locator("input").first().fill("בעל עסק"); // name
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill("secret123");
  await page.getByRole("button", { name: "המשך" }).click();

  await page.waitForURL("**/onboarding");
  await page.getByRole("button", { name: "בואו נתחיל" }).click();
  await page.getByRole("button", { name: "ניקוי ספות" }).click();
  await page.getByRole("button", { name: "המשך" }).click();
  await page.locator('input[required]').first().fill("העסק שלי לבדיקה");
  await page.getByRole("button", { name: "סיום והתחלה" }).click();

  await page.waitForURL("**/dashboard");
  await expect(page.getByText("סקירה של העסק")).toBeVisible();
});

test("Flow 2 — new customer persists after reload", async ({ page }) => {
  await login(page);
  await page.goto("/customers");
  const name = `לקוח בדיקה ${Date.now()}`;
  await page.getByRole("button", { name: /לקוח/ }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("input").first().fill(name);
  await dialog.getByRole("button", { name: "שמור" }).click();
  await expect(page.getByText(name)).toBeVisible();

  await page.reload();
  await expect(page.getByText(name)).toBeVisible(); // survived refresh (real DB)
});

test("Flow 6 — dashboard + settings load for the tenant", async ({ page }) => {
  await login(page);
  await expect(page.getByText("לידים חדשים")).toBeVisible();
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "הגדרות" })).toBeVisible();
});
