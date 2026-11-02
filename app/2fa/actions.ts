"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { prisma } from "@/lib/db";
import { signIn } from "@/lib/auth/auth";
import { createUserSession } from "@/lib/auth/session-registry";
import { clearMfaTicketCookie, readMfaTicketCookie } from "@/lib/auth/mfa-cookie";
import { verifyMfaTicket, createMfaTicket } from "@/lib/security/crypto";
import { decryptTotpSecret, verifyTotpCode } from "@/lib/auth/totp";
import { verifyRecoveryCode } from "@/lib/services/recovery";
import { writeAuditLog } from "@/lib/audit";
import { getClientIp } from "@/lib/http";
import { checkRateLimit } from "@/lib/security/rate-limit";

async function finish(adminId: string, mustChange: boolean, method: string): Promise<never> {
  const ticket = createMfaTicket(adminId, "password_only");
  try {
    const result = (await signIn("credentials", { ticket, redirect: false, redirectTo: "/dashboard" })) as
      | { ok?: boolean; error?: string }
      | undefined;
    if (result?.error) redirect("/2fa?error=1");
  } catch (error) {
    if (error instanceof AuthError) redirect("/2fa?error=1");
    throw error;
  }
  const headerStore = await headers();
  await createUserSession(adminId, headerStore);
  await writeAuditLog({
    adminId,
    action: "auth.login_success",
    entity: "AdminUser",
    entityId: adminId,
    metadata: { method },
    ip: getClientIp(headerStore),
  });
  await clearMfaTicketCookie();
  redirect(mustChange ? "/change-password" : "/dashboard");
}

export async function verifyTwoFactorAction(formData: FormData): Promise<void> {
  const ticket = verifyMfaTicket(await readMfaTicketCookie());
  if (!ticket || ticket.purpose !== "totp") redirect("/login");
  const admin = await prisma.adminUser.findUnique({ where: { id: ticket.sub } });
  if (!admin || !admin.is_active || !admin.totp_enabled || !admin.totp_secret) redirect("/login");

  const limit = await checkRateLimit({ key: `2fa:${admin.id}`, limit: 6, windowSeconds: 300 });
  if (!limit.allowed) redirect("/2fa?error=rate");
  const code = String(formData.get("code") ?? "").replace(/\s+/g, "");
  const valid =
    verifyTotpCode(decryptTotpSecret(admin.totp_secret), code) ||
    (await verifyRecoveryCode(admin.id, code));
  if (!valid) redirect("/2fa?error=1");
  await finish(admin.id, admin.must_change_password, "totp");
}
