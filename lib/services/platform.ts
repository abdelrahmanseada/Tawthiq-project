import { prisma } from "@/lib/db";
import { hashIp } from "@/lib/security/crypto";
import { hashPassword } from "@/lib/security/password";
import { normalizeUnicode } from "@/lib/text";
import { env, initialVerifyBaseUrl } from "@/lib/env";
import { validateVerifyBaseUrl } from "@/lib/qr";
import { resetAdminTwoFactor } from "@/lib/services/recovery";

export class PlatformError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "PlatformError";
    this.code = code;
  }
}

export interface CreateCompanyInput {
  name: string;
  slug: string;
  ownerName: string;
  ownerEmail: string;
  temporaryPassword: string;
  maxEmployees: number;
  timeZone: string;
}

async function writePlatformAudit(input: {
  actorId: string;
  action: string;
  entity: string;
  entityId?: string | null;
  companyId?: string | null;
  metadata?: Record<string, unknown>;
  ip?: string | null;
}) {
  await prisma.platformAuditLog.create({
    data: {
      actor_id: input.actorId,
      action: input.action,
      entity: input.entity,
      entity_id: input.entityId ?? null,
      company_id: input.companyId ?? null,
      metadata: (input.metadata ?? {}) as never,
      ip_hash: input.ip ? hashIp(input.ip) : null,
    },
  });
}

export async function listCompanies() {
  const companies = await prisma.company.findMany({ orderBy: { created_at: "desc" } });
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  return Promise.all(
    companies.map(async (company) => {
      const [employees, activeCards, scans30d, admins] = await Promise.all([
        prisma.employee.count({ where: { company_id: company.id, deleted_at: null } }),
        prisma.card.count({ where: { status: "ACTIVE", employee: { company_id: company.id, deleted_at: null } } }),
        prisma.scanLog.count({ where: { company_id: company.id, created_at: { gte: since } } }),
        prisma.adminUser.count({ where: { company_id: company.id, is_active: true } }),
      ]);
      return { ...company, employees, activeCards, scans30d, admins };
    }),
  );
}

export async function platformStats() {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [companies, employees, scans, failedLogins, recentSignups, recentAudit] = await Promise.all([
    prisma.company.count(),
    prisma.employee.count({ where: { deleted_at: null } }),
    prisma.scanLog.count({ where: { created_at: { gte: since } } }),
    prisma.auditLog.count({ where: { action: "auth.login_failed", created_at: { gte: since } } }),
    prisma.company.findMany({ orderBy: { created_at: "desc" }, take: 6 }),
    prisma.platformAuditLog.findMany({ orderBy: { created_at: "desc" }, take: 8 }),
  ]);
  return { companies, employees, scans, failedLogins, recentSignups, recentAudit };
}

export async function createCompanyWithOwner(input: CreateCompanyInput, actorId: string, ip: string | null) {
  const slug = input.slug.trim().toLowerCase();
  if (!/^[a-z0-9-]+$/.test(slug) || slug.length < 2 || slug.length > 80) {
    throw new PlatformError("INVALID_SLUG", "Use a lowercase slug containing letters, numbers and dashes.");
  }
  const check = await prisma.company.findUnique({ where: { slug }, select: { id: true } });
  if (check) throw new PlatformError("SLUG_TAKEN", "That slug is already in use.");

  const email = input.ownerEmail.toLowerCase().trim();
  const existingAdmin = await prisma.adminUser.findUnique({ where: { email }, select: { id: true } });
  if (existingAdmin) throw new PlatformError("EMAIL_TAKEN", "An account with that e-mail already exists.");

  const passwordHash = await hashPassword(input.temporaryPassword);
  const verifyCheck = validateVerifyBaseUrl(initialVerifyBaseUrl, false);
  if (!verifyCheck.ok || !verifyCheck.normalized) {
    throw new PlatformError("INVALID_URL", "PUBLIC_VERIFY_URL is not a usable verification URL.");
  }

  const company = await prisma.$transaction(async (tx) => {
    const created = await tx.company.create({
      data: {
        name: normalizeUnicode(input.name),
        slug,
        status: "ACTIVE",
        max_employees: input.maxEmployees,
        time_zone: input.timeZone,
        verify_base_url: verifyCheck.normalized!,
        contact_phone: env.SEED_COMPANY_PHONE,
        contact_email: email,
      },
    });
    await tx.adminUser.create({
      data: {
        company_id: created.id,
        name: normalizeUnicode(input.ownerName),
        email,
        password_hash: passwordHash,
        role: "SUPER_ADMIN",
        must_change_password: true,
        totp_enabled: false,
      },
    });
    return created;
  });

  await writePlatformAudit({
    actorId,
    action: "platform.company_created",
    entity: "Company",
    entityId: company.id,
    companyId: company.id,
    metadata: { slug, name: company.name, owner: email, max_employees: company.max_employees },
    ip,
  });
  return company;
}

