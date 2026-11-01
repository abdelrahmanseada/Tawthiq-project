import { requireActionPermission } from "@/lib/auth/session";
import { ApiError, assertSameOrigin, errorToResponse, getClientIp, jsonResponse } from "@/lib/http";
import { buildA4Sheet, CardOperationError } from "@/lib/services/cards";

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

/** A4 sheet (8 CR80 cards, crop marks, mirrored backs) — optionally watermarked test cards. */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const admin = await requireActionPermission("cards.write");
    const formData = await request.formData();
    const ids = parseIds(formData.getAll("ids"));
    if (ids.length === 0) throw new ApiError(422, "NO_SELECTION", "Select at least one employee");
    if (ids.length > MAX_CARDS) throw new ApiError(422, "TOO_MANY", "At most 100 cards can be generated at once");

    const mode = formData.get("mode") === "test" ? "test" : "cr80";
    const { pdf } = await buildA4Sheet(admin.companyId, ids, admin.id, getClientIp(request.headers), mode);

    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="employee-cards-a4.pdf"',
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
