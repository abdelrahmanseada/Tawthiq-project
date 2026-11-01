"use server";

import { redirect } from "next/navigation";
import { requireActionAdmin } from "@/lib/auth/session";
import { revokeOtherSessions } from "@/lib/auth/session-registry";
import { writeAuditLog } from "@/lib/audit";

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
