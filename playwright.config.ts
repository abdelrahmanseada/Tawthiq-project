import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E suite. Requires a running PostgreSQL database with migrations and
 * the seed applied (see README "Tests"). The suite provisions its own administrator
 * account and resets its credentials on every run.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3010",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    locale: "en-US",
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npx next dev -p 3010 -H 0.0.0.0",
        url: "http://localhost:3010/login",
        reuseExistingServer: true,
        timeout: 180_000,
        stdout: "ignore",
        stderr: "pipe",
        env: { ...process.env, E2E_MODE: "1", APP_URL: "http://localhost:3010", AUTH_URL: "http://localhost:3010", PUBLIC_BASE_URL: "http://localhost:3010", PUBLIC_VERIFY_URL: "http://localhost:3010", REQUIRE_2FA: "false" },
      },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
