import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { AlertTriangle, Download, RotateCcw } from "lucide-react";
import { Alert, Badge, PageHeader, SectionCard, StatCard } from "@/components/ui";
import { ConfirmForm } from "@/components/ConfirmForm";
import { ImportStepper } from "@/components/ImportStepper";
import { requirePermission } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/format";
import { hasMessage } from "@/lib/i18n";
import type { Locale } from "@/lib/locale";
import { getImportBatchForAdmin, getImportPreview } from "@/lib/services/imports";
import { confirmImportAction, rollbackImportAction } from "../actions";
import { ImportProgress } from "../import-progress";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("imports");
  return { title: t("previewTitle") };
}

export default async function ImportBatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await requirePermission("imports.manage");
  const { id } = await params;
  const batch = await getImportBatchForAdmin(id, admin.id);
  if (!batch) notFound();
  const preview = await getImportPreview(batch);
  const query = await searchParams;

  const [t, tc, tv, locale] = await Promise.all([
    getTranslations("imports"),
    getTranslations("common"),
    getTranslations("validation"),
    getLocale() as Promise<Locale>,
  ]);

  const statusLabel =
    batch.status === "PENDING"
      ? t("statusPending")
      : batch.status === "PROCESSING"
        ? t("statusProcessing")
        : batch.status === "DONE"
          ? t("statusDone")
          : batch.status === "FAILED"
            ? t("statusFailed")
            : t("statusRolledBack");
  const statusTone =
    batch.status === "DONE" ? "success" : batch.status === "FAILED" ? "danger" : batch.status === "PROCESSING" ? "info" : "neutral";
  const step = batch.status === "PENDING" ? 2 : 3;

  const issueLabel = (message: string): string => {
    const code = message.split(/[\s(]/)[0] ?? message;
    return hasMessage(locale, `validation.${code}`) ? tv(code) : message;
  };

  return (
    <div>
      <PageHeader
        title={batch.filename}
        subtitle={`${t("totalRows")}: ${batch.total_rows} · ${t("createdAt")}: ${formatDateTime(batch.created_at, locale)}`}
        actions={
          <Link href="/imports" className="btn btn-secondary btn-sm">
            {t("backToImports")}
          </Link>
        }
      />

      <ImportStepper steps={[t("stepTemplate"), t("stepUpload"), t("stepReview"), t("stepDone")]} active={step} />

      {query.error === "validation" ? <Alert tone="danger">{t("uploadFailed")}</Alert> : null}
      {query.error === "rate" ? <Alert tone="warning">{t("uploadFailed")}</Alert> : null}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Badge tone={statusTone}>{statusLabel}</Badge>
        <span className="text-sm text-muted">
          {t("duplicateStrategy")}:{" "}
          {batch.duplicate_strategy === "SKIP" ? t("strategySkip") : batch.duplicate_strategy === "UPDATE" ? t("strategyUpdate") : t("strategyFail")}
        </span>
      </div>

      {batch.status === "PENDING" && preview ? (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label={t("validRows")} value={preview.validCount} tone="success" />
            <StatCard label={t("invalidRows")} value={preview.errorCount} tone={preview.errorCount > 0 ? "danger" : "neutral"} />
            <StatCard label={t("duplicateRows")} value={preview.duplicateCount} tone="warning" />
          </div>

          <Alert tone={preview.errorCount > 0 ? "warning" : "info"} title={t("previewReady")}>
            {t("previewInvalidNotice")}
          </Alert>

          <SectionCard title={t("previewTitle")} description={t("previewSummary")}>
            <div className="table-wrap max-h-[480px] overflow-y-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th className="th">{t("rowNumber")}</th>
                    <th className="th">{t("columns.employee_code")}</th>
                    <th className="th">{t("columns.full_name")}</th>
                    <th className="th hidden md:table-cell">{t("columns.department")}</th>
                    <th className="th">{t("message")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {preview.rows.slice(0, 200).map((row) => (
                    <tr key={row.rowNumber} className={row.issues.length > 0 ? "bg-danger-tint" : ""}>
                      <td className="td text-xs tabular-nums">{row.rowNumber}</td>
                      <td className="td font-mono text-xs" dir="ltr">{row.employee_code || tc("dash")}</td>
                      <td className="td text-sm">{row.full_name || tc("dash")}</td>
                      <td className="td hidden text-sm md:table-cell">{row.department ?? tc("dash")}</td>
                      <td className="td">
                        {row.issues.length === 0 ? (
                          <Badge tone="success">{tc("yes")}</Badge>
                        ) : (
                          <ul className="space-y-0.5 text-xs text-danger-fg">
                            {row.issues.map((issue, index) => (
                              <li key={`${issue.column}-${index}`}>
                                <span className="font-semibold">{t(`columns.${issue.column}`)}</span>: {issueLabel(issue.message)}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {preview.rows.length > 200 ? <p className="hint mt-2">{t("maxRowsNote")}</p> : null}
          </SectionCard>

          <SectionCard title={t("confirmImport")} description={t("confirmImportBody")}>
            <form action={confirmImportAction} className="space-y-4">
              <input type="hidden" name="batch_id" value={batch.id} />
              <fieldset>
                <legend className="label">{t("duplicateStrategy")}</legend>
                <p className="hint mb-2">{t("strategyHelp")}</p>
                <div className="grid gap-2 sm:grid-cols-3">
                  {(
                    [
                      ["SKIP", t("strategySkip"), t("strategySkipHint")],
                      ["UPDATE", t("strategyUpdate"), t("strategyUpdateHint")],
                      ["FAIL", t("strategyFail"), t("strategyFailHint")],
                    ] as const
                  ).map(([value, label, hint]) => (
                    <label key={value} className="flex cursor-pointer items-start gap-2 rounded-control border border-border p-3 hover:bg-surface">
                      <input
                        type="radio"
                        name="strategy"
                        value={value}
                        defaultChecked={batch.duplicate_strategy === value} className="mt-1 h-4 w-4 text-brand focus:ring-brand"
                      />
                      <span>
                        <span className="block text-sm font-semibold text-ink">{label}</span>
                        <span className="block text-xs text-muted">{hint}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <button type="submit" className="btn btn-primary">{t("confirmImport")}</button>
            </form>
          </SectionCard>
        </div>
      ) : null}

      {batch.status === "PROCESSING" ? (
        <SectionCard title={t("processing")}>
          <ImportProgress
            batchId={batch.id}
            initial={{
              status: batch.status,
              total_rows: batch.total_rows,
              processed_rows: batch.processed_rows,
              success_count: batch.success_count,
              failed_count: batch.failed_count,
              skipped_count: batch.skipped_count,
              error_message: batch.error_message,
            }}
          />
        </SectionCard>
      ) : null}

      {batch.status === "DONE" || batch.status === "FAILED" || batch.status === "ROLLED_BACK" ? (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-4">
            <StatCard label={t("successCount")} value={batch.success_count} tone="success" />
            <StatCard label={t("failedCount")} value={batch.failed_count} tone={batch.failed_count > 0 ? "danger" : "neutral"} />
            <StatCard label={t("skippedCount")} value={batch.skipped_count} tone="neutral" />
            <StatCard label={t("progress")} value={`${batch.processed_rows}/${batch.total_rows}`} tone="info" />
          </div>

          {batch.status === "DONE" ? <Alert tone="success">{t("completed")}</Alert> : null}
          {batch.status === "FAILED" ? <Alert tone="danger">{t("failed")}</Alert> : null}
          {batch.status === "ROLLED_BACK" ? <Alert tone="success">{t("rollbackDone")}</Alert> : null}

          <SectionCard title={t("summaryTitle")}>
            <div className="flex flex-wrap gap-2">
              {batch.failed_count > 0 ? (
                <a href={`/api/admin/import/${batch.id}/errors`} className="btn btn-secondary">
                  <Download className="h-4 w-4" aria-hidden="true" />
                  {t("errorReport")}
                </a>
              ) : null}
              {batch.status !== "ROLLED_BACK" ? (
                <ConfirmForm action={rollbackImportAction} message={t("confirmRollback")}>
                  <input type="hidden" name="batch_id" value={batch.id} />
                  <button type="submit" className="btn btn-danger">
                    <RotateCcw className="h-4 w-4" aria-hidden="true" />
                    {t("rollback")}
                  </button>
                </ConfirmForm>
              ) : null}
              <Link href="/imports" className="btn btn-secondary">{t("backToImports")}</Link>
            </div>
            {batch.error_message ? (
              <p className="mt-3 flex items-start gap-1.5 text-sm text-danger-fg">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {batch.error_message}
              </p>
            ) : null}
          </SectionCard>
        </div>
      ) : null}
    </div>
  );
}
