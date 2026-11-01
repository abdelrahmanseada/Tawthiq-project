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
    companyName: "Northwind Demo",
    validUntil: "21 Nov 2026",
    host: "verify.example.com",
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
  ["40-character company", { companyName: "Northwind International Facilities Group" }],
  ["no logo", { companyName: "Contoso Demo" }],
  ["no photo", { hasPhoto: false }],
  ["identical department and title", { department: "Operations", jobTitle: "Operations" }],
  ["very long e-mail", { email: "people.operations.and.human.resources@very-long-company-domain.example" }],
  ["long host", { host: "employee-verification.services.northwind-facilities.example.com" }],
];

describe("card layout single source", () => {
  it("uses CR80 landscape geometry and a 4 mm safe margin", () => {
    expect(CARD_WIDTH_MM).toBe(85.6);
    expect(CARD_HEIGHT_MM).toBe(54);
    expect(SAFE_MARGIN_MM).toBe(4);
    expect(FRONT.photo.x).toBeGreaterThanOrEqual(4);
    expect(FRONT.photo.y + FRONT.photo.h).toBeLessThanOrEqual(45);
    expect(BACK.qr.x + BACK.qr.w).toBeLessThanOrEqual(BACK.column.x);
  });

  it.each(CASES)("keeps every content box inside the safe area: %s", (_label, overrides) => {
    const layout = layoutCard(input(overrides));
    const frontContent = [layout.front.name, layout.front.title, layout.front.department].flatMap(boxes);
    const frontBlocks = [...frontContent, ...boxes(layout.front.code), ...boxes(layout.front.validUntil)];
    const backBlocks = [
      layout.back.heading,
      layout.back.host,
      layout.back.phone,
      layout.back.email,
      layout.back.returns,
      layout.back.footer,
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
    for (const block of backBlocks.slice(0, -1)) expect(block.y + block.h).toBeLessThanOrEqual(44.01);
  });

  it.each(CASES)("does not overlap text or the QR panel: %s", (_label, overrides) => {
    const layout = layoutCard(input(overrides));
    const front = [layout.front.name, layout.front.title, layout.front.department].filter((block): block is TextBlock => Boolean(block));
    for (let index = 1; index < front.length; index += 1) {
      expect(overlaps(front[index - 1]!, front[index]!)).toBe(false);
    }
    expect(overlaps(layout.front.name, { x: FRONT.photo.x, y: FRONT.photo.y, w: FRONT.photo.w, h: FRONT.photo.h })).toBe(false);

    const back = [layout.back.heading, layout.back.host, layout.back.phone, layout.back.email, layout.back.returns];
    for (let index = 1; index < back.length; index += 1) {
      expect(overlaps(back[index - 1]!, back[index]!)).toBe(false);
    }
    const qrPanel = { x: BACK.panel.x, y: BACK.panel.y, w: BACK.panel.w, h: BACK.panel.h };
    for (const block of back) expect(overlaps(block, qrPanel)).toBe(false);
  });

  it("prints identical department and job title only once", () => {
    const layout = layoutCard(input({ department: "Operations", jobTitle: "operations" }));
    expect(layout.front.title?.text.toLowerCase()).toBe("operations");
    expect(layout.front.department).toBeNull();
  });

  it("keeps the QR inside its 30 mm panel with a four-module quiet zone and >= 0.45 mm modules", () => {
    const totalModules = 25 + BACK.qr.quietModules * 2;
    const moduleMm = BACK.qr.w / totalModules;
    expect(moduleMm).toBeGreaterThanOrEqual(BACK.qr.minModuleMm);
    expect(BACK.qr.x).toBeGreaterThanOrEqual(BACK.panel.x);
    expect(BACK.qr.y).toBeGreaterThanOrEqual(BACK.panel.y);
    expect(BACK.qr.x + BACK.qr.w).toBeLessThanOrEqual(BACK.panel.x + BACK.panel.w);
    expect(BACK.qr.y + BACK.qr.h).toBeLessThanOrEqual(BACK.panel.y + BACK.panel.h);
  });
});
