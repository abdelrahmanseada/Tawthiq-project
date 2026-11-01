"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireActionPermission } from "@/lib/auth/session";
import { getClientIp } from "@/lib/http";
import { ValidationError } from "@/lib/http";
import { createAdminSchema, formValue, parseInput } from "@/lib/validation/schemas";
import {
  AdminManagementError,
  createAdmin,
  deactivateAdmin,
  setAdminRole,
} from "@/lib/services/admins";

export interface AdminFormState {
  error?: "validation" | "email_taken" | "last_super_admin" | "cannot_remove_self" | "unknown";
  fieldErrors?: Record<string, string>;
}

export async function createAdminAction(
  _previous: AdminFormState | undefined,
  formData: FormData,
): Promise<AdminFormState> {
  const admin = await requireActionPermission("admins.manage");
  const ip = getClientIp(await headers());

  let input;
  try {
    input = parseInput(createAdminSchema, {
      name: formValue(formData, "name"),
      email: formValue(formData, "email"),
      role: formValue(formData, "role"),
      password: formValue(formData, "password"),
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of error.issues) {
        if (issue.path && !fieldErrors[issue.path]) fieldErrors[issue.path] = issue.message;
      }
      return { error: "validation", fieldErrors };
    }
    return { error: "unknown" };
  }

  try {
    await createAdmin(admin.companyId, input, admin.id, ip);
  } catch (error) {
    if (error instanceof AdminManagementError && error.code === "EMAIL_TAKEN") {
      return { error: "email_taken", fieldErrors: { email: "duplicate_in_db" } };
    }
    throw error;
  }

  redirect("/admins?created=1");
}

export async function updateAdminRoleAction(formData: FormData): Promise<void> {
  const admin = await requireActionPermission("admins.manage");
  const ip = getClientIp(await headers());
  const adminId = formValue(formData, "admin_id");
  const role = formValue(formData, "role");
  if (role !== "SUPER_ADMIN" && role !== "ADMIN" && role !== "VIEWER") throw new Error("Invalid role");
  if (!adminId) throw new Error("Missing administrator id");

  await setAdminRole(admin.companyId, adminId, role, admin.id, ip);
  redirect("/admins?updated=1");
}

export async function deactivateAdminAction(formData: FormData): Promise<void> {
  const admin = await requireActionPermission("admins.manage");
  const ip = getClientIp(await headers());
  const adminId = formValue(formData, "admin_id");
  if (!adminId) throw new Error("Missing administrator id");

  await deactivateAdmin(admin.companyId, adminId, admin.id, ip);
  redirect("/admins?removed=1");
}
