import type { CardStatus, EmployeeStatus, ScanResult } from "@prisma/client";
import { prisma } from "@/lib/db";
import { normalizeUnicode, truncate } from "@/lib/text";
import {
  createPhotoToken,
  hashCardToken,
  isValidCardTokenFormat,
  safeTokenPrefix,
} from "@/lib/security/crypto";
import { recordInvalidVerifyAttempt } from "@/lib/security/rate-limit";
import { PRODUCT_NAME } from "@/lib/brand";

export type VerificationState = "valid" | "expired" | "cancelled" | "invalid";

export interface VerificationCardSnapshot {
  status: CardStatus;
  expires_at: Date;
  employee: {
    id?: string;
    status: EmployeeStatus;
    deleted_at: Date | null;
  };
}

export interface VerificationOutcome {
  state: VerificationState;
  result: ScanResult;
}

export function resolveVerificationOutcome(
  card: VerificationCardSnapshot | null,
  now: Date = new Date(),
): VerificationOutcome {
  if (!card) return { state: "invalid", result: "INVALID" };
  if (card.status === "REVOKED") return { state: "cancelled", result: "REVOKED" };
  if (card.employee.deleted_at) return { state: "cancelled", result: "REVOKED" };
  if (card.employee.status === "TERMINATED") return { state: "cancelled", result: "REVOKED" };
  if (card.employee.status === "SUSPENDED") return { state: "cancelled", result: "SUSPENDED" };
  if (card.expires_at.getTime() <= now.getTime()) return { state: "expired", result: "EXPIRED" };
  return { state: "valid", result: "VALID" };
}

export interface PublicCompany {
  id: string;
  time_zone: string;
  name: string;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  contact_phone: string;
  contact_email: string;
}

export interface PublicEmployee {
  full_name: string;
  job_title: string | null;
  department: string | null;
  photo_url: string | null;
}

export interface VerificationView {
  state: VerificationState;
  result: ScanResult;
  /** Null for unknown/invalid tokens or a suspended company: use product branding. */
  company: PublicCompany | null;
  employee: PublicEmployee | null;
  valid_until: string | null;
}

export interface VerificationRequestMeta {
  ipHash: string;
  userAgent: string | null;
  host?: string | null;
}

export const NEUTRAL_PRODUCT = {
  id: "product",
  time_zone: "Africa/Cairo",
  name: PRODUCT_NAME,
  logo_url: null,
  primary_color: "#0F766E",
  secondary_color: "#F59E0B",
  contact_phone: "",
  contact_email: "",
} as const satisfies PublicCompany;

function toPublicCompany(company: {
  id: string;
  time_zone: string;
  name: string;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  contact_phone: string;
  contact_email: string;
}): PublicCompany {
  return {
    id: company.id,
    time_zone: company.time_zone,
    name: company.name,
    logo_url: company.logo_url,
    primary_color: company.primary_color,
    secondary_color: company.secondary_color,
    contact_phone: company.contact_phone,
    contact_email: company.contact_email,
  };
}

async function safeLogScan(input: {
  companyId: string | null;
  cardId: string | null;
  tokenPrefix: string;
  result: ScanResult;
  ipHash: string;
  userAgent: string | null;
}): Promise<void> {
  try {
    await prisma.scanLog.create({
      data: {
        company_id: input.companyId,
        card_id: input.cardId,
        token_prefix: input.tokenPrefix.slice(0, 6),
        result: input.result,
        ip_hash: input.ipHash,
        user_agent: input.userAgent ? truncate(input.userAgent, 400) : null,
      },
    });
  } catch (error) {
    console.error("scan_log_failed", error instanceof Error ? error.message : "unknown");
  }
}

/**
 * Tenant is resolved exclusively from the token hash. There is no primary-company
 * fallback: invalid tokens and suspended companies always use neutral Tawthiq branding.
 */
