/**
 * The single source of truth for the CR80 card.
 *
 * All coordinates are millimetres from the top-left of the 85.6 × 54 mm card.
 * The PDF renderer converts these values to points; the web preview uses the
 * same values through a CSS `cqw` conversion (1 mm = 100 / 85.6 cqw).
 *
 * Text wrapping is deliberately computed here, not in either renderer, so the
 * preview and the printable PDF share line breaks, shrinking rules and boxes.
 */

export const CARD_WIDTH_MM = 85.6;
export const CARD_HEIGHT_MM = 54;
export const SAFE_MARGIN_MM = 4;
export const MM_TO_PT = 72 / 25.4;

export const CARD_COLORS = {
  front: "#1B1B1B",
  back: "#141414",
  white: "#FFFFFF",
  muted: "#A3A3A3",
  faint: "#8A8A8A",
  test: "#DC2626",
  pattern: "#FFFFFF",
} as const;

export const FRONT = {
  text: { x: 10, y: 12.5, w: 44 },
  name: { minPt: 8.5, maxPt: 11, maxLines: 2, gapAfter: 1.1 },
  title: { minPt: 5.4, maxPt: 6.4, maxLines: 2, gapAfter: 0.5 },
  accent: { x: 10, y: 0, w: 14, h: 0.6 },
  qr: { x: 57.5, y: 25.5, w: 21, h: 21, quietModules: 4, minModuleMm: 0.4 },
  code: { x: 10, y: 46.4, w: 42, h: 3, pt: 5.4 },
} as const;

export const BACK = {
  brand: { x: 10, y: 36.5, w: 52, h: 11, minPt: 9, maxPt: 18 },
  meta: { x: 10, y: 7, w: 69.6, h: 3, minPt: 3.8, maxPt: 4.8 },
  testBand: { x: 0, y: 51, w: CARD_WIDTH_MM, h: 3 },
} as const;

export interface CardTextInput {
  fullName: string;
  jobTitle: string | null;
  employeeCode: string;
  companyName: string;
  validUntil: string;
  host: string | null;
  showVerifyHostOnCard: boolean;
}

export interface TextBlock {
  text: string;
  lines: string[];
  x: number;
  y: number;
  w: number;
  h: number;
  fontSizePt: number;
  lineHeightPt: number;
  weight: "regular" | "bold";
  align: "left" | "right" | "center";
  color: string;
  maxLines: number;
}

export interface CardLayout {
  front: {
    name: TextBlock;
    title: TextBlock | null;
    code: TextBlock;
  };
  back: {
    brand: TextBlock;
    meta: TextBlock;
  };
}

/** Approximate advance width as a fraction of font size; shared by both renderers. */
function glyphFactor(weight: "regular" | "bold"): number {
  return weight === "bold" ? 0.585 : 0.55;
}

export function textWidthMm(text: string, fontSizePt: number, weight: "regular" | "bold"): number {
  return text.length * fontSizePt * glyphFactor(weight) * 0.352778;
}

