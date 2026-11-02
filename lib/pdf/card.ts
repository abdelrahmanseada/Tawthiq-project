import {
  PDFDocument,
  PDFFont,
  PDFImage,
  rgb,
  type RGB,
} from "pdf-lib";
import { CARD_HEIGHT_MM, CARD_WIDTH_MM, FRONT, BACK, CARD_COLORS, MM_TO_PT, layoutCard, type TextBlock } from "@/lib/card/layout";
import { buildVerifyUrl, displayVerifyDomain, qrModules } from "@/lib/qr";
import { formatDate } from "@/lib/format";
import { embedPdfFonts, embedStoredImage, loadRoundedPortrait, pdfColor, type FontFamily } from "@/lib/pdf/assets";
import { DEFAULT_PRIMARY_COLOR, DEFAULT_SECONDARY_COLOR, normalizeHexColor, readableTextOn } from "@/lib/colors";

export const CARD_WIDTH = CARD_WIDTH_MM * MM_TO_PT;
export const CARD_HEIGHT = CARD_HEIGHT_MM * MM_TO_PT;

export type CardPrintMode = "cr80" | "print_shop" | "test";

export interface CardCompanyData {
  name: string;
  logo_path: string | null;
  logo_bg_dark: boolean;
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
  department: string | null;
  photo_path: string | null;
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

function drawBlock(
  page: import("pdf-lib").PDFPage,
  geometryValue: PageGeometry,
  text: TextBlock,
  fonts: FontFamily,
  primary: RGB,
) {
  const font = text.weight === "bold" ? fonts.bold : fonts.regular;
  const color = text.color === "primary" ? primary : pdfColor(text.color);
  for (let index = 0; index < text.lines.length; index += 1) {
    const line = text.lines[index]!;
    const width = font.widthOfTextAtSize(line, text.fontSizePt);
    const xPt =
      text.align === "right"
        ? x(geometryValue, text.x + text.w) - width
        : text.align === "center"
          ? x(geometryValue, text.x + text.w / 2) - width / 2
          : x(geometryValue, text.x);
    const baselineMm = text.y + text.lineHeightPt * 0.352778 * (index + 0.78);
    page.drawText(line, {
      x: xPt,
      y: y(geometryValue, baselineMm),
      size: text.fontSizePt,
      font,
      color,
    });
  }
}

async function drawLogo(
  pdf: PDFDocument,
  page: import("pdf-lib").PDFPage,
  g: PageGeometry,
  input: RenderCardInput,
  logo: PDFImage | null,
  fonts: FontFamily,
  primary: RGB,
) {
  const box = FRONT.logo;
  if (!input.company.logo_bg_dark) page.drawRectangle({
    x: x(g, box.x),
    y: y(g, box.y + box.h),
    width: MM(box.w),
    height: MM(box.h),
    color: rgb(1, 1, 1),
  });
  if (logo) {
    const maxW = MM(box.w - box.padding * 2);
    const maxH = MM(box.h - box.padding * 2);
    const scale = Math.min(maxW / logo.width, maxH / logo.height);
    const width = logo.width * scale;
    const height = logo.height * scale;
    page.drawImage(logo, {
      x: x(g, box.x + box.w / 2) - width / 2,
      y: y(g, box.y + box.h / 2) - height / 2,
      width,
      height,
    });
  } else {
    const initials = input.company.name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("");
    const size = 14;
    const width = fonts.bold.widthOfTextAtSize(initials || "C", size);
    page.drawText(initials || "C", {
      x: x(g, box.x + box.w / 2) - width / 2,
      y: y(g, box.y + box.h / 2 + 2.2),
      size,
      font: fonts.bold,
      color: primary,
    });
  }
}

function drawSilhouette(page: import("pdf-lib").PDFPage, g: PageGeometry, color: RGB) {
  const box = FRONT.photo;
  page.drawRectangle({
    x: x(g, box.x),
    y: y(g, box.y + box.h),
    width: MM(box.w),
    height: MM(box.h),
    color: pdfColor("#E2E8F0"),
  });
  page.drawCircle({
    x: x(g, box.x + box.w / 2),
    y: y(g, box.y + 10),
    size: MM(4.2),
    color,
  });
  page.drawEllipse({
    x: x(g, box.x + box.w / 2),
    y: y(g, box.y + 26),
    xScale: MM(7.4),
    yScale: MM(9.5),
    color,
  });
}

function drawTestPattern(
  page: import("pdf-lib").PDFPage,
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
        color: rgb(0.04, 0.07, 0.12),
        opacity: 0.06,
      });
    }
  }
}

