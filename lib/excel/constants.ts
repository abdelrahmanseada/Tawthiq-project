/** Excel import contract shared by the template, parser and validator. */
import type { Locale } from "@/lib/locale";

export const REQUIRED_HEADERS = ["employee_code", "full_name"] as const;
export const OPTIONAL_HEADERS = ["department", "job_title", "expires_at", "photo_filename"] as const;
export const TEMPLATE_HEADERS = [...REQUIRED_HEADERS, ...OPTIONAL_HEADERS] as const;
export type TemplateHeader = (typeof TEMPLATE_HEADERS)[number];

/** Human-facing column labels. Canonical English keys are always accepted too. */
export const HEADER_LABELS: Record<Locale, Record<TemplateHeader, string>> = {
  en: {
    employee_code: "Employee code",
    full_name: "Full name",
    department: "Department",
    job_title: "Job title",
    expires_at: "Expiry date",
    photo_filename: "Photo file name",
  },
};

export function normalizeHeader(value: string): string {
  return value
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/_+/g, "_");
}

/** Resolve an English or localized header to its canonical internal key. */
export function resolveTemplateHeader(value: string): TemplateHeader | null {
  const normalized = normalizeHeader(value);
  for (const header of TEMPLATE_HEADERS) {
    if (normalized === header) return header;
    if (normalized === normalizeHeader(HEADER_LABELS.en[header])) return header;
  }
  return null;
}

export function templateHeaderLabels(locale: Locale): string[] {
  return TEMPLATE_HEADERS.map((header) => HEADER_LABELS[locale][header]);
}

export const EMPLOYEE_SHEET_NAME = "Employees";
export const INSTRUCTIONS_SHEET_NAME = "Instructions";

export const MAX_IMPORT_ROWS = 5_000;
export const MAX_XLSX_BYTES = 10 * 1024 * 1024;
export const MAX_ZIP_BYTES = 200 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_ZIP_ENTRIES = 5_000;
export const MAX_ZIP_UNCOMPRESSED_BYTES = 300 * 1024 * 1024;
export const MAX_ZIP_COMPRESSION_RATIO = 200;

export const EMPLOYEE_CODE_PATTERN = /^[\p{L}\p{N}._-]{1,64}$/u;
export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class ImportFileError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ImportFileError";
    this.code = code;
  }
}
