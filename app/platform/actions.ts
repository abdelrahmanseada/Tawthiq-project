"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getClientIp } from "@/lib/http";
import { requirePlatformAction } from "@/lib/auth/session";
import {
  PlatformError,
  createCompanyWithOwner,
  platformDeactivateAdmin,
  platformResetOwnerTwoFactor,
  setCompanyStatus,
  updateCompanyLimits,
} from "@/lib/services/platform";
import { formValue, platformCompanySchema } from "@/lib/validation/schemas";

function errorRedirect(path: string, code: string): never {
  redirect(`${path}?error=${encodeURIComponent(code)}`);
}

export async function createPlatformCompanyAction(formData: FormData): Promise<void> {
  const actor = await requirePlatformAction();
  const ip = getClientIp(await headers());
  const parsed = platformCompanySchema.safeParse({
    name: formValue(formData, "name"),
    slug: formValue(formData, "slug"),
    owner_name: formValue(formData, "owner_name"),
    owner_email: formValue(formData, "owner_email"),
    temporary_password: formValue(formData, "temporary_password"),
    max_employees: formValue(formData, "max_employees"),
    time_zone: formValue(formData, "time_zone"),
  });
  if (!parsed.success) errorRedirect("/platform/companies/new", "validation");

  try {
    const company = await createCompanyWithOwner(
      {
        name: parsed.data.name,
        slug: parsed.data.slug,
        ownerName: parsed.data.owner_name,
        ownerEmail: parsed.data.owner_email,
        temporaryPassword: parsed.data.temporary_password,
        maxEmployees: parsed.data.max_employees,
        timeZone: parsed.data.time_zone,
      },
      actor.id,
      ip,
    );
    redirect(`/platform/companies/${company.id}?created=1`);
  } catch (error) {
    if (error instanceof PlatformError) errorRedirect("/platform/companies/new", error.code.toLowerCase());
    throw error;
  }
}

export async function suspendCompanyAction(formData: FormData): Promise<void> {
  const actor = await requirePlatformAction();
  const companyId = formValue(formData, "company_id");
  const status = formValue(formData, "status") === "SUSPENDED" ? "SUSPENDED" : "ACTIVE";
  if (!companyId) throw new Error("Invalid company");
  await setCompanyStatus(companyId, status, actor.id, getClientIp(await headers()));
  redirect(`/platform/companies/${companyId}?updated=1`);
}

export async function updateCompanyLimitsAction(formData: FormData): Promise<void> {
  const actor = await requirePlatformAction();
  const companyId = formValue(formData, "company_id");
  const maxEmployees = Number(formValue(formData, "max_employees"));
  const timeZone = formValue(formData, "time_zone");
  if (!companyId || !Number.isInteger(maxEmployees) || maxEmployees < 1 || maxEmployees > 100000) {
    throw new Error("Invalid limits");
  }
  await updateCompanyLimits(companyId, { maxEmployees, timeZone }, actor.id, getClientIp(await headers()));
  redirect(`/platform/companies/${companyId}?updated=1`);
}

export async function resetOwner2faAction(formData: FormData): Promise<void> {
  const actor = await requirePlatformAction();
  const companyId = formValue(formData, "company_id");
  const adminId = formValue(formData, "admin_id");
  if (!companyId || !adminId) throw new Error("Invalid administrator");
  await platformResetOwnerTwoFactor(companyId, adminId, actor.id, getClientIp(await headers()));
  redirect(`/platform/companies/${companyId}?reset2fa=1`);
}

export async function platformDeactivateAdminAction(formData: FormData): Promise<void> {
  const actor = await requirePlatformAction();
  const companyId = formValue(formData, "company_id");
  const adminId = formValue(formData, "admin_id");
  if (!companyId || !adminId) throw new Error("Invalid administrator");
  await platformDeactivateAdmin(companyId, adminId, actor.id, getClientIp(await headers()));
  redirect(`/platform/companies/${companyId}?deactivated=1`);
}
