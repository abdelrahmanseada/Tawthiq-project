import { requireActionPermission } from "@/lib/auth/session";
import { ApiError, errorToResponse } from "@/lib/http";
import { getSystemLanguage } from "@/lib/system-language";
import { exportEmployees } from "@/lib/services/export";
import { employeeExportQuerySchema, employeeListQuerySchema, searchParamsToObject } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const admin = await requireActionPermission("employees.read");
    const locale = await getSystemLanguage();
    const url = new URL(request.url);
    const formatParsed = employeeExportQuerySchema.safeParse(searchParamsToObject(Object.fromEntries(url.searchParams)));
    if (!formatParsed.success) throw new ApiError(422, "INVALID_QUERY", "Invalid export query");
    const query = employeeListQuerySchema.parse({
      ...searchParamsToObject(Object.fromEntries(url.searchParams)),
      deleted: "0",
    });
    const file = await exportEmployees(admin.companyId, query, formatParsed.data.format, locale);
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
