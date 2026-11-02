import type { Company } from "@prisma/client";
import { prisma } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { normalizeUnicode } from "@/lib/text";
import { normalizeCompanyLogo, ImageValidationError, logoBackgroundIsDark } from "@/lib/images";
import { removeStorageFile, storageKey, writeStorageFile } from "@/lib/storage";
import { env } from "@/lib/env";
import { validateVerifyBaseUrl } from "@/lib/qr";
import type { CompanySettingsInput } from "@/lib/validation/schemas";

export class CompanySettingsError extends Error {
  readonly code: string;
  readonly details?: string[];
  constructor(code: string, details?: string[]) {
    super(code);
    this.name = "CompanySettingsError";
    this.code = code;
    this.details = details;
  }
}

export class DomainChangeRequiresConfirmationError extends Error {
  readonly code = "DOMAIN_CHANGE_CONFIRMATION_REQUIRED";
  readonly affectedCards: number;
  constructor(affectedCards: number) {
    super("Domain change requires confirmation");
    this.name = "DomainChangeRequiresConfirmationError";
    this.affectedCards = affectedCards;
  }
}

/** Single-company deployment: the oldest company row is the primary brand. */
export async function getPrimaryCompany(): Promise<Company> {
  const company = await prisma.company.findFirst({ orderBy: { created_at: "asc" } });
  if (!company) throw new Error("No company configured. Run the seed script.");
  return company;
}

export async function getCompanyById(companyId: string): Promise<Company | null> {
  return prisma.company.findUnique({ where: { id: companyId } });
}

export async function countActiveCards(companyId: string): Promise<number> {
  return prisma.card.count({
    where: { status: "ACTIVE", employee: { company_id: companyId, deleted_at: null } },
  });
}

export async function updateCompanySettings(
  companyId: string,
  input: CompanySettingsInput,
  adminId: string,
  ip: string | null,
  options: { confirmDomainChange?: boolean } = {},
): Promise<Company> {
  const check = validateVerifyBaseUrl(input.verify_base_url, env.NODE_ENV === "production");
  if (!check.ok || !check.normalized || (env.NODE_ENV === "production" && !check.productionValid)) {
    throw new CompanySettingsError("invalid_verify_url", check.errors);
  }
  const normalizedUrl = check.normalized;

  const existing = await prisma.company.findUnique({ where: { id: companyId } });
  if (!existing) throw new CompanySettingsError("company_not_found");

  const domainChanged = existing.verify_base_url !== normalizedUrl;
  const activeCards = domainChanged ? await countActiveCards(companyId) : 0;
  if (domainChanged && activeCards > 0 && !options.confirmDomainChange) {
    throw new DomainChangeRequiresConfirmationError(activeCards);
  }

  const updated = await prisma.company.update({
    where: { id: companyId },
    data: {
      name: normalizeUnicode(input.name),
      tagline: normalizeUnicode(input.tagline ?? ""),
      website: input.website ? input.website : null,
      show_verify_host_on_card: input.show_verify_host_on_card === "1",
      primary_color: input.primary_color.toLowerCase(),
      secondary_color: input.secondary_color.toLowerCase(),
      contact_phone: normalizeUnicode(input.contact_phone),
      contact_email: input.contact_email,
      verify_base_url: normalizedUrl,
      time_zone: input.time_zone,
      idle_timeout_minutes: input.idle_timeout_minutes,
      default_card_validity_days: input.default_card_validity_days,
      scan_log_retention_days: input.scan_log_retention_days,
    },
  });

  await writeAuditLog({
    adminId,
    action: "company.settings_updated",
    entity: "Company",
    entityId: companyId,
    metadata: {
      name: updated.name,
      verify_base_url: updated.verify_base_url,
      time_zone: updated.time_zone,
      previous_verify_base_url: existing.verify_base_url,
      domain_changed: domainChanged,
      active_cards_affected: activeCards,
      default_card_validity_days: updated.default_card_validity_days,
      scan_log_retention_days: updated.scan_log_retention_days,
      idle_timeout_minutes: updated.idle_timeout_minutes,
    },
    ip,
  });

  return updated;
}

export async function updateCompanyLogo(
  companyId: string,
  imageBuffer: Buffer,
  adminId: string,
  ip: string | null,
): Promise<Company> {
  if (imageBuffer.length > env.MAX_IMAGE_BYTES) throw new ImageValidationError("Image too large");
  const normalized = await normalizeCompanyLogo(imageBuffer);
  const dark = await logoBackgroundIsDark(normalized.buffer);
  const key = storageKey("logos", companyId, "logo.png");
  await writeStorageFile(key, normalized.buffer);

  const previous = await prisma.company.findUnique({ where: { id: companyId }, select: { logo_url: true } });
  const company = await prisma.company.update({ where: { id: companyId }, data: { logo_url: key, logo_bg_dark: dark } });
  if (previous?.logo_url && previous.logo_url !== key) await removeStorageFile(previous.logo_url);

  await writeAuditLog({
    adminId,
    action: "company.logo_updated",
    entity: "Company",
    entityId: companyId,
    ip,
  });
  return company;
}

export async function removeCompanyLogo(companyId: string, adminId: string, ip: string | null): Promise<Company> {
  const previous = await prisma.company.findUnique({ where: { id: companyId }, select: { logo_url: true } });
  const company = await prisma.company.update({ where: { id: companyId }, data: { logo_url: null, logo_bg_dark: false } });
  if (previous?.logo_url) await removeStorageFile(previous.logo_url);
  await writeAuditLog({
    adminId,
    action: "company.logo_removed",
    entity: "Company",
    entityId: companyId,
    ip,
  });
  return company;
}

/** Accepts PNG/JPG/SVG logos; SVGs are rasterised server-side before storage. */
export async function updateCompanyLogoFromUpload(
  companyId: string,
  file: { buffer: Buffer; name: string; type: string },
  adminId: string,
  ip: string | null,
): Promise<Company> {
  const isSvg = file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg");
  let buffer = file.buffer;
  if (isSvg) {
    const { default: sharp } = await import("sharp");
    try {
      buffer = await sharp(file.buffer, { density: 192 }).png().toBuffer();
    } catch {
      throw new ImageValidationError("Invalid SVG logo");
    }
  }
  return updateCompanyLogo(companyId, buffer, adminId, ip);
}
