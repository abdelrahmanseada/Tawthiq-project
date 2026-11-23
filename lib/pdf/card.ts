import { PDFDocument, PDFFont, rgb, type PDFPage } from "pdf-lib";
import {
  BACK,
  CARD_COLORS,
  CARD_HEIGHT_MM,
  CARD_WIDTH_MM,
  FRONT,
  MM_TO_PT,
  accentTop,
  layoutCard,
  type TextBlock,
} from "@/lib/card/layout";
// MM_TO_PT keeps the exported point dimensions below in sync with the layout.
import { buildVerifyUrl, cardQrFit, displayVerifyDomain, QrCapacityError, qrModules } from "@/lib/qr";
import { formatDate } from "@/lib/format";
import { embedPdfFonts, pdfColor, type CardFontFamily } from "@/lib/pdf/assets";

export const CARD_WIDTH = CARD_WIDTH_MM * MM_TO_PT;
export const CARD_HEIGHT = CARD_HEIGHT_MM * MM_TO_PT;

export type CardPrintMode = "cr80" | "print_shop" | "test";

export interface CardCompanyData {
  name: string;
  primary_color: string;
  secondary_color: string;
  contact_phone: string;
  contact_email: string;
  verify_base_url: string;
  website: string | null;
  tagline: string;
  show_verify_host_on_card: boolean;
  time_zone?: string;
  status?: "ACTIVE" | "SUSPENDED";
}

export interface CardEmployeeData {
  full_name: string;
  job_title: string | null;
  employee_code: string;
}

export interface RenderCardInput {
  company: CardCompanyData;
  employee: CardEmployeeData;
  expiresAt: Date;
  token: string;
  mode?: CardPrintMode;
}

interface PageGeometry {
  pageWidth: number;
  pageHeight: number;
  originX: number;
  originY: number;
  bleed: number;
}

const MM = (value: number) => value * MM_TO_PT;

function geometry(mode: CardPrintMode): PageGeometry {
  if (mode === "print_shop") {
    const bleed = 3;
    return {
      pageWidth: MM(CARD_WIDTH_MM + bleed * 2),
      pageHeight: MM(CARD_HEIGHT_MM + bleed * 2),
      originX: MM(bleed),
      originY: MM(bleed),
      bleed: MM(bleed),
    };
  }
  return { pageWidth: MM(CARD_WIDTH_MM), pageHeight: MM(CARD_HEIGHT_MM), originX: 0, originY: 0, bleed: 0 };
}

function x(page: PageGeometry, mm: number): number {
  return page.originX + MM(mm);
}

/** pdf-lib uses bottom-left origin: convert a top-left box to a baseline. */
function y(page: PageGeometry, mm: number): number {
  return page.pageHeight - page.originY - MM(mm);
}

function lineWidth(text: string, font: PDFFont, fontSizePt: number, trackingEm: number): number {
  let width = 0;
  const glyphs = [...text];
  for (const glyph of glyphs) width += font.widthOfTextAtSize(glyph, fontSizePt);
  return width + Math.max(0, glyphs.length - 1) * trackingEm * fontSizePt;
}

function drawBlock(
  page: PDFPage,
  geometryValue: PageGeometry,
  text: TextBlock,
  fonts: CardFontFamily,
) {
  const font = fonts[text.font];
  const color = pdfColor(text.color);
  for (let index = 0; index < text.lines.length; index += 1) {
    const line = text.lines[index]!;
    const width = lineWidth(line, font, text.fontSizePt, text.trackingEm);
    let cursor =
      text.align === "right"
        ? x(geometryValue, text.x + text.w) - width
        : text.align === "center"
          ? x(geometryValue, text.x + text.w / 2) - width / 2
          : x(geometryValue, text.x);
    const baseline = y(geometryValue, text.baselines[index] ?? text.baselines[0] ?? 0);
    for (const glyph of line) {
      page.drawText(glyph, {
        x: cursor,
        y: baseline,
        size: text.fontSizePt,
        font,
        color,
      });
      cursor += font.widthOfTextAtSize(glyph, text.fontSizePt) + text.trackingEm * text.fontSizePt;
    }
  }
}

function drawTestPattern(
  page: PDFPage,
  g: PageGeometry,
  font: PDFFont,
) {
  const size = 7;
  for (let row = 0; row < 7; row += 1) {
    for (let column = 0; column < 5; column += 1) {
      page.drawText("TEST", {
        x: x(g, 5 + column * 17),
        y: y(g, 9 + row * 7),
        size,
        font,
        color: rgb(1, 1, 1),
        opacity: 0.06,
      });
    }
  }
}

