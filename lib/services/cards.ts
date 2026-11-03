import type { Card, Company, Employee, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { addDays, cairoEndOfDay, formatIsoDate, parseIsoDateOnly } from "@/lib/format";
import { renderCardPdf, type CardCompanyData, type CardEmployeeData, type CardPrintMode } from "@/lib/pdf/card";
import { renderCardsSheet } from "@/lib/pdf/sheet";
import { validateVerifyBaseUrl } from "@/lib/qr";
import {
  cardTokenPrefix,
  decryptCardToken,
  encryptCardToken,
  generateCardToken,
  hashCardToken,
  newId,
} from "@/lib/security/crypto";

export type DbClient = Prisma.TransactionClient;
export type EmployeeWithCompany = Employee & { company: Company };

export class CardOperationError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(code: string, message: string, status = 409) {
    super(message);
    this.name = "CardOperationError";
    this.code = code;
    this.status = status;
  }
}

export function companyCardData(company: Company): CardCompanyData {
  return {
    name: company.name,
    logo_path: company.logo_url,
    logo_bg_dark: company.logo_bg_dark,
    primary_color: company.primary_color,
    secondary_color: company.secondary_color,
    contact_phone: company.contact_phone,
    contact_email: company.contact_email,
    verify_base_url: company.verify_base_url,
    website: company.website,
    tagline: company.tagline,
    show_verify_host_on_card: company.show_verify_host_on_card,
    time_zone: company.time_zone,
    status: company.status,
  };
}

export function employeeCardData(employee: Employee): CardEmployeeData {
  return {
    full_name: employee.full_name,
    job_title: employee.job_title,
    department: employee.department,
    photo_path: employee.photo_path,
    employee_code: employee.employee_code,
  };
}

export function defaultCardExpiry(company: Pick<Company, "default_card_validity_days">, now = new Date()): Date {
  return addDays(now, company.default_card_validity_days);
}

export function cardExpiryFromInput(
  value: string | null | undefined,
  company: Pick<Company, "default_card_validity_days">,
  now = new Date(),
): Date {
  if (!value) return defaultCardExpiry(company, now);
  const parsed = parseIsoDateOnly(value);
  if (!parsed) throw new CardOperationError("invalid_expiry", "Invalid expiry date", 422);
  const end = cairoEndOfDay(value);
  if (!end) throw new CardOperationError("invalid_expiry", "Invalid expiry date", 422);
  return end;
}

export interface PreparedCard {
  cardId: string;
  tokenHash: string;
  tokenPrefix: string;
  tokenEnc: string;
  expiresAt: Date;
}

/** Generate a card token and encrypt it for later PDF rendering. No PDF is stored. */
export function prepareCard(expiresAt: Date): PreparedCard {
  const token = generateCardToken();
  return {
    cardId: newId(),
    tokenHash: hashCardToken(token),
    tokenPrefix: cardTokenPrefix(token),
    tokenEnc: encryptCardToken(token),
    expiresAt,
  };
}

export interface PersistCardOptions {
  employeeId: string;
  adminId: string | null;
  importBatchId?: string | null;
  issuedAt?: Date;
}

export async function persistCard(
  db: DbClient | typeof prisma,
  prepared: PreparedCard,
  options: PersistCardOptions,
): Promise<Card> {
  return db.card.create({
    data: {
      id: prepared.cardId,
      employee_id: options.employeeId,
      token_hash: prepared.tokenHash,
      token_prefix: prepared.tokenPrefix,
      token_enc: prepared.tokenEnc,
      status: "ACTIVE",
      issued_at: options.issuedAt ?? new Date(),
      expires_at: prepared.expiresAt,
      created_by: options.adminId,
      import_batch_id: options.importBatchId ?? null,
    },
  });
}

export async function issueCardForEmployee(
  employee: Pick<Employee, "id">,
  company: Company,
  adminId: string | null,
  options: { expiresAt?: Date; importBatchId?: string | null; db?: DbClient | typeof prisma } = {},
): Promise<Card> {
  const prepared = prepareCard(options.expiresAt ?? defaultCardExpiry(company));
  return persistCard(options.db ?? prisma, prepared, {
    employeeId: employee.id,
    adminId,
    importBatchId: options.importBatchId,
  });
}

export async function getActiveCard(employeeId: string): Promise<Card | null> {
  return prisma.card.findFirst({
    where: { employee_id: employeeId, status: "ACTIVE" },
    orderBy: { issued_at: "desc" },
  });
}

export async function getLatestCard(employeeId: string): Promise<Card | null> {
  return prisma.card.findFirst({
    where: { employee_id: employeeId },
    orderBy: { issued_at: "desc" },
  });
}

export function cardToken(card: Pick<Card, "token_enc">): string | null {
  return decryptCardToken(card.token_enc);
}

