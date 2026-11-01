"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireActionAdmin } from "@/lib/auth/session";
import { hashPassword, verifyPassword } from "@/lib/security/password";
import { getClientIp } from "@/lib/http";
import { writeAuditLog } from "@/lib/audit";
import { revokeOtherSessions } from "@/lib/auth/session-registry";
import { changePasswordSchema, formValue } from "@/lib/validation/schemas";

export interface ChangePasswordState {
  error?: "invalid_current_password" | "validation";
  fieldErrors?: Record<string, string>;
}

export async function changePasswordAction(
  _previous: ChangePasswordState | undefined,
  formData: FormData,
): Promise<ChangePasswordState> {
  const admin = await requireActionAdmin();
  const parsed = changePasswordSchema.safeParse({
    current_password: formValue(formData, "current_password"),
    new_password: formValue(formData, "new_password"),
    confirm_password: formValue(formData, "confirm_password"),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path.join(".");
      if (field && !fieldErrors[field]) fieldErrors[field] = issue.message;
    }
    return { error: "validation", fieldErrors };
  }

  const record = await prisma.adminUser.findUnique({ where: { id: admin.id } });
  if (!record) redirect("/login");

  const currentValid = await verifyPassword(record.password_hash, parsed.data.current_password);
  if (!currentValid) return { error: "invalid_current_password" };

  const passwordHash = await hashPassword(parsed.data.new_password);
  await prisma.adminUser.update({
    where: { id: admin.id },
    data: { password_hash: passwordHash, must_change_password: false },
  });
  await revokeOtherSessions(admin.id, admin.sessionId);

  await writeAuditLog({
    adminId: admin.id,
    action: "admin.password_changed",
    entity: "AdminUser",
    entityId: admin.id,
    ip: getClientIp(await headers()),
  });

  const company = admin.companyId ? await prisma.company.findUnique({ where: { id: admin.companyId }, select: { onboarding_completed_at: true } }) : null;
  redirect(admin.role === "SUPER_ADMIN" && company && !company.onboarding_completed_at ? "/onboarding" : "/dashboard");
}
