import type { AdminRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { hashPassword } from "@/lib/security/password";
import { normalizeUnicode } from "@/lib/text";

export class AdminManagementError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "AdminManagementError";
    this.code = code;
  }
}

export async function listAdmins(companyId: string) {
  return prisma.adminUser.findMany({
    where: { company_id: companyId },
    orderBy: [{ role: "asc" }, { created_at: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      is_active: true,
      totp_enabled: true,
      last_login_at: true,
      created_at: true,
    },
  });
}

export async function createAdmin(
  companyId: string,
  input: { name: string; email: string; role: AdminRole; password: string },
  actorId: string,
  ip: string | null,
) {
  const email = input.email.toLowerCase();
  const existing = await prisma.adminUser.findUnique({ where: { email }, select: { id: true } });
  if (existing) throw new AdminManagementError("EMAIL_TAKEN", "An account with this e-mail already exists");

  const passwordHash = await hashPassword(input.password);
  const admin = await prisma.adminUser.create({
    data: {
      company_id: companyId,
      name: normalizeUnicode(input.name),
      email,
      password_hash: passwordHash,
      role: input.role,
      must_change_password: true,
      totp_enabled: false,
      is_active: true,
    },
    select: { id: true, email: true, name: true, role: true },
  });

  await writeAuditLog({
    adminId: actorId,
    action: "admin.created",
    entity: "AdminUser",
    entityId: admin.id,
    metadata: { email: admin.email, role: admin.role },
    ip,
  });
  return admin;
}

export async function setAdminRole(
  companyId: string,
  targetId: string,
  role: AdminRole,
  actorId: string,
  ip: string | null,
) {
  const target = await prisma.adminUser.findFirst({
    where: { id: targetId, company_id: companyId },
    select: { id: true, role: true, is_active: true },
  });
  if (!target) throw new AdminManagementError("NOT_FOUND", "Administrator not found");

  if (target.role === "SUPER_ADMIN" && role !== "SUPER_ADMIN") {
    const superCount = await prisma.adminUser.count({
      where: { company_id: companyId, role: "SUPER_ADMIN", is_active: true },
    });
    if (superCount <= 1) {
      throw new AdminManagementError("LAST_SUPER_ADMIN", "At least one super administrator must remain");
    }
  }

  const updated = await prisma.adminUser.update({
    where: { id: targetId },
    data: { role },
    select: { id: true, role: true },
  });

  await writeAuditLog({
    adminId: actorId,
    action: "admin.role_changed",
    entity: "AdminUser",
    entityId: targetId,
    metadata: { from: target.role, to: role },
    ip,
  });
  return updated;
}

/** Administrators are deactivated (never hard-deleted) so audit history stays intact. */
export async function deactivateAdmin(
  companyId: string,
  targetId: string,
  actorId: string,
  ip: string | null,
): Promise<void> {
  if (targetId === actorId) {
    throw new AdminManagementError("CANNOT_REMOVE_SELF", "You cannot deactivate your own account");
  }
  const target = await prisma.adminUser.findFirst({
    where: { id: targetId, company_id: companyId },
    select: { id: true, role: true, is_active: true, email: true },
  });
  if (!target) throw new AdminManagementError("NOT_FOUND", "Administrator not found");

  if (target.role === "SUPER_ADMIN") {
    const superCount = await prisma.adminUser.count({
      where: { company_id: companyId, role: "SUPER_ADMIN", is_active: true, NOT: { id: targetId } },
    });
    if (superCount === 0) {
      throw new AdminManagementError("LAST_SUPER_ADMIN", "At least one super administrator must remain");
    }
  }

  await prisma.adminUser.update({ where: { id: targetId }, data: { is_active: false } });
  await writeAuditLog({
    adminId: actorId,
    action: "admin.deactivated",
    entity: "AdminUser",
    entityId: targetId,
    metadata: { email: target.email, role: target.role },
    ip,
  });
}