/**
 * Old cards can carry a token encrypted with a previous CARD_TOKEN_KEY (for
 * example after moving a database into a new Docker stack). Rotate that card
 * in place so printing works again; the old printed QR becomes invalid.
 */
async function ensureCardToken(card: Card): Promise<string | null> {
  const existing = cardToken(card);
  if (existing) return existing;
  const prepared = prepareCard(card.expires_at);
  try {
    await prisma.card.update({
      where: { id: card.id },
      data: { token_hash: prepared.tokenHash, token_prefix: prepared.tokenPrefix, token_enc: prepared.tokenEnc },
    });
    return decryptCardToken(prepared.tokenEnc);
  } catch {
    return null;
  }
}

export async function revokeCard(
  cardId: string,
  reason: string,
  adminId: string,
  ip: string | null,
): Promise<Card> {
  const card = await prisma.card.findUnique({ where: { id: cardId } });
  if (!card) throw new CardOperationError("card_not_found", "Card not found", 404);
  if (card.status === "REVOKED") return card;
  const updated = await prisma.card.update({
    where: { id: cardId },
    data: { status: "REVOKED", revoked_at: new Date(), revoked_reason: reason.slice(0, 200) },
  });
  await writeAuditLog({
    adminId,
    action: "card.revoked",
    entity: "Card",
    entityId: cardId,
    metadata: { employee_id: card.employee_id, token_prefix: card.token_prefix, reason },
    ip,
  });
  return updated;
}

export function cardIsExpired(card: Pick<Card, "expires_at">, now = new Date()): boolean {
  return card.expires_at.getTime() <= now.getTime();
}

export interface PrintCheckInput {
  employee: Pick<Employee, "photo_path" | "deleted_at" | "status">;
  card: Pick<Card, "status" | "expires_at" | "token_enc">;
  company: Pick<Company, "verify_base_url" | "status">;
  mode: CardPrintMode;
}

export interface PrintCheck {
  ok: boolean;
  errors: string[];
}

/**
 * Printing rules: revoked/expired cards are never printable. Photos are optional;
 * normal prints require a production-valid verification URL. "test print" allows a
 * development URL, adds a watermark, and still refuses dead cards.
 */
export function checkCardPrintability(input: PrintCheckInput, now = new Date()): PrintCheck {
  const errors: string[] = [];
  if (input.employee.deleted_at) errors.push("employee_deleted");
  if (input.card.status !== "ACTIVE") errors.push("card_revoked");
  if (cardIsExpired(input.card, now)) errors.push("card_expired");
  if (!input.card.token_enc) errors.push("card_needs_reissue");
  if (input.company.status === "SUSPENDED") errors.push("company_suspended");
  if (input.employee.status !== "ACTIVE") errors.push("employee_not_active");

  const productionCheck = validateVerifyBaseUrl(input.company.verify_base_url, true);
  if (!productionCheck.ok || !productionCheck.productionValid) errors.push("verify_domain_invalid");

  if (input.mode === "test") {
    const parseable = validateVerifyBaseUrl(input.company.verify_base_url, false);
    const blocking = ["employee_deleted", "card_revoked", "card_expired", "card_needs_reissue", "company_suspended", "employee_not_active"];
    return {
      ok: parseable.ok && !errors.some((error) => blocking.includes(error)),
      errors,
    };
  }
  return { ok: errors.length === 0, errors };
}

export async function regenerateEmployeeCard(
  employeeId: string,
  adminId: string,
  ip: string | null,
  options: { reason?: string; keepExpiry?: boolean } = {},
): Promise<Card> {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    include: { company: true },
  });
  if (!employee) throw new CardOperationError("employee_not_found", "Employee not found", 404);
  if (employee.deleted_at) throw new CardOperationError("employee_deleted", "Employee is deleted");

  const existing = await getActiveCard(employeeId);
  const now = new Date();
  const expiresAt =
    options.keepExpiry !== false && existing && existing.expires_at > now
      ? existing.expires_at
      : defaultCardExpiry(employee.company, now);

  const prepared = prepareCard(expiresAt);
  const card = await prisma.$transaction(async (tx) => {
    if (existing) {
      await tx.card.updateMany({
        where: { employee_id: employeeId, status: "ACTIVE" },
        data: {
          status: "REVOKED",
          revoked_at: now,
          revoked_reason: (options.reason ?? "Regenerated").slice(0, 200),
        },
      });
    }
    return persistCard(tx, prepared, { employeeId, adminId });
  });

  await writeAuditLog({
    adminId,
    action: "card.regenerated",
    entity: "Employee",
    entityId: employeeId,
    metadata: {
      employee_code: employee.employee_code,
      card_id: card.id,
      token_prefix: card.token_prefix,
      previous_card: existing?.id ?? null,
    },
    ip,
  });
  return card;
}

