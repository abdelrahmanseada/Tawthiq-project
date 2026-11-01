import { prisma } from "@/lib/db";
import { parsePhotoToken } from "@/lib/security/crypto";
import { readStorageFile, contentTypeForStorageKey } from "@/lib/storage";
import { ApiError, errorToResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Short-lived, opaque employee photo URL. The URL token is AES-256-GCM encrypted
 * (employee id + expiry), so no internal UUID or personal data appears in the URL.
 */
export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    const parsed = parsePhotoToken(token);
    if (!parsed) {
      throw new ApiError(403, "INVALID_SIGNATURE", "This photo link is invalid or has expired");
    }

    const employee = await prisma.employee.findUnique({
      where: { id: parsed.employeeId },
      select: { photo_path: true },
    });
    if (!employee?.photo_path) throw new ApiError(404, "PHOTO_NOT_FOUND", "Photo not found");

    let bytes: Buffer;
    try {
      bytes = await readStorageFile(employee.photo_path);
    } catch {
      throw new ApiError(404, "PHOTO_NOT_FOUND", "Photo not found");
    }

    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": contentTypeForStorageKey(employee.photo_path),
        "Cache-Control": "private, max-age=60",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'",
        "Cross-Origin-Resource-Policy": "same-origin",
      },
    });
  } catch (error) {
    return errorToResponse(error);
  }
}
