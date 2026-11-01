import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { FileSpreadsheet } from "lucide-react";
import { Badge, EmptyState, PageHeader, SectionCard } from "@/components/ui";
import { ImportStepper } from "@/components/ImportStepper";
import { requirePermission } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/format";
import type { Locale } from "@/lib/locale";
import { prisma } from "@/lib/db";
import { ImportWizard } from "./import-wizard";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("imports");
  return { title: t("title") };
}

export default async function ImportsPage() {
  const admin = await requirePermission("imports.manage");
  const [t, tc, locale] = await Promise.all([
    getTranslations("imports"),
    getTranslations("common"),
    getLocale() as Promise<Locale>,
  ]);

  const batches = await prisma.importBatch.findMany({
    where: { company_id: admin.companyId },
    orderBy: { created_at: "desc" },
    take: 50,
  });

  const statusLabel = (status: (typeof batches)[number]["status"]) =>
    status === "PENDING"
      ? t("statusPending")
      : status === "PROCESSING"
        ? t("statusProcessing")
        : status === "DONE"
          ? t("statusDone")
          : status === "FAILED"
            ? t("statusFailed")
            : t("statusRolledBack");

  const statusTone = (status: (typeof batches)[number]["status"]) =>
    status === "DONE" ? "success" : status === "FAILED" ? "danger" : status === "PROCESSING" ? "info" : "neutral";

  return (
    <div>
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          <a href="/api/admin/import/template" className="btn btn-secondary" download>
            {t("downloadTemplate")}
          </a>
        }
      />

      <ImportStepper steps={[t("stepTemplate"), t("stepUpload"), t("stepReview"), t("stepDone")]} active={1} />

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <SectionCard title={t("uploadTitle")} description={t("templateHint")}>
          <ImportWizard />
        </SectionCard>

        <SectionCard title={t("history")}>
          {batches.length === 0 ? (
            <EmptyState title={t("noBatches")} />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th className="th">{t("filename")}</th>
                    <th className="th">{t("totalRows")}</th>
                    <th className="th">{tc("status")}</th>
                    <th className="th hidden sm:table-cell">{t("createdAt")}</th>
                    <th className="th"><span className="sr-only">{tc("open")}</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {batches.map((batch) => (
                    <tr key={batch.id} className="hover:bg-surface">
                      <td className="td">
                        <p className="flex items-center gap-1.5 font-medium text-ink">
                          <FileSpreadsheet className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
                          <span className="truncate">{batch.filename}</span>
                        </p>
                        {batch.failed_count > 0 ? (
                          <p className="text-xs text-danger">{t("errorsFound", { count: batch.failed_count })}</p>
                        ) : null}
                      </td>
                      <td className="td tabular-nums">{batch.total_rows}</td>
                      <td className="td"><Badge tone={statusTone(batch.status)}>{statusLabel(batch.status)}</Badge></td>
                      <td className="td hidden whitespace-nowrap text-xs text-muted sm:table-cell">
                        {formatDateTime(batch.created_at, locale)}
                      </td>
                      <td className="td text-end">
                        <Link href={`/imports/${batch.id}`} className="link text-xs">{t("viewBatch")}</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
