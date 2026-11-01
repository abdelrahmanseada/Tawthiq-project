import "dotenv/config";
import { mkdir } from "node:fs/promises";
import { chromium, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { decryptCardToken } from "@/lib/security/crypto";

const BASE = process.env.APP_URL ?? "http://localhost:3000";
const OUT = "screenshots/v2";
const prisma = new PrismaClient();

async function shot(page: Page, name: string, fullPage = true) {
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage });
  console.log("shot", name);
}

async function loginOwner(page: Page) {
  await page.goto(`${BASE}/login`);
  await page.fill('input[name="email"]', process.env.SEED_SUPERADMIN_EMAIL ?? "admin@example.com");
  await page.fill('input[name="password"]', process.env.SEED_SUPERADMIN_PASSWORD ?? "ChangeMe!2026");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/change-password/);
  await page.fill('input[name="current_password"]', process.env.SEED_SUPERADMIN_PASSWORD ?? "ChangeMe!2026");
  await page.fill('input[name="new_password"]', "NewPassword!2026");
  await page.fill('input[name="confirm_password"]', "NewPassword!2026");
  await page.locator('main form button[type="submit"]').first().click();
  await page.waitForURL(/\/dashboard/);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();

  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: "light" });
  const page = await context.newPage();
  await page.goto(`${BASE}/login`);
  await shot(page, "login-light");
  await loginOwner(page);
  await shot(page, "dashboard-light");

  const employeeId = (await prisma.employee.findFirstOrThrow({ where: { company: { slug: "northwind-demo" }, deleted_at: null }, orderBy: { employee_code: "asc" } })).id;
  const routes: Array<[string, string]> = [
    ["employees", "/employees"],
    ["employee-detail", `/employees/${employeeId}`],
    ["employee-card", `/employees/${employeeId}?tab=card`],
    ["cards", "/cards"],
    ["imports", "/imports"],
    ["scan-log", "/logs/scans"],
    ["audit-log", "/logs/audit"],
    ["analytics", "/analytics"],
    ["settings", "/settings"],
    ["admins", "/admins"],
    ["status", "/status"],
    ["account", "/account"],
    ["onboarding", "/onboarding"],
  ];
  for (const [name, path] of routes) {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    await shot(page, name);
  }

  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await shot(page, "dashboard-dark");
  await page.goto(`${BASE}/employees`, { waitUntil: "networkidle" });
  await shot(page, "employees-dark");
  await page.emulateMedia({ colorScheme: "light" });

  const card = await prisma.card.findFirstOrThrow({ where: { status: "ACTIVE", token_enc: { not: null }, employee: { company: { slug: "northwind-demo" }, deleted_at: null } } });
  const token = decryptCardToken(card.token_enc)!;
  const verify = await context.newPage();
  await verify.goto(`${BASE}/v/${token}`, { waitUntil: "networkidle" });
  await shot(verify, "verify-valid");
  await verify.goto(`${BASE}/v/${"B".repeat(32)}`, { waitUntil: "networkidle" });
  await shot(verify, "verify-invalid");
  await verify.emulateMedia({ colorScheme: "dark" });
  await verify.goto(`${BASE}/v/${token}`, { waitUntil: "networkidle" });
  await shot(verify, "verify-valid-dark");

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const phone = await mobile.newPage();
  await phone.goto(`${BASE}/login`);
  await shot(phone, "login-mobile");
  await phone.close();

  const platformContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const platform = await platformContext.newPage();
  await platform.goto(`${BASE}/login`);
  await platform.fill('input[name="email"]', process.env.PLATFORM_ADMIN_EMAIL ?? "platform@tawthiq.example");
  await platform.fill('input[name="password"]', process.env.PLATFORM_ADMIN_PASSWORD ?? "ChangeMe!2026");
  await platform.click('button[type="submit"]');
  await platform.waitForURL(/\/platform/);
  await shot(platform, "platform-overview");
  await platform.goto(`${BASE}/platform/companies`, { waitUntil: "networkidle" });
  await shot(platform, "platform-companies");
  await platform.goto(`${BASE}/platform/companies/new`, { waitUntil: "networkidle" });
  await shot(platform, "platform-create-company");
  const northwind = await prisma.company.findUniqueOrThrow({ where: { slug: "northwind-demo" } });
  await platform.goto(`${BASE}/platform/companies/${northwind.id}`, { waitUntil: "networkidle" });
  await shot(platform, "platform-company-detail");

  await browser.close();
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
