import ExcelJS from "exceljs";
import { hasMessage, translate } from "@/lib/i18n";
import type { Locale } from "@/lib/locale";
import { neutralizeForSpreadsheet } from "@/lib/text";

export interface ImportErrorReportRow {
  rowNumber: number;
  employee_code: string;
  full_name: string;
  errors: string;
}

/** Error report workbook with localized headers and formula-injection neutralization. */
export async function buildErrorReport(rows: ImportErrorReportRow[], locale: Locale): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = translate(locale, "brand.name");
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(translate(locale, "imports.summaryTitle"), {
    views: [{ state: "frozen", ySplit: 1, rightToLeft: false }],
  });

  sheet.columns = [
    { header: translate(locale, "imports.rowNumber"), key: "rowNumber", width: 10 },
    { header: translate(locale, "imports.columns.employee_code"), key: "employee_code", width: 26 },
    { header: translate(locale, "imports.columns.full_name"), key: "full_name", width: 34 },
    { header: translate(locale, "imports.message"), key: "errors", width: 70 },
  ];

  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFB91C1C" } };
  header.height = 22;

  for (const row of rows) {
    sheet.addRow({
      rowNumber: row.rowNumber,
      employee_code: neutralizeForSpreadsheet(row.employee_code),
      full_name: neutralizeForSpreadsheet(row.full_name),
      errors: neutralizeForSpreadsheet(
        row.errors
          .split(" | ")
          .map((code) => {
            const clean = code.replace(/\s*\(row \d+\)$/, "");
            return hasMessage(locale, `validation.${clean}`) ? translate(locale, `validation.${clean}`) : code;
          })
          .join(" | "),
      ),
    });
  }

  sheet.getColumn("errors").alignment = { wrapText: true, vertical: "top" };
  sheet.autoFilter = { from: "A1", to: `D${Math.max(1, rows.length + 1)}` };

  const summary = workbook.addWorksheet(translate(locale, "imports.previewSummary"));
  summary.columns = [{ width: 26 }, { width: 80 }];
  summary.addRow([translate(locale, "imports.totalRows"), rows.length]);
  summary.addRow([translate(locale, "imports.message"), translate(locale, "imports.previewInvalidNotice")]);
  summary.getRow(1).font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
