import { requireActionPermission } from "@/lib/auth/session";
import { assertSameOrigin, ApiError, errorToResponse, getClientIp, jsonResponse } from "@/lib/http";
import { env } from "@/lib/env";
import { ImportFileError } from "@/lib/excel/constants";
import { previewImport } from "@/lib/services/imports";
import { IMPORT_PREVIEW_LIMIT, IMPORT_PREVIEW_WINDOW_SECONDS, checkRateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Upload + validate a spreadsheet and optional photo ZIP. Nothing is persisted as
 * employee data: a PENDING ImportBatch and an encrypted preview snapshot are stored.
 */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const admin = await requireActionPermission("imports.manage");
    const ip = getClientIp(request.headers);

    const limit = await checkRateLimit({
      key: `import:preview:${admin.id}`,
      limit: IMPORT_PREVIEW_LIMIT,
      windowSeconds: IMPORT_PREVIEW_WINDOW_SECONDS,
    });
    if (!limit.allowed) {
      throw new ApiError(429, "RATE_LIMITED", "Too many import previews. Please try again later.");
    }

    const formData = await request.formData();
    const spreadsheet = formData.get("spreadsheet");
    const photoZip = formData.get("photo_zip");

    if (!(spreadsheet instanceof File) || spreadsheet.size === 0) {
      throw new ApiError(422, "NO_SPREADSHEET", "Choose an Excel or CSV file");
    }
    if (spreadsheet.size > env.MAX_SPREADSHEET_BYTES) {
      throw new ImportFileError("file_too_large", "Spreadsheet exceeds the 10 MB limit");
    }
    if (photoZip instanceof File && photoZip.size > 0 && photoZip.size > env.MAX_ZIP_BYTES) {
      throw new ImportFileError("file_too_large", "Photo ZIP exceeds the 200 MB limit");
    }

    const spreadsheetBuffer = Buffer.from(await spreadsheet.arrayBuffer());
    const zipBuffer =
      photoZip instanceof File && photoZip.size > 0 ? Buffer.from(await photoZip.arrayBuffer()) : null;

    const { batch, preview } = await previewImport({
      companyId: admin.companyId,
      adminId: admin.id,
      filename: spreadsheet.name,
      spreadsheet: spreadsheetBuffer,
      photoZip: zipBuffer,
      ip,
    });

    return jsonResponse(
      {
        batch_id: batch.id,
        total_rows: preview.totalRows,
        valid_count: preview.validCount,
        error_count: preview.errorCount,
        duplicate_count: preview.duplicateCount,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof ImportFileError) {
      return jsonResponse(
        { error: { code: error.code, message: error.message } },
        { status: 422 },
      );
    }
    return errorToResponse(error);
  }
}
