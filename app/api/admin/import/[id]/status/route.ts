import { requireActionPermission } from "@/lib/auth/session";
import { errorToResponse, jsonResponse } from "@/lib/http";
import { getImportStatus } from "@/lib/services/imports";

export const dynamic = "force-dynamic";

/** Polling endpoint for the import progress bar. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireActionPermission("imports.manage");
    const { id } = await context.params;
    const status = await getImportStatus(id, admin.id);
    if (!status) return jsonResponse({ error: { code: "NOT_FOUND", message: "Import not found" } }, { status: 404 });
    return jsonResponse(status);
  } catch (error) {
    return errorToResponse(error);
  }
}
