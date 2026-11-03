"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireActionAdmin } from "@/lib/auth/session";
import { revokeOtherSessions, revokeUserSession } from "@/lib/auth/session-registry";
import { writeAuditLog } from "@/lib/audit";
import { assertActionOrigin } from "@/lib/action-origin";
import { prisma } from "@/lib/db";
import { getClientIp } from "@/lib/http";
import { hashIp } from "@/lib/security/crypto";
import { verifyPassword } from "@/lib/security/password";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { decryptTotpSecret, verifyTotpCode } from "@/lib/auth/totp";
import { maskEmail } from "@/lib/mask";
import { formValue, profileSchema } from "@/lib/validation/schemas";

const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
const PROFILE_EMAIL_LIMIT = 5;
const PROFILE_EMAIL_WINDOW_SECONDS = 15 * 60;

export interface ProfileState {
  error?: "forbidden" | "validation" | "invalid_password" | "invalid_code" | "account_locked" | "rate_limited" | "email_taken";
  fieldErrors?: Record<string, string>;
  success?: boolean;
  emailChanged?: boolean;
}

function fieldErrorsFrom(issues: Array<{ path: PropertyKey[]; message: string }>): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const field = issue.path.join(".");
    if (field && !errors[field]) errors[field] = issue.message;
  }
  return errors;
}

export async function signOutOtherSessionsAction(): Promise<void> {
  const admin = await requireActionAdmin();
  const count = await revokeOtherSessions(admin.id, admin.sessionId);
  await writeAuditLog({
    adminId: admin.id,
    action: "auth.logout",
    entity: "AdminUser",
    entityId: admin.id,
    metadata: { other_sessions_revoked: count },
  });
  redirect(`/account?sessions=${count}`);
}

export async function revokeSessionAction(formData: FormData): Promise<void> {
  try {
    await assertActionOrigin();
  } catch {
    redirect("/403");
  }
  const admin = await requireActionAdmin();
  const sessionId = formValue(formData, "session_id");
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) redirect("/403");
  const revoked = await revokeUserSession(admin.id, sessionId, admin.sessionId);
  if (revoked) {
    await writeAuditLog({
      adminId: admin.id,
      action: "auth.session_revoked",
      entity: "AdminUser",
      entityId: admin.id,
      ip: getClientIp(await headers()),
    });
  }
  redirect("/account?revoked=1");
}

async function recordFailedLogin(adminId: string, currentFailed: number): Promise<boolean> {
  const failedLogins = currentFailed + 1;
  const lockedUntil = failedLogins >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCKOUT_MS) : null;
  await prisma.adminUser.update({
    where: { id: adminId },
    data: { failed_logins: failedLogins, locked_until: lockedUntil },
  });
  return Boolean(lockedUntil);
}

/** Update only the signed-in administrator's own profile. */
export async function profileAction(_previous: ProfileState | undefined, formData: FormData): Promise<ProfileState> {
  try {
    await assertActionOrigin();
  } catch {
    return { error: "forbidden" };
  }

  const admin = await requireActionAdmin();
  const parsed = profileSchema.safeParse({
    name: formValue(formData, "name"),
    email: formValue(formData, "email"),
    current_password: formValue(formData, "current_password"),
    code: formValue(formData, "code"),
  });
  if (!parsed.success) {
    return { error: "validation", fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }

  const record = await prisma.adminUser.findUnique({ where: { id: admin.id } });
  if (!record) redirect("/login");

  const name = parsed.data.name;
  const email = parsed.data.email;
  const nameChanged = name !== record.name;
  const emailChanged = email !== record.email.toLowerCase();
  if (!nameChanged && !emailChanged) return { success: true, emailChanged: false };

  const requestHeaders = await headers();
  const ip = getClientIp(requestHeaders);
  const now = new Date();
  let failed = record.failed_logins;

  if (emailChanged) {
    const ipHash = hashIp(ip);
    const [userLimit, ipLimit] = await Promise.all([
      checkRateLimit({ key: `profile:email:user:${hashIp(admin.id)}`, limit: PROFILE_EMAIL_LIMIT, windowSeconds: PROFILE_EMAIL_WINDOW_SECONDS }),
      checkRateLimit({ key: `profile:email:ip:${ipHash}`, limit: PROFILE_EMAIL_LIMIT, windowSeconds: PROFILE_EMAIL_WINDOW_SECONDS }),
    ]);
    if (!userLimit.allowed || !ipLimit.allowed) return { error: "rate_limited" };

    if (record.locked_until && record.locked_until > now) return { error: "account_locked" };
    if (record.locked_until && record.locked_until <= now && failed >= MAX_FAILED_LOGINS) {
      await prisma.adminUser.update({ where: { id: record.id }, data: { failed_logins: 0, locked_until: null } });
      failed = 0;
    }

    if (!parsed.data.current_password) {
      const locked = await recordFailedLogin(record.id, failed);
      return { error: locked ? "account_locked" : "invalid_password", fieldErrors: { current_password: "required" } };
    }
    if (!(await verifyPassword(record.password_hash, parsed.data.current_password))) {
      const locked = await recordFailedLogin(record.id, failed);
      return { error: locked ? "account_locked" : "invalid_password", fieldErrors: { current_password: "invalid_current_password" } };
    }

    if (record.totp_enabled) {
      if (!parsed.data.code || !record.totp_secret) {
        const locked = await recordFailedLogin(record.id, failed);
        return { error: locked ? "account_locked" : "invalid_code", fieldErrors: { code: "required" } };
      }
      let validCode = false;
      try {
        validCode = verifyTotpCode(decryptTotpSecret(record.totp_secret), parsed.data.code);
      } catch {
        validCode = false;
      }
      if (!validCode) {
        const locked = await recordFailedLogin(record.id, failed);
        return { error: locked ? "account_locked" : "invalid_code", fieldErrors: { code: "invalid_code" } };
      }
    }

    const existing = await prisma.adminUser.findFirst({
      where: { email: { equals: email, mode: "insensitive" }, NOT: { id: record.id } },
      select: { id: true },
    });
    if (existing) return { error: "email_taken", fieldErrors: { email: "email_taken" } };

    try {
      await prisma.adminUser.update({
        where: { id: record.id },
        data: { name, email, failed_logins: 0, locked_until: null },
      });
    } catch (error) {
      if (typeof error === "object" && error && "code" in error && error.code === "P2002") {
        return { error: "email_taken", fieldErrors: { email: "email_taken" } };
      }
      throw error;
    }
    await revokeOtherSessions(record.id, admin.sessionId);
    await writeAuditLog({
      adminId: record.id,
      companyId: record.company_id,
      action: "admin.profile_email_changed",
      entity: "AdminUser",
      entityId: record.id,
      metadata: { old_email: maskEmail(record.email), new_email: maskEmail(email) },
      ip,
    });
  } else {
    try {
      await prisma.adminUser.update({ where: { id: record.id }, data: { name } });
    } catch (error) {
      if (typeof error === "object" && error && "code" in error && error.code === "P2002") {
        return { error: "email_taken", fieldErrors: { email: "email_taken" } };
      }
      throw error;
    }
  }

  if (nameChanged) {
    await writeAuditLog({
      adminId: record.id,
      companyId: record.company_id,
      action: "admin.profile_name_changed",
      entity: "AdminUser",
      entityId: record.id,
      metadata: { old_name: record.name, new_name: name },
      ip,
    });
  }

  revalidatePath("/account");
  return { success: true, emailChanged };
}
