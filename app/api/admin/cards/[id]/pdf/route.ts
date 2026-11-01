import { requireActionPermission } from "@/lib/auth/session";
import { ApiError, errorToResponse, getClientIp } from "@/lib/http";
import { loadPrintableCard } from "@/lib/services/cards";
import { writeAuditLog } from "@/lib/audit";
import type { CardPrintMode } from "@/lib/pdf/card";

export const dynamic = "force-dynamic";

function parseMode(value: string | null): CardPrintMode {
  return value === "print_shop" || value === "test" ? value : "cr80";
}

/** Render one card PDF on demand (CR80, print-shop with bleed, or watermarked test print). */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireActionPermission("cards.write");
    const { id } = await context.params;
    const url = new URL(request.url);
    const mode = parseMode(url.searchParams.get("mode"));
    const { card, employee, bytes } = await loadPrintableCard(id, admin.companyId, mode);

    if (mode === "test") {
      await writeAuditLog({
        adminId: admin.id,
        action: "card.test_printed",
        entity: "Card",
        entityId: card.id,
        metadata: { employee_code: employee.employee_code },
        ip: getClientIp(request.headers),
      });
    }

    const suffix = mode === "print_shop" ? "print" : mode === "test" ? "test" : "cr80";
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="card-${card.token_prefix}-${suffix}.pdf"`,
        "Cache-Control": "no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof Error && "code" in error) {
      const code = String((error as { code?: unknown }).code);
      if (
        ["photo_missing", "card_revoked", "card_expired", "verify_domain_invalid", "card_needs_reissue"].includes(
          code,
        )
      ) {
        return errorToResponse(new ApiError(409, code.toUpperCase(), "Card cannot be printed"));
      }
    }
    return errorToResponse(error);
  }
}
