import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Download, Search } from "lucide-react";
import { EmptyState, PageHeader, Pagination, SectionCard, Badge } from "@/components/ui";
import { requirePermission } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/format";
import { hasMessage, translate } from "@/lib/i18n";
import type { Locale } from "@/lib/locale";
import { listAuditLogs } from "@/lib/services/logs";
import { auditLogQuerySchema, searchParamsToObject } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("logs");
  return { title: t("auditTitle") };
}

export default async function AuditLogsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await requirePermission("logs.audit");
  const [t, ta, tc, tp] = await Promise.all([
    getTranslations("logs"),
    getTranslations("audit"),
    getTranslations("common"),
    getTranslations("pagination"),
  ]);
  const locale = (await getLocale()) as Locale;
  const params = await searchParams;
  const parsed = auditLogQuerySchema.safeParse(searchParamsToObject(params));
  const query = parsed.success ? parsed.data : auditLogQuerySchema.parse({});
  const data = await listAuditLogs(admin.companyId, query);
  const exportQuery = new URLSearchParams();
  if (query.action) exportQuery.set("action", query.action);
  if (query.admin) exportQuery.set("admin", query.admin);

  return (
    <div>
      <PageHeader
        title={t("auditTitle")}
        subtitle={t("auditSubtitle")}
        actions={
          <a href={`/api/admin/logs/audit/export?${exportQuery.toString()}`} className="btn btn-secondary">
            <Download className="h-4 w-4" aria-hidden="true" />
            {t("exportAudit")}
          </a>
        }
      />

      <SectionCard className="mb-4">
        <form action="/logs/audit" method="get" className="flex flex-wrap items-end gap-2">
          <div className="min-w-48 flex-1">
            <label className="label" htmlFor="action">{t("action")}</label>
            <input id="action" name="action" defaultValue={query.action} className="input" placeholder={ta("unknownAction")} />
          </div>
          <div className="min-w-48 flex-1">
            <label className="label" htmlFor="admin">{t("admin")}</label>
            <input id="admin" name="admin" defaultValue={query.admin} className="input" />
          </div>
          <button type="submit" className="btn btn-primary">
            <Search className="h-4 w-4" aria-hidden="true" />
            {t("filter")}
          </button>
          <Link href="/logs/audit" className="btn btn-secondary">{t("resetFilters")}</Link>
        </form>
      </SectionCard>

      {data.rows.length === 0 ? (
        <SectionCard><EmptyState title={t("noAudit")} /></SectionCard>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th className="th">{t("dateTime")}</th>
                <th className="th">{t("admin")}</th>
                <th className="th">{t("action")}</th>
                <th className="th hidden md:table-cell">{t("entity")}</th>
                <th className="th hidden lg:table-cell">{t("metadata")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.rows.map((entry) => {
                const actionLabel = hasMessage(locale, `audit.actions.${entry.action}`)
                  ? translate(locale, `audit.actions.${entry.action}`)
                  : t("unknownAction");
                const entityLabel = hasMessage(locale, `audit.entities.${entry.entity}`)
                  ? translate(locale, `audit.entities.${entry.entity}`)
                  : t("unknownEntity");
                return (
                  <tr key={entry.id} className="hover:bg-surface">
                    <td className="td whitespace-nowrap text-xs">{formatDateTime(entry.created_at, locale)}</td>
                    <td className="td text-sm">
                      <span className="font-medium text-ink">{entry.admin?.name ?? t("system")}</span>
                      {entry.admin?.email ? <p className="text-xs text-muted" dir="ltr">{entry.admin.email}</p> : null}
                    </td>
                    <td className="td text-sm font-medium text-ink">{actionLabel}</td>
                    <td className="td hidden md:table-cell">
                      <Badge tone="neutral">{entityLabel}</Badge>
                    </td>
                    <td className="td hidden lg:table-cell">
                      {entry.metadata ? (
                        <details>
                          <summary className="cursor-pointer text-xs text-muted">{t("openDetails")}</summary>
                          <pre data-lang-exempt className="mt-1 max-w-xs overflow-x-auto rounded bg-surface p-2 text-[10px] text-muted" dir="ltr">
                            {JSON.stringify(entry.metadata, null, 2)}
                          </pre>
                        </details>
                      ) : (
                        <span className="text-muted">{tc("dash")}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        basePath="/logs/audit"
        query={{ action: query.action, admin: query.admin }}
        page={data.page}
        pageCount={data.pageCount}
        labels={{ previous: tc("previous"), next: tc("next"), pageOf: tp("pageOf", { page: data.page, pages: data.pageCount }) }}
      />
    </div>
  );
}
