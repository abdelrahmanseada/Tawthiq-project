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
import { DEFAULT_PRIMARY_COLOR, DEFAULT_SECONDARY_COLOR } from "@/lib/colors";
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

  const rawPrimary = formValue(formData, "primary_color");
  const rawSecondary = formValue(formData, "secondary_color");
  const colorErrors: Record<string, string> = {};
  if (!/^#[0-9a-fA-F]{6}$/.test(rawPrimary.trim())) colorErrors.primary_color = "invalid_color";
  if (!/^#[0-9a-fA-F]{6}$/.test(rawSecondary.trim())) colorErrors.secondary_color = "invalid_color";

  let input;
  try {
    input = parseInput(companySettingsSchema, {
      name: formValue(formData, "name"),
      tagline: formValue(formData, "tagline"),
      website: formValue(formData, "website"),
      show_verify_host_on_card: formValue(formData, "show_verify_host_on_card") === "1" ? "1" : "0",
      primary_color: colorErrors.primary_color ? DEFAULT_PRIMARY_COLOR : rawPrimary,
      secondary_color: colorErrors.secondary_color ? DEFAULT_SECONDARY_COLOR : rawSecondary,
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
      Object.assign(fieldErrors, colorErrors);
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
  if (Object.keys(colorErrors).length > 0) return { error: "validation", fieldErrors: colorErrors };
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
      headers: { "user-agent": "Bremer-URL-Test/1.0" },
    });
    const body = (await response.json().catch(() => null)) as { status?: string } | null;
    if (response.ok && body?.status === "ok") return { ok: true, detail: "ok" };
    return { ok: false, detail: `http_${response.status}` };
  } catch {
    return { ok: false, detail: "unreachable" };
  }
}
