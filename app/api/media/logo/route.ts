import { prisma } from "@/lib/db";
import { contentTypeForStorageKey, readStorageFile } from "@/lib/storage";
import { ApiError, errorToResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Public company logo (branding only — no personal data). */
export async function GET(request: Request) {
  try {
    const companyId = new URL(request.url).searchParams.get("company") ?? "";
    if (!/^[0-9a-f-]{36}$/i.test(companyId)) throw new ApiError(404, "LOGO_NOT_FOUND", "No logo configured");
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new ApiError(404, "LOGO_NOT_FOUND", "No logo configured");
    if (!company.logo_url) throw new ApiError(404, "LOGO_NOT_FOUND", "No logo configured");

    let bytes: Buffer;
    try {
      bytes = await readStorageFile(company.logo_url);
    } catch {
      throw new ApiError(404, "LOGO_NOT_FOUND", "No logo configured");
    }

    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": contentTypeForStorageKey(company.logo_url),
        "Cache-Control": "public, max-age=300, immutable",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'",
      },
    });
  } catch (error) {
    return errorToResponse(error);
  }
}
