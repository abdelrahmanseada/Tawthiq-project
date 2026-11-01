import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { buildEmployeeTemplate } from "@/lib/excel/template";
import { parseSpreadsheet } from "@/lib/excel/parse";
import { ImportFileError } from "@/lib/excel/constants";

function csvFile(content: string): Buffer {
  return Buffer.from(content, "utf8");
}

const HEADER = "employee_code,full_name,department,job_title,expires_at,photo_filename\n";

describe("spreadsheet parsing", () => {
  it("parses CSV with quoted fields and Arabic text", async () => {
    const buffer = csvFile(
      `${HEADER}EMP-1,"أحمد, محمد",العمليات,فني,2027-01-31,\nEMP-2,Sara Ali,HR,Recruiter,,\n`,
    );
    const parsed = await parseSpreadsheet(buffer, "employees.csv");
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]?.values.full_name).toBe("أحمد, محمد");
    expect(parsed.rows[1]?.values.photo_filename).toBe("");
    expect(parsed.headers).toContain("employee_code");
  });

  it("rejects a file with missing required headers", async () => {
    const buffer = csvFile("name,department\nAhmed,Ops\n");
    await expect(parseSpreadsheet(buffer, "employees.csv")).rejects.toMatchObject({
      code: "missing_headers",
    });
  });

  it("rejects duplicate headers", async () => {
    const buffer = csvFile("employee_code,full_name,full_name\nEMP-1,Ahmed,Ahmed\n");
    await expect(parseSpreadsheet(buffer, "employees.csv")).rejects.toBeInstanceOf(ImportFileError);
  });

  it("detects the real file type from magic bytes, not the extension", async () => {
    const zipMagic = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00]);
    await expect(parseSpreadsheet(zipMagic, "employees.csv")).rejects.toMatchObject({
      code: "invalid_file_type",
    });
    await expect(parseSpreadsheet(csvFile(HEADER), "employees.xlsx")).rejects.toMatchObject({
      code: "invalid_file_type",
    });
  });

  it("rejects empty files and files without data rows", async () => {
    await expect(parseSpreadsheet(Buffer.alloc(0), "employees.csv")).rejects.toMatchObject({ code: "empty_file" });
    await expect(parseSpreadsheet(csvFile(HEADER), "employees.csv")).rejects.toMatchObject({ code: "empty_file" });
  });

  it("builds a template that parses back and contains an instructions sheet", async () => {
    const template = await buildEmployeeTemplate("en");
    expect(template.length).toBeGreaterThan(5_000);
    const parsed = await parseSpreadsheet(template, "employee-import-template.xlsx");
    expect(parsed.headers).toEqual(
      expect.arrayContaining(["employee_code", "full_name", "department", "job_title", "expires_at", "photo_filename"]),
    );
    expect(parsed.rows[0]?.values.employee_code).toBe("EMP-0001");

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(template as unknown as ArrayBuffer);
    expect(workbook.getWorksheet("Employees")).toBeDefined();
    expect(workbook.getWorksheet("Instructions")).toBeDefined();
  });
});
