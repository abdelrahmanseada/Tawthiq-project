import path from "node:path";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import ExcelJS from "exceljs";
import { hash as argonHash } from "@node-rs/argon2";
import { test, expect, type Page } from "@playwright/test";
import { encryptCardToken } from "../../lib/security/crypto";
import {
  ensureE2eAdmin,
  loginAsAdmin,
  newCardToken,
  prisma,
  sha256,
  uniqueSuffix,
  type E2eAdmin,
} from "./helpers";

let admin: E2eAdmin;

test.beforeAll(async () => {
  admin = await ensureE2eAdmin();
});

test.afterAll(async () => {
  const employees = await prisma.employee.findMany({
    where: { employee_code: { startsWith: "E2E-" } },
    select: { id: true },
  });
  const employeeIds = employees.map((employee) => employee.id);
  const cards = await prisma.card.findMany({
    where: { employee_id: { in: employeeIds } },
    select: { id: true },
  });
  await prisma.scanLog.deleteMany({ where: { card_id: { in: cards.map((card) => card.id) } } });
  await prisma.card.deleteMany({ where: { employee_id: { in: employeeIds } } });
  await prisma.employee.deleteMany({ where: { id: { in: employeeIds } } });
  await prisma.adminUser.deleteMany({ where: { email: { startsWith: "e2e-temp-" } } });
  await prisma.$disconnect();
});

async function createEmployeeThroughUi(page: Page, code: string, fullName: string): Promise<string> {
  await page.goto("/employees/new");
  await page.fill('input[name="employee_code"]', code);
  await page.fill('input[name="full_name"]', fullName);
  await page.fill('input[name="department"]', "Operations");
  await page.fill('input[name="job_title"]', "Technician");
  await page.locator('main form button[type="submit"]').first().click();
  await page.waitForURL(/\/employees\/[0-9a-f-]{36}/);
  await expect(page.getByRole("heading", { level: 1, name: fullName })).toBeVisible();
  const employeeId = page.url().match(/\/employees\/([0-9a-f-]{36})/)?.[1];
  if (!employeeId) throw new Error("Employee id missing from URL");
  return employeeId;
}

test("admin signs in, adds an employee and a photo-less card is still test-printable", async ({ page }) => {
  await loginAsAdmin(page, admin);
  const suffix = uniqueSuffix();
  const code = `E2E-CARD-${suffix}`;

  const employeeId = await createEmployeeThroughUi(page, code, `E2E Employee ${suffix}`);
  await expect(page.getByText("Employee created and card issued.")).toBeVisible();
  await expect(page.getByText("This employee has no photo. Printing is blocked until a photo is added.")).toHaveCount(0);
  await expect(page.getByText("Photo missing")).toHaveCount(0);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Test print" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.pdf$/);
  expect(employeeId).toMatch(/^[0-9a-f-]{36}$/);
});

test("editing an employee can remove a saved photo", async ({ page }) => {
  await loginAsAdmin(page, admin);
  const suffix = uniqueSuffix();
  const code = `E2E-PHOTO-${suffix}`;
  const employeeId = await createEmployeeThroughUi(page, code, `Photo Employee ${suffix}`);
  await page.goto(`/employees/${employeeId}/edit`);
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Upload photo" }).click();
  await (await chooser).setFiles("screenshots/polish/login-390.png");
  await page.locator('main form button[type="submit"]').first().click();
  await page.waitForURL(new RegExp(`/employees/${employeeId}\\?saved=1`));
  expect((await prisma.employee.findUniqueOrThrow({ where: { id: employeeId } })).photo_path).toBeTruthy();

  await page.goto(`/employees/${employeeId}/edit`);
  await page.getByRole("button", { name: "Remove photo" }).click();
  await page.locator('main form button[type="submit"]').first().click();
  await page.waitForURL(new RegExp(`/employees/${employeeId}\\?saved=1`));
  expect((await prisma.employee.findUniqueOrThrow({ where: { id: employeeId } })).photo_path).toBeNull();
});

