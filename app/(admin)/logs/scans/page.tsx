import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Download, Search } from "lucide-react";
import { Badge, EmptyState, PageHeader, Pagination, SectionCard } from "@/components/ui";
import { requirePermission } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/format";
import type { Locale } from "@/lib/locale";
import { listScanLogs } from "@/lib/services/logs";
import { scanLogQuerySchema, searchParamsToObject } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("logs");
  return { title: t("scanTitle") };
}

function resultLabelKey(result: string): string {
  return result === "VALID"
    ? "scanValid"
    : result === "INVALID"
      ? "scanInvalid"
      : result === "EXPIRED"
        ? "scanExpired"
        : result === "REVOKED"
          ? "scanRevoked"
          : "scanSuspended";
}

export default async function ScanLogsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await requirePermission("logs.scans");
  const [t, ts, tc, tp] = await Promise.all([
    getTranslations("logs"),
    getTranslations("statuses"),
    getTranslations("common"),
    getTranslations("pagination"),
  ]);
  const locale = (await getLocale()) as Locale;
  const params = await searchParams;
  const parsed = scanLogQuerySchema.safeParse(searchParamsToObject(params));
  const query = parsed.success ? parsed.data : scanLogQuerySchema.parse({});
  const data = await listScanLogs(admin.companyId, query);
  const selectedId = typeof params.scan === "string" ? params.scan : null;
  const selected = selectedId ? data.rows.find((row) => row.id === selectedId) : null;

  const exportQuery = new URLSearchParams();
  if (query.result) exportQuery.set("result", query.result);
  if (query.employee) exportQuery.set("employee", query.employee);
  if (query.from) exportQuery.set("from", query.from);
  if (query.to) exportQuery.set("to", query.to);

  return (
    <div>
      <PageHeader
        title={t("scanTitle")}
        subtitle={t("scanSubtitle")}
        actions={
          <a href={`/api/admin/logs/scans/export?${exportQuery.toString()}`} className="btn btn-secondary">
            <Download className="h-4 w-4" aria-hidden="true" />
            {t("exportCsv")}
          </a>
        }
      />

      {selected ? (
        <div className="mb-4">
          <SectionCard
            title={t("detailsTitle")}
            actions={
              <Link href={`/logs/scans?${new URLSearchParams(Object.entries({ result: query.result, employee: query.employee, from: query.from, to: query.to }).filter(([, value]) => value) as string[][]).toString()}`} className="btn btn-ghost btn-sm">
                {t("closeDrawer")}
              </Link>
            }
          >
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted">{t("dateTime")}</dt>
                <dd className="text-ink">{formatDateTime(selected.created_at, locale)}</dd>
              </div>
              <div>
                <dt className="text-muted">{t("result")}</dt>
                <dd><Badge tone={selected.result === "VALID" ? "success" : "danger"}>{ts(resultLabelKey(selected.result))}</Badge></dd>
              </div>
              <div>
                <dt className="text-muted">Reason</dt>
                <dd className="font-mono text-xs text-ink">{selected.reason ?? "VALID"}</dd>
              </div>
              <div>
                <dt className="text-muted">{t("employee")}</dt>
                <dd className="text-ink">
                  {selected.card?.employee ? (
                    <Link href={`/employees/${selected.card.employee.id}`} className="link">{selected.card.employee.full_name}</Link>
                  ) : tc("unknown")}
                </dd>
              </div>
              <div>
                <dt className="text-muted">{t("prefix")}</dt>
                <dd className="font-mono text-xs text-ink" dir="ltr">{selected.token_prefix}</dd>
              </div>
              <div>
                <dt className="text-muted">{t("ipHash")}</dt>
                <dd className="break-all font-mono text-xs text-ink" dir="ltr">{selected.ip_hash}</dd>
              </div>
              <div>
                <dt className="text-muted">{t("userAgent")}</dt>
                <dd className="break-all text-xs text-ink" dir="ltr">{selected.user_agent ?? tc("unknown")}</dd>
              </div>
              <div>
                <dt className="text-muted">{t("reported")}</dt>
                <dd className="text-ink">{selected.reported ? tc("yes") : tc("no")}</dd>
              </div>
            </dl>
          </SectionCard>
        </div>
      ) : null}

      <SectionCard className="mb-4">
        <form action="/logs/scans" method="get" className="grid gap-3 md:grid-cols-12">
          <div className="md:col-span-3">
            <label className="label" htmlFor="employee">{t("employee")}</label>
            <input id="employee" name="employee" defaultValue={query.employee} placeholder={t("employeeSearchPlaceholder")} className="input" />
          </div>
          <div className="md:col-span-2">
            <label className="label" htmlFor="result">{t("result")}</label>
            <select id="result" name="result" defaultValue={query.result} className="input">
              <option value="">{t("allResults")}</option>
              <option value="VALID">{ts("scanValid")}</option>
              <option value="INVALID">{ts("scanInvalid")}</option>
              <option value="EXPIRED">{ts("scanExpired")}</option>
              <option value="REVOKED">{ts("scanRevoked")}</option>
              <option value="SUSPENDED">{ts("scanSuspended")}</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="label" htmlFor="from">{t("from")}</label>
            <input id="from" name="from" type="date" defaultValue={query.from} className="input" dir="ltr" />
          </div>
          <div className="md:col-span-2">
            <label className="label" htmlFor="to">{t("to")}</label>
            <input id="to" name="to" type="date" defaultValue={query.to} className="input" dir="ltr" />
          </div>
          <div className="flex items-end gap-2 md:col-span-3">
            <button type="submit" className="btn btn-primary flex-1">
              <Search className="h-4 w-4" aria-hidden="true" />
              {t("filter")}
            </button>
            <Link href="/logs/scans" className="btn btn-secondary">{t("resetFilters")}</Link>
          </div>
        </form>
      </SectionCard>

      {data.rows.length === 0 ? (
        <SectionCard><EmptyState title={t("noScans")} /></SectionCard>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th className="th">{t("dateTime")}</th>
                <th className="th">{t("employee")}</th>
                <th className="th">{t("result")}</th>
                <th className="th hidden md:table-cell">{t("prefix")}</th>
                <th className="th hidden lg:table-cell">{t("ipHash")}</th>
                <th className="th"><span className="sr-only">{tc("details")}</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.rows.map((scan) => (
                <tr key={scan.id} className="hover:bg-surface">
                  <td className="td whitespace-nowrap text-sm">{formatDateTime(scan.created_at, locale)}</td>
                  <td className="td text-sm">
                    {scan.card?.employee ? (
                      <Link href={`/employees/${scan.card.employee.id}`} className="font-medium text-ink hover:text-brand">
                        {scan.card.employee.full_name}
                      </Link>
                    ) : (
                      <span className="text-muted">{tc("unknown")}</span>
                    )}
                  </td>
                  <td className="td">
                    <Badge tone={scan.result === "VALID" ? "success" : "danger"}>{ts(resultLabelKey(scan.result))}</Badge>
                  </td>
                  <td className="td hidden font-mono text-xs md:table-cell" dir="ltr">{scan.token_prefix}</td>
                  <td className="td hidden font-mono text-xs lg:table-cell" dir="ltr">{scan.ip_hash.slice(0, 12)}…</td>
                  <td className="td text-end">
                    <Link
                      href={`/logs/scans?${new URLSearchParams({ ...(query.result ? { result: query.result } : {}), ...(query.employee ? { employee: query.employee } : {}), ...(query.from ? { from: query.from } : {}), ...(query.to ? { to: query.to } : {}), scan: scan.id }).toString()}`} className="link text-xs"
                    >
                      {t("openDetails")}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        basePath="/logs/scans"
        query={{ result: query.result, employee: query.employee, from: query.from, to: query.to }}
        page={data.page}
        pageCount={data.pageCount}
        labels={{ previous: tc("previous"), next: tc("next"), pageOf: tp("pageOf", { page: data.page, pages: data.pageCount }) }}
      />
    </div>
  );
}
