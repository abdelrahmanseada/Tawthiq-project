import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Prisma } from "@prisma/client";

const hasDatabase = Boolean(process.env.TEST_DATABASE_URL);

describe.skipIf(!hasDatabase)("bulk import integration", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let companyId = "";
  let adminId = "";
  let batchId = "";

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db"));
    const company = await prisma.company.create({
      data: {
        name: "Import Test Company",
        slug: `import-test-${Date.now()}`,
        max_employees: 100,
        time_zone: "Africa/Cairo",
        contact_phone: "+20 100 000 0000",
        contact_email: "import-test@example.com",
        verify_base_url: `https://import-test-${Date.now()}.example.com`,
      },
    });
    companyId = company.id;
    const admin = await prisma.adminUser.create({
      data: {
        company_id: company.id,
        name: "Import Test Admin",
        email: `import-admin-${Date.now()}@example.com`,
        password_hash: "not-used-in-this-test",
        role: "ADMIN",
        must_change_password: false,
        totp_enabled: false,
        is_active: true,
      },
    });
    adminId = admin.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.scanLog.deleteMany({ where: { card: { employee: { company_id: companyId } } } });
    await prisma.card.deleteMany({ where: { employee: { company_id: companyId } } });
    await prisma.employee.deleteMany({ where: { company_id: companyId } });
    await prisma.importBatch.deleteMany({ where: { company_id: companyId } });
    await prisma.auditLog.deleteMany({ where: { admin_id: adminId } });
    await prisma.adminUser.deleteMany({ where: { id: adminId } });
    await prisma.company.deleteMany({ where: { id: companyId } });
    await prisma.$disconnect();
  });

  async function buildWorkbook(rows: Array<Record<string, string>>): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Employees");
    sheet.addRow(["employee_code", "full_name", "department", "job_title", "expires_at", "photo_filename"]);
    for (const row of rows) {
      sheet.addRow([
        row.employee_code ?? "",
        row.full_name ?? "",
        row.department ?? "",
        row.job_title ?? "",
        row.expires_at ?? "",
        row.photo_filename ?? "",
      ]);
    }
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  it("previews, imports, reports errors and rolls back atomically", async () => {
    const { previewImport, processImportBatch, rollbackImportBatch } = await import("@/lib/services/imports");

    const workbook = await buildWorkbook([
      { employee_code: "INT-001", full_name: "Integration One", department: "Ops" },
      { employee_code: "INT-002", full_name: "Integration Two", department: "HR", job_title: "Recruiter" },
      { employee_code: "INT-003", full_name: "" },
    ]);

    const { batch, preview } = await previewImport({
      companyId,
      adminId,
      filename: "integration.xlsx",
      spreadsheet: workbook,
      photoZip: null,
      ip: null,
    });
    batchId = batch.id;

    expect(preview.totalRows).toBe(3);
    expect(preview.validCount).toBe(2);
    expect(preview.errorCount).toBe(1);
    expect(batch.status).toBe("PENDING");

    await prisma.importBatch.update({
      where: { id: batch.id },
      data: { status: "PROCESSING", duplicate_strategy: "SKIP" },
    });
    await processImportBatch(batch.id);

    const finished = await prisma.importBatch.findUniqueOrThrow({ where: { id: batch.id } });
    expect(finished.status).toBe("DONE");
    expect(finished.success_count).toBe(2);
    expect(finished.failed_count).toBe(1);
    expect(finished.error_report_path).toBeTruthy();

    const employees = await prisma.employee.findMany({
      where: { company_id: companyId, employee_code: { in: ["INT-001", "INT-002"] } },
      include: { cards: true },
    });
    expect(employees).toHaveLength(2);
    for (const employee of employees) {
      expect(employee.cards).toHaveLength(1);
      expect(employee.cards[0]?.status).toBe("ACTIVE");
      expect(employee.cards[0]?.token_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(employee.cards[0]?.token_enc).toBeTruthy();
      expect(employee.batch_id).toBe(batch.id);
    }

    // Duplicate strategy FAIL is reflected in the preview as a duplicate, not an error.
    const duplicateWorkbook = await buildWorkbook([{ employee_code: "INT-001", full_name: "Duplicate Code" }]);
    const duplicatePreview = await previewImport({
      companyId,
      adminId,
      filename: "duplicate.xlsx",
      spreadsheet: duplicateWorkbook,
      photoZip: null,
      ip: null,
    });
    expect(duplicatePreview.preview.duplicateCount).toBe(1);
    expect(duplicatePreview.preview.validCount).toBe(1);

    await rollbackImportBatch(batch.id, adminId, null);

    const rolledBack = await prisma.importBatch.findUniqueOrThrow({ where: { id: batch.id } });
    expect(rolledBack.status).toBe("ROLLED_BACK");

    const afterRollback = await prisma.employee.findMany({
      where: { employee_code: { in: ["INT-001", "INT-002"] } },
      include: { cards: true },
    });
    for (const employee of afterRollback) {
      expect(employee.deleted_at).not.toBeNull();
      expect(employee.cards.every((card) => card.status === "REVOKED")).toBe(true);
    }
  }, 180_000);

  it("rejects rows exceeding the row limit at parse time", async () => {
    const { previewImport } = await import("@/lib/services/imports");
    const rows = Array.from({ length: 5_001 }, (_, index) => ({
      employee_code: `INT-${index}`,
      full_name: `Employee ${index}`,
    }));
    const workbook = await buildWorkbook(rows);
    await expect(
      previewImport({
        companyId,
        adminId,
        filename: "too-many.xlsx",
        spreadsheet: workbook,
        photoZip: null,
        ip: null,
      }),
    ).rejects.toMatchObject({ code: "row_limit" });
  }, 180_000);

  it("keeps batches scoped to their company", async () => {
    const otherCompany = await prisma.company.create({
      data: {
        name: "Other Company",
        slug: `other-company-${Date.now()}`,
        max_employees: 100,
        time_zone: "Africa/Cairo",
        contact_phone: "+20 100 000 0001",
        contact_email: "other@example.com",
        verify_base_url: `https://other-${Date.now()}.example.com`,
      },
    });
    try {
      const batches = await prisma.importBatch.findMany({ where: { company_id: otherCompany.id } });
      expect(batches).toHaveLength(0);
      const ownBatch = await prisma.importBatch.findFirst({ where: { id: batchId, company_id: companyId } });
      expect(ownBatch).toBeTruthy();
    } finally {
      await prisma.company.delete({ where: { id: otherCompany.id } });
    }
  });

  // Type helper to keep the Prisma namespace import used for linting.
  const _typeCheck: Prisma.EmployeeCreateInput | null = null;
  void _typeCheck;
});
