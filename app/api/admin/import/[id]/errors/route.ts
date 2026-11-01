import { requireActionPermission } from "@/lib/auth/session";
import { errorToResponse } from "@/lib/http";
import { getErrorReport } from "@/lib/services/imports";

export const dynamic = "force-dynamic";

/** Download the generated .xlsx error report for a finished batch. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireActionPermission("imports.manage");
    const { id } = await context.params;
    const report = await getErrorReport(id, admin.id);
    if (!report) return new Response("Not found", { status: 404 });

    return new Response(new Uint8Array(report), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="import-errors-${id}.xlsx"`,
        "Cache-Control": "no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return errorToResponse(error);
  }
}
