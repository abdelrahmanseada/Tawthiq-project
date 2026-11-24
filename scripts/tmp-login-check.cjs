const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on("console", (m) => console.log("CONSOLE", m.type(), m.text()));
  page.on("response", (r) => {
    if (r.status() >= 400) console.log("HTTP", r.status(), r.url());
  });
  await page.goto("http://localhost:3000/login", { waitUntil: "networkidle" });
  console.log("LOADED", page.url(), await page.title());
  await page.fill('input[name="email"]', "owner@bremer.example");
  await page.fill('input[name="password"]', "ChangeMe!2026");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(5000);
  console.log("AFTER", page.url());
  console.log((await page.textContent("body")).slice(0, 800));
  await browser.close();
})();
