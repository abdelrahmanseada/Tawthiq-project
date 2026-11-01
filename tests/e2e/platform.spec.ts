import { expect, test } from "@playwright/test";
import { uniqueSuffix } from "./helpers";

const PLATFORM_EMAIL = process.env.PLATFORM_ADMIN_EMAIL ?? "platform@tawthiq.example";
const PLATFORM_PASSWORD = process.env.PLATFORM_ADMIN_PASSWORD ?? "ChangeMe!2026";

async function loginPlatform(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', PLATFORM_EMAIL);
  await page.fill('input[name="password"]', PLATFORM_PASSWORD);
  await page.locator('main form button[type="submit"]').first().click();
  await page.waitForURL(/\/platform/);
}

test("platform creates a tenant, owner completes onboarding, suspension blocks login", async ({ page, browser }) => {
  const suffix = uniqueSuffix().toLowerCase();
  const companyName = `Platform Test ${suffix}`;
  const slug = `platform-test-${suffix}`;
  const ownerEmail = `owner-${suffix}@example.com`;
  const temporaryPassword = "Temp!Password2026";
  const newPassword = "Changed!Password2026";

  await loginPlatform(page);
  await page.goto("/platform/companies/new");
  await page.fill('input[name="name"]', companyName);
  await page.fill('input[name="slug"]', slug);
  await page.fill('input[name="owner_name"]', "Alex Morgan");
  await page.fill('input[name="owner_email"]', ownerEmail);
  await page.fill('input[name="temporary_password"]', temporaryPassword);
  await page.fill('input[name="max_employees"]', "12");
  await page.fill('input[name="time_zone"]', "Europe/London");
  await page.locator('main form button[type="submit"]').first().click();
  await page.waitForURL(/\/platform\/companies\/[0-9a-f-]{36}/);
  await expect(page.getByText(companyName, { exact: true }).first()).toBeVisible();
  const companyUrl = page.url();

  // A platform operator cannot enter a tenant workspace.
  await page.goto("/dashboard");
  await page.waitForURL(/\/platform/);

  const owner = await browser.newPage();
  await owner.goto("/login");
  await owner.fill('input[name="email"]', ownerEmail);
  await owner.fill('input[name="password"]', temporaryPassword);
  await owner.click('button[type="submit"]');
  await owner.waitForURL(/\/change-password/);
  await owner.fill('input[name="current_password"]', temporaryPassword);
  await owner.fill('input[name="new_password"]', newPassword);
  await owner.fill('input[name="confirm_password"]', newPassword);
  await owner.locator('main form button[type="submit"]').first().click();
  await owner.waitForURL(/\/onboarding/);
  await expect(owner.getByRole("heading", { name: `Set up ${companyName}` })).toBeVisible();

  await page.goto(companyUrl);
  await page.getByRole("button", { name: "Suspend company" }).click();
  await page.waitForTimeout(300);

  const blocked = await browser.newPage();
  await blocked.goto("/login");
  await blocked.fill('input[name="email"]', ownerEmail);
  await blocked.fill('input[name="password"]', newPassword);
  await blocked.click('button[type="submit"]');
  await expect(blocked.getByText("The e-mail or password is incorrect.").first()).toBeVisible();
  await owner.close();
  await blocked.close();
});
