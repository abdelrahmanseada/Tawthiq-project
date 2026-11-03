import { describe, expect, it } from "vitest";
import {
  BACK,
  CARD_HEIGHT_MM,
  CARD_WIDTH_MM,
  FRONT,
  SAFE_MARGIN_MM,
  layoutCard,
  type CardTextInput,
  type TextBlock,
} from "@/lib/card/layout";

function input(overrides: Partial<CardTextInput> = {}): CardTextInput {
  return {
    fullName: "Amelia Hart",
    jobTitle: "Maintenance Technician",
    department: "Operations",
    employeeCode: "NW-0001",
    companyName: "Bremer",
    validUntil: "21 Nov 2026",
    host: "verify.example.com",
    website: "bremer.example",
    tagline: "Established 1989",
    showVerifyHostOnCard: false,
    phone: "+20 100 000 0000",
    email: "hr@example.com",
    hasPhoto: true,
    ...overrides,
  };
}

function boxes(block: TextBlock | null) {
  if (!block) return [];
  return [{ x: block.x, y: block.y, w: block.w, h: block.h }];
}

function overlaps(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

const CASES: Array<[string, Partial<CardTextInput>]> = [
  ["normal", {}],
  ["60-character name", { fullName: "Abdelrahman Mohamed Abdelrahman Mohamed Abdelrahman Mohamed Ali" }],
  ["60-character job title", { jobTitle: "Senior International Maintenance and Reliability Technician Lead" }],
  ["40-character company", { companyName: "Bremer International Facilities Group" }],
  ["no logo", { companyName: "Bremer" }],
  ["no photo", { hasPhoto: false }],
  ["identical department and title", { department: "Operations", jobTitle: "Operations" }],
  ["very long e-mail", { email: "people.operations.and.human.resources@very-long-company-domain.example" }],
  ["long host", { host: "employee-verification.services.bremer-facilities.example.com", showVerifyHostOnCard: true }],
  ["long website", { website: "https://people.operations.human-resources.bremer.example" }],
  ["no tagline", { tagline: null }],
  ["with verification address", { showVerifyHostOnCard: true }],
];

describe("card layout single source", () => {
  it("uses CR80 landscape geometry and a 4 mm safe margin", () => {
    expect(CARD_WIDTH_MM).toBe(85.6);
    expect(CARD_HEIGHT_MM).toBe(54);
    expect(SAFE_MARGIN_MM).toBe(4);
    expect(FRONT.photo.x).toBeGreaterThanOrEqual(4);
    expect(FRONT.photo.y + FRONT.photo.h).toBeLessThanOrEqual(45);
    expect(FRONT.qrPanel.x + FRONT.qrPanel.w).toBeLessThanOrEqual(CARD_WIDTH_MM - SAFE_MARGIN_MM);
    expect(FRONT.qr.x + FRONT.qr.w).toBeLessThanOrEqual(FRONT.qrPanel.x + FRONT.qrPanel.w);
    expect(BACK.logo.x + BACK.logo.w).toBeLessThanOrEqual(CARD_WIDTH_MM - SAFE_MARGIN_MM);
  });

  it.each(CASES)("keeps every content box inside the safe area: %s", (_label, overrides) => {
    const layout = layoutCard(input(overrides));
    const frontContent = [layout.front.name, layout.front.title, layout.front.department].flatMap(boxes);
    const frontBlocks = [...frontContent, ...boxes(layout.front.code), ...boxes(layout.front.validUntil)];
    const backBlocks = [
      layout.back.company,
      layout.back.tagline,
      layout.back.website,
      layout.back.host,
    ].flatMap(boxes);

    for (const block of frontBlocks) {
      expect(block.x).toBeGreaterThanOrEqual(SAFE_MARGIN_MM - 0.01);
      expect(block.x + block.w).toBeLessThanOrEqual(CARD_WIDTH_MM - SAFE_MARGIN_MM + 0.01);
      expect(block.y).toBeGreaterThanOrEqual(SAFE_MARGIN_MM - 0.01);
      expect(block.y + block.h).toBeLessThanOrEqual(CARD_HEIGHT_MM - SAFE_MARGIN_MM + 0.01);
    }
    for (const block of backBlocks) {
      expect(block.x).toBeGreaterThanOrEqual(SAFE_MARGIN_MM - 0.01);
      expect(block.x + block.w).toBeLessThanOrEqual(CARD_WIDTH_MM - SAFE_MARGIN_MM + 0.01);
      expect(block.y).toBeGreaterThanOrEqual(SAFE_MARGIN_MM - 0.01);
      expect(block.y + block.h).toBeLessThanOrEqual(CARD_HEIGHT_MM - SAFE_MARGIN_MM + 0.01);
    }
    // Text stops above the footer row.
    for (const block of frontContent) expect(block.y + block.h).toBeLessThanOrEqual(45.01);
    for (const block of backBlocks) expect(block.y + block.h).toBeLessThanOrEqual(50.01);
  });

  it.each(CASES)("does not overlap text or the QR panel: %s", (_label, overrides) => {
    const layout = layoutCard(input(overrides));
    const front = [layout.front.name, layout.front.title, layout.front.department].filter((block): block is TextBlock => Boolean(block));
    for (let index = 1; index < front.length; index += 1) {
      expect(overlaps(front[index - 1]!, front[index]!)).toBe(false);
    }
    expect(overlaps(layout.front.name, { x: FRONT.photo.x, y: FRONT.photo.y, w: FRONT.photo.w, h: FRONT.photo.h })).toBe(false);

    const back = [layout.back.company, layout.back.tagline, layout.back.website, layout.back.host].filter((block): block is TextBlock => block !== null);
    for (let index = 1; index < back.length; index += 1) {
      expect(overlaps(back[index - 1]!, back[index]!)).toBe(false);
    }
    const logoBox = { x: BACK.logo.x, y: BACK.logo.y, w: BACK.logo.w, h: BACK.logo.h };
    for (const block of back) expect(overlaps(block, logoBox)).toBe(false);
    const qrPanel = { x: FRONT.qrPanel.x, y: FRONT.qrPanel.y, w: FRONT.qrPanel.w, h: FRONT.qrPanel.h };
    for (const block of [layout.front.name, layout.front.title, layout.front.department, layout.front.code, layout.front.validUntil].filter((block): block is TextBlock => Boolean(block))) {
      expect(overlaps(block, qrPanel)).toBe(false);
    }
  });

  it("prints identical department and job title only once", () => {
    const layout = layoutCard(input({ department: "Operations", jobTitle: "operations" }));
    expect(layout.front.title?.text.toLowerCase()).toBe("operations");
    expect(layout.front.department).toBeNull();
  });

  it("keeps the front QR inside its quiet panel with a four-module quiet zone and >= 0.45 mm modules", () => {
    const totalModules = 25 + FRONT.qr.quietModules * 2;
    const moduleMm = FRONT.qr.w / totalModules;
    expect(moduleMm).toBeGreaterThanOrEqual(FRONT.qr.minModuleMm);
    expect(FRONT.qr.x).toBeGreaterThanOrEqual(FRONT.qrPanel.x);
    expect(FRONT.qr.y).toBeGreaterThanOrEqual(FRONT.qrPanel.y);
    expect(FRONT.qr.x + FRONT.qr.w).toBeLessThanOrEqual(FRONT.qrPanel.x + FRONT.qrPanel.w);
    expect(FRONT.qr.y + FRONT.qr.h).toBeLessThanOrEqual(FRONT.qrPanel.y + FRONT.qrPanel.h);
  });
});
