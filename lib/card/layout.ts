/**
 * The single source of truth for the CR80 card.
 *
 * All coordinates are millimetres from the top-left of the 85.6 Ã— 54 mm card.
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
  ink: "#0B1220",
  muted: "#64748B",
  border: "#D5DCE5",
  white: "#FFFFFF",
  test: "#DC2626",
  pattern: "#0B1220",
} as const;

export const FRONT = {
  header: { x: 0, y: 0, w: CARD_WIDTH_MM, h: 12 },
  accent: { x: 0, y: 12, w: CARD_WIDTH_MM, h: 1 },
  logo: { x: 4, y: 1.5, w: 9, h: 9, radius: 1.5, padding: 0.8 },
  company: { x: 15, y: 1.5, w: 66.6, h: 9, minPt: 7, maxPt: 9, maxLines: 2 },
  photo: { x: 4, y: 16, w: 22, h: 29, radius: 2, borderPt: 0.4 },
  text: { x: 30, y: 17, w: 51.6, bottom: 45 },
  name: { minPt: 9, maxPt: 12, maxLines: 2, gapAfter: 1.5 },
  title: { minPt: 7, maxPt: 8, maxLines: 2, gapAfter: 1 },
  department: { pt: 7, maxLines: 1 },
  footer: { x: 4, right: 81.6, y: 47.5, h: 2.5, pt: 6.5 },
} as const;

export const BACK = {
  header: { x: 0, y: 0, w: CARD_WIDTH_MM, h: 8 },
  accent: { x: 0, y: 8, w: CARD_WIDTH_MM, h: 0.8 },
  panel: { x: 4, y: 12, w: 30, h: 30, radius: 2 },
  qr: { x: 6, y: 14, w: 26, h: 26, quietModules: 4, minModuleMm: 0.45 },
  column: { x: 38, y: 13, w: 43.6, bottom: 44, gap: 2 },
  heading: { pt: 10, maxLines: 1 },
  host: { minPt: 6.5, maxPt: 7.5, maxLines: 2 },
  phone: { minPt: 6.5, maxPt: 7, maxLines: 1 },
  email: { minPt: 6, maxPt: 7, maxLines: 1 },
  returns: { pt: 6, maxLines: 3 },
  footer: { x: 4, y: 47.5, h: 2.5, pt: 6 },
  testBand: { x: 0, y: 51, w: CARD_WIDTH_MM, h: 3 },
} as const;

export interface CardTextInput {
  fullName: string;
  jobTitle: string | null;
  department: string | null;
  employeeCode: string;
  companyName: string;
  validUntil: string;
  host: string | null;
  website: string | null;
  tagline: string | null;
  showVerifyHostOnCard: boolean;
  phone: string;
  email: string;
  hasPhoto: boolean;
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
    company: TextBlock;
    name: TextBlock;
    title: TextBlock | null;
    department: TextBlock | null;
    code: TextBlock;
    validUntil: TextBlock;
  };
  back: {
    company: TextBlock;
    heading: TextBlock;
    host: TextBlock | null;
    website: TextBlock | null;
    phone: TextBlock;
    email: TextBlock;
    returns: TextBlock;
    footer: TextBlock;
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
  while (result.length > 1 && textWidthMm(`${result}â€¦`, fontSizePt, weight) > maxWidthMm) {
    result = result.slice(0, -1).trimEnd();
  }
  return `${result}â€¦`;
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

/** Wrap a host at dots (never truncate) while keeping each label readable. */
export function wrapHost(host: string, maxWidthMm: number, pt: number): string[] {
  if (textWidthMm(host, pt, "bold") <= maxWidthMm) return [host];
  const parts = host.split(".");
  const lines: string[] = [];
  let current = "";
  for (const part of parts) {
    const candidate = current ? `${current}.${part}` : part;
    if (textWidthMm(candidate, pt, "bold") <= maxWidthMm) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = part;
    }
  }
  if (current) lines.push(current);
  return lines;
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

function titleAndDepartment(jobTitle: string | null, department: string | null) {
  const title = jobTitle?.trim() || "";
  const dept = department?.trim() || "";
  if (title && dept && title.toLowerCase() === dept.toLowerCase()) return { title, department: "" };
  return { title, department: dept };
}