export async function setCompanyStatus(companyId: string, status: "ACTIVE" | "SUSPENDED", actorId: string, ip: string | null) {
  const company = await prisma.company.update({ where: { id: companyId }, data: { status } });
  await writePlatformAudit({
    actorId,
    action: status === "SUSPENDED" ? "platform.company_suspended" : "platform.company_reactivated",
    entity: "Company",
    entityId: companyId,
    companyId,
    metadata: { name: company.name },
    ip,
  });
  return company;
}

export async function updateCompanyLimits(
  companyId: string,
  input: { maxEmployees: number; timeZone: string },
  actorId: string,
  ip: string | null,
) {
  const company = await prisma.company.update({
    where: { id: companyId },
    data: { max_employees: input.maxEmployees, time_zone: input.timeZone },
  });
  await writePlatformAudit({
    actorId,
    action: "platform.company_limits_updated",
    entity: "Company",
    entityId: companyId,
    companyId,
    metadata: { max_employees: company.max_employees, time_zone: company.time_zone },
    ip,
  });
  return company;
}

export async function platformResetOwnerTwoFactor(
  companyId: string,
  targetAdminId: string,
  actorId: string,
  ip: string | null,
) {
  await resetAdminTwoFactor(companyId, targetAdminId, actorId, ip);
  await writePlatformAudit({
    actorId,
    action: "platform.owner_2fa_reset",
    entity: "AdminUser",
    entityId: targetAdminId,
    companyId,
    ip,
  });
}

export async function platformDeactivateAdmin(companyId: string, targetId: string, actorId: string, ip: string | null) {
  const target = await prisma.adminUser.findFirst({
    where: { id: targetId, company_id: companyId },
    select: { id: true, email: true, role: true },
  });
  if (!target) throw new PlatformError("NOT_FOUND", "Administrator not found.");
  if (target.role === "SUPER_ADMIN") {
    const otherOwners = await prisma.adminUser.count({
      where: { company_id: companyId, role: "SUPER_ADMIN", is_active: true, id: { not: targetId } },
    });
    if (otherOwners === 0) throw new PlatformError("LAST_OWNER", "A company must retain at least one active owner.");
  }
  await prisma.adminUser.update({ where: { id: targetId }, data: { is_active: false } });
  await prisma.userSession.updateMany({ where: { admin_id: targetId, revoked_at: null }, data: { revoked_at: new Date() } });
  await writePlatformAudit({
    actorId,
    action: "platform.admin_deactivated",
    entity: "AdminUser",
    entityId: targetId,
    companyId,
    metadata: { email: target.email, role: target.role },
    ip,
  });
}

export async function getCompanyForPlatform(id: string) {
  return prisma.company.findUnique({
    where: { id },
    include: {
      admin_users: { orderBy: { created_at: "asc" }, select: { id: true, name: true, email: true, role: true, is_active: true, totp_enabled: true, last_login_at: true, created_at: true } },
      _count: { select: { employees: true } },
    },
  });
}
