import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { ensureE2eAdmin, loginAsAdmin, prisma } from "./helpers";

test("account breadcrumbs, roles, sessions and user menu follow the real route", async ({ page }) => {
  const admin = await ensureE2eAdmin();
  await loginAsAdmin(page, admin);
  const record = await prisma.adminUser.findUniqueOrThrow({ where: { email: admin.email } });
  await prisma.userSession.create({
    data: {
      admin_id: record.id,
      jti: randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, ""),
      ip_hash: "d".repeat(64),
      user_agent: "Mozilla/5.0 (Windows NT 10.0) Chrome/131.0",
      expires_at: new Date(Date.now() + 86_400_000),
      last_seen_at: new Date(),
    },
  });
  await page.goto("/account");

  const breadcrumb = page.locator('nav[aria-label="Breadcrumb"]');
  await expect(breadcrumb).toContainText("Dashboard");
  await expect(breadcrumb).toContainText("My account");
  await expect(breadcrumb).not.toContainText("Employees");

  await expect(page.getByText("Owner", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Current session").first()).toBeVisible();
  await expect(page.getByText("IP hash")).toHaveCount(0);
  await expect(page.getByText("Device", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Revoke" }).first()).toBeVisible();

  const trigger = page.getByRole("button", { name: /Owner/ }).first();
  await trigger.click();
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(trigger).toBeFocused();
});