/** Re-issue every legacy active card that predates encrypted token storage. */
export async function reissueLegacyCards(
  companyId: string,
  adminId: string,
  ip: string | null,
): Promise<{ reissued: number }> {
  const legacy = await prisma.card.findMany({
    where: {
      employee: { company_id: companyId, deleted_at: null },
      token_enc: null,
      status: "ACTIVE",
    },
    include: { employee: { include: { company: true } } },
  });

  let reissued = 0;
  for (const card of legacy) {
    const employee = card.employee;
    const prepared = prepareCard(card.expires_at > new Date() ? card.expires_at : defaultCardExpiry(employee.company));
    await prisma.$transaction(async (tx) => {
      await tx.card.update({
        where: { id: card.id },
        data: { status: "REVOKED", revoked_at: new Date(), revoked_reason: "Re-issued (legacy card)" },
      });
      await persistCard(tx, prepared, { employeeId: employee.id, adminId });
    });
    reissued += 1;
  }

  await writeAuditLog({
    adminId,
    action: "card.bulk_reissued",
    entity: "Company",
    entityId: companyId,
    metadata: { reissued },
    ip,
  });
  return { reissued };
}

export interface PrintableCard {
  card: Card;
  employee: EmployeeWithCompany;
  bytes: Uint8Array;
}

/** Render printable cards on demand (no PDF artefacts are stored). */
export async function buildPrintableCards(
  companyId: string,
  employeeIds: string[],
  adminId: string,
  ip: string | null,
  mode: CardPrintMode = "cr80",
): Promise<PrintableCard[]> {
  if (employeeIds.length === 0) return [];
  const employees = await prisma.employee.findMany({
    where: { id: { in: employeeIds }, company_id: companyId, deleted_at: null },
    include: { company: true },
    orderBy: { full_name: "asc" },
  });
  if (employees.length !== employeeIds.length) {
    throw new CardOperationError("employee_not_found", "One or more employees were not found", 404);
  }

  const result: PrintableCard[] = [];
  for (const employee of employees) {
    const card = await getActiveCard(employee.id);
    if (!card) throw new CardOperationError("no_card", `No active card for ${employee.employee_code}`, 409);
    const check = checkCardPrintability({ employee, card, company: employee.company, mode }, new Date());
    if (!check.ok) {
      throw new CardOperationError(check.errors[0] ?? "print_blocked", "Card cannot be printed", 409);
    }
    const token = await ensureCardToken(card);
    if (!token) throw new CardOperationError("card_needs_reissue", "Card must be re-issued", 409);
    const bytes = await renderCardPdf({
      company: companyCardData(employee.company),
      employee: employeeCardData(employee),
      expiresAt: card.expires_at,
      token,
      mode,
    });
    result.push({ card, employee, bytes });
  }
  void adminId;
  void ip;
  return result;
}

export async function buildA4Sheet(
  companyId: string,
  employeeIds: string[],
  adminId: string,
  ip: string | null,
  mode: "cr80" | "test" = "cr80",
) {
  const cards = await buildPrintableCards(companyId, employeeIds, adminId, ip, mode);
  await writeAuditLog({
    adminId,
    action: "card.bulk_a4_download",
    entity: "Company",
    entityId: companyId,
    metadata: { employees: employeeIds.length, cards: cards.length, mode },
    ip,
  });
  const pdf = await renderCardsSheet(cards.map((entry) => entry.bytes), {
    author: cards[0]?.employee.company.name,
  });
  return { pdf, count: cards.length };
}

export function cardExpiryInputValue(card: Card | null): string {
  return card ? formatIsoDate(card.expires_at) : "";
}

export async function loadPrintableCard(
  cardId: string,
  companyId: string,
  mode: CardPrintMode,
): Promise<{ card: Card; employee: Employee & { company: Company }; bytes: Uint8Array }> {
  const card = await prisma.card.findFirst({
    where: { id: cardId, employee: { company_id: companyId } },
    include: { employee: { include: { company: true } } },
  });
  if (!card) throw new CardOperationError("card_not_found", "Card not found", 404);
  const check = checkCardPrintability(
    { employee: card.employee, card, company: card.employee.company, mode },
    new Date(),
  );
  if (!check.ok) throw new CardOperationError(check.errors[0] ?? "print_blocked", "Card cannot be printed", 409);
  const token = await ensureCardToken(card);
  if (!token) throw new CardOperationError("card_needs_reissue", "Card must be re-issued", 409);
  const bytes = await renderCardPdf({
    company: companyCardData(card.employee.company),
    employee: employeeCardData(card.employee),
    expiresAt: card.expires_at,
    token,
    mode,
  });
  return { card, employee: card.employee, bytes };
}
