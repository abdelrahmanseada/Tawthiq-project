import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { PageHeader, SectionCard, cn } from "@/components/ui";
import { ScanChart } from "@/components/ScanChart";
import { requirePermission } from "@/lib/auth/session";
import { formatNumber, formatTime } from "@/lib/format";
import type { Locale } from "@/lib/locale";
import { getDashboardData, getScansByHour, getTopScannedEmployees } from "@/lib/services/dashboard";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("analytics") };
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await requirePermission("logs.scans");
  const [t, td, tc] = await Promise.all([
    getTranslations("nav"),
    getTranslations("dashboard"),
    getTranslations("common"),
  ]);
  const locale = (await getLocale()) as Locale;
  const params = await searchParams;
  const range = params.range === "7" ? 7 : 30;
  const [data, hourly, topEmployees] = await Promise.all([
    getDashboardData(admin.companyId),
    getScansByHour(),
    getTopScannedEmployees(admin.companyId),
  ]);
  const series = data.series.slice(-range);
  const maxHour = Math.max(1, ...hourly.map((point) => point.count));

  return (
    <div>
      <PageHeader title={t("analytics")} subtitle={td("chartSubtitle")} />
      <div className="grid gap-5 xl:grid-cols-3">
        <SectionCard
          className="xl:col-span-2"
          title={td("chartTitle")}
          actions={
            <div className="flex rounded-control border border-border p-0.5">
              {[7, 30].map((value) => (
                <Link
                  key={value}
                  href={`/analytics?range=${value}`}
                  className={cn(
                    "rounded-[8px] px-3 py-1.5 text-xs font-semibold",
                    range === value ? "bg-brand text-brand-fg" : "text-muted hover:text-ink",
                  )}
                >
                  {value === 7 ? td("chart7") : td("chart30")}
                </Link>
              ))}
            </div>
          }
        >
          <ScanChart data={series} locale={locale} labels={{ valid: td("valid"), invalid: td("invalid") }} title={td("chartTitle")} />
        </SectionCard>

        <SectionCard title={td("needsAttention")}>
          <ul className="space-y-3 text-sm">
            <li className="flex items-center justify-between">
              <span className="text-muted">{td("scans24h")}</span>
              <span className="font-semibold text-ink">{formatNumber(data.scans24h, locale)}</span>
            </li>
            <li className="flex items-center justify-between">
              <span className="text-muted">{td("scans7d")}</span>
              <span className="font-semibold text-ink">{formatNumber(data.scans7d, locale)}</span>
            </li>
            <li className="flex items-center justify-between">
              <span className="text-muted">{td("invalidScans24h")}</span>
              <span className="font-semibold text-ink">{formatNumber(data.invalid24h, locale)}</span>
            </li>
          </ul>
          <h3 className="mt-5 text-sm font-semibold text-ink">{t("scanLogs")}</h3>
          <Link href="/logs/scans" className="link mt-2 inline-block text-sm">
            {tc("viewAll")}
          </Link>
        </SectionCard>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <SectionCard title={td("chartTitle")} description={td("scans24h")}>
          {hourly.length === 0 ? (
            <p className="text-sm text-muted">{td("recentInvalidEmpty")}</p>
          ) : (
            <div className="flex h-40 items-end gap-1 overflow-x-auto" aria-hidden="true">
              {hourly.map((point) => (
                <div key={point.hour.toISOString()} className="flex min-w-3 flex-1 flex-col items-center gap-1">
                  <div className="w-full rounded-t bg-brand" style={{ height: `${Math.max(4, (point.count / maxHour) * 100)}%` }} title={`${formatTime(point.hour, locale)}: ${point.count}`} />
                  <span className="text-[9px] text-subtle" dir="ltr">{formatTime(point.hour, locale)}</span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title={t("employees")}>
          {topEmployees.length === 0 ? (
            <p className="text-sm text-muted">{td("recentInvalidEmpty")}</p>
          ) : (
            <ul className="divide-y divide-border">
              {topEmployees.map((entry) => (
                <li key={entry.employee.id} className="flex items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0">
                    <Link href={`/employees/${entry.employee.id}`} className="block truncate text-sm font-semibold text-ink hover:text-brand">
                      {entry.employee.full_name}
                    </Link>
                    <p className="text-xs text-muted" dir="ltr">{entry.employee.employee_code}</p>
                  </div>
                  <span className="text-sm font-semibold text-ink">{formatNumber(entry.count, locale)}</span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <SectionCard className="mt-5" title={td("recentInvalid")}>
        {data.topInvalidPrefixes.length === 0 ? (
          <p className="text-sm text-muted">{td("recentInvalidEmpty")}</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th className="th">{td("invalid")}</th>
                  <th className="th">{td("date")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.topInvalidPrefixes.map((entry) => (
                  <tr key={entry.token_prefix}>
                    <td className="td font-mono text-xs" dir="ltr">{entry.token_prefix}</td>
                    <td className="td">{formatNumber(entry.count, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
