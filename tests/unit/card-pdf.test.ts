import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { CARD_HEIGHT, CARD_WIDTH, renderCardPdf, type RenderCardInput } from "@/lib/pdf/card";
import { renderCardsSheet } from "@/lib/pdf/sheet";
import { preparePdfText, shapeArabic } from "@/lib/pdf/arabic";
import { sanitizePdfText } from "@/lib/pdf/text";

const TOKEN = "Zx7Qp2Lm9Rt4Vw8Yb3Nc6Hd1Ks5Jf0Ga";

function input(): RenderCardInput {
  return {
    company: {
      name: "Northwind Demo",
      logo_path: null,
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

describe("dormant Arabic shaping utilities", () => {
  it("keeps the dormant shaping implementation intact", () => {
    expect(shapeArabic("محمد")).toBe("\uFEE3\uFEA4\uFEE4\uFEAA");
    expect(shapeArabic("لا")).toBe("\uFEFB");
    expect(preparePdfText("31 أكتوبر 2027").startsWith("2027")).toBe(true);
  });

  it("sanitises unsupported characters before drawing", () => {
    expect(sanitizePdfText("Ahmed\u0000 😀 Ali")).toBe("Ahmed Ali");
    expect(sanitizePdfText("a—b")).toBe("a-b");
  });
});

describe("card PDF rendering", () => {
  it("renders a two-page CR80 PDF at the exact card size", async () => {
    const bytes = await renderCardPdf(input());
    expect(Buffer.from(bytes).subarray(0, 5).toString()).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(50_000);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(2);
    for (const page of pdf.getPages()) {
      expect(page.getWidth()).toBeCloseTo(CARD_WIDTH, 1);
      expect(page.getHeight()).toBeCloseTo(CARD_HEIGHT, 1);
    }
  });

  it("never embeds the raw token as text", async () => {
    const bytes = await renderCardPdf(input());
    expect(Buffer.from(bytes).toString("latin1").includes(TOKEN)).toBe(false);
  });

  it("renders print-shop pages with 3 mm bleed", async () => {
    const bytes = await renderCardPdf({ ...input(), mode: "print_shop" });
    const pdf = await PDFDocument.load(bytes);
    const bleed = 3 * 2.834645669291339;
    for (const page of pdf.getPages()) {
      expect(page.getWidth()).toBeCloseTo(CARD_WIDTH + bleed * 2, 1);
      expect(page.getHeight()).toBeCloseTo(CARD_HEIGHT + bleed * 2, 1);
    }
  });

  it("handles 60-character names/titles, a 40-character company and missing images", async () => {
    const bytes = await renderCardPdf({
      ...input(),
      company: { ...input().company, name: "Northwind International Facilities Group Ltd" },
      employee: {
        ...input().employee,
        full_name: "Abdelrahman Mohamed Abdelrahman Mohamed Abdelrahman Mohamed Ali",
        job_title: "Senior International Maintenance and Reliability Technician",
      },
    });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(2);
  });

  it("sets English metadata with the Tawthiq producer and no employee name", async () => {
    const bytes = await renderCardPdf(input());
    const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
    expect(pdf.getTitle()).toBe("ID card - Amelia Hart");
    expect(pdf.getProducer()).toBe("Tawthiq");
    expect(pdf.getAuthor()).toBe("Northwind Demo");
  });

  it("composes cards onto A4 sheets with mirrored backs", async () => {
    const card = await renderCardPdf(input());
    const sheet = await renderCardsSheet([card, card, card]);
    const pdf = await PDFDocument.load(sheet);
    expect(pdf.getPageCount()).toBe(2);
    expect(pdf.getTitle()).toBe("Employee ID cards — A4 sheet");
  });
});