function wrapWords(text: string, maxWidthMm: number, fontSizePt: number, weight: "regular" | "bold"): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (textWidthMm(candidate, fontSizePt, weight) <= maxWidthMm) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    // Break a single over-long token rather than allowing it outside the column.
    if (textWidthMm(word, fontSizePt, weight) > maxWidthMm) {
      let chunk = "";
      for (const char of word) {
        if (textWidthMm(chunk + char, fontSizePt, weight) > maxWidthMm && chunk) {
          lines.push(chunk);
          chunk = char;
        } else {
          chunk += char;
        }
      }
      current = chunk;
    } else {
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function ellipsize(text: string, maxWidthMm: number, fontSizePt: number, weight: "regular" | "bold"): string {
  if (textWidthMm(text, fontSizePt, weight) <= maxWidthMm) return text;
  let result = text;
  while (result.length > 1 && textWidthMm(`${result}…`, fontSizePt, weight) > maxWidthMm) {
    result = result.slice(0, -1).trimEnd();
  }
  return `${result}…`;
}

/**
 * Shrink from maxPt to minPt, then wrap. Only the final fallback ellipsizes a
 * line; callers that print identifiers/hosts use a no-ellipsis path instead.
 */
export function fitText(
  text: string,
  maxWidthMm: number,
  maxLines: number,
  maxPt: number,
  minPt: number,
  weight: "regular" | "bold",
  allowEllipsis = true,
): { lines: string[]; fontSizePt: number } {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return { lines: [], fontSizePt: maxPt };
  for (let size = maxPt; size >= minPt; size -= 0.25) {
    let lines = wrapWords(clean, maxWidthMm, size, weight);
    if (lines.length <= maxLines) return { lines, fontSizePt: size };
    if (size === minPt) {
      lines = lines.slice(0, maxLines);
      if (allowEllipsis && lines.length > 0) {
        const last = lines.length - 1;
        lines[last] = ellipsize(lines[last]!, maxWidthMm, size, weight);
      }
      return { lines, fontSizePt: size };
    }
  }
  return { lines: [clean], fontSizePt: minPt };
}

function block(
  text: string,
  x: number,
  y: number,
  w: number,
  fontSizePt: number,
  lineHeightPt: number,
  weight: "regular" | "bold",
  color: string,
  maxLines: number,
  lines?: string[],
  align: "left" | "right" | "center" = "left",
): TextBlock {
  const resolved = lines ?? [text];
  return {
    text,
    lines: resolved,
    x,
    y,
    w,
    h: (resolved.length || 1) * lineHeightPt * 0.352778,
    fontSizePt,
    lineHeightPt,
    weight,
    align,
    color,
    maxLines,
  };
}

/** The reference card sets names and titles in uppercase; Arabic is unaffected. */
function upper(value: string): string {
  return value.toLocaleUpperCase();
}

export function layoutCard(input: CardTextInput): CardLayout {
  // ── Front: name block on the left, QR on the right, code at the bottom. ────
  const name = fitText(upper(input.fullName), FRONT.text.w, FRONT.name.maxLines, FRONT.name.maxPt, FRONT.name.minPt, "bold");
  const nameLineHeight = name.fontSizePt * 1.12;
  const nameBlock = block(
    input.fullName,
    FRONT.text.x,
    FRONT.text.y,
    FRONT.text.w,
    name.fontSizePt,
    nameLineHeight,
    "bold",
    CARD_COLORS.white,
    FRONT.name.maxLines,
    name.lines,
  );

  const cursor = FRONT.text.y + nameBlock.h + FRONT.name.gapAfter;
  const title = input.jobTitle?.trim() || "";
  const titleFit = title ? fitText(upper(title), FRONT.text.w, FRONT.title.maxLines, FRONT.title.maxPt, FRONT.title.minPt, "regular") : null;
  const titleBlock = titleFit
    ? block(title, FRONT.text.x, cursor, FRONT.text.w, titleFit.fontSizePt, titleFit.fontSizePt * 1.18, "regular", CARD_COLORS.muted, FRONT.title.maxLines, titleFit.lines)
    : null;

  const codeBlock = block(`#${input.employeeCode}`, FRONT.code.x, FRONT.code.y, FRONT.code.w, FRONT.code.pt, 6, "regular", CARD_COLORS.muted, 1);

  // ── Back: a quiet wordmark and the validity line. ──────────────────────────
  const brandFit = fitText(upper(input.companyName), BACK.brand.w, 1, BACK.brand.maxPt, BACK.brand.minPt, "bold");
  const brandBlock = block(
    input.companyName,
    BACK.brand.x,
    BACK.brand.y + (BACK.brand.h - brandFit.fontSizePt * 1.1 * 0.352778) / 2,
    BACK.brand.w,
    brandFit.fontSizePt,
    brandFit.fontSizePt * 1.1,
    "bold",
    CARD_COLORS.white,
    1,
    brandFit.lines,
  );

  const metaText = [
    `VALID UNTIL ${upper(input.validUntil)}`,
    input.showVerifyHostOnCard && input.host ? upper(input.host) : "",
  ]
    .filter(Boolean)
    .join("  /  ");
  const metaFit = fitText(metaText, BACK.meta.w, 1, BACK.meta.maxPt, BACK.meta.minPt, "regular", false);
  const metaBlock = block(metaText, BACK.meta.x, BACK.meta.y, BACK.meta.w, metaFit.fontSizePt, 5, "regular", CARD_COLORS.faint, 1, metaFit.lines, "right");

  return {
    front: {
      name: nameBlock,
      title: titleBlock,
      code: codeBlock,
    },
    back: {
      brand: brandBlock,
      meta: metaBlock,
    },
  };
}

/** Red rule sits just under the name block, like the reference card. */
export function accentTop(layout: CardLayout): number {
  const last = layout.front.title ?? layout.front.name;
  return last.y + last.h + 2;
}

/** Geometry helpers used by the renderer and tests. */
export function textBlockBox(blockValue: TextBlock) {
  return { x: blockValue.x, y: blockValue.y, w: blockValue.w, h: blockValue.h };
}

export const SAFE_AREA = {
  x: SAFE_MARGIN_MM,
  y: SAFE_MARGIN_MM,
  w: CARD_WIDTH_MM - SAFE_MARGIN_MM * 2,
  h: CARD_HEIGHT_MM - SAFE_MARGIN_MM * 2,
} as const;
