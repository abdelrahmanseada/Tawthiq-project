"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getClientIp, ValidationError } from "@/lib/http";
import { requireActionPermission } from "@/lib/auth/session";
import { ImageValidationError } from "@/lib/images";
import { env } from "@/lib/env";
import { companySettingsSchema, formValue, parseInput } from "@/lib/validation/schemas";
import { validateVerifyBaseUrl } from "@/lib/qr";
import {
  CompanySettingsError,
  DomainChangeRequiresConfirmationError,
  removeCompanyLogo,
  updateCompanyLogoFromUpload,
  updateCompanySettings,
} from "@/lib/services/company";

export interface SettingsState {
  error?:
    | "validation"
    | "invalid_logo"
    | "unknown"
    | "no_company"
    | "domain_confirmation_required"
    | "invalid_verify_url";
  affectedCards?: number;
  fieldErrors?: Record<string, string>;
}

export async function saveCompanySettingsAction(
  _previous: SettingsState | undefined,
  formData: FormData,
): Promise<SettingsState> {
  const admin = await requireActionPermission("settings.manage");
  const ip = getClientIp(await headers());

  let input;
  try {
    input = parseInput(companySettingsSchema, {
      name: formValue(formData, "name"),
      primary_color: formValue(formData, "primary_color"),
      secondary_color: formValue(formData, "secondary_color"),
      contact_phone: formValue(formData, "contact_phone"),
      contact_email: formValue(formData, "contact_email"),
      verify_base_url: formValue(formData, "verify_base_url"),
      time_zone: formValue(formData, "time_zone"),
      custom_domain: formValue(formData, "custom_domain"),
      idle_timeout_minutes: formValue(formData, "idle_timeout_minutes"),
      default_card_validity_days: formValue(formData, "default_card_validity_days"),
      scan_log_retention_days: formValue(formData, "scan_log_retention_days"),
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
    await updateCompanySettings(admin.companyId, input, admin.id, ip, {
      confirmDomainChange: formValue(formData, "confirm_domain_change") === "1",
    });
  } catch (error) {
    if (error instanceof DomainChangeRequiresConfirmationError) {
      return { error: "domain_confirmation_required", affectedCards: error.affectedCards };
    }
    if (error instanceof CompanySettingsError) {
      return {
        error: "invalid_verify_url",
        fieldErrors: { verify_base_url: error.details?.[0] ?? "invalid_url" },
      };
    }
    return { error: "unknown" };
  }

  try {
    const removeLogo = formValue(formData, "remove_logo") === "1";
    const logo = formData.get("logo");
    if (removeLogo) {
      await removeCompanyLogo(admin.companyId, admin.id, ip);
    } else if (logo instanceof File && logo.size > 0) {
      if (logo.size > env.MAX_IMAGE_BYTES) return { error: "invalid_logo" };
      const buffer = Buffer.from(await logo.arrayBuffer());
      await updateCompanyLogoFromUpload(
        admin.companyId,
        { buffer, name: logo.name, type: logo.type },
        admin.id,
        ip,
      );
    }
  } catch (error) {
    if (error instanceof ImageValidationError) return { error: "invalid_logo" };
    return { error: "unknown" };
  }

  revalidatePath("/", "layout");
  redirect("/settings?saved=1");
}

export async function testVerifyUrlAction(url: string): Promise<{ ok: boolean; detail: string }> {
  await requireActionPermission("settings.manage");
  const check = validateVerifyBaseUrl(url, false);
  if (!check.ok || !check.normalized) return { ok: false, detail: check.errors[0] ?? "invalid_url" };
  try {
    const response = await fetch(`${check.normalized}/api/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
      headers: { "user-agent": "Tawthiq-URL-Test/1.0" },
    });
    const body = (await response.json().catch(() => null)) as { status?: string } | null;
    if (response.ok && body?.status === "ok") return { ok: true, detail: "ok" };
    return { ok: false, detail: `http_${response.status}` };
  } catch {
    return { ok: false, detail: "unreachable" };
  }
}
