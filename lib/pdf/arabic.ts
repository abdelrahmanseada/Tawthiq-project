import bidiFactory from "bidi-js";

/**
 * Arabic shaping + bidi reordering for PDF rendering.
 *
 * pdf-lib draws glyphs left-to-right with no shaping engine, so Arabic text must be
 * converted to Arabic Presentation Forms (isolated/final/initial/medial, plus
 * lam-alef ligatures) and then reordered into visual order with the Unicode bidi
 * algorithm before drawing.
 */

type Forms = readonly [isolated: string, final: string | null, initial: string | null, medial: string | null];

const ZWJ = "\u200D";
const ZWNJ = "\u200C";
const TATWEEL = "\u0640";

const MARK = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/u;

// prettier-ignore
const ARABIC_FORMS: Record<string, Forms> = {
  "\u0621": ["\uFE80", null, null, null], // ء
  "\u0622": ["\uFE81", "\uFE82", null, null], // آ
  "\u0623": ["\uFE83", "\uFE84", null, null], // أ
  "\u0624": ["\uFE85", "\uFE86", null, null], // ؤ
  "\u0625": ["\uFE87", "\uFE88", null, null], // إ
  "\u0626": ["\uFE89", "\uFE8A", "\uFE8B", "\uFE8C"], // ئ
  "\u0627": ["\uFE8D", "\uFE8E", null, null], // ا
  "\u0628": ["\uFE8F", "\uFE90", "\uFE91", "\uFE92"], // ب
  "\u0629": ["\uFE93", "\uFE94", null, null], // ة
  "\u062A": ["\uFE95", "\uFE96", "\uFE97", "\uFE98"], // ت
  "\u062B": ["\uFE99", "\uFE9A", "\uFE9B", "\uFE9C"], // ث
  "\u062C": ["\uFE9D", "\uFE9E", "\uFE9F", "\uFEA0"], // ج
  "\u062D": ["\uFEA1", "\uFEA2", "\uFEA3", "\uFEA4"], // ح
  "\u062E": ["\uFEA5", "\uFEA6", "\uFEA7", "\uFEA8"], // خ
  "\u062F": ["\uFEA9", "\uFEAA", null, null], // د
  "\u0630": ["\uFEAB", "\uFEAC", null, null], // ذ
  "\u0631": ["\uFEAD", "\uFEAE", null, null], // ر
  "\u0632": ["\uFEAF", "\uFEB0", null, null], // ز
  "\u0633": ["\uFEB1", "\uFEB2", "\uFEB3", "\uFEB4"], // س
  "\u0634": ["\uFEB5", "\uFEB6", "\uFEB7", "\uFEB8"], // ش
  "\u0635": ["\uFEB9", "\uFEBA", "\uFEBB", "\uFEBC"], // ص
  "\u0636": ["\uFEBD", "\uFEBE", "\uFEBF", "\uFEC0"], // ض
  "\u0637": ["\uFEC1", "\uFEC2", "\uFEC3", "\uFEC4"], // ط
  "\u0638": ["\uFEC5", "\uFEC6", "\uFEC7", "\uFEC8"], // ظ
  "\u0639": ["\uFEC9", "\uFECA", "\uFECB", "\uFECC"], // ع
  "\u063A": ["\uFECD", "\uFECE", "\uFECF", "\uFED0"], // غ
  "\u0641": ["\uFED1", "\uFED2", "\uFED3", "\uFED4"], // ف
  "\u0642": ["\uFED5", "\uFED6", "\uFED7", "\uFED8"], // ق
  "\u0643": ["\uFED9", "\uFEDA", "\uFEDB", "\uFEDC"], // ك
  "\u0644": ["\uFEDD", "\uFEDE", "\uFEDF", "\uFEE0"], // ل
  "\u0645": ["\uFEE1", "\uFEE2", "\uFEE3", "\uFEE4"], // م
  "\u0646": ["\uFEE5", "\uFEE6", "\uFEE7", "\uFEE8"], // ن
  "\u0647": ["\uFEE9", "\uFEEA", "\uFEEB", "\uFEEC"], // ه
  "\u0648": ["\uFEED", "\uFEEE", null, null], // و
  "\u0649": ["\uFEEF", "\uFEF0", null, null], // ى
  "\u064A": ["\uFEF1", "\uFEF2", "\uFEF3", "\uFEF4"], // ي
  [TATWEEL]: [TATWEEL, TATWEEL, TATWEEL, TATWEEL], // ـ
  // Persian / Urdu letters commonly found in names (best-effort support)
  "\u067E": ["\uFB56", "\uFB57", "\uFB58", "\uFB59"], // پ
  "\u0686": ["\uFB7A", "\uFB7B", "\uFB7C", "\uFB7D"], // چ
  "\u0698": ["\uFB8A", "\uFB8B", null, null], // ژ
  "\u06A9": ["\uFB8E", "\uFB8F", "\uFB90", "\uFB91"], // ک
  "\u06AF": ["\uFB92", "\uFB93", "\uFB94", "\uFB95"], // گ
  "\u06CC": ["\uFBFC", "\uFBFD", "\uFBFE", "\uFBFF"], // ی
};

