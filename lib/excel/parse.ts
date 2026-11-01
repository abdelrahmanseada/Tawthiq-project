import ExcelJS from "exceljs";
import { ImportFileError, MAX_IMPORT_ROWS, REQUIRED_HEADERS, TEMPLATE_HEADERS, resolveTemplateHeader } from "./constants";

export interface ParsedImportRow {
  rowNumber: number;
  values: Partial<Record<(typeof TEMPLATE_HEADERS)[number], string>>;
}

export interface ParsedSpreadsheet {
  sheetName: string;
  headers: string[];
  rows: ParsedImportRow[];
}

function hasZipMagic(buffer: Buffer): boolean {
  return buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04;
}

function decodeCsv(buffer: Buffer): string {
  if (buffer.includes(0)) throw new ImportFileError("invalid_file_type", "CSV file contains binary data");
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer).replace(/^\uFEFF/, "");
  } catch {
    throw new ImportFileError("invalid_file_type", "CSV file is not valid UTF-8");
  }
}

/** RFC 4180 CSV parser with quoted fields, escaped quotes and CRLF support. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function dateToIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Excel serial dates (1900 date system) converted to YYYY-MM-DD. */
function excelSerialToIso(serial: number): string {
  const epoch = Date.UTC(1899, 11, 30);
  const date = new Date(epoch + Math.round(serial) * 86_400_000);
  return Number.isNaN(date.getTime()) ? "" : dateToIso(date);
}

function cellToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return dateToIso(value);
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "object") {
    if ("result" in value && value.result !== undefined) return cellToString(value.result as ExcelJS.CellValue);
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join("");
    }
    if ("text" in value && typeof value.text === "string") return value.text;
    if ("hyperlink" in value && typeof value.text === "string") return value.text;
    if ("error" in value) return "";
  }
  return String(value);
}

async function parseXlsx(buffer: Buffer): Promise<{ sheetName: string; grid: string[][]; firstRowNumber: number }> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw new ImportFileError("invalid_file_type", "The spreadsheet could not be read");
  }

  const sheet = workbook.getWorksheet("Employees") ?? workbook.worksheets[0];
  if (!sheet) throw new ImportFileError("sheet_not_found", "The workbook has no worksheets");

  const grid: string[][] = [];
  let firstRowNumber = 1;
  let started = false;

  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (!started) {
      started = true;
      firstRowNumber = rowNumber;
    }
    const values: string[] = [];
    for (let column = 1; column <= TEMPLATE_HEADERS.length + 10; column += 1) {
      values.push(cellToString(row.getCell(column).value));
    }
    grid.push(values);
  });

  // Dates in the expiry column are converted to YYYY-MM-DD later if numeric.
  return { sheetName: sheet.name, grid, firstRowNumber };
}

function parseCsvGrid(text: string): { sheetName: string; grid: string[][]; firstRowNumber: number } {
  const raw = parseCsv(text);
  const grid = raw.filter((row) => row.some((cell) => cell.trim().length > 0));
  return { sheetName: "CSV", grid, firstRowNumber: 1 };
}

function buildRows(grid: string[][], firstRowNumber: number, sheetName: string): ParsedSpreadsheet {
  const headerRow = grid[0];
  if (!headerRow) throw new ImportFileError("empty_file", "The spreadsheet is empty");

  const headerIndex = new Map<string, number>();
  const headers: string[] = [];
  headerRow.forEach((rawHeader, index) => {
    const header = resolveTemplateHeader(rawHeader);
    if (!header) return;
    if (headerIndex.has(header)) {
      throw new ImportFileError("duplicate_headers", `Duplicate column header: ${header}`);
    }
    headerIndex.set(header, index);
    headers.push(header);
  });

  const missing = REQUIRED_HEADERS.filter((header) => !headerIndex.has(header));
  if (missing.length > 0) {
    throw new ImportFileError("missing_headers", `Missing required headers: ${missing.join(", ")}`);
  }

  const rows: ParsedImportRow[] = [];
  for (let index = 1; index < grid.length; index += 1) {
    const rawRow = grid[index]!;
    if (!rawRow.some((cell) => cell.trim().length > 0)) continue;
    if (rows.length >= MAX_IMPORT_ROWS) {
      throw new ImportFileError("row_limit", `The file exceeds the maximum of ${MAX_IMPORT_ROWS} rows`);
    }
    const values: ParsedImportRow["values"] = {};
    for (const header of TEMPLATE_HEADERS) {
      const columnIndex = headerIndex.get(header);
      if (columnIndex === undefined) continue;
      let value = rawRow[columnIndex] ?? "";
      if (header === "expires_at" && /^\d{5}(\.\d+)?$/.test(value.trim())) {
        value = excelSerialToIso(Number(value.trim()));
      }
      values[header] = value;
    }
    rows.push({ rowNumber: firstRowNumber + index, values });
  }

  if (rows.length === 0) throw new ImportFileError("empty_file", "The spreadsheet contains no data rows");

  return { sheetName, headers, rows };
}

/**
 * Parse an uploaded XLSX/CSV file. The real type is detected from the bytes:
 * XLSX must be a ZIP container; CSV must be valid UTF-8 text without NUL bytes.
 */
export async function parseSpreadsheet(buffer: Buffer, filename: string): Promise<ParsedSpreadsheet> {
  if (buffer.length === 0) throw new ImportFileError("empty_file", "The file is empty");
  const lower = filename.toLowerCase();
  const looksXlsx = hasZipMagic(buffer);
  const declaredXlsx = lower.endsWith(".xlsx");
  const declaredCsv = lower.endsWith(".csv");

  if (declaredCsv && looksXlsx) {
    throw new ImportFileError("invalid_file_type", "The file is a ZIP/XLSX, not a CSV");
  }
  if (declaredXlsx && !looksXlsx) {
    throw new ImportFileError("invalid_file_type", "The file is not a valid XLSX workbook");
  }

  if (looksXlsx) {
    const parsed = await parseXlsx(buffer);
    return buildRows(parsed.grid, parsed.firstRowNumber, parsed.sheetName);
  }

  if (!declaredCsv && !declaredXlsx) {
    throw new ImportFileError("invalid_file_type", "Only .xlsx and .csv files are supported");
  }

  const text = decodeCsv(buffer);
  const parsed = parseCsvGrid(text);
  return buildRows(parsed.grid, parsed.firstRowNumber, parsed.sheetName);
}