test("verify page shows valid, revoked and unknown card states without leaking employee data", async ({ page }) => {
  await loginAsAdmin(page, admin);
  const suffix = uniqueSuffix();
  const code = `E2E-VERIFY-${suffix}`;
  const fullName = `Verify Person ${suffix}`;
  const employeeId = await createEmployeeThroughUi(page, code, fullName);

  const token = newCardToken();
  await prisma.card.updateMany({
    where: { employee_id: employeeId, status: "ACTIVE" },
    data: { status: "REVOKED", revoked_at: new Date(), revoked_reason: "E2E replaced" },
  });
  const knownCard = await prisma.card.create({
    data: {
      employee_id: employeeId,
      token_hash: sha256(token),
      token_prefix: token.slice(0, 6),
      token_enc: encryptCardToken(token),
      status: "ACTIVE",
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  await page.goto(`/v/${token}`);
  await expect(page.getByRole("heading", { name: /Verified employee of/ })).toBeVisible();
  await expect(page.getByText(fullName)).toBeVisible();
  await expect(page.getByText("Compare the photo with the person in front of you.")).toBeVisible();

  const apiResponse = await page.request.get(`/api/verify/${token}`);
  expect(apiResponse.ok()).toBe(true);
  const apiBody = (await apiResponse.json()) as { state: string; employee: { full_name: string } | null };
  expect(apiBody.state).toBe("valid");
  expect(apiBody.employee?.full_name).toBe(fullName);

  await page.goto(`/employees/${employeeId}`);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Revoke card" }).click();
  await page.waitForURL(/revoked=1/);
  const revokedCard = await prisma.card.findUniqueOrThrow({ where: { id: knownCard.id } });
  expect(revokedCard.status).toBe("REVOKED");

  await page.goto(`/v/${token}`);
  await expect(page.getByRole("heading", { name: /cancelled/i })).toBeVisible();
  await expect(page.getByText(fullName)).toHaveCount(0);

  const unknownToken = "B".repeat(32);
  await page.goto(`/v/${unknownToken}`);
  await expect(page.getByRole("heading", { name: /not valid/i })).toBeVisible();
});

test("bulk import reports row errors, completes in the background and can be rolled back", async ({ page }) => {
  await loginAsAdmin(page, admin);
  const suffix = uniqueSuffix();
  const validCode = `E2E-IMPORT-${suffix}`;

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Employees");
  sheet.addRow(["employee_code", "full_name", "department", "job_title", "expires_at", "photo_filename"]);
  sheet.addRow([validCode, `Imported Person ${suffix}`, "Operations", "Technician", "", ""]);
  sheet.addRow([`E2E-BAD-${suffix}`, "", "Operations", "", "", ""]);
  const buffer = await workbook.xlsx.writeBuffer();
  const directory = await mkdtemp(path.join(tmpdir(), "evs-e2e-"));
  const filePath = path.join(directory, "import.xlsx");
  await writeFile(filePath, Buffer.from(buffer));

  await page.goto("/imports");
  await page.setInputFiles('input[name="spreadsheet"]', filePath);
  await page.getByRole("button", { name: "Upload and preview" }).click();
  await page.waitForURL(/\/imports\/[0-9a-f-]{36}/);
  await expect(page.getByText("Review import").first()).toBeVisible();
  await expect(page.getByText("Valid rows")).toBeVisible();

  const batchId = page.url().split("/imports/")[1]!.split("?")[0]!;
  await page.getByRole("button", { name: "Start import" }).click();
  await page.waitForURL(new RegExp(`/imports/${batchId}`));

  await expect
    .poll(
      async () => {
        const response = await page.request.get(`/api/admin/import/${batchId}/status`);
        if (!response.ok()) return "UNKNOWN";
        return ((await response.json()) as { status: string }).status;
      },
      { timeout: 90_000 },
    )
    .toBe("DONE");

  const statusResponse = await page.request.get(`/api/admin/import/${batchId}/status`);
  const statusBody = (await statusResponse.json()) as { success_count: number; failed_count: number };
  expect(statusBody.success_count).toBe(1);
  expect(statusBody.failed_count).toBe(1);

  await page.reload();
  await expect(page.getByText("Completed", { exact: true }).first()).toBeVisible();
  const imported = await prisma.employee.findFirst({ where: { employee_code: validCode } });
  expect(imported).toBeTruthy();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Roll back batch" }).click();
  await expect(page.getByText("Import rolled back.")).toBeVisible();

  const rolledBack = await prisma.employee.findFirst({ where: { employee_code: validCode } });
  expect(rolledBack?.deleted_at).not.toBeNull();
});

test("first sign-in forces a password change without two-factor authentication", async ({ page }) => {
  const company = await prisma.company.findFirstOrThrow({ orderBy: { created_at: "asc" } });
  const suffix = uniqueSuffix();
  const email = `e2e-temp-${suffix}@example.com`;
  const initialPassword = "Temp!Password2026";
  const newPassword = "Changed!Password2026";

  await prisma.adminUser.create({
    data: {
      company_id: company.id,
      name: "E2E Temp Admin",
      email,
      password_hash: await argonHash(initialPassword, {
        algorithm: 2,
        memoryCost: 19_456,
        timeCost: 2,
        parallelism: 1,
      }),
      role: "ADMIN",
      must_change_password: true,
      totp_enabled: false,
      is_active: true,
    },
  });

  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', initialPassword);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/change-password/);
  await expect(page).not.toHaveURL(/2fa/);
  await expect(page.getByRole("heading", { name: "Set a new password" })).toBeVisible();

  await page.fill('input[name="current_password"]', initialPassword);
  await page.fill('input[name="new_password"]', newPassword);
  await page.fill('input[name="confirm_password"]', newPassword);
  await page.locator('main form button[type="submit"]').first().click();
  await page.waitForURL(/\/dashboard/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  const updated = await prisma.adminUser.findUniqueOrThrow({ where: { email } });
  expect(updated.totp_enabled).toBe(false);
  expect(updated.must_change_password).toBe(false);
});

