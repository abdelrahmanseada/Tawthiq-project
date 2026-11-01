import type { Card, Employee, EmployeeStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { normalizeEmployeePhoto, ImageValidationError } from "@/lib/images";
import { normalizeUnicode } from "@/lib/text";
import { createPhotoToken, newId } from "@/lib/security/crypto";
import { removeStorageFile, storageKey, writeStorageFile } from "@/lib/storage";
import { addDays, parseIsoDateOnly } from "@/lib/format";
import type { EmployeeInput, EmployeeListQuery } from "@/lib/validation/schemas";
import {
  cardExpiryFromInput,
  getActiveCard,
  persistCard,
  prepareCard,
  type PreparedCard,
} from "@/lib/services/cards";
export class EmployeeCodeConflictError extends Error {
  readonly code = "EMPLOYEE_CODE_TAKEN";
  constructor() {
    super("Employee code already exists in this company");
    this.name = "EmployeeCodeConflictError";
  }
}

export class EmployeeNotFoundError extends Error {
  readonly code = "EMPLOYEE_NOT_FOUND";
  constructor() {
    super("Employee not found");
    this.name = "EmployeeNotFoundError";
  }
}

export class EmployeeCapacityError extends Error {
  readonly code = "EMPLOYEE_LIMIT_REACHED";
  constructor(limit: number) {
    super(`This company has reached its ${limit}-employee plan limit.`);
    this.name = "EmployeeCapacityError";
  }
}

async function assertEmployeeCapacity(companyId: string, limit: number) {
  const count = await prisma.employee.count({ where: { company_id: companyId, deleted_at: null } });
  if (count >= limit) throw new EmployeeCapacityError(limit);
}

export interface EmployeeCardSummary {
  id: string;
  status: Card["status"];
  expires_at: Date;
  token_prefix: string;
  issued_at: Date;
  has_token: boolean;
}

export interface EmployeeListItem {
  id: string;
  employee_code: string;
  full_name: string;
  department: string | null;
  job_title: string | null;
  status: EmployeeStatus;
  photo_path: string | null;
  created_at: Date;
  deleted_at: Date | null;
  card: EmployeeCardSummary | null;
}

export interface EmployeeListResult {
  rows: EmployeeListItem[];
  total: number;
  page: number;
  pageCount: number;
  departments: string[];
}

function toCardSummary(card: Card | undefined): EmployeeCardSummary | null {
  if (!card) return null;
  return {
    id: card.id,
    status: card.status,
    expires_at: card.expires_at,
    token_prefix: card.token_prefix,
    issued_at: card.issued_at,
    has_token: Boolean(card.token_enc),
  };
}

export async function listEmployees(companyId: string, query: EmployeeListQuery): Promise<EmployeeListResult> {
  const pageSize = 20;
  const where: Prisma.EmployeeWhereInput = {
    company_id: companyId,
    ...(query.deleted === "1" ? { deleted_at: { not: null } } : { deleted_at: null }),
    ...(query.status ? { status: query.status } : {}),
    ...(query.department ? { department: query.department } : {}),
    ...(query.photo === "missing" ? { photo_path: null } : {}),
    ...(query.q
      ? {
          OR: [
            { full_name: { contains: query.q, mode: "insensitive" } },
            { employee_code: { contains: query.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const orderBy: Prisma.EmployeeOrderByWithRelationInput =
    query.sort === "full_name"
      ? { full_name: query.dir }
      : query.sort === "employee_code"
        ? { employee_code: query.dir }
        : query.sort === "status"
          ? { status: query.dir }
          : { created_at: query.dir };

  const [rows, total, departmentsRaw] = await Promise.all([
    prisma.employee.findMany({
      where,
      orderBy,
      skip: (query.page - 1) * pageSize,
      take: pageSize,
      include: {
        cards: { orderBy: { issued_at: "desc" }, take: 1 },
      },
    }),
    prisma.employee.count({ where }),
    prisma.employee.findMany({
      where: { company_id: companyId, deleted_at: null, NOT: { department: null } },
      select: { department: true },
      distinct: ["department"],
      orderBy: { department: "asc" },
    }),
  ]);

  return {
    rows: rows.map((row) => ({
      id: row.id,
      employee_code: row.employee_code,
      full_name: row.full_name,
      department: row.department,
      job_title: row.job_title,
      status: row.status,
      photo_path: row.photo_path,
      created_at: row.created_at,
      deleted_at: row.deleted_at,
      card: toCardSummary(row.cards[0]),
    })),
    total,
    page: query.page,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    departments: departmentsRaw.map((row) => row.department).filter((value): value is string => Boolean(value)),
  };
}

export async function findEmployee(companyId: string, employeeId: string): Promise<Employee | null> {
  return prisma.employee.findFirst({ where: { id: employeeId, company_id: companyId } });
}

export async function getEmployeeDetail(companyId: string, employeeId: string) {
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, company_id: companyId },
    include: {
      cards: { orderBy: { issued_at: "desc" } },
    },
  });
  if (!employee) return null;
  const scans = await prisma.scanLog.findMany({
    where: { card_id: { in: employee.cards.map((card) => card.id) } },
    orderBy: { created_at: "desc" },
    take: 25,
  });
  const activity = await prisma.auditLog.findMany({
    where: { entity: "Employee", entity_id: employeeId },
    orderBy: { created_at: "desc" },
    take: 20,
    include: { admin: { select: { name: true } } },
  });
  return { employee, cards: employee.cards, scans, activity };
}

export function employeePhotoUrl(employee: Pick<Employee, "id" | "photo_path">): string | null {
  if (!employee.photo_path) return null;
  return createPhotoToken(employee.id).path;
}

async function assertCodeAvailable(companyId: string, code: string, excludeId?: string): Promise<void> {
  const existing = await prisma.employee.findFirst({
    where: { company_id: companyId, employee_code: code, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true, deleted_at: true },
  });
  if (existing) throw new EmployeeCodeConflictError();
}

async function savePhoto(companyId: string, buffer: Buffer): Promise<string> {
  const normalized = await normalizeEmployeePhoto(buffer);
  const key = storageKey("photos", companyId, `${newId()}.${normalized.extension}`);
  await writeStorageFile(key, normalized.buffer);
  return key;
}

interface MutationContext {
  adminId: string;
  ip: string | null;
}

export interface EmployeeMutationResult {
  employee: Employee;
  card: Card | null;
}

export async function createEmployee(
  companyId: string,
  input: EmployeeInput,
  context: MutationContext,
  photoBuffer?: Buffer | null,
): Promise<EmployeeMutationResult> {
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) throw new EmployeeNotFoundError();

  await assertEmployeeCapacity(companyId, company.max_employees);
  const employeeCode = normalizeUnicode(input.employee_code);
  await assertCodeAvailable(companyId, employeeCode);

  const fullName = normalizeUnicode(input.full_name);
  const department = input.department ? normalizeUnicode(input.department) : null;
  const jobTitle = input.job_title ? normalizeUnicode(input.job_title) : null;

  let photoPath: string | null = null;
  let prepared: PreparedCard | null = null;

  try {
    if (photoBuffer && photoBuffer.length > 0) {
      photoPath = await savePhoto(companyId, photoBuffer);
    }

    const employeeId = newId();
    const expiresAt = cardExpiryFromInput(input.expires_at, company);
    prepared = prepareCard(expiresAt);

    const result = await prisma.$transaction(async (tx) => {
      const employee = await tx.employee.create({
        data: {
          id: employeeId,
          company_id: companyId,
          employee_code: employeeCode,
          full_name: fullName,
          department,
          job_title: jobTitle,
          photo_path: photoPath,
          status: input.status,
        },
      });
      const card = await persistCard(tx, prepared!, { employeeId: employee.id, adminId: context.adminId });
      return { employee, card };
    });

    await writeAuditLog({
      adminId: context.adminId,
      action: "employee.created",
      entity: "Employee",
      entityId: result.employee.id,
      metadata: { employee_code: employeeCode, status: input.status, card_id: result.card.id },
      ip: context.ip,
    });

    return result;
  } catch (error) {
    if (photoPath) await removeStorageFile(photoPath);
    throw error;
  }
}

export async function updateEmployee(
  companyId: string,
  employeeId: string,
  input: EmployeeInput,
  context: MutationContext,
  photoBuffer?: Buffer | null,
): Promise<EmployeeMutationResult> {
  const existing = await prisma.employee.findFirst({
    where: { id: employeeId, company_id: companyId },
    include: { company: true },
  });
  if (!existing) throw new EmployeeNotFoundError();

  const company = existing.company;
  const fullName = normalizeUnicode(input.full_name);
  const department = input.department ? normalizeUnicode(input.department) : null;
  const jobTitle = input.job_title ? normalizeUnicode(input.job_title) : null;
  const status = input.status;

  const activeCard = await getActiveCard(employeeId);
  const expiresAt = cardExpiryFromInput(input.expires_at, company);

  let newPhotoPath: string | null = null;
  let prepared: PreparedCard | null = null;

  const photoChanged = Boolean(photoBuffer && photoBuffer.length > 0);
  const identityChanged =
    photoChanged ||
    existing.full_name !== fullName ||
    (existing.department ?? null) !== department ||
    (existing.job_title ?? null) !== jobTitle;
  const expiryChanged = !activeCard || activeCard.expires_at.getTime() !== expiresAt.getTime();
  const needsNewCard = identityChanged || expiryChanged || Boolean(activeCard && !activeCard.token_enc);

  try {
    if (photoChanged && photoBuffer) {
      newPhotoPath = await savePhoto(companyId, photoBuffer);
    }

    if (needsNewCard) {
      prepared = prepareCard(expiresAt);
    }

    const result = await prisma.$transaction(async (tx) => {
      const employee = await tx.employee.update({
        where: { id: employeeId },
        data: {
          full_name: fullName,
          department,
          job_title: jobTitle,
          status,
          ...(newPhotoPath ? { photo_path: newPhotoPath } : {}),
        },
      });

      let card: Card | null = activeCard;
      if (prepared) {
        if (activeCard) {
          await tx.card.updateMany({
            where: { employee_id: employeeId, status: "ACTIVE" },
            data: {
              status: "REVOKED",
              revoked_at: new Date(),
              revoked_reason: "Employee data updated",
            },
          });
        }
        card = await persistCard(tx, prepared, { employeeId, adminId: context.adminId });
      }
      return { employee, card };
    });

    if (newPhotoPath && existing.photo_path) await removeStorageFile(existing.photo_path);

    await writeAuditLog({
      adminId: context.adminId,
      action: "employee.updated",
      entity: "Employee",
      entityId: employeeId,
      metadata: {
        employee_code: existing.employee_code,
        status,
        card_rotated: Boolean(prepared),
      },
      ip: context.ip,
    });

    return result;
  } catch (error) {
    if (newPhotoPath) await removeStorageFile(newPhotoPath);
    throw error;
  }
}

export async function setEmployeeStatus(
  companyId: string,
  employeeId: string,
  status: EmployeeStatus,
  context: MutationContext,
): Promise<Employee> {
  const employee = await prisma.employee.findFirst({ where: { id: employeeId, company_id: companyId } });
  if (!employee) throw new EmployeeNotFoundError();
  const updated = await prisma.employee.update({
    where: { id: employeeId },
    data: { status, ...(status === "ACTIVE" ? { deleted_at: null } : {}) },
  });
  await writeAuditLog({
    adminId: context.adminId,
    action: "employee.status_changed",
    entity: "Employee",
    entityId: employeeId,
    metadata: { employee_code: employee.employee_code, from: employee.status, to: status },
    ip: context.ip,
  });
  return updated;
}

export async function softDeleteEmployee(
  companyId: string,
  employeeId: string,
  context: MutationContext,
): Promise<void> {
  const employee = await prisma.employee.findFirst({ where: { id: employeeId, company_id: companyId } });
  if (!employee) throw new EmployeeNotFoundError();
  if (!employee.deleted_at) {
    await prisma.employee.update({ where: { id: employeeId }, data: { deleted_at: new Date() } });
  }
  await writeAuditLog({
    adminId: context.adminId,
    action: "employee.deleted",
    entity: "Employee",
    entityId: employeeId,
    metadata: { employee_code: employee.employee_code },
    ip: context.ip,
  });
}

export async function restoreEmployee(
  companyId: string,
  employeeId: string,
  context: MutationContext,
): Promise<Employee> {
  const employee = await prisma.employee.findFirst({ where: { id: employeeId, company_id: companyId } });
  if (!employee) throw new EmployeeNotFoundError();
  if (employee.deleted_at) {
    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { max_employees: true } });
    if (company) await assertEmployeeCapacity(companyId, company.max_employees);
  }
  const restored = await prisma.employee.update({
    where: { id: employeeId },
    data: { deleted_at: null, status: "ACTIVE" },
  });
  await writeAuditLog({
    adminId: context.adminId,
    action: "employee.restored",
    entity: "Employee",
    entityId: employeeId,
    metadata: { employee_code: employee.employee_code },
    ip: context.ip,
  });
  return restored;
}

export async function removeEmployeePhoto(
  companyId: string,
  employeeId: string,
  context: MutationContext,
): Promise<Employee> {
  const employee = await prisma.employee.findFirst({ where: { id: employeeId, company_id: companyId } });
  if (!employee) throw new EmployeeNotFoundError();
  const updated = await prisma.employee.update({ where: { id: employeeId }, data: { photo_path: null } });
  if (employee.photo_path) await removeStorageFile(employee.photo_path);
  await writeAuditLog({
    adminId: context.adminId,
    action: "employee.photo_removed",
    entity: "Employee",
    entityId: employeeId,
    metadata: { employee_code: employee.employee_code },
    ip: context.ip,
  });
  return updated;
}

/** Per-employee scan history for the detail page. */
export async function getEmployeeScanHistory(cardIds: string[], take = 25) {
  if (cardIds.length === 0) return [];
  return prisma.scanLog.findMany({
    where: { card_id: { in: cardIds } },
    orderBy: { created_at: "desc" },
    take,
  });
}

export { parseIsoDateOnly, addDays, ImageValidationError };
