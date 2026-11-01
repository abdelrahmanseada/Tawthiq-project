"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { requireActionPermission } from "@/lib/auth/session";
import { getClientIp } from "@/lib/http";
import { importConfirmSchema, formValue } from "@/lib/validation/schemas";
import { rollbackImportBatch, startImport } from "@/lib/services/imports";
import {
  IMPORT_CONFIRM_LIMIT,
  IMPORT_CONFIRM_WINDOW_SECONDS,
  checkRateLimit,
} from "@/lib/security/rate-limit";

export async function confirmImportAction(formData: FormData): Promise<void> {
  const admin = await requireActionPermission("imports.manage");
  const batchId = formValue(formData, "batch_id");
  const parsed = importConfirmSchema.safeParse({
    batch_id: batchId,
    strategy: formValue(formData, "strategy"),
  });
  if (!parsed.success) redirect(`/imports/${encodeURIComponent(batchId)}?error=validation`);

  const limit = await checkRateLimit({
    key: `import:confirm:${admin.id}`,
    limit: IMPORT_CONFIRM_LIMIT,
    windowSeconds: IMPORT_CONFIRM_WINDOW_SECONDS,
  });
  if (!limit.allowed) redirect(`/imports/${parsed.data.batch_id}?error=rate`);

  await startImport(parsed.data.batch_id, parsed.data.strategy, admin.id, getClientIp(await headers()));
  redirect(`/imports/${parsed.data.batch_id}`);
}

export async function rollbackImportAction(formData: FormData): Promise<void> {
  const admin = await requireActionPermission("imports.manage");
  const batchId = formValue(formData, "batch_id");
  if (!batchId) redirect("/imports");
  await rollbackImportBatch(batchId, admin.id, getClientIp(await headers()));
  redirect(`/imports/${batchId}`);
}
