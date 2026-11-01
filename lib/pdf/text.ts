import type { PDFFont, PDFPage, RGB } from "pdf-lib";
import { containsArabic, detectBaseDirection, preparePdfText } from "./arabic";

/** Characters used in names/job titles that are not in the Arabic font subset. */
const CHARACTER_REPLACEMENTS: Record<string, string> = {
  "\u2014": "-",
  "\u2013": "-",
  "\u2018": "'",
  "\u2019": "'",
  "\u201c": '"',
  "\u201d": '"',
  "\u2026": "...",
  "\u2022": "-",
  "\u00a0": " ",
  "\u200f": "",
  "\u200e": "",
};

const ALLOWED_CHARACTERS =
  /[^\u0020-\u007e\u00a0-\u00ff\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\ufb50-\ufdff\ufe70-\ufeff]/gu;

/** Normalise text and drop code points the embedded font cannot render (avoids encode crashes). */
export function sanitizePdfText(input: string): string {
  let text = input.normalize("NFC");
  text = text.replace(/[\u2014\u2013\u2018\u2019\u201c\u201d\u2026\u2022\u00a0\u200e\u200f]/g, (char) => CHARACTER_REPLACEMENTS[char] ?? "");
  text = text.replace(/[\p{Cc}\p{Cf}]/gu, "");
  text = text.replace(ALLOWED_CHARACTERS, "");
  return text.replace(/[ \t]+/g, " ").trim();
}

/**
 * Width of an already prepared (shaped + visually ordered) string.
 *
 * Arabic is measured and drawn one glyph at a time: pdf-lib/fontkit re-runs the
 * OpenType shaper on every drawText call, which would reverse an already-visual
 * string and detach Arabic dots. Per-glyph advances keep the shaped forms intact.
 */
function measurePrepared(font: PDFFont, prepared: string, size: number): number {
  let width = 0;
  for (const char of Array.from(prepared)) {
    width += font.widthOfTextAtSize(char, size);
  }
  return width;
}

export function measureText(font: PDFFont, text: string, size: number): number {
  const sanitized = sanitizePdfText(text);
  const prepared = preparePdfText(sanitized, detectBaseDirection(sanitized));
  if (containsArabic(sanitized)) return measurePrepared(font, prepared, size);
  return font.widthOfTextAtSize(prepared, size);
}

function drawGlyphSequence(
  page: PDFPage,
  prepared: string,
  options: { x: number; y: number; size: number; font: PDFFont; color: RGB; opacity: number },
): void {
  let cursor = options.x;
  for (const char of Array.from(prepared)) {
    page.drawText(char, {
      x: cursor,
      y: options.y,
      size: options.size,
      font: options.font,
      color: options.color,
      opacity: options.opacity,
    });
    cursor += options.font.widthOfTextAtSize(char, options.size);
  }
}

export interface DrawTextOptions {
  text: string;
  x: number;
  y: number;
  size: number;
  font: PDFFont;
  color: RGB;
  align?: "left" | "right" | "center";
  maxWidth?: number;
  minSize?: number;
  opacity?: number;
}

/** Draw a single line, shrinking to fit `maxWidth` and applying Arabic shaping + bidi. */
export function drawText(page: PDFPage, options: DrawTextOptions): number {
  const sanitized = sanitizePdfText(options.text);
  if (!sanitized) return 0;
  const direction = detectBaseDirection(sanitized);
  const arabic = containsArabic(sanitized);
  let size = options.size;
  const prepared = preparePdfText(sanitized, direction);
  const widthFor = (candidateSize: number) =>
    arabic ? measurePrepared(options.font, prepared, candidateSize) : options.font.widthOfTextAtSize(prepared, candidateSize);
  let width = widthFor(size);
  if (options.maxWidth && width > options.maxWidth) {
    const min = options.minSize ?? Math.max(4, options.size * 0.6);
    while (width > options.maxWidth && size > min) {
      size = Math.max(min, size - 0.25);
      width = widthFor(size);
    }
  }
  let drawX = options.x;
  if (options.align === "right") drawX = options.x - width;
  else if (options.align === "center") drawX = options.x - width / 2;
  if (arabic) {
    drawGlyphSequence(page, prepared, {
      x: drawX,
      y: options.y,
      size,
      font: options.font,
      color: options.color,
      opacity: options.opacity ?? 1,
    });
  } else {
    page.drawText(prepared, {
      x: drawX,
      y: options.y,
      size,
      font: options.font,
      color: options.color,
      opacity: options.opacity ?? 1,
    });
  }
  return width;
}

/** Wrap logical text into lines that fit `maxWidth` (measured after shaping). */
export function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const sanitized = sanitizePdfText(text);
  if (!sanitized) return [];
  const words = sanitized.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (measureText(font, candidate, size) <= maxWidth || current === "") {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export interface DrawParagraphOptions {
  text: string;
  x: number;
  y: number;
  size: number;
  font: PDFFont;
  color: RGB;
  maxWidth: number;
  lineHeight?: number;
  align?: "left" | "right" | "center";
  maxLines?: number;
}

/** Draw wrapped lines top-down; returns the baseline Y of the last line. */
export function drawParagraph(page: PDFPage, options: DrawParagraphOptions): number {
  const lineHeight = options.lineHeight ?? options.size * 1.35;
  let lines = wrapText(options.text, options.font, options.size, options.maxWidth);
  if (options.maxLines && lines.length > options.maxLines) {
    lines = lines.slice(0, options.maxLines);
    const last = lines[lines.length - 1] ?? "";
    lines[lines.length - 1] = `${last.replace(/\s+\S*$/, "")}...`;
  }
  let baseline = options.y;
  for (const line of lines) {
    drawText(page, {
      text: line,
      x: options.x,
      y: baseline,
      size: options.size,
      font: options.font,
      color: options.color,
      align: options.align,
    });
    baseline -= lineHeight;
  }
  return baseline + lineHeight;
}

/** Shorten text with an ellipsis so it fits a width (single line). */
export function truncateToWidth(text: string, font: PDFFont, size: number, maxWidth: number): string {
  let value = sanitizePdfText(text);
  if (measureText(font, value, size) <= maxWidth) return value;
  while (value.length > 1 && measureText(font, `${value}...`, size) > maxWidth) {
    value = value.slice(0, -1);
  }
  return `${value.trimEnd()}...`;
}

export function fitFontSize(
  text: string,
  font: PDFFont,
  preferredSize: number,
  maxWidth: number,
  minSize: number,
): number {
  let size = preferredSize;
  while (size > minSize && measureText(font, text, size) > maxWidth) size -= 0.25;
  return size;
}