export async function verifyPublicToken(
  token: string,
  meta: VerificationRequestMeta,
  now: Date = new Date(),
): Promise<VerificationView> {
  if (!isValidCardTokenFormat(token)) {
    await safeLogScan({
      companyId: null,
      cardId: null,
      tokenPrefix: safeTokenPrefix(token),
      result: "INVALID",
      ipHash: meta.ipHash,
      userAgent: meta.userAgent,
    });
    await recordInvalidVerifyAttempt(meta.ipHash, now);
    return { state: "invalid", result: "INVALID", company: null, employee: null, valid_until: null };
  }

  const card = await prisma.card.findUnique({
    where: { token_hash: hashCardToken(token) },
    include: { employee: { include: { company: true } } },
  });

  if (!card) {
    await safeLogScan({
      companyId: null,
      cardId: null,
      tokenPrefix: safeTokenPrefix(token),
      result: "INVALID",
      ipHash: meta.ipHash,
      userAgent: meta.userAgent,
    });
    await recordInvalidVerifyAttempt(meta.ipHash, now);
    return { state: "invalid", result: "INVALID", company: null, employee: null, valid_until: null };
  }

  const company = card.employee.company;
  const host = meta.host?.toLowerCase().replace(/:\d+$/, "") ?? null;
  let hostTenantId: string | null = null;
  if (host) {
    const hostCompany = await prisma.company.findFirst({
      where: { custom_domain: host },
      select: { id: true },
    });
    hostTenantId = hostCompany?.id ?? null;
  }
  const hostMismatch =
    (company.custom_domain && host && company.custom_domain.toLowerCase() !== host) ||
    (hostTenantId !== null && hostTenantId !== company.id);

  if (company.status === "SUSPENDED" || hostMismatch) {
    await safeLogScan({
      companyId: company.id,
      cardId: card.id,
      tokenPrefix: card.token_prefix,
      result: "INVALID",
      ipHash: meta.ipHash,
      userAgent: meta.userAgent,
    });
    await recordInvalidVerifyAttempt(meta.ipHash, now);
    return { state: "invalid", result: "INVALID", company: null, employee: null, valid_until: null };
  }

  const outcome = resolveVerificationOutcome(card, now);
  await safeLogScan({
    companyId: company.id,
    cardId: card.id,
    tokenPrefix: card.token_prefix,
    result: outcome.result,
    ipHash: meta.ipHash,
    userAgent: meta.userAgent,
  });
  if (outcome.result === "INVALID") await recordInvalidVerifyAttempt(meta.ipHash, now);

  if (outcome.state === "valid") {
    const photoUrl = card.employee.photo_path ? createPhotoToken(card.employee.id).path : null;
    return {
      state: "valid",
      result: "VALID",
      company: toPublicCompany(company),
      employee: {
        full_name: card.employee.full_name,
        job_title: card.employee.job_title,
        department: card.employee.department,
        photo_url: photoUrl,
      },
      valid_until: card.expires_at.toISOString(),
    };
  }

  return {
    state: outcome.state,
    result: outcome.result,
    company: toPublicCompany(company),
    employee: null,
    valid_until: outcome.state === "expired" ? card.expires_at.toISOString() : null,
  };
}

export function toPublicVerificationJson(view: VerificationView) {
  return {
    state: view.state,
    result: view.result,
    company: view.company
      ? {
          name: view.company.name,
          logo_url: view.company.logo_url ? "/api/media/logo" : null,
          primary_color: view.company.primary_color,
          secondary_color: view.company.secondary_color,
        }
      : null,
    employee: view.employee
      ? {
          full_name: view.employee.full_name,
          job_title: view.employee.job_title,
          department: view.employee.department,
          photo_url: view.employee.photo_url,
        }
      : null,
    valid_until: view.valid_until,
  };
}

export async function reportVerificationProblem(
  token: string,
  note: string,
  ipHash: string,
): Promise<void> {
  const cleanNote = truncate(normalizeUnicode(note), 500);
  if (cleanNote.length < 3) throw new Error("Note is too short");

  const card = isValidCardTokenFormat(token)
    ? await prisma.card.findUnique({
        where: { token_hash: hashCardToken(token) },
        select: { id: true, token_prefix: true, employee: { select: { company_id: true } } },
      })
    : null;

  await prisma.verificationReport.create({
    data: {
      company_id: card?.employee.company_id ?? null,
      card_id: card?.id ?? null,
      token_prefix: card?.token_prefix ?? safeTokenPrefix(token),
      note: cleanNote,
      ip_hash: ipHash,
    },
  });

  if (card) {
    const latestScan = await prisma.scanLog.findFirst({
      where: { card_id: card.id, company_id: card.employee.company_id },
      orderBy: { created_at: "desc" },
      select: { id: true },
    });
    if (latestScan) await prisma.scanLog.update({ where: { id: latestScan.id }, data: { reported: true } });
  }
}

export async function getPublicCompanyForToken(token: string): Promise<PublicCompany | null> {
  if (!isValidCardTokenFormat(token)) return null;
  const card = await prisma.card.findUnique({
    where: { token_hash: hashCardToken(token) },
    include: { employee: { include: { company: true } } },
  });
  if (!card || card.employee.company.status === "SUSPENDED") return null;
  return toPublicCompany(card.employee.company);
}
