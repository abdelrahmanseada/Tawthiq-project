import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const hasDatabase = Boolean(process.env.TEST_DATABASE_URL);

describe.skipIf(!hasDatabase)("RBAC and tenant scoping integration", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let companyA = "";
  let companyB = "";
  let employeeA = "";
  let employeeB = "";

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db"));
    const stamp = Date.now();
    const a = await prisma.company.create({
      data: {
        name: "Company A",
        slug: `company-a-${stamp}`,
        contact_phone: "+20 100 000 0000",
        contact_email: "a@example.com",
        verify_base_url: `https://a-${stamp}.example.com`,
        max_employees: 100,
        time_zone: "Africa/Cairo",
      },
    });
    const b = await prisma.company.create({
      data: {
        name: "Company B",
        slug: `company-b-${stamp}`,
        contact_phone: "+20 100 000 0001",
        contact_email: "b@example.com",
        verify_base_url: `https://b-${stamp}.example.com`,
        max_employees: 100,
        time_zone: "Africa/Cairo",
      },
    });
    companyA = a.id;
    companyB = b.id;
    employeeA = (
      await prisma.employee.create({
        data: { company_id: a.id, employee_code: "RBAC-A", full_name: "Employee A" },
      })
    ).id;
    employeeB = (
      await prisma.employee.create({
        data: { company_id: b.id, employee_code: "RBAC-B", full_name: "Employee B" },
      })
    ).id;
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.employee.deleteMany({ where: { company_id: { in: [companyA, companyB] } } });
    await prisma.company.deleteMany({ where: { id: { in: [companyA, companyB] } } });
    await prisma.$disconnect();
  });

  it("enforces the permission matrix server-side, including the platform role", async () => {
    const { can, assertCan, ForbiddenError } = await import("@/lib/auth/rbac");
    expect(can("SUPER_ADMIN", "settings.manage")).toBe(true);
    expect(can("ADMIN", "settings.manage")).toBe(false);
    expect(can("VIEWER", "employees.write")).toBe(false);
    expect(can("VIEWER", "employees.read")).toBe(true);
    expect(can("PLATFORM_ADMIN", "dashboard.view")).toBe(false);
    expect(can("PLATFORM_ADMIN", "settings.manage")).toBe(false);
    expect(() => assertCan("VIEWER", "imports.manage")).toThrow(ForbiddenError);
    expect(() => assertCan("ADMIN", "admins.manage")).toThrow(ForbiddenError);
  });

  it("never returns employees from another company", async () => {
    const { listEmployees, getEmployeeDetail, findEmployee } = await import("@/lib/services/employees");
    const { employeeListQuerySchema } = await import("@/lib/validation/schemas");
    const query = employeeListQuerySchema.parse({});

    const listA = await listEmployees(companyA, query);
    expect(listA.rows.map((row) => row.id)).toContain(employeeA);
    expect(listA.rows.map((row) => row.id)).not.toContain(employeeB);

    expect(await findEmployee(companyA, employeeB)).toBeNull();
    expect(await getEmployeeDetail(companyA, employeeB)).toBeNull();
  });

  it("rejects cross-company status mutations", async () => {
    const { setEmployeeStatus, EmployeeNotFoundError } = await import("@/lib/services/employees");
    await expect(
      setEmployeeStatus(companyA, employeeB, "SUSPENDED", { adminId: "no-such-admin", ip: null }),
    ).rejects.toBeInstanceOf(EmployeeNotFoundError);
    const employee = await prisma.employee.findUniqueOrThrow({ where: { id: employeeB } });
    expect(employee.status).toBe("ACTIVE");
  });

  it("enforces max_employees on create and refuses to restore over the limit", async () => {
    const { createEmployee, EmployeeCapacityError, restoreEmployee } = await import("@/lib/services/employees");
    const company = await prisma.company.create({
      data: {
        name: "Capacity Test",
        slug: `capacity-${Date.now()}`,
        max_employees: 1,
        contact_phone: "+20 100 000 0002",
        contact_email: "capacity@example.com",
        verify_base_url: "https://capacity.example.com",
        time_zone: "Africa/Cairo",
      },
    });
    try {
      const first = await prisma.employee.create({
        data: { company_id: company.id, employee_code: "CAP-1", full_name: "First Person" },
      });
      await expect(
        createEmployee(
          company.id,
          { employee_code: "CAP-2", full_name: "Second Person", department: null, job_title: null, status: "ACTIVE", expires_at: null },
          { adminId: "no-such-admin", ip: null },
        ),
      ).rejects.toBeInstanceOf(EmployeeCapacityError);
      await prisma.employee.update({ where: { id: first.id }, data: { deleted_at: new Date() } });
      await prisma.employee.create({ data: { company_id: company.id, employee_code: "CAP-3", full_name: "Third Person" } });
      await expect(
        restoreEmployee(company.id, first.id, { adminId: "no-such-admin", ip: null }),
      ).rejects.toBeInstanceOf(EmployeeCapacityError);
    } finally {
      await prisma.employee.deleteMany({ where: { company_id: company.id } });
      await prisma.company.delete({ where: { id: company.id } });
    }
  });

  it("verifies suspended companies and custom-host mismatches as neutral INVALID", async () => {
    const { verifyPublicToken } = await import("@/lib/services/verification");
    const { issueCardForEmployee } = await import("@/lib/services/cards");
    const { decryptCardToken } = await import("@/lib/security/crypto");
    const company = await prisma.company.create({
      data: {
        name: "Verify Tenant",
        slug: `verify-${Date.now()}`,
        max_employees: 5,
        contact_phone: "+20 100 000 0003",
        contact_email: "verify@example.com",
        verify_base_url: "https://verify-tenant.example.com",
        custom_domain: "cards.verify-tenant.example.com",
        time_zone: "Africa/Cairo",
      },
    });
    try {
      const employee = await prisma.employee.create({
        data: { company_id: company.id, employee_code: "VER-1", full_name: "Verify Person", status: "ACTIVE" },
      });
      const card = await issueCardForEmployee(employee, company, randomUUID());
      const token = decryptCardToken(card.token_enc)!;
      const meta = { ipHash: "test-ip", userAgent: "vitest" };

      const mismatch = await verifyPublicToken(token, { ...meta, host: "other.example.com" });
      expect(mismatch.state).toBe("invalid");
      expect(mismatch.company).toBeNull();

      const valid = await verifyPublicToken(token, { ...meta, host: "cards.verify-tenant.example.com" });
      expect(valid.state).toBe("valid");
      expect(valid.company?.name).toBe("Verify Tenant");

      await prisma.company.update({ where: { id: company.id }, data: { status: "SUSPENDED" } });
      const suspended = await verifyPublicToken(token, { ...meta, host: "cards.verify-tenant.example.com" });
      expect(suspended.state).toBe("invalid");
      expect(suspended.company).toBeNull();
    } finally {
      await prisma.scanLog.deleteMany({ where: { company_id: company.id } });
      await prisma.card.deleteMany({ where: { employee: { company_id: company.id } } });
      await prisma.employee.deleteMany({ where: { company_id: company.id } });
      await prisma.company.delete({ where: { id: company.id } });
    }
  });
});
