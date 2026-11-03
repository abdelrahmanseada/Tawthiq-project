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
  logo: { x: 4, y: 1.5, w: 8, h: 8, radius: 1.4, padding: 0.7 },
  company: { x: 13.5, y: 1.5, w: 68.1, h: 9, minPt: 7, maxPt: 9, maxLines: 2 },
  photo: { x: 4, y: 16, w: 20, h: 27, radius: 2, borderPt: 0.4 },
  text: { x: 27, y: 16.5, w: 27.8, bottom: 44 },
  name: { minPt: 8.5, maxPt: 11.5, maxLines: 2, gapAfter: 1.2 },
  title: { minPt: 6.5, maxPt: 7.8, maxLines: 2, gapAfter: 0.8 },
  department: { pt: 6.5, maxLines: 1 },
  qrPanel: { x: 55.0, y: 15.3, w: 26.6, h: 26.6, radius: 1.6 },
  qr: { x: 55.8, y: 16.1, w: 25.7, h: 25.7, quietModules: 4, minModuleMm: 0.45 },
  scanLabel: { x: 55.0, y: 42.2, w: 26.6, h: 2.2, pt: 5.2 },
  footer: { x: 4, right: 81.6, y: 47.5, h: 2.5, pt: 6.5 },
} as const;

export const BACK = {
  logo: { x: 28.8, y: 7, w: 28, h: 28, radius: 3, padding: 2.8 },
  accent: { x: 35, y: 41.3, w: 15.6, h: 0.6 },
  company: { x: 8, y: 35.8, w: 69.6, h: 4.2, minPt: 7, maxPt: 12, maxLines: 1 },
  tagline: { x: 8, y: 42.0, w: 69.6, h: 2.7, minPt: 5.5, maxPt: 6.8, maxLines: 1 },
  website: { x: 8, y: 44.95, w: 69.6, h: 2.7, minPt: 5, maxPt: 6.5, maxLines: 1 },
  host: { x: 8, y: 47.9, w: 69.6, h: 2.1, minPt: 4.6, maxPt: 4.9, maxLines: 1 },
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
    scanLabel: TextBlock;
  };
  back: {
    company: TextBlock;
    tagline: TextBlock | null;
    website: TextBlock | null;
    host: TextBlock | null;
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
  const titleFit = title ? fitText(title, FRONT.text.w, 2, FRONT.title.maxPt, FRONT.title.minPt, "regular") : null;
  const titleBlock = titleFit
    ? block(title, FRONT.text.x, cursor, FRONT.text.w, titleFit.fontSizePt, titleFit.fontSizePt * 1.2, "regular", CARD_COLORS.ink, 2, titleFit.lines)
    : null;
  if (titleBlock) cursor += titleBlock.h + FRONT.title.gapAfter;

  const deptFit = department ? fitText(department, FRONT.text.w, 1, FRONT.department.pt, FRONT.department.pt, "regular") : null;
  const departmentBlock = deptFit
    ? block(department, FRONT.text.x, cursor, FRONT.text.w, FRONT.department.pt, 8.2, "regular", CARD_COLORS.muted, 1, deptFit.lines)
    : null;

  const scanLabelBlock = block("Scan to verify", FRONT.scanLabel.x, FRONT.scanLabel.y, FRONT.scanLabel.w, FRONT.scanLabel.pt, 6.2, "bold", CARD_COLORS.muted, 1, ["Scan to verify"], "center");

  const footerY = FRONT.footer.y;
  const codeBlock = block(`ID ${input.employeeCode}`, FRONT.footer.x, footerY, 34, 6.5, 7.0, "regular", CARD_COLORS.ink, 1);
  const validText = `Valid until ${input.validUntil}`;
  const validBlock = block(validText, 40, footerY, 41.6, 6.5, 7.0, "regular", CARD_COLORS.ink, 1, [validText], "right");

  // ── Back: a quiet brand panel. ─────────────────────────────────────────────
  const backCompany = fitText(input.companyName, BACK.company.w, BACK.company.maxLines, BACK.company.maxPt, BACK.company.minPt, "bold");
  const backCompanyBlock = block(
    input.companyName,
    BACK.company.x,
    BACK.company.y + (BACK.company.h - backCompany.lines.length * backCompany.fontSizePt * 1.2 * 0.352778) / 2,
    BACK.company.w,
    backCompany.fontSizePt,
    backCompany.fontSizePt * 1.2,
    "bold",
    CARD_COLORS.white,
    1,
    backCompany.lines,
    "center",
  );

  const taglineText = input.tagline?.trim() ?? "";
  const taglineFit = taglineText ? fitText(taglineText, BACK.tagline.w, 1, BACK.tagline.maxPt, BACK.tagline.minPt, "regular") : null;
  const taglineBlock = taglineFit
    ? block(taglineText, BACK.tagline.x, BACK.tagline.y, BACK.tagline.w, taglineFit.fontSizePt, taglineFit.fontSizePt * 1.2, "regular", CARD_COLORS.white, 1, taglineFit.lines, "center")
    : null;

  const websiteText = input.website ? input.website.replace(/^https?:\/\//i, "").replace(/\/$/, "") : "";
  const websiteFit = websiteText ? fitText(websiteText, BACK.website.w, 1, BACK.website.maxPt, BACK.website.minPt, "regular") : null;
  const websiteBlock = websiteFit
    ? block(websiteText, BACK.website.x, BACK.website.y, BACK.website.w, websiteFit.fontSizePt, websiteFit.fontSizePt * 1.2, "regular", CARD_COLORS.white, 1, websiteFit.lines, "center")
    : null;

  const hostFit = input.showVerifyHostOnCard && input.host
    ? fitText(input.host, BACK.host.w, 1, BACK.host.maxPt, BACK.host.minPt, "regular")
    : null;
  const hostBlock = hostFit
    ? block(input.host!, BACK.host.x, BACK.host.y, BACK.host.w, hostFit.fontSizePt, hostFit.fontSizePt * 1.2, "regular", CARD_COLORS.white, 1, hostFit.lines, "center")
    : null;

  return {
    front: {
      company: companyBlock,
      name: nameBlock,
      title: titleBlock,
      department: departmentBlock,
      code: codeBlock,
      validUntil: validBlock,
      scanLabel: scanLabelBlock,
    },
    back: {
      company: backCompanyBlock,
      tagline: taglineBlock,
      website: websiteBlock,
      host: hostBlock,
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
