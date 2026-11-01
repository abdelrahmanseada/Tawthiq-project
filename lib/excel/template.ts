import ExcelJS from "exceljs";
import { addDays } from "@/lib/format";
import { translate } from "@/lib/i18n";
import type { Locale } from "@/lib/locale";
import { neutralizeForSpreadsheet } from "@/lib/text";
import {
  EMPLOYEE_SHEET_NAME,
  HEADER_LABELS,
  INSTRUCTIONS_SHEET_NAME,
  MAX_IMPORT_ROWS,
  TEMPLATE_HEADERS,
} from "./constants";

/** Builds the localized .xlsx template: headers, sample row, validation, instructions. */
export async function buildEmployeeTemplate(locale: Locale): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = translate(locale, "brand.name");
  workbook.created = new Date();
  workbook.modified = new Date();

  const rtl = false;
  const sheet = workbook.addWorksheet(EMPLOYEE_SHEET_NAME, {
    properties: { defaultRowHeight: 20 },
    views: [{ state: "frozen", ySplit: 1, rightToLeft: rtl }],
  });

  sheet.columns = TEMPLATE_HEADERS.map((header) => ({
    header: HEADER_LABELS[locale][header],
    key: header,
    width: header === "full_name" ? 32 : header === "photo_filename" ? 26 : 22,
  }));

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 12 };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };
  headerRow.alignment = { vertical: "middle", horizontal: rtl ? "right" : "left" };
  headerRow.height = 24;

  const sampleExpiry = addDays(new Date(), 365).toISOString().slice(0, 10);
  sheet.addRow({
    employee_code: "EMP-0001",
    full_name: "Amelia Hart",
    department: "Operations",
    job_title: "Maintenance Technician",
    expires_at: sampleExpiry,
    photo_filename: "employee-photo.jpg",
  });
  sheet.getRow(2).font = { italic: true, color: { argb: "FF64748B" } };

  sheet.autoFilter = { from: "A1", to: `F${Math.max(2, MAX_IMPORT_ROWS + 1)}` };

  for (let row = 2; row <= MAX_IMPORT_ROWS + 1; row += 1) {
    sheet.getCell(`A${row}`).dataValidation = {
      type: "textLength",
      operator: "between",
      allowBlank: false,
      formulae: [1, 64],
      showErrorMessage: true,
      errorTitle: HEADER_LABELS[locale].employee_code,
      error: translate(locale, "employees.codeHint"),
    };
    sheet.getCell(`B${row}`).dataValidation = {
      type: "textLength",
      operator: "between",
      allowBlank: false,
      formulae: [2, 200],
      showErrorMessage: true,
      errorTitle: HEADER_LABELS[locale].full_name,
      error: translate(locale, "validation.too_short"),
    };
    sheet.getCell(`E${row}`).dataValidation = {
      type: "date",
      operator: "between",
      allowBlank: true,
      formulae: [new Date(), addDays(new Date(), 3650)],
      showErrorMessage: true,
      errorTitle: HEADER_LABELS[locale].expires_at,
      error: translate(locale, "employees.expiresHint"),
    };
  }

  const instructions = workbook.addWorksheet(INSTRUCTIONS_SHEET_NAME, {
    views: [{ state: "frozen", ySplit: 1, rightToLeft: rtl }],
    properties: { defaultRowHeight: 22 },
  });
  instructions.columns = [{ width: 4 }, { width: 120 }];
  instructions.mergeCells("A1:B1");
  const title = instructions.getCell("A1");
  title.value = translate(locale, "imports.templateHint");
  title.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };
  title.alignment = { vertical: "middle" };
  instructions.getRow(1).height = 28;

  const labels = HEADER_LABELS[locale];
  const lines: Array<[string, string]> = [
    [labels.employee_code, translate(locale, "employees.codeHint")],
    [labels.full_name, translate(locale, "validation.too_short")],
    [labels.department, translate(locale, "imports.columns.department")],
    [labels.job_title, translate(locale, "imports.columns.job_title")],
    [labels.expires_at, translate(locale, "employees.expiresHint")],
    [labels.photo_filename, translate(locale, "imports.photoZipHint")],
    [translate(locale, "imports.requiredHeadersNote"), translate(locale, "imports.maxRowsNote")],
    [translate(locale, "imports.photoZipNote"), translate(locale, "imports.previewInvalidNotice")],
    [translate(locale, "imports.rollback"), translate(locale, "imports.confirmRollback")],
  ];

  let rowIndex = 3;
  for (const [label, text] of lines) {
    instructions.getCell(`A${rowIndex}`).value = neutralizeForSpreadsheet(label);
    instructions.getCell(`B${rowIndex}`).value = neutralizeForSpreadsheet(text);
    instructions.getCell(`A${rowIndex}`).font = { bold: true };
    instructions.getCell(`B${rowIndex}`).alignment = { wrapText: true, vertical: "top", horizontal: rtl ? "right" : "left" };
    rowIndex += 1;
  }

  instructions.getCell(`B${rowIndex}`).value = TEMPLATE_HEADERS.map((header) => labels[header]).join(", ");
  instructions.getCell(`B${rowIndex}`).font = { bold: true };
  instructions.getCell(`B${rowIndex}`).alignment = { wrapText: true };

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
