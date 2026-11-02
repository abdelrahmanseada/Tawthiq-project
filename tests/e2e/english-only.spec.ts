import { expect, test } from "@playwright/test";
import { encryptCardToken } from "../../lib/security/crypto";
import { ensureE2eAdmin, loginAsAdmin, newCardToken, prisma, sha256, type E2eAdmin } from "./helpers";

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

test("verify states are English and unknown tokens use neutral product branding", async ({ page }) => {
  const employee = await prisma.employee.findFirstOrThrow({
    where: { company: { slug: "bremer" }, status: "ACTIVE", deleted_at: null },
  });
  const token = newCardToken();
  const card = await prisma.card.create({
    data: {
      employee_id: employee.id,
      token_hash: sha256(token),
      token_prefix: token.slice(0, 6),
      token_enc: encryptCardToken(token),
      status: "ACTIVE",
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });
  try {
    await page.goto(`/v/${token}`);
    const validBody = await page.locator("body").innerText();
    expect(validBody).not.toMatch(ARABIC);
    expect(validBody).toContain("Bremer");
    expect(validBody).toContain("© 2026 Tawthiq");

    await page.goto(`/v/${"B".repeat(32)}`);
    const invalidBody = await page.locator("body").innerText();
    expect(invalidBody).not.toMatch(ARABIC);
    expect(invalidBody).toContain("Tawthiq");
  } finally {
    await prisma.card.delete({ where: { id: card.id } });
  }
});
