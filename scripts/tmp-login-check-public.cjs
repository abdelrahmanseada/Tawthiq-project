const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().includes("/login")) {
      console.log("REQ", r.url());
      console.log("HEADERS", JSON.stringify(r.headers(), null, 2));
      console.log("POSTDATA", (r.postData() || "").slice(0, 1500));
    }
  });
  page.on("response", async (r) => {
    if (r.status() >= 400) console.log("HTTP", r.status(), r.url(), (await r.text()).slice(0, 500));
  });
  await page.goto("https://corn-seem-barbara-dirt.trycloudflare.com/login", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.fill('input[name="email"]', "owner@bremer.example");
  await page.fill('input[name="password"]', "ChangeMe!2026");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(6000);
  console.log("AFTER", page.url());
  await browser.close();
})();
