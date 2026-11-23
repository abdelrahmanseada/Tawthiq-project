import { describe, expect, it } from "vitest";
import { cardQrFit, measureVerifyBaseUrl, QrCapacityError, buildVerifyUrl } from "@/lib/qr";
import { renderCardPdf, type RenderCardInput } from "@/lib/pdf/card";

const TOKEN = "Zx7Qp2Lm9Rt4Vw8Yb3Nc6Hd1Ks5Jf0Ga";
const LONG_TUNNEL = "https://corn-seem-barbara-dirt.trycloudflare.com";
const PRODUCTION_HOST = "https://verify.bremer-eg.com";

function input(verifyBaseUrl: string): RenderCardInput {
  return {
    company: {
      name: "Bremer",
      website: "bremer-eg.com",
      tagline: "Established 1989",
      show_verify_host_on_card: false,
      primary_color: "#0F766E",
      secondary_color: "#F59E0B",
      contact_phone: "+20 100 000 0000",
      contact_email: "hr@bremer-eg.com",
      verify_base_url: verifyBaseUrl,
      time_zone: "Africa/Cairo",
      status: "ACTIVE",
    },
    employee: {
      full_name: "Amelia Hart",
      job_title: "Maintenance Technician",
      employee_code: "BR-0001",
    },
    expiresAt: new Date("2027-12-31T23:59:59.999Z"),
    token: TOKEN,
  };
}

describe("card QR capacity", () => {
  it("rejects a matrix that is denser than the print minimum", () => {
    const fit = cardQrFit(45, 83);
    expect(fit.totalModules).toBe(45);
    expect(fit.moduleMm).toBeLessThan(fit.minModuleMm);
    expect(fit.ok).toBe(false);
  });

  it("accepts the matrix produced by a short production host", () => {
    const fit = cardQrFit(37, 62);
    expect(fit.moduleMm).toBeGreaterThanOrEqual(fit.minModuleMm);
    expect(fit.ok).toBe(true);
  });

  it("fits the production verification host and reports the host budget", async () => {
    const fit = await measureVerifyBaseUrl(PRODUCTION_HOST);
    expect(fit.ok).toBe(true);
    expect(fit.hostLength).toBe("verify.bremer-eg.com".length);
    expect(fit.maxHostLength).toBe(31);
  });

  it("refuses a long tunnel host and says how long the host may be", async () => {
    const fit = await measureVerifyBaseUrl(LONG_TUNNEL);
    expect(fit.ok).toBe(false);
    expect(fit.hostLength).toBeGreaterThan(fit.maxHostLength);
    expect(fit.maxHostLength).toBe(31);
  });

  it("does not render a card whose QR cannot be printed, and names the fix", async () => {
    const error = await renderCardPdf(input(LONG_TUNNEL)).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(QrCapacityError);
    expect((error as QrCapacityError).host).toBe("corn-seem-barbara-dirt.trycloudflare.com");
    expect((error as Error).message).toContain("Use a shorter verification domain");
  });

  it("still renders a card for a host inside the budget", async () => {
    const bytes = await renderCardPdf(input(PRODUCTION_HOST));
    expect(bytes.byteLength).toBeGreaterThan(1000);
    expect(buildVerifyUrl(PRODUCTION_HOST, TOKEN).startsWith(PRODUCTION_HOST)).toBe(true);
  });
});