function drawTestBand(page: PDFPage, g: PageGeometry, font: PDFFont) {
  const band = BACK.testBand;
  page.drawRectangle({
    x: x(g, band.x),
    y: y(g, band.y + band.h),
    width: MM(band.w),
    height: MM(band.h),
    color: pdfColor(CARD_COLORS.test),
  });
  const label = "TEST PRINT - NOT VALID";
  const width = font.widthOfTextAtSize(label, 6);
  page.drawText(label, {
    x: x(g, CARD_WIDTH_MM / 2) - width / 2,
    y: y(g, band.y + 2.1),
    size: 6,
    font,
    color: rgb(1, 1, 1),
  });
}

function roundedRectPath(w: number, h: number, radius: number): string {
  const r = Math.min(radius, w / 2, h / 2);
  return [
    `M ${r} 0`,
    `L ${w - r} 0`,
    `Q ${w} 0 ${w} ${r}`,
    `L ${w} ${h - r}`,
    `Q ${w} ${h} ${w - r} ${h}`,
    `L ${r} ${h}`,
    `Q 0 ${h} 0 ${h - r}`,
    `L 0 ${r}`,
    `Q 0 0 ${r} 0`,
    "Z",
  ].join(" ");
}

function drawRoundedRect(
  page: PDFPage,
  g: PageGeometry,
  left: number,
  top: number,
  w: number,
  h: number,
  radius: number,
  color: ReturnType<typeof pdfColor>,
) {
  page.drawSvgPath(roundedRectPath(MM(w), MM(h), MM(radius)), {
    x: x(g, left),
    y: y(g, top),
    color,
  });
}

async function drawFront(
  pdf: PDFDocument,
  g: PageGeometry,
  input: RenderCardInput,
  fonts: CardFontFamily,
  testFont: PDFFont,
  test: boolean,
  watermarkFont: PDFFont | null,
) {
  const page = pdf.addPage([g.pageWidth, g.pageHeight]);
  const layout = layoutCard({
    fullName: input.employee.full_name,
    jobTitle: input.employee.job_title,
    employeeCode: input.employee.employee_code,
    companyName: input.company.name,
    validUntil: formatDate(input.expiresAt, "en", input.company.time_zone),
    host: input.company.show_verify_host_on_card ? displayVerifyDomain(input.company.verify_base_url) : null,
    showVerifyHostOnCard: input.company.show_verify_host_on_card,
  });
  const verifyUrl = buildVerifyUrl(input.company.verify_base_url, input.token);
  const qr = await qrModules(verifyUrl);
  const fit = cardQrFit(qr.size, verifyUrl.length);
  if (!fit.ok) throw new QrCapacityError(verifyUrl, fit);
  const moduleMm = fit.moduleMm;

  page.drawRectangle({ x: 0, y: 0, width: g.pageWidth, height: g.pageHeight, color: pdfColor(CARD_COLORS.front) });

  if (test && watermarkFont) drawTestPattern(page, g, watermarkFont);

  // White modules on the dark card, matching the reference artwork.
  const moduleSize = MM(moduleMm);
  const qrOriginX = x(g, FRONT.qr.x);
  const qrTopY = y(g, FRONT.qr.y);
  for (let row = 0; row < qr.size; row += 1) {
    for (let column = 0; column < qr.size; column += 1) {
      if (!qr.modules[row]?.[column]) continue;
      page.drawRectangle({
        x: qrOriginX + column * moduleSize,
        y: qrTopY - (row + 1) * moduleSize,
        width: moduleSize,
        height: moduleSize,
        color: rgb(1, 1, 1),
      });
    }
  }

  // Square, contrast-safe finder eyes for print: white frame, dark ring, red core.
  const eyes: Array<[number, number]> = [
    [0, 0],
    [qr.size - 7, 0],
    [0, qr.size - 7],
  ];
  for (const [row, column] of eyes) {
    const left = FRONT.qr.x + column * moduleMm;
    const top = FRONT.qr.y + row * moduleMm;
    drawRoundedRect(page, g, left, top, moduleMm * 7, moduleMm * 7, moduleMm * 1.4, rgb(1, 1, 1));
    drawRoundedRect(page, g, left + moduleMm, top + moduleMm, moduleMm * 5, moduleMm * 5, moduleMm * 1.1, pdfColor(CARD_COLORS.front));
    drawRoundedRect(page, g, left + moduleMm * 2, top + moduleMm * 2, moduleMm * 3, moduleMm * 3, moduleMm * 0.9, pdfColor(CARD_COLORS.qrEyePrint));
  }

  drawBlock(page, g, layout.front.name, fonts);
  if (layout.front.title) drawBlock(page, g, layout.front.title, fonts);
  drawBlock(page, g, layout.front.code, fonts);

  page.drawRectangle({
    x: x(g, FRONT.accent.x),
    y: y(g, accentTop(layout) + FRONT.accent.h),
    width: MM(FRONT.accent.w),
    height: MM(FRONT.accent.h),
    color: pdfColor(CARD_COLORS.accent),
  });

  if (test) drawTestBand(page, g, testFont);

  if (g.bleed > 0) drawCropMarks(page, g);
}

