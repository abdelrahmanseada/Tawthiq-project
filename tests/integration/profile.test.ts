import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const hasDatabase = Boolean(process.env.TEST_DATABASE_URL);

describe.skipIf(!hasDatabase)("profile and session integration", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let companyId = "";
  let adminId = "";

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db"));
    const stamp = Date.now();
    const company = await prisma.company.create({
      data: {
        name: "Profile Test",
        slug: `profile-test-${stamp}`,
        contact_phone: "+20 100 000 0000",
        contact_email: "profile@example.com",
        verify_base_url: `https://profile-${stamp}.example.com`,
        max_employees: 10,
        time_zone: "Africa/Cairo",
      },
    });
    companyId = company.id;
    const admin = await prisma.adminUser.create({
      data: {
        company_id: company.id,
        name: "Profile Admin",
        email: `profile-${stamp}@example.com`,
        password_hash: "not-used-in-this-test",
        role: "SUPER_ADMIN",
      },
    });
    adminId = admin.id;
  });

  afterAll(async () => {
    await prisma.userSession.deleteMany({ where: { admin_id: adminId } });
    await prisma.adminUser.deleteMany({ where: { id: adminId } });
    await prisma.company.deleteMany({ where: { id: companyId } });
    await prisma.$disconnect();
  });

  it("rejects an administrator e-mail that differs only by case", async () => {
    const existing = await prisma.adminUser.findUniqueOrThrow({ where: { id: adminId } });
    await expect(
      prisma.adminUser.create({
        data: {
          company_id: companyId,
          name: "Case Duplicate",
          email: existing.email.toUpperCase(),
          password_hash: "not-used",
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("excludes old and revoked sessions and refuses to revoke the current session", async () => {
    const { listUserSessions, revokeUserSession } = await import("@/lib/auth/session-registry");
    const now = new Date();
    const current = await prisma.userSession.create({
      data: {
        admin_id: adminId,
        jti: randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, ""),
        ip_hash: "a".repeat(64),
        user_agent: "Mozilla/5.0 (Windows NT 10.0) Chrome/131.0",
        expires_at: new Date(now.getTime() + 86_400_000),
        last_seen_at: now,
      },
    });
    const recent = await prisma.userSession.create({
      data: {
        admin_id: adminId,
        jti: randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, ""),
        ip_hash: "b".repeat(64),
        user_agent: "Mozilla/5.0 (Macintosh) Firefox/120.0",
        expires_at: new Date(now.getTime() + 86_400_000),
        last_seen_at: new Date(now.getTime() - 60_000),
      },
    });
    const old = await prisma.userSession.create({
      data: {
        admin_id: adminId,
        jti: randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, ""),
        ip_hash: "c".repeat(64),
        expires_at: new Date(now.getTime() + 86_400_000),
        last_seen_at: new Date(now.getTime() - 31 * 86_400_000),
      },
    });

    const sessions = await listUserSessions(adminId, now);
    expect(sessions.map((session) => session.id)).toContain(current.id);
    expect(sessions.map((session) => session.id)).toContain(recent.id);
    expect(sessions.map((session) => session.id)).not.toContain(old.id);

    expect(await revokeUserSession(adminId, current.id, current.id)).toBe(false);
    expect(await revokeUserSession(adminId, recent.id, current.id)).toBe(true);
  });
});
