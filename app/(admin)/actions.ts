"use server";

import { signOut } from "@/lib/auth/auth";
import { getCurrentAdmin } from "@/lib/auth/session";
import { clearSessionCookie, revokeSession } from "@/lib/auth/session-registry";
import { writeAuditLog } from "@/lib/audit";

export async function logoutAction(): Promise<void> {
  const admin = await getCurrentAdmin();
  if (admin) {
    await revokeSession(admin.sessionId);
    await writeAuditLog({
      adminId: admin.id,
      action: "auth.logout",
      entity: "AdminUser",
      entityId: admin.id,
    });
  }
  await clearSessionCookie();
  await signOut({ redirectTo: "/login" });
}
