import { requireActionPermission } from "@/lib/auth/session";
import { buildEmployeeTemplate } from "@/lib/excel/template";
import { errorToResponse } from "@/lib/http";
import { getSystemLanguage } from "@/lib/system-language";

export const dynamic = "force-dynamic";

/** Download the official import template (localized headers, sample row, instructions). */
export async function GET() {
  try {
    await requireActionPermission("imports.manage");
    const locale = await getSystemLanguage();
    const buffer = await buildEmployeeTemplate(locale);
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="employee-import-template.xlsx"',
        "Cache-Control": "no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return errorToResponse(error);
  }
}
