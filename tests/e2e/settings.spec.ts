import { expect, test } from "@playwright/test";
import { ensureE2eAdmin, loginAsAdmin, prisma } from "./helpers";

test("settings accepts IANA zones, reports every invalid field and falls back card colours", async ({ page }) => {
  const admin = await ensureE2eAdmin();
  await loginAsAdmin(page, admin);
  await page.goto("/settings");

  await expect(page.locator('input[name="time_zone"]')).toHaveValue("Africa/Cairo");
  await expect(page.locator("#time-zone-options option")).not.toHaveCount(0);
  await page.fill('input[name="time_zone"]', "Europe/London");
  await page.locator('main form button[type="submit"]').first().click();
  await page.waitForURL(/saved=1/);

  const saved = await prisma.company.findFirstOrThrow({ where: { slug: "bremer" } });
  expect(saved.time_zone).toBe("Europe/London");

  await page.goto("/settings");
  await page.fill('input[name="name"]', "");
  await page.fill('input[name="primary_color"]', "");
  await page.fill('input[name="secondary_color"]', "");
  await page.fill('input[name="time_zone"]', "Mars/Olympus");
  await page.locator('main form button[type="submit"]').first().click();
  await page.waitForTimeout(700);

  const summary = page.getByText(/Please fix these fields:/);
  await expect(summary).toContainText("Company name");
  await expect(summary).toContainText("Primary colour");
  await expect(summary).toContainText("Secondary colour");
  await expect(summary).toContainText("Time zone");
  await expect(page.getByText("Choose a valid IANA time zone.").first()).toBeVisible();
  await expect(page.getByText("Use a six-digit hex colour.").first()).toBeVisible();

  await expect(page.locator('[data-card-side="front"] > div').first()).toHaveCSS("background-color", "rgb(0, 0, 0)");

  await page.fill('input[name="name"]', "Bremer");
  await page.fill('input[name="primary_color"]', "#000000");
  await page.fill('input[name="secondary_color"]', "#8F0015");
  await page.fill('input[name="time_zone"]', "Africa/Cairo");
  await page.locator('main form button[type="submit"]').first().click();
  await page.waitForURL(/saved=1/);
});
