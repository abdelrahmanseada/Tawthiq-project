"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireActionPermission } from "@/lib/auth/session";
import { getClientIp } from "@/lib/http";
import { ValidationError } from "@/lib/http";
import { parseImageDataUrl } from "@/lib/images";
import { employeeInputSchema, formValue, parseInput } from "@/lib/validation/schemas";
import {
  EmployeeCodeConflictError,
  EmployeeNotFoundError,
  createEmployee,
  removeEmployeePhoto,
  restoreEmployee,
  setEmployeeStatus,
  softDeleteEmployee,
  updateEmployee,
  findEmployee,
} from "@/lib/services/employees";
import { regenerateEmployeeCard, revokeCard, getActiveCard } from "@/lib/services/cards";
import { safeRedirectPath } from "@/lib/http";

export interface EmployeeFormState {
  error?: "validation" | "employee_code_taken" | "invalid_photo" | "not_found" | "unknown";
  fieldErrors?: Record<string, string>;
}

function employeeInputFromForm(formData: FormData) {
  return {
    employee_code: formValue(formData, "employee_code"),
    full_name: formValue(formData, "full_name"),
    department: formValue(formData, "department") || null,
    job_title: formValue(formData, "job_title") || null,
    status: formValue(formData, "status") || "ACTIVE",
    expires_at: formValue(formData, "expires_at") || null,
  };
}

function readPhotoData(formData: FormData): Buffer | null {
  const raw = formValue(formData, "photo") || formValue(formData, "photo_data");
  if (!raw) return null;
  return parseImageDataUrl(raw);
}

function fieldErrorsFrom(error: ValidationError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    if (issue.path && !result[issue.path]) result[issue.path] = issue.message;
  }
  return result;
}

export async function saveEmployeeAction(
  _previous: EmployeeFormState | undefined,
  formData: FormData,
): Promise<EmployeeFormState> {
  const admin = await requireActionPermission("employees.write");
  const employeeId = formValue(formData, "employee_id");
  const headerStore = await headers();
  const ip = getClientIp(headerStore);

  let input;
  try {
    input = parseInput(employeeInputSchema, employeeInputFromForm(formData));
  } catch (error) {
    if (error instanceof ValidationError) {
      return { error: "validation", fieldErrors: fieldErrorsFrom(error) };
    }
    return { error: "unknown" };
  }

  let photoBuffer: Buffer | null = null;
  try {
    photoBuffer = readPhotoData(formData);
  } catch {
    return { error: "invalid_photo" };
  }

  try {
    const isUpdate = Boolean(employeeId);
    const result = isUpdate
      ? await updateEmployee(admin.companyId, employeeId, input, { adminId: admin.id, ip }, photoBuffer)
      : await createEmployee(admin.companyId, input, { adminId: admin.id, ip }, photoBuffer);

    revalidatePath("/employees");
    revalidatePath(`/employees/${result.employee.id}`);
    redirect(`/employees/${result.employee.id}?${isUpdate ? "saved=1" : "created=1"}`);
  } catch (error) {
    if (error instanceof EmployeeCodeConflictError) {
      return { error: "employee_code_taken", fieldErrors: { employee_code: "duplicate_in_db" } };
    }
    if (error instanceof EmployeeNotFoundError) return { error: "not_found" };
    if (error instanceof ValidationError) {
      return { error: "validation", fieldErrors: fieldErrorsFrom(error) };
    }
    throw error;
  }
}

async function employeeIdsFromForm(formData: FormData): Promise<{ employeeId: string; next: string }> {
  const employeeId = formValue(formData, "employee_id");
  if (!employeeId) throw new Error("Missing employee id");
  const next = safeRedirectPath(formValue(formData, "next"), `/employees/${employeeId}`);
  return { employeeId, next };
}

export async function changeEmployeeStatusAction(formData: FormData): Promise<void> {
  const admin = await requireActionPermission("employees.write");
  const ip = getClientIp(await headers());
  const { employeeId, next } = await employeeIdsFromForm(formData);
  const status = formValue(formData, "status");
  if (status !== "ACTIVE" && status !== "SUSPENDED" && status !== "TERMINATED") {
    throw new Error("Invalid status");
  }
  await setEmployeeStatus(admin.companyId, employeeId, status, { adminId: admin.id, ip });
  revalidatePath("/employees");
  revalidatePath(`/employees/${employeeId}`);
  redirect(next);
}

export async function deleteEmployeeAction(formData: FormData): Promise<void> {
  const admin = await requireActionPermission("employees.write");
  const ip = getClientIp(await headers());
  const { employeeId, next } = await employeeIdsFromForm(formData);
  await softDeleteEmployee(admin.companyId, employeeId, { adminId: admin.id, ip });
  revalidatePath("/employees");
  redirect(next);
}

export async function restoreEmployeeAction(formData: FormData): Promise<void> {
  const admin = await requireActionPermission("employees.write");
  const ip = getClientIp(await headers());
  const { employeeId, next } = await employeeIdsFromForm(formData);
  await restoreEmployee(admin.companyId, employeeId, { adminId: admin.id, ip });
  revalidatePath("/employees");
  redirect(next);
}

export async function revokeCardAction(formData: FormData): Promise<void> {
  const admin = await requireActionPermission("cards.write");
  const ip = getClientIp(await headers());
  const { employeeId, next } = await employeeIdsFromForm(formData);
  const cardId = formValue(formData, "card_id");
  if (cardId) {
    const employee = await findEmployee(admin.companyId, employeeId);
    if (!employee) throw new Error("Employee not found");
    await revokeCard(cardId, "Revoked by administrator", admin.id, ip);
  }
  revalidatePath(`/employees/${employeeId}`);
  redirect(`${next}${next.includes("?") ? "&" : "?"}revoked=1`);
}

export async function regenerateCardAction(formData: FormData): Promise<void> {
  const admin = await requireActionPermission("cards.write");
  const ip = getClientIp(await headers());
  const { employeeId, next } = await employeeIdsFromForm(formData);
  await regenerateEmployeeCard(employeeId, admin.id, ip);
  revalidatePath(`/employees/${employeeId}`);
  redirect(`${next}${next.includes("?") ? "&" : "?"}regenerated=1`);
}

export async function removePhotoAction(formData: FormData): Promise<void> {
  const admin = await requireActionPermission("employees.write");
  const ip = getClientIp(await headers());
  const { employeeId, next } = await employeeIdsFromForm(formData);
  await removeEmployeePhoto(admin.companyId, employeeId, { adminId: admin.id, ip });
  revalidatePath(`/employees/${employeeId}`);
  redirect(next);
}

export async function generateCardForEmployeeAction(formData: FormData): Promise<void> {
  const admin = await requireActionPermission("cards.write");
  const ip = getClientIp(await headers());
  const { employeeId, next } = await employeeIdsFromForm(formData);
  const active = await getActiveCard(employeeId);
  if (!active) {
    await regenerateEmployeeCard(employeeId, admin.id, ip, { reason: "Issued by administrator" });
  }
  redirect(next);
}