async function drawBack(
  pdf: PDFDocument,
  g: PageGeometry,
  input: RenderCardInput,
  fonts: CardFontFamily,
  testFont: PDFFont,
  test: boolean,
  watermarkFont: PDFFont | null,
) {
  const page = pdf.addPage([g.pageWidth, g.pageHeight]);
  const layout = layoutCard({
    fullName: input.employee.full_name,
    jobTitle: input.employee.job_title,
    employeeCode: input.employee.employee_code,
    companyName: input.company.name,
    validUntil: formatDate(input.expiresAt, "en", input.company.time_zone),
    host: input.company.show_verify_host_on_card ? displayVerifyDomain(input.company.verify_base_url) : null,
    showVerifyHostOnCard: input.company.show_verify_host_on_card,
  });

  page.drawRectangle({ x: 0, y: 0, width: g.pageWidth, height: g.pageHeight, color: pdfColor(CARD_COLORS.back) });

  if (test && watermarkFont) drawTestPattern(page, g, watermarkFont);

  drawBlock(page, g, layout.back.brand, fonts);
  drawBlock(page, g, layout.back.claim, fonts);
  drawBlock(page, g, layout.back.established, fonts);
  page.drawLine({
    start: { x: x(g, BACK.slash.x1), y: y(g, BACK.slash.y1) },
    end: { x: x(g, BACK.slash.x2), y: y(g, BACK.slash.y2) },
    thickness: MM(BACK.slash.thickness),
    color: pdfColor(CARD_COLORS.accent),
    lineCap: 1,
  });

  if (test) drawTestBand(page, g, testFont);
  if (g.bleed > 0) drawCropMarks(page, g);
}

function drawCropMarks(page: PDFPage, g: PageGeometry) {
  const mark = MM(2);
  const gap = MM(0.5);
  const color = rgb(0, 0, 0);
  const positions = [
    [g.originX, g.pageHeight - g.originY],
    [g.originX + MM(CARD_WIDTH_MM), g.pageHeight - g.originY],
    [g.originX, g.pageHeight - g.originY - MM(CARD_HEIGHT_MM)],
    [g.originX + MM(CARD_WIDTH_MM), g.pageHeight - g.originY - MM(CARD_HEIGHT_MM)],
  ];
  for (const [px, py] of positions) {
    if (px === undefined || py === undefined) continue;
    page.drawLine({ start: { x: px - gap - mark, y: py }, end: { x: px - gap, y: py }, thickness: 0.25, color });
    page.drawLine({ start: { x: px, y: py - gap - mark }, end: { x: px, y: py - gap }, thickness: 0.25, color });
  }
}

export async function renderCardPdf(input: RenderCardInput): Promise<Uint8Array> {
  if (input.company.status === "SUSPENDED") throw new Error("Company is suspended");
  const mode: CardPrintMode = input.mode ?? "cr80";
  const g = geometry(mode);
  const pdf = await PDFDocument.create();
  pdf.setTitle(`ID card - ${input.employee.full_name}`);
  pdf.setAuthor(input.company.name);
  pdf.setSubject("Employee identity card");
  pdf.setCreator("Employee ID system");
  pdf.setProducer("Employee ID system");
  pdf.setCreationDate(new Date());
  pdf.setModificationDate(new Date());

  const fonts = await embedPdfFonts(pdf);
  const watermarkFont = mode === "test" ? await (await import("@/lib/pdf/assets")).embedWatermarkFont(pdf) : null;

  const test = mode === "test";
  await drawFront(pdf, g, input, fonts.card, fonts.primary.bold, test, watermarkFont);
  await drawBack(pdf, g, input, fonts.card, fonts.primary.bold, test, watermarkFont);

  return pdf.save();
}
