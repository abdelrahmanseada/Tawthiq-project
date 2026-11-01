import { requireActionPermission } from "@/lib/auth/session";
import { errorToResponse } from "@/lib/http";
import { getSystemLanguage } from "@/lib/system-language";
import { exportScanLogs } from "@/lib/services/export";
import { scanLogQuerySchema, searchParamsToObject } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const admin = await requireActionPermission("logs.scans");
    const locale = await getSystemLanguage();
    const url = new URL(request.url);
    const query = scanLogQuerySchema.parse(searchParamsToObject(Object.fromEntries(url.searchParams)));
    const file = await exportScanLogs(admin.companyId, query, locale);
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
