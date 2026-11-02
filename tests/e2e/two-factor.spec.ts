import { expect, test } from "@playwright/test";
import { authenticator } from "otplib";
import { encryptTotpSecret, generateTotpSecret } from "../../lib/auth/totp";
import { ensureE2eAdmin, prisma } from "./helpers";

test("an enrolled administrator must complete TOTP before the dashboard", async ({ page }) => {
  const admin = await ensureE2eAdmin();
  const secret = generateTotpSecret();
  await prisma.adminUser.update({
    where: { email: admin.email },
    data: { totp_enabled: true, totp_secret: encryptTotpSecret(secret) },
  });
  try {
    await page.goto("/login");
    await page.fill('input[name="email"]', admin.email);
    await page.fill('input[name="password"]', admin.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/2fa$/);
    await expect(page.getByRole("heading", { name: "Two-step verification" })).toBeVisible();
    await page.fill('input[name="code"]', authenticator.generate(secret));
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  } finally {
    await prisma.adminUser.update({
      where: { email: admin.email },
      data: { totp_enabled: false, totp_secret: null },
    });
  }
});
