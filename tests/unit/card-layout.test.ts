import { describe, expect, it } from "vitest";
import {
  BACK,
  BACK_TEXT,
  CARD_HEIGHT_MM,
  CARD_WIDTH_MM,
  FRONT,
  SAFE_MARGIN_MM,
  accentTop,
  layoutCard,
  type CardTextInput,
  type TextBlock,
} from "@/lib/card/layout";

function input(overrides: Partial<CardTextInput> = {}): CardTextInput {
  return {
    fullName: "Amelia Hart",
    jobTitle: "Maintenance Technician",
    employeeCode: "NW-0001",
    companyName: "Bremer",
    validUntil: "21 Nov 2026",
    host: "verify.example.com",
    showVerifyHostOnCard: false,
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
  ["long host", { host: "employee-verification.services.bremer-facilities.example.com", showVerifyHostOnCard: true }],
  ["with verification address", { showVerifyHostOnCard: true }],
];

describe("card layout single source", () => {
  it("uses CR80 landscape geometry and a 4 mm safe margin", () => {
    expect(CARD_WIDTH_MM).toBe(85.6);
    expect(CARD_HEIGHT_MM).toBe(54);
    expect(SAFE_MARGIN_MM).toBe(4);
    expect(FRONT.qr.x + FRONT.qr.w).toBeLessThanOrEqual(CARD_WIDTH_MM - SAFE_MARGIN_MM);
    expect(BACK.brand.x + BACK.brand.w).toBeLessThanOrEqual(CARD_WIDTH_MM - SAFE_MARGIN_MM);
  });

  it.each(CASES)("keeps every content box inside the safe area: %s", (_label, overrides) => {
    const layout = layoutCard(input(overrides));
    const frontContent = [layout.front.name, layout.front.title].flatMap(boxes);
    const frontBlocks = [...frontContent, ...boxes(layout.front.code)];
    const backBlocks = [layout.back.brand, layout.back.claim, layout.back.established].flatMap(boxes);

    for (const block of frontBlocks) {
      expect(block.x).toBeGreaterThanOrEqual(SAFE_MARGIN_MM - 0.01);
      expect(block.x + block.w).toBeLessThanOrEqual(CARD_WIDTH_MM - SAFE_MARGIN_MM + 0.01);
      expect(block.y).toBeGreaterThanOrEqual(SAFE_MARGIN_MM - 0.01);
      expect(block.y + block.h).toBeLessThanOrEqual(CARD_HEIGHT_MM - SAFE_MARGIN_MM + 0.01);
    }
    for (const block of backBlocks) {
      expect(block.x).toBeGreaterThanOrEqual(SAFE_MARGIN_MM - 0.01);
      expect(block.x + block.w).toBeLessThanOrEqual(CARD_WIDTH_MM - SAFE_MARGIN_MM + 0.01);
      expect(block.y).toBeGreaterThanOrEqual(0);
      expect(block.y + block.h).toBeLessThanOrEqual(CARD_HEIGHT_MM);
    }
    // Text stops above the code row.
    for (const block of frontContent) expect(block.y + block.h).toBeLessThanOrEqual(layout.front.code.y);
  });

  it.each(CASES)("does not overlap text or the QR: %s", (_label, overrides) => {
    const layout = layoutCard(input(overrides));
    const front = [layout.front.name, layout.front.title].filter((block): block is TextBlock => Boolean(block));
    for (let index = 1; index < front.length; index += 1) {
      expect(overlaps(front[index - 1]!, front[index]!)).toBe(false);
    }
    const qr = { x: FRONT.qr.x, y: FRONT.qr.y, w: FRONT.qr.w, h: FRONT.qr.h };
    for (const block of [...front, layout.front.code]) expect(overlaps(block, qr)).toBe(false);
    expect(overlaps(layout.back.brand, layout.back.claim)).toBe(false);
    expect(overlaps(layout.back.claim, layout.back.established)).toBe(false);
  });

  it("sets names and titles in uppercase", () => {
    const layout = layoutCard(input({ jobTitle: "Operations Lead" }));
    expect(layout.front.name.lines.join(" ")).toBe("AMELIA HART");
    expect(layout.front.title?.lines.join(" ")).toBe("OPERATIONS LEAD");
  });

  it("draws the accent rule below the last front text block and above the code", () => {
    const layout = layoutCard(input());
    const top = accentTop(layout);
    const last = layout.front.title ?? layout.front.name;
    expect(top).toBeGreaterThan(last.y + last.h * 0.8);
    expect(top + FRONT.accent.h).toBeLessThan(layout.front.code.y);
  });

  it("keeps the front QR inside its quiet zone with >= 0.28 mm modules", () => {
    const totalModules = 25 + FRONT.qr.quietModules * 2;
    const moduleMm = FRONT.qr.w / totalModules;
    expect(moduleMm).toBeGreaterThanOrEqual(FRONT.qr.minModuleMm);
    expect(FRONT.qr.x + FRONT.qr.w).toBeLessThanOrEqual(CARD_WIDTH_MM - SAFE_MARGIN_MM);
    expect(FRONT.qr.y + FRONT.qr.h).toBeLessThanOrEqual(CARD_HEIGHT_MM - SAFE_MARGIN_MM);
  });

  it("keeps the designed back claim and establishment line", () => {
    expect(layoutCard(input()).back.claim.text).toBe(BACK_TEXT.claim);
    expect(layoutCard(input()).back.established.text).toBe(BACK_TEXT.established);
  });
});
