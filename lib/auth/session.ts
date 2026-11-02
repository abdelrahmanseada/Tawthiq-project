import { redirect } from "next/navigation";
import type { Company } from "@prisma/client";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/http";
import { ForbiddenError, assertCan, can, type Permission, type Role } from "@/lib/auth/rbac";
import { readSessionCookie, validateUserSession } from "@/lib/auth/session-registry";
import { env } from "@/lib/env";

export interface SessionAdmin {
  id: string;
  email: string;
  name: string;
  role: Role;
  companyId: string | null;
  mustChangePassword: boolean;
  totpEnabled: boolean;
  sessionId: string;
  company: Company | null;
}

/**
 * Every request re-loads the admin and validates the server-side session row
 * (expiry + idle timeout) in addition to the Auth.js JWT.
 */
export async function getCurrentAdmin(): Promise<SessionAdmin | null> {
  const session = await auth();
  const adminId = session?.user?.id;
  if (!adminId) return null;

  const sessionId = await readSessionCookie();
  if (!sessionId) return null;

  const admin = await prisma.adminUser.findUnique({
    where: { id: adminId },
    include: { company: true },
  });
  if (!admin || !admin.is_active) return null;
  if (!admin.company) return null;

  const validated = await validateUserSession(
    admin.id,
    sessionId,
    admin.company?.idle_timeout_minutes ?? env.IDLE_TIMEOUT_MINUTES,
  );
  if (!validated) return null;

  return {
    id: admin.id,
    email: admin.email,
    name: admin.name,
    role: admin.role,
    companyId: admin.company_id,
    mustChangePassword: admin.must_change_password,
    totpEnabled: admin.totp_enabled,
    sessionId: validated.id,
    company: admin.company,
  };
}

/** Page guard for company pages. */
export async function requireAdmin(): Promise<SessionAdmin & { companyId: string; company: Company }> {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/login");
  if (!admin.company || !admin.companyId) redirect("/login");
  return admin as SessionAdmin & { companyId: string; company: Company };
}

/** Page guard with RBAC: unauthorised roles are sent back to the dashboard. */
export async function requirePermission(permission: Permission): Promise<SessionAdmin & { companyId: string; company: Company }> {
  const admin = await requireAdmin();
  if (!can(admin.role, permission)) redirect("/403");
  return admin;
}

/** Server Action / Route Handler guard for tenant operations. */
export async function requireActionAdmin(): Promise<SessionAdmin & { companyId: string; company: Company }> {
  const admin = await getCurrentAdmin();
  if (!admin) throw new ApiError(401, "UNAUTHENTICATED", "You must sign in first");
  if (!admin.company || !admin.companyId) {
    throw new ApiError(403, "FORBIDDEN", "Company context is required");
  }
  return admin as SessionAdmin & { companyId: string; company: Company };
}

export async function requireActionPermission(permission: Permission): Promise<SessionAdmin & { companyId: string; company: Company }> {
  const admin = await requireActionAdmin();
  try {
    assertCan(admin.role, permission);
  } catch (error) {
    if (error instanceof ForbiddenError) throw new ApiError(403, "FORBIDDEN", error.message);
    throw error;
  }
  return admin;
}

