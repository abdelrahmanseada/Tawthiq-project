"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireActionPermission } from "@/lib/auth/session";
import { bulkEmployeeIdsSchema } from "@/lib/validation/schemas";
import { writeAuditLog } from "@/lib/audit";
import { getClientIp } from "@/lib/http";

export async function bulkSuspendEmployeesAction(formData: FormData): Promise<void> {
  const admin = await requireActionPermission("employees.write");
  const parsed = bulkEmployeeIdsSchema.safeParse({ ids: formData.getAll("ids") });
  if (!parsed.success) return;

  const result = await prisma.employee.updateMany({
    where: { id: { in: parsed.data.ids }, company_id: admin.companyId, deleted_at: null },
    data: { status: "SUSPENDED" },
  });

  await writeAuditLog({
    adminId: admin.id,
    action: "employee.status_changed",
    entity: "Employee",
    metadata: { count: result.count, to: "SUSPENDED", bulk: true },
    ip: getClientIp(await headers()),
  });
  revalidatePath("/employees");
}
