import { expect, test } from "@playwright/test";
import { ensureE2eAdmin, loginAsAdmin } from "./helpers";

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("content is final immediately and animations are disabled", async ({ page }) => {
    await page.goto("/login");
    const loginAnimation = await page.locator(".auth-form-enter").evaluate((element) => getComputedStyle(element).animationDuration);
    expect(Number.parseFloat(loginAnimation)).toBeLessThan(0.1);
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();

    const admin = await ensureE2eAdmin();
    await loginAsAdmin(page, admin);
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const pageAnimation = await page.locator(".page-enter").first().evaluate((element) => getComputedStyle(element).animationDuration);
    expect(Number.parseFloat(pageAnimation)).toBeLessThan(0.1);
  });
});

test("dashboard content is visible after 600ms and has minimal layout shift", async ({ page }) => {
  await page.addInitScript(() => {
    (window as Window & { __cls?: number }).__cls = 0;
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as Array<PerformanceEntry & { value?: number; hadRecentInput?: boolean }>) {
          if (!entry.hadRecentInput) (window as Window & { __cls?: number }).__cls = (window as Window & { __cls?: number }).__cls! + (entry.value ?? 0);
        }
      }).observe({ type: "layout-shift", buffered: true });
    } catch {
      // Browser without layout-shift support: keep the zero baseline.
    }
  });
  const admin = await ensureE2eAdmin();
  await loginAsAdmin(page, admin);
  await page.goto("/dashboard");
  await page.waitForTimeout(650);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator(".stagger > *").first()).toBeVisible();
  const cls = await page.evaluate(() => (window as Window & { __cls?: number }).__cls ?? 0);
  expect(cls).toBeLessThan(0.05);
});
