import AdmZip from "adm-zip";
import { requireActionPermission } from "@/lib/auth/session";
import { writeAuditLog } from "@/lib/audit";
import { ApiError, assertSameOrigin, errorToResponse, getClientIp, jsonResponse } from "@/lib/http";
import { buildPrintableCards, CardOperationError } from "@/lib/services/cards";
import type { CardPrintMode } from "@/lib/pdf/card";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_CARDS = 100;

function parseIds(values: FormDataEntryValue[]): string[] {
  const ids = new Set<string>();
  for (const value of values) {
    if (typeof value !== "string") continue;
    for (const part of value.split(",")) {
      const id = part.trim();
      if (/^[0-9a-fA-F-]{36}$/.test(id)) ids.add(id);
    }
  }
  return [...ids];
}

function parseMode(value: FormDataEntryValue | null): CardPrintMode {
  return value === "print_shop" || value === "test" ? value : "cr80";
}

/** ZIP of individual card PDFs (front + back), rendered on demand. */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const admin = await requireActionPermission("cards.write");
    const formData = await request.formData();
    const ids = parseIds(formData.getAll("ids"));
    if (ids.length === 0) throw new ApiError(422, "NO_SELECTION", "Select at least one employee");
    if (ids.length > MAX_CARDS) throw new ApiError(422, "TOO_MANY", "At most 100 cards can be generated at once");

    const mode = parseMode(formData.get("mode"));
    const cards = await buildPrintableCards(admin.companyId, ids, admin.id, getClientIp(request.headers), mode);
    const zip = new AdmZip();
    for (const entry of cards) {
      const safeCode = entry.employee.employee_code.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 64);
      zip.addFile(`${safeCode}.pdf`, Buffer.from(entry.bytes));
    }

    await writeAuditLog({
      adminId: admin.id,
      action: "card.bulk_zip_download",
      entity: "Company",
      entityId: admin.companyId,
      metadata: { employees: ids.length, cards: cards.length, mode },
      ip: getClientIp(request.headers),
    });

    return new Response(new Uint8Array(zip.toBuffer()), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="employee-cards.zip"',
        "Cache-Control": "no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof CardOperationError) {
      return jsonResponse({ error: { code: error.code, message: error.message } }, { status: error.status });
    }
    return errorToResponse(error);
  }
}
