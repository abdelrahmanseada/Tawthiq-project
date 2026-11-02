"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { decryptTotpSecret, verifyTotpCode } from "@/lib/auth/totp";
import { generateRecoveryCodes } from "@/lib/services/recovery";
import { RECOVERY_CODES_COOKIE } from "@/lib/auth/constants";
import { writeAuditLog } from "@/lib/audit";
import { getClientIp } from "@/lib/http";

export async function enableTwoFactorAction(formData: FormData): Promise<void> {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/login");
  const record = await prisma.adminUser.findUnique({ where: { id: admin.id } });
  if (!record?.totp_secret) redirect("/2fa/setup?error=expired");
  const code = String(formData.get("code") ?? "").replace(/\s+/g, "");
  if (!verifyTotpCode(decryptTotpSecret(record.totp_secret), code)) {
    redirect("/2fa/setup?error=code");
  }
  await prisma.adminUser.update({ where: { id: admin.id }, data: { totp_enabled: true } });
  const codes = await generateRecoveryCodes(admin.id);
  const store = await cookies();
  store.set({
    name: RECOVERY_CODES_COOKIE,
    value: JSON.stringify(codes),
    httpOnly: true,
    sameSite: "lax",
    secure: (process.env.APP_URL ?? "").startsWith("https://"),
    path: "/2fa",
    maxAge: 120,
  });
  await writeAuditLog({
    adminId: admin.id,
    action: "auth.totp_enabled",
    entity: "AdminUser",
    entityId: admin.id,
    ip: getClientIp(await import("next/headers").then((module) => module.headers())),
  });
  redirect("/2fa/recovery");
}

export async function acknowledgeRecoveryCodesAction(): Promise<void> {
  const store = await cookies();
  store.delete(RECOVERY_CODES_COOKIE);
  redirect("/dashboard");
}
