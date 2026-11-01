import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { addDays, parseIsoDateOnly } from "@/lib/format";
import type { auditLogQuerySchema, scanLogQuerySchema } from "@/lib/validation/schemas";
import type { z } from "zod";

type ScanQuery = z.infer<typeof scanLogQuerySchema>;
type AuditQuery = z.infer<typeof auditLogQuerySchema>;

const PAGE_SIZE = 50;

export async function listScanLogs(companyId: string, query: ScanQuery, options: { exportAll?: boolean } = {}) {
  const where: Prisma.ScanLogWhereInput = { company_id: companyId };
  if (query.result) where.result = query.result;
  const createdAt: Prisma.DateTimeFilter = {};
  if (query.from) {
    const from = parseIsoDateOnly(query.from);
    if (from) createdAt.gte = from;
  }
  if (query.to) {
    const to = parseIsoDateOnly(query.to);
    if (to) createdAt.lte = new Date(to.getTime() + 86_399_999);
  }
  if (Object.keys(createdAt).length > 0) where.created_at = createdAt;
  if (query.employee) {
    where.card = {
      employee: {
        company_id: companyId,
        OR: [
          { full_name: { contains: query.employee, mode: "insensitive" } },
          { employee_code: { contains: query.employee, mode: "insensitive" } },
        ],
      },
    };
  } else {
    where.card = { employee: { company_id: companyId } };
  }

  const pageSize = options.exportAll ? 10_000 : PAGE_SIZE;
  const [rows, total] = await Promise.all([
    prisma.scanLog.findMany({
      where,
      orderBy: { created_at: "desc" },
      skip: options.exportAll ? 0 : (query.page - 1) * pageSize,
      take: pageSize,
      include: {
        card: {
          select: {
            token_prefix: true,
            employee: { select: { id: true, full_name: true, employee_code: true } },
          },
        },
      },
    }),
    prisma.scanLog.count({ where }),
  ]);

  return {
    rows,
    total,
    page: query.page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

export async function listAuditLogs(companyId: string, query: AuditQuery) {
  const where: Prisma.AuditLogWhereInput = { company_id: companyId };
  if (query.action) where.action = { contains: query.action, mode: "insensitive" };
  if (query.admin) {
    where.admin = {
      company_id: companyId,
      email: { contains: query.admin, mode: "insensitive" },
    };
  }

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { created_at: "desc" },
      skip: (query.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { admin: { select: { name: true, email: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    rows,
    total,
    page: query.page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

/** Used by the data-retention job (per company setting). */
export function retentionCutoff(days: number, now: Date = new Date()): Date {
  return addDays(now, -days);
}
