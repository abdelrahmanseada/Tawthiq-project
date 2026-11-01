import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { hashIp } from "@/lib/security/crypto";

/**
 * Append-only audit trail for every state-changing admin action.
 * Metadata is sanitised (no tokens, hashes, passwords or secrets; bounded depth/size).
 */
export interface AuditLogInput {
  adminId: string | null;
  companyId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
  ip?: string | null;
}

const SENSITIVE_KEY = /pass(word)?|token|secret|hash|otp|credential/i;

function sanitizeValue(value: unknown, depth: number): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    return value.replace(/[\p{Cc}]/gu, "").slice(0, 300);
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (depth >= 3) return "[truncated]";
  if (Array.isArray(value)) {
    return value.slice(0, 25).map((item) => sanitizeValue(item, depth + 1));
  }
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>).slice(0, 40)) {
      if (SENSITIVE_KEY.test(key)) continue;
      result[key] = sanitizeValue(nested, depth + 1);
    }
    return result;
  }
  return String(value).slice(0, 300);
}

export function sanitizeAuditMetadata(metadata: Record<string, unknown> | null | undefined): Prisma.InputJsonValue | undefined {
  if (!metadata) return undefined;
  return sanitizeValue(metadata, 0) as Prisma.InputJsonValue;
}

export async function writeAuditLog(input: AuditLogInput): Promise<void> {
  try {
    let companyId = input.companyId ?? null;
    if (!companyId && input.adminId) {
      const actor = await prisma.adminUser.findUnique({ where: { id: input.adminId }, select: { company_id: true } });
      companyId = actor?.company_id ?? null;
    }
    await prisma.auditLog.create({
      data: {
        company_id: companyId,
        admin_id: input.adminId,
        action: input.action.slice(0, 80),
        entity: input.entity.slice(0, 80),
        entity_id: input.entityId ? input.entityId.slice(0, 128) : null,
        metadata: sanitizeAuditMetadata(input.metadata) ?? undefined,
        ip: input.ip ? hashIp(input.ip) : null,
      },
    });
  } catch (error) {
    // Auditing must not break the user's action, but a failure is always surfaced.
    console.error("audit_log_write_failed", error instanceof Error ? error.message : "unknown");
  }
}
