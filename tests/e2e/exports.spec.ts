import { expect, test } from "@playwright/test";
import { ensureE2eAdmin, loginAsAdmin } from "./helpers";

test("employee CSV export downloads without a server error", async ({ page }) => {
  const admin = await ensureE2eAdmin();
  await loginAsAdmin(page, admin);
  const result = await page.evaluate(async () => {
    const response = await fetch("/api/admin/employees/export?format=csv");
    return {
      status: response.status,
      type: response.headers.get("content-type") ?? "",
      text: (await response.text()).slice(0, 120),
    };
  });
  expect(result.status).toBe(200);
  expect(result.type).toContain("text/csv");
  expect(result.text).toContain("Employee code");
});
