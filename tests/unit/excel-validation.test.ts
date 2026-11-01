import { describe, expect, it } from "vitest";
import { validateImportRows, type ExistingEmployeeRecord } from "@/lib/excel/validate";
import type { ParsedImportRow } from "@/lib/excel/parse";

const NOW = new Date("2026-06-15T09:00:00.000Z");

function row(rowNumber: number, values: ParsedImportRow["values"]): ParsedImportRow {
  return { rowNumber, values };
}

function options(overrides: Partial<Parameters<typeof validateImportRows>[1]> = {}) {
  return {
    companyId: "company-1",
    photoFilenames: new Set<string>(),
    hasPhotoZip: false,
    existingRows: [] as ExistingEmployeeRecord[],
    now: NOW,
    ...overrides,
  };
}

function existing(values: Partial<ExistingEmployeeRecord> = {}): ExistingEmployeeRecord {
  return {
    id: "existing-1",
    employee_code: "EMP-1",
    full_name: "Existing Employee",
    department: "Operations",
    job_title: "Technician",
    status: "ACTIVE",
    deleted_at: null,
    ...values,
  };
}

describe("import row validation", () => {
  it("accepts a valid row", async () => {
    const result = await validateImportRows(
      [row(2, { employee_code: "EMP-1", full_name: "Ahmed Ali", department: "Ops", job_title: "Tech", expires_at: "2027-01-31" })],
      options(),
    );
    expect(result.errorCount).toBe(0);
    expect(result.validCount).toBe(1);
    expect(result.rows[0]?.issues).toEqual([]);
  });

  it("neutralises spreadsheet formula injection in every cell", async () => {
    const result = await validateImportRows(
      [
        row(2, {
          employee_code: "=EMP-77",
          full_name: "  =Ahmed Ali  ",
          department: "@Operations",
          job_title: "+Senior Technician",
          expires_at: "",
        }),
      ],
      options(),
    );
    const parsed = result.rows[0]!;
    expect(parsed.employee_code).toBe("EMP-77");
    expect(parsed.full_name).toBe("Ahmed Ali");
    expect(parsed.department).toBe("Operations");
    expect(parsed.job_title).toBe("Senior Technician");
    expect(parsed.issues).toEqual([]);
  });

  it("normalises Arabic text to NFC and strips control characters", async () => {
    const decomposed = "ا\u0644\u0645\u0647\u0646\u062f\u0633";
    const result = await validateImportRows(
      [row(2, { employee_code: "EMP-9", full_name: `أحمد\u0000\u0007 علي`, department: decomposed })],
      options(),
    );
    expect(result.rows[0]?.full_name).toBe("أحمد علي");
    expect(result.rows[0]?.department?.normalize("NFC")).toBe(result.rows[0]?.department);
  });

  it("detects duplicate employee codes within the sheet", async () => {
    const result = await validateImportRows(
      [
        row(2, { employee_code: "EMP-1", full_name: "First Person" }),
        row(3, { employee_code: "EMP-1", full_name: "Second Person" }),
      ],
      options(),
    );
    expect(result.rows[0]?.issues).toEqual([]);
    expect(result.rows[1]?.issues[0]?.column).toBe("employee_code");
    expect(result.rows[1]?.issues[0]?.message).toContain("duplicate_in_sheet");
    expect(result.errorCount).toBe(1);
  });

  it("detects duplicates against the database", async () => {
    const result = await validateImportRows(
      [row(2, { employee_code: "EMP-1", full_name: "New Name" })],
      options({ existingRows: [existing()] }),
    );
    expect(result.rows[0]?.duplicate).toBe(true);
    expect(result.rows[0]?.existing?.id).toBe("existing-1");
    expect(result.duplicateCount).toBe(1);
  });

  it("rejects invalid and out-of-range dates", async () => {
    const invalid = await validateImportRows(
      [row(2, { employee_code: "EMP-1", full_name: "Person One", expires_at: "31-10-2026" })],
      options(),
    );
    expect(invalid.rows[0]?.issues).toContainEqual({ column: "expires_at", message: "invalid_date" });

    const past = await validateImportRows(
      [row(2, { employee_code: "EMP-2", full_name: "Person Two", expires_at: "2020-01-01" })],
      options(),
    );
    expect(past.rows[0]?.issues).toContainEqual({ column: "expires_at", message: "date_in_past" });

    const farFuture = await validateImportRows(
      [row(2, { employee_code: "EMP-3", full_name: "Person Three", expires_at: "2099-01-01" })],
      options(),
    );
    expect(farFuture.rows[0]?.issues).toContainEqual({ column: "expires_at", message: "date_too_far" });
  });

  it("requires employee_code and full_name", async () => {
    const result = await validateImportRows([row(2, { employee_code: "", full_name: "" })], options());
    expect(result.rows[0]?.issues).toEqual(
      expect.arrayContaining([
        { column: "employee_code", message: "required" },
        { column: "full_name", message: "required" },
      ]),
    );
  });

  it("rejects invalid employee codes and over-long fields", async () => {
    const result = await validateImportRows(
      [
        row(2, {
          employee_code: "EMP 1",
          full_name: "A".repeat(201),
          department: "D".repeat(121),
        }),
      ],
      options(),
    );
    expect(result.rows[0]?.issues).toContainEqual({ column: "employee_code", message: "invalid_employee_code" });
    expect(result.rows[0]?.issues).toContainEqual({ column: "full_name", message: "too_long" });
    expect(result.rows[0]?.issues).toContainEqual({ column: "department", message: "too_long" });
  });

  it("requires a matching photo in the ZIP when photo_filename is set", async () => {
    const missing = await validateImportRows(
      [row(2, { employee_code: "EMP-1", full_name: "Person One", photo_filename: "ahmed.jpg" })],
      options({ hasPhotoZip: true }),
    );
    expect(missing.rows[0]?.issues).toContainEqual({ column: "photo_filename", message: "photo_not_found" });

    const found = await validateImportRows(
      [row(2, { employee_code: "EMP-1", full_name: "Person One", photo_filename: "ahmed.jpg" })],
      options({ hasPhotoZip: true, photoFilenames: new Set(["ahmed.jpg"]) }),
    );
    expect(found.rows[0]?.issues).toEqual([]);
    expect(found.rows[0]?.photo_filename).toBe("ahmed.jpg");
  });

  it("rejects a photo reference when no ZIP was uploaded", async () => {
    const result = await validateImportRows(
      [row(2, { employee_code: "EMP-1", full_name: "Person One", photo_filename: "ahmed.jpg" })],
      options(),
    );
    expect(result.rows[0]?.issues).toContainEqual({ column: "photo_filename", message: "photo_not_found" });
  });
});
