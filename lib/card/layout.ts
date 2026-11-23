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
  front: "#0D0D0D",
  back: "#0D0D0D",
  white: "#FFFFFF",
  accent: "#A12B2B",
  qrEye: "#B22D2D",
  qrEyePrint: "#FF7070",
  test: "#DC2626",
} as const;

export type CardFont = "display" | "body" | "mono";

export const FRONT = {
  name: { x: 8.02, baseline: 11.415, w: 52, minPt: 5.5, maxPt: 8, maxLines: 2, lineHeightFactor: 1.14, trackingEm: -0.05 },
  title: { x: 8.12, baseline: 13.919, w: 52, minPt: 3.6, maxPt: 5.3, maxLines: 2, lineHeightFactor: 1.16, trackingEm: -0.05 },
  accent: { x: 8.489, y: 16.295, w: 11.776, h: 0.462 },
  qr: { x: 67.552, y: 36.313, w: 11.887, h: 11.887, quietModules: 0, minModuleMm: 0.28 },
  code: { x: 8.45, baseline: 47.492, w: 40, pt: 4.42, minPt: 3.2, trackingEm: 0.2, lineHeightFactor: 1.2 },
} as const;

export const BACK = {
  brand: { x: 5.55, baseline: 48.65, w: 48, minPt: 7, maxPt: 14.3, trackingEm: 0 },
  claim: { x: 56.2, baseline: 48.63, w: 15.2, pt: 2.85, trackingEm: 0 },
  slash: { x1: 71.98, y1: 48.86, x2: 72.78, y2: 47.69, thickness: 0.12 },
  established: { x: 74.22, baseline: 48.55, w: 7, pt: 2.6, trackingEm: 0 },
  testBand: { x: 0, y: 51, w: CARD_WIDTH_MM, h: 3 },
} as const;

export const BACK_TEXT = {
  claim: "QUALITAT HAT EINEN NAMEN",
  established: "ESTD. 1989",
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
  baselines: number[];
  fontSizePt: number;
  lineHeightPt: number;
  weight: "regular" | "bold";
  font: CardFont;
  trackingEm: number;
  align: "left" | "right" | "center";
  color: string;
  maxLines: number;
}

export interface CardLayout {
  front: {
    name: TextBlock;
    title: TextBlock | null;
    code: TextBlock;
    accentY: number;
  };
  back: {
    brand: TextBlock;
    claim: TextBlock;
    established: TextBlock;
  };
}

/** Approximate advance width as a fraction of font size; shared by both renderers. */
function glyphFactor(font: CardFont): number {
  if (font === "display") return 0.72;
  if (font === "mono") return 0.68;
  return 0.69;
}

export function textWidthMm(text: string, fontSizePt: number, font: CardFont, trackingEm = 0): number {
  const glyphs = [...text].length;
  const tracking = Math.max(0, glyphs - 1) * trackingEm;
  return (glyphs * glyphFactor(font) + tracking) * fontSizePt * 0.352778;
}

