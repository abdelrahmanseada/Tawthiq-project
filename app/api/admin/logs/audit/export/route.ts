import { prisma } from "@/lib/db";
import { requireActionPermission } from "@/lib/auth/session";
import { errorToResponse } from "@/lib/http";
import { getSystemLanguage } from "@/lib/system-language";
import { buildAuditCsv } from "@/lib/services/export";
import { auditLogQuerySchema, searchParamsToObject } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const admin = await requireActionPermission("logs.audit");
    const locale = await getSystemLanguage();
    const url = new URL(request.url);
    const query = auditLogQuerySchema.parse(searchParamsToObject(Object.fromEntries(url.searchParams)));
    const rows = await prisma.auditLog.findMany({
      where: {
        OR: [{ admin: { company_id: admin.companyId } }, { admin_id: null }],
        ...(query.action ? { action: { contains: query.action, mode: "insensitive" } } : {}),
        ...(query.admin
          ? {
              admin: {
                company_id: admin.companyId,
                OR: [
                  { name: { contains: query.admin, mode: "insensitive" } },
                  { email: { contains: query.admin, mode: "insensitive" } },
                ],
              },
            }
          : {}),
      },
      orderBy: { created_at: "desc" },
      take: 10_000,
      include: { admin: { select: { name: true } } },
    });
    const file = buildAuditCsv(
      rows.map((row) => ({
        created_at: row.created_at,
        action: row.action,
        adminName: row.admin?.name ?? null,
        entity: row.entity,
        entityId: row.entity_id,
        metadata: row.metadata,
      })),
      locale,
    );
    return new Response(new Uint8Array(file.buffer), {
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": `attachment; filename="${file.filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return errorToResponse(error);
  }
}
