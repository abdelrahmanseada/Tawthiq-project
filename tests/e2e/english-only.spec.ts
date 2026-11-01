import { expect, test } from "@playwright/test";
import { decryptCardToken } from "../../lib/security/crypto";
import { ensureE2eAdmin, loginAsAdmin, prisma, type E2eAdmin } from "./helpers";

const ARABIC = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/u;
let admin: E2eAdmin;

test.beforeAll(async () => {
  admin = await ensureE2eAdmin();
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("company pages contain no Arabic text", async ({ page }) => {
  await loginAsAdmin(page, admin);
  for (const path of ["/dashboard", "/employees", "/cards", "/imports", "/logs/scans", "/logs/audit", "/analytics", "/settings", "/admins", "/status", "/account", "/onboarding"]) {
    await page.goto(path);
    const body = await page.locator("body").innerText();
    expect(body, `${path} contains Arabic`).not.toMatch(ARABIC);
    expect(await page.locator("html").getAttribute("lang")).toBe("en");
    expect(await page.locator("html").getAttribute("dir")).toBe("ltr");
  }
});

test("platform console contains no Arabic and uses product branding", async ({ page }) => {
  await page.goto("/login");
  await page.fill('input[name="email"]', process.env.PLATFORM_ADMIN_EMAIL ?? "platform@tawthiq.example");
  await page.fill('input[name="password"]', process.env.PLATFORM_ADMIN_PASSWORD ?? "ChangeMe!2026");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/platform/);
  for (const path of ["/platform", "/platform/companies", "/platform/companies/new"]) {
    await page.goto(path);
    const body = await page.locator("body").innerText();
    expect(body, `${path} contains Arabic`).not.toMatch(ARABIC);
    expect(body).toMatch(/platform console/i);
    expect(body).toContain("Tawthiq");
  }
});

test("verify states are English and unknown tokens use neutral product branding", async ({ page }) => {
  const card = await prisma.card.findFirstOrThrow({
    where: { status: "ACTIVE", token_enc: { not: null }, employee: { company: { slug: "northwind-demo" }, deleted_at: null } },
  });
  const token = decryptCardToken(card.token_enc)!;
  await page.goto(`/v/${token}`);
  const validBody = await page.locator("body").innerText();
  expect(validBody).not.toMatch(ARABIC);
  expect(validBody).toContain("Northwind Demo");
  expect(validBody).toContain("Verified by Tawthiq");

  await page.goto(`/v/${"B".repeat(32)}`);
  const invalidBody = await page.locator("body").innerText();
  expect(invalidBody).not.toMatch(ARABIC);
  expect(invalidBody).toContain("Tawthiq");
  expect(invalidBody).not.toContain("Northwind Demo");
  expect(invalidBody).not.toContain("Contoso Demo");
});