export function layoutCard(input: CardTextInput): CardLayout {
  // â”€â”€ Front â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const company = fitText(input.companyName, FRONT.company.w, FRONT.company.maxLines, FRONT.company.maxPt, FRONT.company.minPt, "bold");
  const companyLineHeight = company.fontSizePt * 1.18;
  const companyBlock = block(
    input.companyName,
    FRONT.company.x,
    FRONT.company.y + (FRONT.company.h - company.lines.length * companyLineHeight * 0.352778) / 2,
    FRONT.company.w,
    company.fontSizePt,
    companyLineHeight,
    "bold",
    CARD_COLORS.white,
    2,
    company.lines,
  );

  const name = fitText(input.fullName, FRONT.text.w, FRONT.name.maxLines, FRONT.name.maxPt, FRONT.name.minPt, "bold");
  const nameLineHeight = name.fontSizePt * 1.16;
  const nameBlock = block(
    input.fullName,
    FRONT.text.x,
    FRONT.text.y,
    FRONT.text.w,
    name.fontSizePt,
    nameLineHeight,
    "bold",
    CARD_COLORS.ink,
    2,
    name.lines,
  );

  let cursor = FRONT.text.y + nameBlock.h + FRONT.name.gapAfter;
  const { title, department } = titleAndDepartment(input.jobTitle, input.department);
  const titleFit = title ? fitText(title, FRONT.text.w, 2, 8, 7, "regular") : null;
  const titleBlock = titleFit
    ? block(title, FRONT.text.x, cursor, FRONT.text.w, titleFit.fontSizePt, titleFit.fontSizePt * 1.2, "regular", CARD_COLORS.ink, 2, titleFit.lines)
    : null;
  if (titleBlock) cursor += titleBlock.h + 1;

  const deptFit = department ? fitText(department, FRONT.text.w, 1, 7, 7, "regular") : null;
  const departmentBlock = deptFit
    ? block(department, FRONT.text.x, cursor, FRONT.text.w, 7, 8.2, "regular", CARD_COLORS.muted, 1, deptFit.lines)
    : null;

  const footerY = FRONT.footer.y;
  const codeBlock = block(`ID ${input.employeeCode}`, FRONT.footer.x, footerY, 34, 6.5, 7.0, "regular", CARD_COLORS.ink, 1);
  const validText = `Valid until ${input.validUntil}`;
  const validBlock = block(validText, 40, footerY, 41.6, 6.5, 7.0, "regular", CARD_COLORS.ink, 1, [validText], "right");

  // â”€â”€ Back â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const backCompany = fitText(input.companyName, BACK.column.w, 1, 7, 6, "bold");
  const backCompanyBlock = block(
    input.companyName,
    4,
    2.4,
    CARD_WIDTH_MM - 8,
    backCompany.fontSizePt,
    backCompany.fontSizePt * 1.2,
    "bold",
    CARD_COLORS.white,
    1,
    backCompany.lines,
  );

  let by = BACK.column.y;
  const headingBlock = block("Scan to verify", BACK.column.x, by, BACK.column.w, 10, 11.8, "bold", "primary", 1);
  by += headingBlock.h + BACK.column.gap;

  const websiteText = input.website ? input.website.replace(/^https?:\/\//i, "").replace(/\/$/, "") : "";
  const websiteFit = websiteText ? fitText(websiteText, BACK.column.w, 2, 7.5, 6.5, "bold", false) : null;
  const websiteLines = websiteFit ? wrapHost(websiteText, BACK.column.w, websiteFit.fontSizePt) : [];
  const websiteBlock = websiteFit
    ? block(websiteText, BACK.column.x, by, BACK.column.w, websiteFit.fontSizePt, websiteFit.fontSizePt * 1.2, "bold", CARD_COLORS.ink, 2, websiteLines)
    : null;
  if (websiteBlock) by += websiteBlock.h + BACK.column.gap;

  const phoneFit = fitText(input.phone, BACK.column.w, 1, 7, 6.5, "regular");
  const phoneBlock = block(input.phone, BACK.column.x, by, BACK.column.w, phoneFit.fontSizePt, phoneFit.fontSizePt * 1.25, "regular", CARD_COLORS.ink, 1, phoneFit.lines);
  by += phoneBlock.h + BACK.column.gap;

  const emailFit = fitText(input.email, BACK.column.w, 1, 7, 6, "regular");
  const emailBlock = block(input.email, BACK.column.x, by, BACK.column.w, emailFit.fontSizePt, emailFit.fontSizePt * 1.25, "regular", CARD_COLORS.ink, 1, emailFit.lines);
  by += emailBlock.h + BACK.column.gap;

  const returnText = `If found, please return to ${input.companyName}.`;
  const returnFit = fitText(returnText, BACK.column.w, 3, 6, 6, "regular");
  const returnBlock = block(returnText, BACK.column.x, by, BACK.column.w, 6, 7.2, "regular", CARD_COLORS.muted, 3, returnFit.lines);
  by += returnBlock.h + BACK.column.gap;

  let hostBlock: TextBlock | null = null;
  if (input.showVerifyHostOnCard && input.host) {
    const hostLines = wrapHost(input.host, BACK.column.w, 6.2);
    hostBlock = block(input.host, BACK.column.x, by, BACK.column.w, 6.2, 7.0, "bold", CARD_COLORS.muted, 2, hostLines);
  }

  const backFooter = block(input.tagline ?? "", BACK.footer.x, BACK.footer.y, 72, 6, 7, "regular", CARD_COLORS.muted, 1);

  return {
    front: {
      company: companyBlock,
      name: nameBlock,
      title: titleBlock,
      department: departmentBlock,
      code: codeBlock,
      validUntil: validBlock,
    },
    back: {
      company: backCompanyBlock,
      heading: headingBlock,
      host: hostBlock,
      website: websiteBlock,
      phone: phoneBlock,
      email: emailBlock,
      returns: returnBlock,
      footer: backFooter,
    },
  };
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