function drawTestBand(page: import("pdf-lib").PDFPage, g: PageGeometry, fonts: FontFamily) {
  const band = BACK.testBand;
  page.drawRectangle({
    x: x(g, band.x),
    y: y(g, band.y + band.h),
    width: MM(band.w),
    height: MM(band.h),
    color: pdfColor(CARD_COLORS.test),
  });
  const label = "TEST PRINT - NOT VALID";
  const width = fonts.bold.widthOfTextAtSize(label, 6);
  page.drawText(label, {
    x: x(g, CARD_WIDTH_MM / 2) - width / 2,
    y: y(g, band.y + 2.1),
    size: 6,
    font: fonts.bold,
    color: rgb(1, 1, 1),
  });
}

async function drawFront(
  pdf: PDFDocument,
  g: PageGeometry,
  input: RenderCardInput,
  fonts: FontFamily,
  logo: PDFImage | null,
  photo: PDFImage | null,
  primary: RGB,
  secondary: RGB,
  test: boolean,
  watermarkFont: PDFFont | null,
) {
  const page = pdf.addPage([g.pageWidth, g.pageHeight]);
  const layout = layoutCard({
    fullName: input.employee.full_name,
    jobTitle: input.employee.job_title,
    department: input.employee.department,
    employeeCode: input.employee.employee_code,
    companyName: input.company.name,
    validUntil: formatDate(input.expiresAt, "en", input.company.time_zone),
    host: input.company.show_verify_host_on_card ? displayVerifyDomain(input.company.verify_base_url) : null,
    website: input.company.website,
    tagline: input.company.tagline,
    showVerifyHostOnCard: input.company.show_verify_host_on_card,
    phone: input.company.contact_phone,
    email: input.company.contact_email,
    hasPhoto: Boolean(photo),
  });
  layout.front.company.color = readableTextOn(normalizeHexColor(input.company.primary_color, DEFAULT_PRIMARY_COLOR));

  page.drawRectangle({ x: 0, y: 0, width: g.pageWidth, height: g.pageHeight, color: rgb(1, 1, 1) });
  // Header and accent extend into the bleed for print-shop output.
  page.drawRectangle({
    x: 0,
    y: g.pageHeight - (MM(FRONT.header.h) + g.bleed),
    width: g.pageWidth,
    height: MM(FRONT.header.h) + g.bleed,
    color: primary,
  });
  page.drawRectangle({
    x: 0,
    y: g.pageHeight - (MM(FRONT.accent.y + FRONT.accent.h) + g.bleed),
    width: g.pageWidth,
    height: MM(FRONT.accent.h),
    color: secondary,
  });

  if (test && watermarkFont) drawTestPattern(page, g, watermarkFont);

  await drawLogo(pdf, page, g, input, logo, fonts, primary);

  if (photo) {
    const box = FRONT.photo;
    page.drawImage(photo, {
      x: x(g, box.x),
      y: y(g, box.y + box.h),
      width: MM(box.w),
      height: MM(box.h),
    });
    page.drawRectangle({
      x: x(g, box.x),
      y: y(g, box.y + box.h),
      width: MM(box.w),
      height: MM(box.h),
      borderColor: secondary,
      borderWidth: box.borderPt,
    });
  } else {
    drawSilhouette(page, g, pdfColor("#94A3B8"));
  }

  drawBlock(page, g, layout.front.company, fonts, primary);
  drawBlock(page, g, layout.front.name, fonts, primary);
  if (layout.front.title) drawBlock(page, g, layout.front.title, fonts, primary);
  if (layout.front.department) drawBlock(page, g, layout.front.department, fonts, primary);
  drawBlock(page, g, layout.front.code, fonts, primary);
  const validWidth = fonts.regular.widthOfTextAtSize(layout.front.validUntil.lines[0] ?? "", 6.5);
  const validStartMm = 81.6 - validWidth / MM_TO_PT;
  const iconCenterMm = validStartMm - 2.1;
  page.drawCircle({ x: x(g, iconCenterMm), y: y(g, 48.55), size: MM(1.15), color: primary });
  page.drawLine({ start: { x: x(g, iconCenterMm - 0.55), y: y(g, 48.55) }, end: { x: x(g, iconCenterMm - 0.1), y: y(g, 48.95) }, thickness: 0.65, color: rgb(1, 1, 1) });
  page.drawLine({ start: { x: x(g, iconCenterMm - 0.1), y: y(g, 48.95) }, end: { x: x(g, iconCenterMm + 0.6), y: y(g, 48.0) }, thickness: 0.65, color: rgb(1, 1, 1) });
  drawBlock(page, g, layout.front.validUntil, fonts, primary);

  if (test) drawTestBand(page, g, fonts);

  if (g.bleed > 0) drawCropMarks(page, g);
}

