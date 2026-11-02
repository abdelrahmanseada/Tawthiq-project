import jsQR from "jsqr";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderCardPdf, type RenderCardInput } from "@/lib/pdf/card";
import { renderCardsSheet } from "@/lib/pdf/sheet";

const TOKEN = "Zx7Qp2Lm9Rt4Vw8Yb3Nc6Hd1Ks5Jf0Ga";

function input(): RenderCardInput {
  return {
    company: {
      name: "Bremer",
      logo_path: null,
      logo_bg_dark: false,
      website: "bremer.example",
      tagline: "Established 1989",
      show_verify_host_on_card: false,
      primary_color: "#0F766E",
      secondary_color: "#F59E0B",
      contact_phone: "+20 100 000 0000",
      contact_email: "hr@example.com",
      verify_base_url: "https://verify.example.com",
      time_zone: "Africa/Cairo",
      status: "ACTIVE",
    },
    employee: {
      full_name: "Amelia Hart",
      job_title: "Maintenance Technician",
      department: "Operations",
      photo_path: null,
      employee_code: "NW-0001",
    },
    expiresAt: new Date("2027-12-31T23:59:59.999Z"),
    token: TOKEN,
  };
}

async function decodePage(pdfBytes: Uint8Array, pageIndex: number, scale = 5) {
  const mupdf = await import("mupdf");
  const doc = mupdf.Document.openDocument(pdfBytes, "application/pdf");
  const page = doc.loadPage(pageIndex);
  const pixmap = page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, true);
  const width = pixmap.getWidth();
  if (process.env.SAVE_CARD_PNGS === "1") {
    mkdirSync(path.join(process.cwd(), "test-output", "cards"), { recursive: true });
    writeFileSync(path.join(process.cwd(), "test-output", "cards", `qr-${pageIndex}-${scale}.png`), pixmap.asPNG());
  }
  const height = pixmap.getHeight();
  const stride = pixmap.getStride();
  let pixels = pixmap.getPixels();
  if (stride !== width * 4) {
    const normalized = new Uint8ClampedArray(width * height * 4);
    for (let row = 0; row < height; row += 1) {
      normalized.set(pixels.subarray(row * stride, row * stride + width * 4), row * width * 4);
    }
    pixels = normalized;
  }
  return jsQR(pixels, width, height)?.data ?? null;
}

describe("card PDF QR", () => {
  it.each(["cr80", "print_shop", "test"] as const)("decodes the exact URL in %s mode", async (mode) => {
    const bytes = await renderCardPdf({ ...input(), mode });
    expect(await decodePage(bytes, 1)).toBe(`https://verify.example.com/v/${TOKEN}`);
  });

  it("decodes the QR on the mirrored A4 back sheet", async () => {
    const card = await renderCardPdf(input());
    const sheet = await renderCardsSheet([card]);
    expect(await decodePage(sheet, 1, 3)).toBe(`https://verify.example.com/v/${TOKEN}`);
  });
});
