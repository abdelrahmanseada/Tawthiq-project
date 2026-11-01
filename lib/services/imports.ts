import type { Company, ImportBatch, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { env, isBullMqEnabled } from "@/lib/env";
import { ImportFileError } from "@/lib/excel/constants";
import { parseSpreadsheet } from "@/lib/excel/parse";
import { validateImportRows, type ImportPreviewData, type ValidatedImportRow } from "@/lib/excel/validate";
import { normalizeEmployeePhoto } from "@/lib/images";
import { newId } from "@/lib/security/crypto";
import { readStorageFile, removeStorageFile, storageFileExists, storageKey, writeEncryptedJson, writeStorageFile, readEncryptedJson } from "@/lib/storage";
import { normalizeUnicode, truncate } from "@/lib/text";
import { readPhotoZip, type ZipPhotoEntry } from "@/lib/zip";
import {
  cardExpiryFromInput,
  defaultCardExpiry,
  persistCard,
  prepareCard,
  type PreparedCard,
} from "@/lib/services/cards";
import { writeAuditLog } from "@/lib/audit";
import { buildErrorReport, type ImportErrorReportRow } from "@/lib/excel/report";
import { enqueueImport } from "@/lib/queue/import-queue";

export class ImportBatchError extends Error {
  readonly status: number;
  constructor(message: string, status = 409) {
    super(message);
    this.name = "ImportBatchError";
    this.status = status;
  }
}

export interface ImportPreviewStored {
  version: 1;
  createdAt: string;
  rows: ValidatedImportRow[];
  validCount: number;
  errorCount: number;
  duplicateCount: number;
  totalRows: number;
}

export interface ImportRowResult {
  rowNumber: number;
  employee_code: string;
  full_name: string;
  action: "CREATE" | "UPDATE" | "RESTORE" | "SKIP" | "ERROR";
  errors: string[];
}

function previewKey(companyId: string, batchId: string): string {
  return storageKey("imports", companyId, batchId, "preview.json.enc");
}

function zipKey(companyId: string, batchId: string): string {
  return storageKey("imports", companyId, batchId, "photos.zip");
}

function reportKey(companyId: string, batchId: string): string {
  return storageKey("reports", companyId, `${batchId}.xlsx`);
}

function batchProgress(batch: ImportBatch) {
  return {
    id: batch.id,
    status: batch.status,
    total_rows: batch.total_rows,
    processed_rows: batch.processed_rows,
    success_count: batch.success_count,
    failed_count: batch.failed_count,
    skipped_count: batch.skipped_count,
    error_report_path: batch.error_report_path,
    error_message: batch.error_message,
    duplicate_strategy: batch.duplicate_strategy,
  };
}

export async function previewImport(input: {
  companyId: string;
  adminId: string;
  filename: string;
  spreadsheet: Buffer;
  photoZip: Buffer | null;
  ip: string | null;
}): Promise<{ batch: ImportBatch; preview: ImportPreviewData }> {
  if (input.spreadsheet.length > env.MAX_SPREADSHEET_BYTES) {
    throw new ImportFileError("file_too_large", "Spreadsheet exceeds the 10 MB limit");
  }
  if (input.photoZip && input.photoZip.length > env.MAX_ZIP_BYTES) {
    throw new ImportFileError("file_too_large", "Photo ZIP exceeds the 200 MB limit");
  }

  const safeFilename = truncate(normalizeUnicode(input.filename), 255);

  const parsed = await parseSpreadsheet(input.spreadsheet, safeFilename);
  const photos = input.photoZip ? readPhotoZip(input.photoZip) : new Map<string, ZipPhotoEntry>();

  const preview = await validateImportRows(parsed.rows, {
    companyId: input.companyId,
    photoFilenames: new Set(photos.keys()),
    hasPhotoZip: Boolean(input.photoZip),
  });

  const batchId = newId();
  const stored: ImportPreviewStored = {
    version: 1,
    createdAt: new Date().toISOString(),
    ...preview,
  };

  await writeEncryptedJson(previewKey(input.companyId, batchId), stored);
  if (input.photoZip) await writeStorageFile(zipKey(input.companyId, batchId), input.photoZip);

  const batch = await prisma.importBatch.create({
    data: {
      id: batchId,
      company_id: input.companyId,
      admin_id: input.adminId,
      filename: safeFilename,
      total_rows: preview.totalRows,
      status: "PENDING",
      summary: {
        valid_count: preview.validCount,
        error_count: preview.errorCount,
        duplicate_count: preview.duplicateCount,
      } as Prisma.InputJsonValue,
    },
  });

  await writeAuditLog({
    adminId: input.adminId,
    action: "import.previewed",
    entity: "ImportBatch",
    entityId: batchId,
    metadata: { filename: safeFilename, rows: preview.totalRows, errors: preview.errorCount },
    ip: input.ip,
  });

  return { batch, preview };
}

export async function getImportPreview(batch: ImportBatch): Promise<ImportPreviewStored | null> {
  try {
    return await readEncryptedJson<ImportPreviewStored>(previewKey(batch.company_id, batch.id));
  } catch {
    return null;
  }
}

/** Chunked processing with BullMQ when Redis is available, otherwise in-process. */
export async function startImport(
  batchId: string,
  strategy: "SKIP" | "UPDATE" | "FAIL",
  adminId: string,
  ip: string | null,
): Promise<void> {
  const batch = await prisma.importBatch.findFirst({
    where: { id: batchId, admin_id: adminId },
  });
  if (!batch) throw new ImportBatchError("Import batch not found", 404);
  if (batch.status !== "PENDING") throw new ImportBatchError("This import has already been processed");

  await prisma.importBatch.update({
    where: { id: batchId },
    data: { status: "PROCESSING", duplicate_strategy: strategy },
  });

  await writeAuditLog({
    adminId,
    action: "import.started",
    entity: "ImportBatch",
    entityId: batchId,
    metadata: { strategy, rows: batch.total_rows },
    ip,
  });

  if (isBullMqEnabled()) {
    try {
      await enqueueImport(batchId);
      return;
    } catch (error) {
      console.error("import_enqueue_failed", error instanceof Error ? error.message : "unknown");
      // fall through to in-process processing
    }
  }

  void processImportBatch(batchId).catch((error) => {
    console.error("import_background_failed", error instanceof Error ? error.message : "unknown");
  });
}

type RowAction = "CREATE" | "UPDATE" | "RESTORE" | "SKIP" | "ERROR";

async function processRow(
  row: ValidatedImportRow,
  context: {
    batchId: string;
    companyId: string;
    adminId: string;
    strategy: "SKIP" | "UPDATE" | "FAIL";
    company: Company;
    photos: Map<string, ZipPhotoEntry>;
  },
): Promise<{ action: RowAction; errors: string[] }> {
  if (row.issues.length > 0) {
    return { action: "ERROR", errors: row.issues.map((issue) => `${issue.column}: ${issue.message}`) };
  }

  if (row.duplicate) {
    if (context.strategy === "SKIP") return { action: "SKIP", errors: [] };
    if (context.strategy === "FAIL") return { action: "ERROR", errors: ["duplicate_in_db"] };
  }

  let existing = null;
  if (row.existing) {
    existing = await prisma.employee.findFirst({
      where: { id: row.existing.id, company_id: context.companyId },
    });
    if (!existing) return { action: "ERROR", errors: ["employee_missing"] };
  }

  let newPhotoPath: string | null = null;
  let photoPath = existing?.photo_path ?? null;
  let prepared: PreparedCard | null = null;

  try {
    if (row.photo_filename) {
      const entry = context.photos.get(row.photo_filename.toLowerCase());
      if (!entry) return { action: "ERROR", errors: ["photo_not_found"] };
      const normalized = await normalizeEmployeePhoto(entry.data);
      newPhotoPath = storageKey("photos", context.companyId, `${newId()}.jpg`);
      await writeStorageFile(newPhotoPath, normalized.buffer);
      photoPath = newPhotoPath;
    }

    const employeeId = existing?.id ?? newId();
    const expiresAt = row.expires_at
      ? cardExpiryFromInput(row.expires_at, context.company)
      : defaultCardExpiry(context.company);
    prepared = prepareCard(expiresAt);
    const preparedCard = prepared;

    let oldPhotoPath: string | null = null;

    const action = await prisma.$transaction(async (tx) => {
      if (existing) {
        const activeCards = await tx.card.findMany({
          where: { employee_id: employeeId, status: "ACTIVE" },
          select: { id: true },
        });
        if (activeCards.length > 0) {
          await tx.card.updateMany({
            where: { employee_id: employeeId, status: "ACTIVE" },
            data: {
              status: "REVOKED",
              revoked_at: new Date(),
              revoked_reason: "Updated by bulk import",
            },
          });
        }
        if (existing.photo_path && newPhotoPath) oldPhotoPath = existing.photo_path;
        await tx.employee.update({
          where: { id: employeeId },
          data: {
            full_name: row.full_name,
            department: row.department,
            job_title: row.job_title,
            status: "ACTIVE",
            deleted_at: null,
            ...(newPhotoPath ? { photo_path: newPhotoPath } : {}),
          },
        });
      } else {
        await tx.employee.create({
          data: {
            id: employeeId,
            company_id: context.companyId,
            employee_code: row.employee_code,
            full_name: row.full_name,
            department: row.department,
            job_title: row.job_title,
            photo_path: photoPath,
            status: "ACTIVE",
            batch_id: context.batchId,
          },
        });
      }

      await persistCard(tx, preparedCard, {
        employeeId,
        adminId: context.adminId,
        importBatchId: context.batchId,
      });

      return existing ? (existing.deleted_at ? "RESTORE" : "UPDATE") : "CREATE";
    });

    if (oldPhotoPath) await removeStorageFile(oldPhotoPath);
    return { action, errors: [] };
  } catch (error) {
    if (newPhotoPath) await removeStorageFile(newPhotoPath);
    return {
      action: "ERROR",
      errors: [error instanceof Error ? truncate(error.message, 300) : "processing_error"],
    };
  }
}

/**
 * Process a batch row by row, each row in its own DB transaction. Progress is
 * persisted so the UI can poll `/api/admin/import/[id]/status`.
 */
export async function processImportBatch(batchId: string): Promise<void> {
  const batch = await prisma.importBatch.findUnique({
    where: { id: batchId },
    include: { company: true },
  });
  if (!batch || batch.status !== "PROCESSING") return;

  try {
    const preview = await getImportPreview(batch);
    if (!preview) {
      await prisma.importBatch.update({
        where: { id: batchId },
        data: { status: "FAILED", error_message: "Preview data is missing" },
      });
      return;
    }

    let photos = new Map<string, ZipPhotoEntry>();
    if (await storageFileExists(zipKey(batch.company_id, batchId))) {
      photos = readPhotoZip(await readStorageFile(zipKey(batch.company_id, batchId)));
    }

    const context = {
      batchId,
      companyId: batch.company_id,
      adminId: batch.admin_id,
      strategy: batch.duplicate_strategy,
      company: batch.company,
      photos,
    };

    const existingCount = await prisma.employee.count({ where: { company_id: batch.company_id, deleted_at: null } });
    let remainingCapacity = Math.max(0, batch.company.max_employees - existingCount);
    let success = 0;
    let failed = 0;
    let skipped = 0;
    let processed = 0;
    const results: ImportRowResult[] = [];

    for (const row of preview.rows) {
      if (!row.existing && remainingCapacity <= 0) {
        failed += 1;
        results.push({
          rowNumber: row.rowNumber,
          employee_code: row.employee_code,
          full_name: row.full_name,
          action: "ERROR",
          errors: ["employee_limit_reached"],
        });
        processed += 1;
        continue;
      }
      const outcome = await processRow(row, context);
      if (outcome.action === "CREATE" || outcome.action === "RESTORE") remainingCapacity -= 1;
      if (outcome.action === "ERROR") {
        failed += 1;
        results.push({
          rowNumber: row.rowNumber,
          employee_code: row.employee_code,
          full_name: row.full_name,
          action: "ERROR",
          errors: outcome.errors,
        });
      } else if (outcome.action === "SKIP") {
        skipped += 1;
        results.push({
          rowNumber: row.rowNumber,
          employee_code: row.employee_code,
          full_name: row.full_name,
          action: "SKIP",
          errors: [],
        });
      } else {
        success += 1;
        results.push({
          rowNumber: row.rowNumber,
          employee_code: row.employee_code,
          full_name: row.full_name,
          action: outcome.action,
          errors: [],
        });
      }
      processed += 1;

      if (processed % 10 === 0) {
        await prisma.importBatch.update({
          where: { id: batchId },
          data: { processed_rows: processed, success_count: success, failed_count: failed, skipped_count: skipped },
        });
      }
    }

    const failedRows: ImportErrorReportRow[] = results
      .filter((result) => result.action === "ERROR")
      .map((result) => ({
        rowNumber: result.rowNumber,
        employee_code: result.employee_code,
        full_name: result.full_name,
        errors: result.errors.join(" | "),
      }));

    let errorReportPath: string | null = null;
    if (failedRows.length > 0) {
      const report = await buildErrorReport(failedRows, "en");
      errorReportPath = reportKey(batch.company_id, batchId);
      await writeStorageFile(errorReportPath, report);
    }

    await prisma.importBatch.update({
      where: { id: batchId },
      data: {
        status: "DONE",
        processed_rows: processed,
        success_count: success,
        failed_count: failed,
        skipped_count: skipped,
        error_report_path: errorReportPath,
        summary: {
          total: preview.totalRows,
          success,
          failed,
          skipped,
          failed_rows: failedRows.map((row) => ({
            rowNumber: row.rowNumber,
            errors: row.errors,
          })),
        } as Prisma.InputJsonValue,
      },
    });

    if (await storageFileExists(zipKey(batch.company_id, batchId))) await removeStorageFile(zipKey(batch.company_id, batchId));

    await writeAuditLog({
      adminId: batch.admin_id,
      action: "import.completed",
      entity: "ImportBatch",
      entityId: batchId,
      metadata: { success, failed, skipped, total: preview.totalRows, strategy: batch.duplicate_strategy },
    });
  } catch (error) {
    console.error("import_processing_failed", error instanceof Error ? error.message : "unknown");
    await prisma.importBatch.update({
      where: { id: batchId },
      data: {
        status: "FAILED",
        error_message: error instanceof Error ? truncate(error.message, 500) : "Processing failed",
      },
    });
    await writeAuditLog({
      adminId: batch.admin_id,
      action: "import.failed",
      entity: "ImportBatch",
      entityId: batchId,
    });
  }
}

export async function getImportBatchForAdmin(batchId: string, adminId: string) {
  return prisma.importBatch.findFirst({ where: { id: batchId, admin_id: adminId } });
}

export async function getImportStatus(batchId: string, adminId: string) {
  const batch = await getImportBatchForAdmin(batchId, adminId);
  if (!batch) return null;
  return batchProgress(batch);
}

/**
 * Roll back a completed batch:
 *  - employees created by the batch are soft-deleted
 *  - cards issued by the batch are revoked
 *  - employees updated/restored by the batch are reverted to their saved snapshot
 */
export async function rollbackImportBatch(
  batchId: string,
  adminId: string,
  ip: string | null,
): Promise<void> {
  const batch = await prisma.importBatch.findFirst({ where: { id: batchId, admin_id: adminId } });
  if (!batch) throw new ImportBatchError("Import batch not found", 404);
  if (batch.status !== "DONE" && batch.status !== "FAILED") {
    throw new ImportBatchError("Only completed or failed imports can be rolled back");
  }

  const preview = await getImportPreview(batch);
  const createdEmployees = await prisma.employee.findMany({
    where: { batch_id: batchId },
    select: { id: true },
  });
  const cards = await prisma.card.findMany({
    where: { import_batch_id: batchId },
    select: { id: true },
  });

  const updatedRows = (preview?.rows ?? []).filter((row) => row.existing !== null);

  await prisma.$transaction(async (tx) => {
    if (createdEmployees.length > 0) {
      await tx.employee.updateMany({
        where: { id: { in: createdEmployees.map((employee) => employee.id) } },
        data: { deleted_at: new Date() },
      });
    }
    if (cards.length > 0) {
      await tx.card.updateMany({
        where: { import_batch_id: batchId, status: "ACTIVE" },
        data: { status: "REVOKED", revoked_at: new Date(), revoked_reason: "Import rolled back" },
      });
    }
    for (const row of updatedRows) {
      const snapshot = row.existing!;
      await tx.employee.updateMany({
        where: { id: snapshot.id, company_id: batch.company_id },
        data: {
          full_name: snapshot.full_name,
          department: snapshot.department,
          job_title: snapshot.job_title,
          status: snapshot.status,
          deleted_at: snapshot.deleted_at ? new Date(snapshot.deleted_at) : null,
        },
      });
    }
    await tx.importBatch.update({
      where: { id: batchId },
      data: { status: "ROLLED_BACK" },
    });
  });

  if (await storageFileExists(previewKey(batch.company_id, batchId))) await removeStorageFile(previewKey(batch.company_id, batchId));
  if (await storageFileExists(zipKey(batch.company_id, batchId))) await removeStorageFile(zipKey(batch.company_id, batchId));

  await writeAuditLog({
    adminId,
    action: "import.rolled_back",
    entity: "ImportBatch",
    entityId: batchId,
    metadata: {
      employees_deleted: createdEmployees.length,
      cards_revoked: cards.length,
      employees_reverted: updatedRows.length,
    },
    ip,
  });
}

export async function getErrorReport(batchId: string, adminId: string): Promise<Buffer | null> {
  const batch = await getImportBatchForAdmin(batchId, adminId);
  if (!batch?.error_report_path) return null;
  if (!(await storageFileExists(batch.error_report_path))) return null;
  return readStorageFile(batch.error_report_path);
}


