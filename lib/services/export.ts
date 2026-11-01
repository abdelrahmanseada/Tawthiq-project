import ExcelJS from "exceljs";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { formatDate, formatDateTime, formatIsoDate } from "@/lib/format";
import { translate } from "@/lib/i18n";
import type { Locale } from "@/lib/locale";
import { neutralizeForSpreadsheet } from "@/lib/text";
import type { EmployeeListQuery, scanLogQuerySchema } from "@/lib/validation/schemas";
import type { z } from "zod";

type ScanQuery = z.infer<typeof scanLogQuerySchema>;

function csvCell(value: string | number | null | undefined): string {
  const text = neutralizeForSpreadsheet(value === null || value === undefined ? "" : String(value));
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(headers: string[], rows: Array<Array<string | number | null>>): Buffer {
  const lines = [headers.map(csvCell).join(",")];
  for (const row of rows) lines.push(row.map(csvCell).join(","));
  return Buffer.from(`\uFEFF${lines.join("\r\n")}`, "utf8");
}

export interface ExportFile {
  buffer: Buffer;
  filename: string;
  contentType: string;
}

export async function exportEmployees(
  companyId: string,
  query: EmployeeListQuery,
  format: "csv" | "xlsx",
  locale: Locale,
): Promise<ExportFile> {
  const where: Prisma.EmployeeWhereInput = {
    company_id: companyId,
    deleted_at: null,
    ...(query.status ? { status: query.status } : {}),
    ...(query.department ? { department: query.department } : {}),
    ...(query.q
      ? {
          OR: [
            { full_name: { contains: query.q, mode: "insensitive" } },
            { employee_code: { contains: query.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const employees = await prisma.employee.findMany({
    where,
    orderBy: { full_name: "asc" },
    take: 20_000,
    include: { cards: { orderBy: { issued_at: "desc" }, take: 1 } },
  });

  const headers = [
    translate(locale, "export.employees.code"),
    translate(locale, "export.employees.name"),
    translate(locale, "export.employees.department"),
    translate(locale, "export.employees.jobTitle"),
    translate(locale, "export.employees.status"),
    translate(locale, "export.employees.cardStatus"),
    translate(locale, "export.employees.validUntil"),
    translate(locale, "export.employees.photo"),
    translate(locale, "export.employees.created"),
  ];

  const rows = employees.map((employee) => {
    const card = employee.cards[0];
    return [
      employee.employee_code,
      employee.full_name,
      employee.department ?? "",
      employee.job_title ?? "",
      translate(locale, `statuses.employee${employee.status === "ACTIVE" ? "Active" : employee.status === "SUSPENDED" ? "Suspended" : "Terminated"}`),
      card
        ? translate(locale, card.status === "ACTIVE" ? "statuses.cardActive" : "statuses.cardRevoked")
        : translate(locale, "common.none"),
      card ? formatDate(card.expires_at, locale) : "",
      employee.photo_path ? translate(locale, "common.yes") : translate(locale, "common.no"),
      formatDate(employee.created_at, locale),
    ];
  });

  if (format === "csv") {
    return {
      buffer: toCsv(headers, rows),
      filename: `employees-${formatIsoDate(new Date())}.csv`,
      contentType: "text/csv; charset=utf-8",
    };
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = translate(locale, "brand.name");
  const sheet = workbook.addWorksheet(translate(locale, "export.employees.sheet"), {
    views: [{ state: "frozen", ySplit: 1, rightToLeft: false }],
  });
  sheet.addRow(headers);
  for (const row of rows) sheet.addRow(row.map((cell) => neutralizeForSpreadsheet(String(cell ?? ""))));
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };
  header.height = 22;
  sheet.columns.forEach((column, index) => {
    column.width = [18, 30, 22, 26, 14, 14, 18, 10, 16][index] ?? 18;
    column.alignment = { vertical: "middle", horizontal: false ? "right" : "left" };
  });
  sheet.autoFilter = { from: "A1", to: `I${Math.max(1, rows.length + 1)}` };
  const buffer = await workbook.xlsx.writeBuffer();
  return {
    buffer: Buffer.from(buffer),
    filename: `employees-${formatIsoDate(new Date())}.xlsx`,
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
}

export async function exportScanLogs(companyId: string, query: ScanQuery, locale: Locale): Promise<ExportFile> {
  const { listScanLogs } = await import("@/lib/services/logs");
  const result = await listScanLogs(companyId, { ...query, page: 1 }, { exportAll: true });
  const rows = result.rows.map((scan) => [
    formatDateTime(scan.created_at, locale),
    translate(
      locale,
      scan.result === "VALID"
        ? "statuses.scanValid"
        : scan.result === "INVALID"
          ? "statuses.scanInvalid"
          : scan.result === "EXPIRED"
            ? "statuses.scanExpired"
            : scan.result === "REVOKED"
              ? "statuses.scanRevoked"
              : "statuses.scanSuspended",
    ),
    scan.card?.employee?.full_name ?? translate(locale, "common.unknown"),
    scan.token_prefix,
    scan.ip_hash.slice(0, 16),
    scan.reported ? translate(locale, "common.yes") : translate(locale, "common.no"),
  ]);
  const headers = [
    translate(locale, "logs.dateTime"),
    translate(locale, "logs.result"),
    translate(locale, "logs.employee"),
    translate(locale, "logs.prefix"),
    translate(locale, "logs.ipHash"),
    translate(locale, "logs.reported"),
  ];
  return {
    buffer: toCsv(headers, rows),
    filename: `scan-logs-${formatIsoDate(new Date())}.csv`,
    contentType: "text/csv; charset=utf-8",
  };
}

export interface AuditExportRow {
  created_at: Date;
  action: string;
  adminName: string | null;
  entity: string;
  entityId: string | null;
  metadata: unknown;
}

export function buildAuditCsv(rows: AuditExportRow[], locale: Locale): ExportFile {
  const headers = [
    translate(locale, "logs.dateTime"),
    translate(locale, "logs.admin"),
    translate(locale, "logs.action"),
    translate(locale, "logs.entity"),
    translate(locale, "logs.details"),
  ];
  const data = rows.map((row) => [
    formatDateTime(row.created_at, locale),
    row.adminName ?? translate(locale, "logs.system"),
    translate(locale, hasAuditAction(row.action) ? `audit.actions.${row.action}` : "audit.unknownAction"),
    translate(locale, hasAuditEntity(row.entity) ? `audit.entities.${row.entity}` : "audit.unknownEntity"),
    row.entityId ?? "",
  ]);
  return {
    buffer: toCsv(headers, data),
    filename: `audit-log-${formatIsoDate(new Date())}.csv`,
    contentType: "text/csv; charset=utf-8",
  };
}

const AUDIT_ACTIONS = new Set([
  "auth.login_success",
  "auth.password_verified",
  "auth.2fa_failed",
  "auth.2fa_rate_limited",
  "auth.2fa_enabled",
  "auth.login_failed",
  "auth.login_blocked",
  "auth.recovery_failed",
  "auth.recovery_used",
  "auth.logout",
  "admin.password_changed",
  "admin.created",
  "admin.role_changed",
  "admin.deactivated",
  "admin.2fa_reset",
  "company.settings_updated",
  "company.logo_updated",
  "company.logo_removed",
  "employee.created",
  "employee.updated",
  "employee.status_changed",
  "employee.deleted",
  "employee.restored",
  "employee.photo_removed",
  "card.revoked",
  "card.regenerated",
  "card.bulk_reissued",
  "card.bulk_a4_download",
  "card.bulk_zip_download",
  "card.test_printed",
  "import.previewed",
  "import.started",
  "import.completed",
  "import.failed",
  "import.rolled_back",
]);

const AUDIT_ENTITIES = new Set(["AdminUser", "Company", "Employee", "Card", "ImportBatch", "System"]);

export function hasAuditAction(action: string): boolean {
  return AUDIT_ACTIONS.has(action);
}

export function hasAuditEntity(entity: string): boolean {
  return AUDIT_ENTITIES.has(entity);
}
