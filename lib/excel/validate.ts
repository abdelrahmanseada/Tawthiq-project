import type { EmployeeStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { addDays, parseIsoDateOnly, utcToday } from "@/lib/format";
import { normalizeUnicode, sanitizeSpreadsheetCell, truncate } from "@/lib/text";
import { LATIN_TEXT_PATTERN } from "@/lib/config";
import { EMPLOYEE_CODE_PATTERN, ISO_DATE_PATTERN } from "./constants";
import type { ParsedImportRow } from "./parse";

export interface RowIssue {
  column: string;
  message: string;
}

export interface ExistingEmployeeSnapshot {
  id: string;
  employee_code: string;
  full_name: string;
  department: string | null;
  job_title: string | null;
  status: EmployeeStatus;
  deleted_at: string | null;
}

export interface ValidatedImportRow {
  rowNumber: number;
  employee_code: string;
  full_name: string;
  department: string | null;
  job_title: string | null;
  expires_at: string | null;
  photo_filename: string | null;
  issues: RowIssue[];
  duplicate: boolean;
  existing: ExistingEmployeeSnapshot | null;
}

export interface ImportPreviewData {
  rows: ValidatedImportRow[];
  validCount: number;
  errorCount: number;
  duplicateCount: number;
  totalRows: number;
}

export interface ExistingEmployeeRecord {
  id: string;
  employee_code: string;
  full_name: string;
  department: string | null;
  job_title: string | null;
  status: EmployeeStatus;
  deleted_at: Date | null;
}

export interface ValidateImportOptions {
  companyId: string;
  photoFilenames: Set<string>;
  hasPhotoZip: boolean;
  now?: Date;
  /** Test hook: supply existing DB rows instead of querying. */
  existingRows?: ExistingEmployeeRecord[];
}

const MAX_VALIDITY_YEARS = 10;

/**
 * Validate every parsed row (nothing is written). Errors are collected per row and
 * column so the admin can download an actionable report.
 */
export async function validateImportRows(
  parsedRows: ParsedImportRow[],
  options: ValidateImportOptions,
): Promise<ImportPreviewData> {
  const today = utcToday(options.now ?? new Date());
  const latest = addDays(today, MAX_VALIDITY_YEARS * 365);

  const codes = parsedRows.map((row) => sanitizeSpreadsheetCell(row.values.employee_code ?? "")).filter(Boolean);
  const existingRows =
    options.existingRows ??
    (codes.length > 0
      ? await prisma.employee.findMany({
          where: { company_id: options.companyId, employee_code: { in: codes } },
          select: {
            id: true,
            employee_code: true,
            full_name: true,
            department: true,
            job_title: true,
            status: true,
            deleted_at: true,
          },
        })
      : []);
  const existingByCode = new Map(existingRows.map((row) => [row.employee_code, row]));

  const seenCodes = new Map<string, number>();
  const rows: ValidatedImportRow[] = [];

  for (const parsed of parsedRows) {
    const issues: RowIssue[] = [];

    const employeeCode = sanitizeSpreadsheetCell(parsed.values.employee_code ?? "");
    const fullName = sanitizeSpreadsheetCell(parsed.values.full_name ?? "");
    const departmentRaw = sanitizeSpreadsheetCell(parsed.values.department ?? "");
    const jobTitleRaw = sanitizeSpreadsheetCell(parsed.values.job_title ?? "");
    const expiresRaw = sanitizeSpreadsheetCell(parsed.values.expires_at ?? "");
    const photoRaw = sanitizeSpreadsheetCell(parsed.values.photo_filename ?? "");

    if (!employeeCode) {
      issues.push({ column: "employee_code", message: "required" });
    } else if (employeeCode.length > 64) {
      issues.push({ column: "employee_code", message: "too_long" });
    } else if (!EMPLOYEE_CODE_PATTERN.test(employeeCode)) {
      issues.push({ column: "employee_code", message: "invalid_employee_code" });
    }

    if (!fullName) {
      issues.push({ column: "full_name", message: "required" });
    } else if (fullName.length < 2) {
      issues.push({ column: "full_name", message: "too_short" });
    } else if (fullName.length > 200) {
      issues.push({ column: "full_name", message: "too_long" });
    } else if (!LATIN_TEXT_PATTERN.test(fullName)) {
      issues.push({ column: "full_name", message: "latin_only" });
    }

    const department = departmentRaw ? truncate(departmentRaw, 120) : null;
    const jobTitle = jobTitleRaw ? truncate(jobTitleRaw, 120) : null;
    if (departmentRaw.length > 120) issues.push({ column: "department", message: "too_long" });
    if (jobTitleRaw.length > 120) issues.push({ column: "job_title", message: "too_long" });
    if (departmentRaw && !LATIN_TEXT_PATTERN.test(departmentRaw)) issues.push({ column: "department", message: "latin_only" });
    if (jobTitleRaw && !LATIN_TEXT_PATTERN.test(jobTitleRaw)) issues.push({ column: "job_title", message: "latin_only" });

    let expiresAt: string | null = null;
    if (expiresRaw) {
      if (!ISO_DATE_PATTERN.test(expiresRaw)) {
        issues.push({ column: "expires_at", message: "invalid_date" });
      } else {
        const parsedDate = parseIsoDateOnly(expiresRaw);
        if (!parsedDate) {
          issues.push({ column: "expires_at", message: "invalid_date" });
        } else if (parsedDate.getTime() < today.getTime()) {
          issues.push({ column: "expires_at", message: "date_in_past" });
        } else if (parsedDate.getTime() > latest.getTime()) {
          issues.push({ column: "expires_at", message: "date_too_far" });
        } else {
          expiresAt = expiresRaw;
        }
      }
    }

    let photoFilename: string | null = null;
    if (photoRaw) {
      const baseName = normalizeUnicode(photoRaw.replace(/\\/g, "/").split("/").pop() ?? "");
      if (!baseName || baseName.length > 255) {
        issues.push({ column: "photo_filename", message: "too_long" });
      } else if (!options.hasPhotoZip) {
        issues.push({ column: "photo_filename", message: "photo_not_found" });
      } else if (!options.photoFilenames.has(baseName.toLowerCase())) {
        issues.push({ column: "photo_filename", message: "photo_not_found" });
      } else {
        photoFilename = baseName;
      }
    }

    if (employeeCode) {
      const sheetKey = employeeCode.toLowerCase();
      const firstRow = seenCodes.get(sheetKey);
      if (firstRow !== undefined) {
        issues.push({ column: "employee_code", message: `duplicate_in_sheet (row ${firstRow})` });
      } else {
        seenCodes.set(sheetKey, parsed.rowNumber);
      }
    }

    const existing = employeeCode ? existingByCode.get(employeeCode) : undefined;

    rows.push({
      rowNumber: parsed.rowNumber,
      employee_code: employeeCode,
      full_name: fullName,
      department,
      job_title: jobTitle,
      expires_at: expiresAt,
      photo_filename: photoFilename,
      issues,
      duplicate: Boolean(existing),
      existing: existing
        ? {
            id: existing.id,
            employee_code: existing.employee_code,
            full_name: existing.full_name,
            department: existing.department,
            job_title: existing.job_title,
            status: existing.status,
            deleted_at: existing.deleted_at ? existing.deleted_at.toISOString() : null,
          }
        : null,
    });
  }

  const validRows = rows.filter((row) => row.issues.length === 0);
  return {
    rows,
    validCount: validRows.length,
    errorCount: rows.length - validRows.length,
    duplicateCount: validRows.filter((row) => row.duplicate).length,
    totalRows: rows.length,
  };
}
