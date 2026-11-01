"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { prisma } from "@/lib/db";
import { signIn } from "@/lib/auth/auth";
import { createUserSession } from "@/lib/auth/session-registry";
import {
  LOGIN_EMAIL_LIMIT,
  LOGIN_EMAIL_WINDOW_SECONDS,
  LOGIN_IP_LIMIT,
  LOGIN_IP_WINDOW_SECONDS,
  checkRateLimit,
} from "@/lib/security/rate-limit";
import { createMfaTicket, hashIp, hashOpaque } from "@/lib/security/crypto";
import { burnPasswordVerification, verifyPassword } from "@/lib/security/password";
import { getClientIp } from "@/lib/http";
import { env } from "@/lib/env";
import { writeAuditLog } from "@/lib/audit";
import { formValue, loginSchema } from "@/lib/validation/schemas";

export interface LoginState {
  error?: "invalid_credentials" | "too_many_attempts" | "account_locked" | "invalid_code" | "validation";
  email?: string;
}

const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

/**
 * Password-only sign-in (2FA removed at the product owner's request).
 * The password never reaches Auth.js; this action verifies it, issues a
 * short-lived HMAC ticket and only then creates the Auth.js session.
 */
export async function startLoginAction(_previous: LoginState | undefined, formData: FormData): Promise<LoginState> {
  const email = formValue(formData, "email");
  const password = formValue(formData, "password");
  const parsed = loginSchema.safeParse({ email, password });
  if (!parsed.success) return { error: "invalid_credentials", email };

  const headerStore = await headers();
  const ip = getClientIp(headerStore);
  const ipHash = hashIp(ip);

  const ipLimit = await checkRateLimit({
    key: `login:ip:${ipHash}`,
    limit: LOGIN_IP_LIMIT,
    windowSeconds: LOGIN_IP_WINDOW_SECONDS,
  });
  if (!ipLimit.allowed) return { error: "too_many_attempts", email };

  const emailHash = hashOpaque(parsed.data.email);
  const emailLimit = await checkRateLimit({
    key: `login:email:${emailHash}`,
    limit: LOGIN_EMAIL_LIMIT,
    windowSeconds: LOGIN_EMAIL_WINDOW_SECONDS,
  });
  if (!emailLimit.allowed) return { error: "too_many_attempts", email };

  const admin = await prisma.adminUser.findUnique({ where: { email: parsed.data.email } });
  if (!admin) {
    await burnPasswordVerification(parsed.data.password);
    await writeAuditLog({
      adminId: null,
      action: "auth.login_failed",
      entity: "AdminUser",
      metadata: { reason: "unknown_email" },
      ip,
    });
    return { error: "invalid_credentials", email };
  }

  const now = new Date();
  if (admin.company_id) {
    const tenant = await prisma.company.findUnique({ where: { id: admin.company_id }, select: { status: true } });
    if (tenant?.status === "SUSPENDED") {
      await burnPasswordVerification(parsed.data.password);
      await writeAuditLog({
        adminId: admin.id,
        action: "auth.login_blocked",
        entity: "AdminUser",
        entityId: admin.id,
        metadata: { reason: "company_suspended" },
        ip,
      });
      return { error: "invalid_credentials", email };
    }
  }
  if (!admin.is_active) {
    await burnPasswordVerification(parsed.data.password);
    await writeAuditLog({
      adminId: admin.id,
      action: "auth.login_blocked",
      entity: "AdminUser",
      entityId: admin.id,
      metadata: { reason: "disabled" },
      ip,
    });
    return { error: "invalid_credentials", email };
  }

  if (admin.locked_until && admin.locked_until <= now && admin.failed_logins >= MAX_FAILED_LOGINS) {
    await prisma.adminUser.update({
      where: { id: admin.id },
      data: { failed_logins: 0, locked_until: null },
    });
    admin.failed_logins = 0;
    admin.locked_until = null;
  }

  if (admin.locked_until && admin.locked_until > now) {
    await writeAuditLog({
      adminId: admin.id,
      action: "auth.login_blocked",
      entity: "AdminUser",
      entityId: admin.id,
      metadata: { reason: "locked" },
      ip,
    });
    return { error: "account_locked", email };
  }

  const passwordValid = await verifyPassword(admin.password_hash, parsed.data.password);
  if (!passwordValid) {
    const failedLogins = admin.failed_logins + 1;
    const lockedUntil = failedLogins >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCKOUT_MS) : null;
    await prisma.adminUser.update({
      where: { id: admin.id },
      data: { failed_logins: failedLogins, locked_until: lockedUntil },
    });
    await writeAuditLog({
      adminId: admin.id,
      action: "auth.login_failed",
      entity: "AdminUser",
      entityId: admin.id,
      metadata: { reason: "bad_password", failed: failedLogins },
      ip,
    });
    return { error: lockedUntil ? "account_locked" : "invalid_credentials", email };
  }

  await prisma.adminUser.update({
    where: { id: admin.id },
    data: { failed_logins: 0, locked_until: null },
  });

  const ticket = createMfaTicket(admin.id, "password_only");
  try {
    const result = (await signIn("credentials", {
      ticket,
      redirect: false,
      redirectTo: "/dashboard",
    })) as { ok?: boolean; error?: string } | undefined;
    if (result?.error) return { error: "invalid_credentials", email };
  } catch (error) {
    if (error instanceof AuthError) return { error: "invalid_credentials", email };
    throw error;
  }

  await createUserSession(admin.id, await headers(), env.SESSION_MAX_AGE);
  await writeAuditLog({
    adminId: admin.id,
    action: "auth.login_success",
    entity: "AdminUser",
    entityId: admin.id,
    metadata: { method: "password" },
    ip,
  });

  if (admin.role === "PLATFORM_ADMIN") redirect("/platform");
  redirect(admin.must_change_password ? "/change-password" : "/dashboard");
}
