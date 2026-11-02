import { readFile } from "node:fs/promises";
import path from "node:path";
import { rgb, type PDFDocument, type PDFFont, type PDFImage, type RGB } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import sharp from "sharp";
import { hexToRgbTuple, normalizeHexColor } from "@/lib/colors";
import { readStorageFile } from "@/lib/storage";

const FONT_DIRECTORY = path.join(process.cwd(), "assets", "fonts");

export interface FontFamily {
  regular: PDFFont;
  bold: PDFFont;
}

export interface PdfFonts {
  primary: FontFamily;
}

const fontBytes = new Map<string, Promise<Buffer>>();

function load(file: string): Promise<Buffer> {
  let cached = fontBytes.get(file);
  if (!cached) {
    cached = readFile(path.join(FONT_DIRECTORY, file));
    fontBytes.set(file, cached);
  }
  return cached;
}

async function embedPair(pdf: PDFDocument, regularFile: string, boldFile: string): Promise<FontFamily> {
  const [regularBytes, boldBytes] = await Promise.all([load(regularFile), load(boldFile)]);
  return {
    regular: await pdf.embedFont(regularBytes, { subset: false }),
    bold: await pdf.embedFont(boldBytes, { subset: false }),
  };
}

/** Inter is the only PDF font in the active build. Full embedding keeps card output deterministic. */
export async function embedPdfFonts(pdf: PDFDocument, _locale?: string): Promise<PdfFonts> {
  pdf.registerFontkit(fontkit);
  return { primary: await embedPair(pdf, "inter-400.ttf", "inter-700.ttf") };
}

export async function embedWatermarkFont(pdf: PDFDocument, _locale?: string): Promise<PDFFont> {
  pdf.registerFontkit(fontkit);
  return pdf.embedFont(await load("inter-600.ttf"), { subset: false, customName: "BremerWatermark" });
}

export async function loadStorageBuffer(key: string | null | undefined): Promise<Buffer | null> {
  if (!key) return null;
  try {
    return await readStorageFile(key);
  } catch {
    return null;
  }
}

export async function embedStoredImage(pdf: PDFDocument, buffer: Buffer | null): Promise<PDFImage | null> {
  if (!buffer) return null;
  const isPng = buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8;
  try {
    if (isPng) return await pdf.embedPng(buffer);
    if (isJpeg) return await pdf.embedJpg(buffer);
    return null;
  } catch {
    return null;
  }
}

/** Rounded, cover-cropped portrait rendered to PNG for clean corners in print. */
export async function loadRoundedPortrait(
  pdf: PDFDocument,
  key: string | null | undefined,
  widthPx: number,
  heightPx: number,
  radiusPx: number,
): Promise<PDFImage | null> {
  const buffer = await loadStorageBuffer(key);
  if (!buffer) return null;
  try {
    const mask = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${widthPx}" height="${heightPx}"><rect width="${widthPx}" height="${heightPx}" rx="${radiusPx}" ry="${radiusPx}" fill="#fff"/></svg>`,
    );
    const rounded = await sharp(buffer)
      .resize(widthPx, heightPx, { fit: "cover", position: "attention" })
      .composite([{ input: mask, blend: "dest-in" }])
      .png()
      .toBuffer();
    return await pdf.embedPng(rounded);
  } catch {
    return null;
  }
}

export function pdfColor(hex: string): RGB {
  const [r, g, b] = hexToRgbTuple(normalizeHexColor(hex, "#000000"));
  return rgb(r / 255, g / 255, b / 255);
}

export const MILLIMETRES_PER_POINT = 2.834645669291339;