// Lam + alef ligatures: [isolated, final]
const LAM_ALEF_LIGATURES: Record<string, readonly [string, string]> = {
  "\u0622": ["\uFEF5", "\uFEF6"],
  "\u0623": ["\uFEF7", "\uFEF8"],
  "\u0625": ["\uFEF9", "\uFEFA"],
  "\u0627": ["\uFEFB", "\uFEFC"],
};

function isArabicLetter(char: string): boolean {
  return ARABIC_FORMS[char] !== undefined;
}

/** Previous non-mark character index, or -1 when a barrier (space/punctuation/ZWJ) is hit. */
function previousJoiner(chars: string[], index: number): string | null {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const char = chars[cursor]!;
    if (MARK.test(char)) continue;
    if (char === ZWJ) return ZWJ;
    if (!isArabicLetter(char)) return null;
    return char;
  }
  return null;
}

function nextJoiner(chars: string[], index: number): string | null {
  for (let cursor = index + 1; cursor < chars.length; cursor += 1) {
    const char = chars[cursor]!;
    if (MARK.test(char)) continue;
    if (char === ZWJ) return ZWJ;
    if (!isArabicLetter(char)) return null;
    return char;
  }
  return null;
}

/** Convert logical Arabic text to presentation forms. Non-Arabic text is untouched. */
export function shapeArabic(input: string): string {
  const chars = Array.from(input);
  let output = "";

  for (let index = 0; index < chars.length; index += 1) {
    const char = chars[index]!;
    const forms = ARABIC_FORMS[char];

    if (!forms) {
      output += char;
      continue;
    }

    const previous = previousJoiner(chars, index);
    const next = nextJoiner(chars, index);
    // A previous letter can join forward only if it has an initial or medial form.
    const joinsPrevious =
      previous === ZWJ ||
      (previous !== null && isArabicLetter(previous) && (ARABIC_FORMS[previous]?.[2] !== null || previous === TATWEEL));
    // The next letter can join backward only if it has a final form.
    const joinsNext =
      next === ZWJ || (next !== null && isArabicLetter(next) && ARABIC_FORMS[next]?.[1] !== null);

    // Lam + alef must become a single ligature glyph.
    if (char === "\u0644" && next !== null && LAM_ALEF_LIGATURES[next]) {
      const ligature = LAM_ALEF_LIGATURES[next]!;
      output += joinsPrevious ? ligature[1] : ligature[0];
      // Skip marks between lam and alef, then the alef itself.
      let cursor = index + 1;
      while (cursor < chars.length && MARK.test(chars[cursor]!)) cursor += 1;
      index = cursor;
      continue;
    }

    if (joinsPrevious && joinsNext && forms[3]) output += forms[3];
    else if (joinsPrevious && forms[1]) output += forms[1];
    else if (joinsNext && forms[2]) output += forms[2];
    else output += forms[0];
  }

  return output;
}

const bidi = bidiFactory();

/** Reorder shaped text into visual order for left-to-right PDF drawing. */
export function reorderBidi(text: string, baseDirection: "rtl" | "ltr" | "auto" = "auto"): string {
  if (!/[\u0590-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/u.test(text)) return text;
  const levels = bidi.getEmbeddingLevels(text, baseDirection);
  return bidi.getReorderedString(text, levels);
}

export function detectBaseDirection(text: string): "rtl" | "ltr" {
  return /[\u0590-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/u.test(text) ? "rtl" : "ltr";
}

/**
 * Full pipeline used before drawing: shape then bidi reorder.
 * `baseDirection: "auto"` picks RTL when any Arabic character is present.
 */
export function preparePdfText(text: string, baseDirection: "rtl" | "ltr" | "auto" = "auto"): string {
  const base = baseDirection === "auto" ? detectBaseDirection(text) : baseDirection;
  return reorderBidi(shapeArabic(text), base);
}

export function containsArabic(text: string): boolean {
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/u.test(text);
}

export { ZWNJ };
