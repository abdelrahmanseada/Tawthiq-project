import { afterAll, beforeAll, describe, expect, it } from "vitest";

const hasDatabase = Boolean(process.env.TEST_DATABASE_URL);

describe.skipIf(!hasDatabase)("sessions, recovery codes and 2FA reset", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let companyId = "";
  let adminId = "";
  let actorId = "";

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db"));
    const company = await prisma.company.create({
      data: {
        name: "Security Test Company",
        slug: `security-test-${Date.now()}`,
        max_employees: 100,
        time_zone: "Africa/Cairo",
        contact_phone: "+20 100 000 0000",
        contact_email: "security@example.com",
        verify_base_url: "https://security.example.com",
        idle_timeout_minutes: 60,
      },
    });
    companyId = company.id;
    const admin = await prisma.adminUser.create({
      data: {
        company_id: company.id,
        name: "Security Admin",
        email: `security-${Date.now()}@example.com`,
        password_hash: "not-used",
        role: "ADMIN",
        totp_secret: "v1.secret",
        totp_enabled: true,
      },
    });
    adminId = admin.id;
    const actor = await prisma.adminUser.create({
      data: {
        company_id: company.id,
        name: "Security Actor",
        email: `actor-${Date.now()}@example.com`,
        password_hash: "not-used",
        role: "SUPER_ADMIN",
      },
    });
    actorId = actor.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.recoveryCode.deleteMany({ where: { admin_id: { in: [adminId, actorId] } } });
    await prisma.userSession.deleteMany({ where: { admin_id: { in: [adminId, actorId] } } });
    await prisma.auditLog.deleteMany({ where: { admin_id: { in: [adminId, actorId] } } });
    await prisma.adminUser.deleteMany({ where: { id: { in: [adminId, actorId] } } });
    await prisma.employee.deleteMany({ where: { company_id: companyId } });
    await prisma.company.deleteMany({ where: { id: companyId } });
    await prisma.$disconnect();
  });

  it("generates 10 single-use Argon2-hashed recovery codes", async () => {
    const { countUnusedRecoveryCodes, generateRecoveryCodes, verifyRecoveryCode } = await import("@/lib/services/recovery");
    const codes = await generateRecoveryCodes(adminId);
    expect(new Set(codes).size).toBe(10);
    const stored = await prisma.recoveryCode.findMany({ where: { admin_id: adminId } });
    expect(stored).toHaveLength(10);
    for (const row of stored) {
      expect(row.code_hash).not.toBe(codes.find((code) => row.code_hash.includes(code)) ?? "missing");
      expect(row.code_hash.startsWith("$argon2")).toBe(true);
    }
    expect(await verifyRecoveryCode(adminId, codes[0]!)).toBe(true);
    expect(await verifyRecoveryCode(adminId, codes[0]!)).toBe(false);
    expect(await countUnusedRecoveryCodes(adminId)).toBe(9);
  });

  it("revokes stale sessions based on idle timeout and keeps fresh sessions", async () => {
    const { validateUserSession } = await import("@/lib/auth/session-registry");
    const stale = await prisma.userSession.create({
      data: {
        admin_id: adminId,
        jti: "stale-session",
        ip_hash: "test-ip-hash",
        expires_at: new Date(Date.now() + 3_600_000),
        last_seen_at: new Date(Date.now() - 2 * 3_600_000),
      },
    });
    expect(await validateUserSession(adminId, stale.id, 60)).toBeNull();
    expect((await prisma.userSession.findUniqueOrThrow({ where: { id: stale.id } })).revoked_at).not.toBeNull();

    const fresh = await prisma.userSession.create({
      data: { admin_id: adminId, jti: "fresh-session", ip_hash: "test-ip-hash", expires_at: new Date(Date.now() + 3_600_000) },
    });
    expect((await validateUserSession(adminId, fresh.id, 60))?.id).toBe(fresh.id);
  });

  it("SUPER_ADMIN reset clears TOTP, recovery codes and target sessions, audited", async () => {
    const { resetAdminTwoFactor } = await import("@/lib/services/recovery");
    await prisma.userSession.create({
      data: { admin_id: adminId, jti: "reset-session", ip_hash: "test-ip-hash", expires_at: new Date(Date.now() + 3_600_000) },
    });
    await resetAdminTwoFactor(companyId, adminId, actorId, null);
    const updated = await prisma.adminUser.findUniqueOrThrow({ where: { id: adminId } });
    expect(updated.totp_enabled).toBe(false);
    expect(updated.totp_secret).toBeNull();
    expect(await prisma.recoveryCode.count({ where: { admin_id: adminId } })).toBe(0);
    expect(await prisma.userSession.count({ where: { admin_id: adminId, revoked_at: null } })).toBe(0);
    const audit = await prisma.auditLog.findFirst({
      where: { admin_id: actorId, action: "admin.2fa_reset", entity_id: adminId },
    });
    expect(audit).toBeTruthy();
  });

  it("notifications report domain and missing-photo issues", async () => {
    const { getNotifications } = await import("@/lib/services/notifications");
    await prisma.employee.create({
      data: { company_id: companyId, employee_code: "SEC-001", full_name: "No Photo" },
    });
    const result = await getNotifications({ id: companyId, verify_base_url: "http://localhost:3000" });
    expect(result.items.map((item) => item.id)).toEqual(expect.arrayContaining(["verifyDomain", "missingPhotos"]));
  });
});
