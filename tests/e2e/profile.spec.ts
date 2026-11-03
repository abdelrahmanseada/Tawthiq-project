import { expect, test } from "@playwright/test";
import { authenticator } from "otplib";
import { encryptTotpSecret, generateTotpSecret } from "../../lib/auth/totp";
import { ensureE2eAdmin, loginAsAdmin, prisma, uniqueSuffix } from "./helpers";

test("account edits name and e-mail with password and 2FA", async ({ page }) => {
  const admin = await ensureE2eAdmin();
  const record = await prisma.adminUser.findUniqueOrThrow({ where: { email: admin.email } });
  const secret = generateTotpSecret();
  const newEmail = `e2e-profile-${uniqueSuffix()}@example.com`;
  const newName = `E2E Owner ${uniqueSuffix()}`;

  try {
    await loginAsAdmin(page, admin);
    await prisma.adminUser.update({
      where: { id: record.id },
      data: { totp_enabled: true, totp_secret: encryptTotpSecret(secret) },
    });

    await page.goto("/account");
    await page.fill('input[name="name"]', newName);
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(page.getByText("Profile updated.")).toBeVisible();

    await page.fill('input[name="email"]', newEmail);
    await page.fill('input[name="current_password"]', "WrongPassword!2026");
    await page.fill('input[name="code"]', authenticator.generate(secret));
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(page.getByText("The current password is incorrect.")).toBeVisible();
    await page.fill('input[name="current_password"]', admin.password);
    await page.fill('input[name="code"]', authenticator.generate(secret));
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(page.getByText(/E-mail updated/)).toBeVisible();

    await page.context().clearCookies();
    await page.goto("/login");
    await page.fill('input[name="email"]', newEmail);
    await page.fill('input[name="password"]', admin.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/2fa/);
    await page.fill('input[name="code"]', authenticator.generate(secret));
    await page.getByRole("button", { name: "Verify" }).click();
    await page.waitForURL(/\/dashboard/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  } finally {
    await prisma.adminUser.update({
      where: { id: record.id },
      data: {
        name: record.name,
        email: record.email,
        totp_enabled: false,
        totp_secret: null,
        failed_logins: 0,
        locked_until: null,
      },
    });
  }
});