function wrapWords(text: string, maxWidthMm: number, fontSizePt: number, font: CardFont, trackingEm: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (textWidthMm(candidate, fontSizePt, font, trackingEm) <= maxWidthMm) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    // Break a single over-long token rather than allowing it outside the column.
    if (textWidthMm(word, fontSizePt, font, trackingEm) > maxWidthMm) {
      let chunk = "";
      for (const char of word) {
        if (textWidthMm(chunk + char, fontSizePt, font, trackingEm) > maxWidthMm && chunk) {
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

function ellipsize(text: string, maxWidthMm: number, fontSizePt: number, font: CardFont, trackingEm: number): string {
  if (textWidthMm(text, fontSizePt, font, trackingEm) <= maxWidthMm) return text;
  let result = text;
  while (result.length > 1 && textWidthMm(`${result}…`, fontSizePt, font, trackingEm) > maxWidthMm) {
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
  font: CardFont,
  trackingEm = 0,
  allowEllipsis = true,
): { lines: string[]; fontSizePt: number } {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return { lines: [], fontSizePt: maxPt };
  for (let size = maxPt; size >= minPt; size -= 0.1) {
    let lines = wrapWords(clean, maxWidthMm, size, font, trackingEm);
    if (lines.length <= maxLines) return { lines, fontSizePt: size };
    if (size <= minPt + 0.001) {
      lines = lines.slice(0, maxLines);
      if (allowEllipsis && lines.length > 0) {
        const last = lines.length - 1;
        lines[last] = ellipsize(lines[last]!, maxWidthMm, size, font, trackingEm);
      }
      return { lines, fontSizePt: size };
    }
  }
  return { lines: [clean], fontSizePt: minPt };
}

function block(
  text: string,
  x: number,
  baseline: number,
  w: number,
  fontSizePt: number,
  lineHeightPt: number,
  weight: "regular" | "bold",
  font: CardFont,
  trackingEm: number,
  color: string,
  maxLines: number,
  lines?: string[],
  align: "left" | "right" | "center" = "left",
): TextBlock {
  const resolved = lines ?? [text];
  const lineHeightMm = lineHeightPt * 0.352778;
  const emMm = fontSizePt * 0.352778;
  return {
    text,
    lines: resolved,
    x,
    y: baseline - emMm * 0.72,
    w,
    h: Math.max(0, resolved.length - 1) * lineHeightMm + emMm * 0.72,
    baselines: resolved.map((_, index) => baseline + index * lineHeightMm),
    fontSizePt,
    lineHeightPt,
    weight,
    font,
    trackingEm,
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
  // ── Front: name and title top-left, rule under them, code bottom-left. ────
  const name = fitText(upper(input.fullName), FRONT.name.w, FRONT.name.maxLines, FRONT.name.maxPt, FRONT.name.minPt, "display", FRONT.name.trackingEm);
  const nameLineHeightPt = name.fontSizePt * FRONT.name.lineHeightFactor;
  const nameBlock = block(
    input.fullName,
    FRONT.name.x,
    FRONT.name.baseline,
    FRONT.name.w,
    name.fontSizePt,
    nameLineHeightPt,
    "bold",
    "display",
    FRONT.name.trackingEm,
    CARD_COLORS.white,
    FRONT.name.maxLines,
    name.lines,
  );
  const nameShift = (name.lines.length - 1) * nameLineHeightPt * 0.352778;

  const title = input.jobTitle?.trim() || "";
  const titleFit = title
    ? fitText(upper(title), FRONT.title.w, FRONT.title.maxLines, FRONT.title.maxPt, FRONT.title.minPt, "body", FRONT.title.trackingEm)
    : null;
  const titleLineHeightPt = (titleFit?.fontSizePt ?? FRONT.title.maxPt) * FRONT.title.lineHeightFactor;
  const titleBlock = titleFit
    ? block(
        title,
        FRONT.title.x,
        FRONT.title.baseline + nameShift,
        FRONT.title.w,
        titleFit.fontSizePt,
        titleLineHeightPt,
        "regular",
        "body",
        FRONT.title.trackingEm,
        CARD_COLORS.white,
        FRONT.title.maxLines,
        titleFit.lines,
      )
    : null;
  const titleShift = titleFit ? (titleFit.lines.length - 1) * titleLineHeightPt * 0.352778 : 0;

  const codeFit = fitText(
    `#${input.employeeCode}`,
    FRONT.code.w,
    1,
    FRONT.code.pt,
    FRONT.code.minPt,
    "mono",
    FRONT.code.trackingEm,
  );
  const codeBlock = block(
    `#${input.employeeCode}`,
    FRONT.code.x,
    FRONT.code.baseline,
    FRONT.code.w,
    codeFit.fontSizePt,
    codeFit.fontSizePt * FRONT.code.lineHeightFactor,
    "regular",
    "mono",
    FRONT.code.trackingEm,
    CARD_COLORS.white,
    1,
    codeFit.lines,
  );

  // ── Back: wordmark bottom-left, claim and ESTD. line bottom-right. ────────
  const brandFit = fitText(upper(input.companyName), BACK.brand.w, 1, BACK.brand.maxPt, BACK.brand.minPt, "display", BACK.brand.trackingEm);
  const brandBlock = block(
    input.companyName,
    BACK.brand.x,
    BACK.brand.baseline,
    BACK.brand.w,
    brandFit.fontSizePt,
    brandFit.fontSizePt * 1.1,
    "bold",
    "display",
    BACK.brand.trackingEm,
    CARD_COLORS.white,
    1,
    brandFit.lines,
  );

  const claimBlock = block(
    BACK_TEXT.claim,
    BACK.claim.x,
    BACK.claim.baseline,
    BACK.claim.w,
    BACK.claim.pt,
    BACK.claim.pt * 1.2,
    "regular",
    "body",
    BACK.claim.trackingEm,
    CARD_COLORS.white,
    1,
  );

  const establishedBlock = block(
    BACK_TEXT.established,
    BACK.established.x,
    BACK.established.baseline,
    BACK.established.w,
    BACK.established.pt,
    BACK.established.pt * 1.2,
    "bold",
    "display",
    BACK.established.trackingEm,
    CARD_COLORS.white,
    1,
  );

  return {
    front: {
      name: nameBlock,
      title: titleBlock,
      code: codeBlock,
      accentY: FRONT.accent.y + nameShift + titleShift,
    },
    back: {
      brand: brandBlock,
      claim: claimBlock,
      established: establishedBlock,
    },
  };
}

/** Red rule fixed under the name block. */
export function accentTop(layout: CardLayout): number {
  return layout.front.accentY;
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