async function drawBack(
  pdf: PDFDocument,
  g: PageGeometry,
  input: RenderCardInput,
  fonts: FontFamily,
  primary: RGB,
  secondary: RGB,
  test: boolean,
  watermarkFont: PDFFont | null,
) {
  const page = pdf.addPage([g.pageWidth, g.pageHeight]);
  const verifyUrl = buildVerifyUrl(input.company.verify_base_url, input.token);
  const qr = await qrModules(verifyUrl);
  const totalModules = qr.size + BACK.qr.quietModules * 2;
  const moduleMm = BACK.qr.w / totalModules;
  if (moduleMm < BACK.qr.minModuleMm) {
    throw new Error("Verification URL is too long for a printable QR");
  }
  const layout = layoutCard({
    fullName: input.employee.full_name,
    jobTitle: input.employee.job_title,
    department: input.employee.department,
    employeeCode: input.employee.employee_code,
    companyName: input.company.name,
    validUntil: formatDate(input.expiresAt, "en", input.company.time_zone),
    host: input.company.show_verify_host_on_card ? displayVerifyDomain(input.company.verify_base_url) : null,
    website: input.company.website,
    tagline: input.company.tagline,
    showVerifyHostOnCard: input.company.show_verify_host_on_card,
    phone: input.company.contact_phone,
    email: input.company.contact_email,
    hasPhoto: false,
  });
  layout.back.company.color = readableTextOn(normalizeHexColor(input.company.primary_color, DEFAULT_PRIMARY_COLOR));

  if (layout.back.host && layout.back.host.lines.length > 2) throw new Error("Verification host is too long for the card");
  if (layout.back.website && layout.back.website.lines.length > 2) throw new Error("Website is too long for the card");
  page.drawRectangle({ x: 0, y: 0, width: g.pageWidth, height: g.pageHeight, color: rgb(1, 1, 1) });
  page.drawRectangle({
    x: 0,
    y: g.pageHeight - (MM(BACK.header.h) + g.bleed),
    width: g.pageWidth,
    height: MM(BACK.header.h) + g.bleed,
    color: primary,
  });
  page.drawRectangle({
    x: 0,
    y: g.pageHeight - (MM(BACK.accent.y + BACK.accent.h) + g.bleed),
    width: g.pageWidth,
    height: MM(BACK.accent.h),
    color: secondary,
  });

  if (test && watermarkFont) drawTestPattern(page, g, watermarkFont);

  // White QR panel and light border.
  page.drawRectangle({
    x: x(g, BACK.panel.x),
    y: y(g, BACK.panel.y + BACK.panel.h),
    width: MM(BACK.panel.w),
    height: MM(BACK.panel.h),
    color: rgb(1, 1, 1),
    borderColor: pdfColor(CARD_COLORS.border),
    borderWidth: 0.3,
  });

  const moduleSize = MM(moduleMm);
  const qrOriginX = x(g, BACK.qr.x + BACK.qr.quietModules * moduleMm);
  const qrTopY = y(g, BACK.qr.y + BACK.qr.quietModules * moduleMm);
  for (let row = 0; row < qr.size; row += 1) {
    for (let column = 0; column < qr.size; column += 1) {
      if (!qr.modules[row]?.[column]) continue;
      page.drawRectangle({
        x: qrOriginX + column * moduleSize,
        y: qrTopY - (row + 1) * moduleSize,
        width: moduleSize,
        height: moduleSize,
        color: rgb(0, 0, 0),
      });
    }
  }

  drawBlock(page, g, layout.back.company, fonts, primary);
  drawBlock(page, g, layout.back.heading, fonts, primary);
  if (layout.back.host) drawBlock(page, g, layout.back.host, fonts, primary);
  if (layout.back.website) drawBlock(page, g, layout.back.website, fonts, primary);
  drawBlock(page, g, layout.back.phone, fonts, primary);
  drawBlock(page, g, layout.back.email, fonts, primary);
  drawBlock(page, g, layout.back.returns, fonts, primary);
  drawBlock(page, g, layout.back.footer, fonts, primary);

  if (test) drawTestBand(page, g, fonts);
  if (g.bleed > 0) drawCropMarks(page, g);
}

function drawCropMarks(page: import("pdf-lib").PDFPage, g: PageGeometry) {
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
  const storedLogo = input.company.logo_path
    ? await (await import("@/lib/pdf/assets")).loadStorageBuffer(input.company.logo_path)
    : null;
  const embeddedLogo = await embedStoredImage(pdf, storedLogo);
  const photo = await loadRoundedPortrait(pdf, input.employee.photo_path, 660, 870, 30);
  const watermarkFont = mode === "test" ? await (await import("@/lib/pdf/assets")).embedWatermarkFont(pdf) : null;

  const primary = pdfColor(normalizeHexColor(input.company.primary_color, DEFAULT_PRIMARY_COLOR));
  const secondary = pdfColor(normalizeHexColor(input.company.secondary_color, DEFAULT_SECONDARY_COLOR));
  const test = mode === "test";
  await drawFront(pdf, g, input, fonts.primary, embeddedLogo, photo, primary, secondary, test, watermarkFont);
  await drawBack(pdf, g, input, fonts.primary, primary, secondary, test, watermarkFont);

  return pdf.save();
}

