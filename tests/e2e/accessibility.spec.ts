import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { decryptCardToken } from "../../lib/security/crypto";
import { ensureE2eAdmin, loginAsAdmin, prisma, type E2eAdmin } from "./helpers";

test.use({ reducedMotion: "reduce" });

let admin: E2eAdmin;

test.beforeAll(async () => {
  admin = await ensureE2eAdmin();
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

async function scan(page: import("@playwright/test").Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const violations = results.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical");
  if (violations.length > 0) {
    console.log(
      JSON.stringify(
        violations.map((violation) => ({
          id: violation.id,
          impact: violation.impact,
          nodes: violation.nodes.map((node) => ({ target: node.target, html: node.html, summary: node.failureSummary })),
        })),
        null,
        2,
      ),
    );
  }
  return violations;
}

test("login has no serious or critical axe violations", async ({ page }) => {
  await page.goto("/login");
  expect(await scan(page)).toEqual([]);
});

test("dashboard and employees have no serious or critical axe violations", async ({ page }) => {
  await loginAsAdmin(page, admin);
  await page.goto("/dashboard");
  expect(await scan(page)).toEqual([]);
  await page.goto("/employees");
  expect(await scan(page)).toEqual([]);
});

test("verification states have no serious or critical axe violations", async ({ page }) => {
  const card = await prisma.card.findFirstOrThrow({
    where: { status: "ACTIVE", token_enc: { not: null }, employee: { status: "ACTIVE", deleted_at: null } },
  });
  const token = decryptCardToken(card.token_enc)!;
  await page.goto(`/v/${token}`);
  expect(await scan(page)).toEqual([]);
  await page.goto(`/v/${"B".repeat(32)}`);
  expect(await scan(page)).toEqual([]);
});
