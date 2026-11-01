/**
 * Text normalisation shared by forms and the Excel importer.
 *
 * - Unicode NFC (Arabic presentation variants, composed accents)
 * - control/format characters removed (except line breaks, which are collapsed)
 * - whitespace collapsed
 * - spreadsheet formula triggers neutralised
 */

const CONTROL_CHARACTERS = /[\p{Cc}\p{Cf}]/gu;

export function normalizeUnicode(value: string): string {
  return value.normalize("NFC").replace(CONTROL_CHARACTERS, "").replace(/\s+/gu, " ").trim();
}

/**
 * Neutralise CSV/Excel formula injection by stripping leading trigger characters
 * (=, +, -, @, tab, carriage return). This is applied to every imported cell.
 */
export function stripFormulaTriggers(value: string): string {
  let result = value;
  while (result.length > 0 && /^[=+\-@\t\r]/.test(result)) {
    result = result.slice(1);
  }
  return result;
}

/** Safe value for storage from an untrusted spreadsheet cell. */
export function sanitizeSpreadsheetCell(value: string): string {
  return stripFormulaTriggers(normalizeUnicode(value));
}

/**
 * Safe value for spreadsheet export: a leading apostrophe prevents Excel/LibreOffice
 * from evaluating the cell as a formula while displaying the original text.
 */
export function neutralizeForSpreadsheet(value: string): string {
  const text = normalizeUnicode(value);
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

export function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}
