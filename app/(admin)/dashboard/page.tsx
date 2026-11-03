import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  FileSpreadsheet,
  IdCard,
  ScanLine,
  TrendingDown,
  TrendingUp,
  UserPlus,
  Users,
} from "lucide-react";
import { Badge, EmptyState, PageHeader, SectionCard, StatCard, cn } from "@/components/ui";
import { ScanChart } from "@/components/ScanChart";
import { KpiNumber } from "@/components/KpiNumber";
import { requirePermission } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { formatDate, formatDateTime, formatNumber } from "@/lib/format";
import { validateVerifyBaseUrl } from "@/lib/qr";
import { getDashboardData } from "@/lib/services/dashboard";
import { kpiDelta } from "@/lib/kpi";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("dashboard");
  return { title: t("title") };
}

function Trend({ current, previous, labels }: { current: number; previous: number; labels: { up: string; down: string; absolute: string; fresh: string } }) {
  const delta = kpiDelta(current, previous);
  if (delta.kind === "none") return null;
  if (delta.kind === "new") return <span className="text-xs font-semibold text-success">{labels.fresh}</span>;
  if (delta.kind === "absolute") {
    const value = delta.change > 0 ? `+${delta.change}` : String(delta.change);
    return <span className={cn("inline-flex items-center gap-1 text-xs font-semibold", delta.change > 0 ? "text-success" : delta.change < 0 ? "text-danger" : "text-muted")}>{labels.absolute.replace("{value}", value)}</span>;
  }
  const Icon = delta.change > 0 ? TrendingUp : TrendingDown;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-semibold", delta.change > 0 ? "text-success" : delta.change < 0 ? "text-danger" : "text-muted")}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {delta.change > 0 ? labels.up.replace("{value}", String(delta.change)) : labels.down.replace("{value}", String(Math.abs(delta.change)))}
    </span>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await requirePermission("dashboard.view");
  const t = await getTranslations("dashboard");
  const tc = await getTranslations("common");
  const ts = await getTranslations("statuses");
  const locale = "en" as const;
  const params = await searchParams;
  const range = params.chart === "7" ? 7 : 30;
  const data = await getDashboardData(admin.companyId);
  const series = data.series.slice(-range);
  const urlCheck = validateVerifyBaseUrl(admin.company.verify_base_url, env.NODE_ENV === "production");
  const invalidDomain = !urlCheck.ok || !urlCheck.productionValid;

  const attention = [
    invalidDomain
      ? { key: "domain", label: t("verifyDomain"), href: "/settings#domain", tone: "danger" as const, count: 1 }
      : null,
    data.expiringSoon > 0
      ? { key: "expiring", label: t("expiringSoon"), href: "/cards?expiring=1", tone: "warning" as const, count: data.expiringSoon }
      : null,
    data.missingPhotos > 0
      ? { key: "photos", label: t("missingPhotos", { count: data.missingPhotos }), href: "/employees?photo=missing", tone: "warning" as const, count: data.missingPhotos }
      : null,
    data.failedImports > 0
      ? { key: "imports", label: t("failedImports", { count: data.failedImports }), href: "/imports", tone: "danger" as const, count: data.failedImports }
      : null,
    data.legacyCards > 0
      ? { key: "legacy", label: t("legacyCards", { count: data.legacyCards }), href: "/cards", tone: "warning" as const, count: data.legacyCards }
      : null,
  ].filter((item): item is NonNullable<typeof item> => Boolean(item));

  const trendLabels = {
    up: t("trendUp", { value: "{value}" }),
    down: t("trendDown", { value: "{value}" }),
    flat: t("trendFlat"),
    absolute: t("trendAbsolute", { value: "{value}" }),
    fresh: t("trendNew"),
  };

  return (
    <div>
      {!admin.company.onboarding_completed_at ? (
        <div className="mb-5 rounded-card border border-brand bg-brand-tint p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-ink">Finish setting up your workspace</p>
              <p className="mt-1 text-sm text-muted">Add your profile, verify the QR URL, add employees and print a test card.</p>
            </div>
            <Link href="/onboarding" className="btn btn-primary btn-sm">Open setup checklist</Link>
          </div>
        </div>
      ) : null}

      <PageHeader
        title={t("greeting", { name: admin.name })}
        subtitle={t("subtitle")}
        actions={
          <>
            <Link href="/employees/new" className="btn btn-secondary btn-sm">
              <UserPlus className="h-4 w-4" aria-hidden="true" />
              {t("addEmployee")}
            </Link>
            <Link href="/cards" className="btn btn-primary btn-sm">
              <IdCard className="h-4 w-4" aria-hidden="true" />
              {t("printCards")}
            </Link>
          </>
        }
      />

      <div className="stagger grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t("activeEmployees")}
          value={<KpiNumber value={data.activeEmployees} />}
          hint={`${formatNumber(data.totalEmployees, locale)} ${tc("results")}`}
          icon={<Users className="h-5 w-5" />}
          tone="info"
        />
        <StatCard
          label={t("activeCards")}
          value={<KpiNumber value={data.activeCards} />}
          hint={`${formatNumber(data.expiringSoon, locale)} ${t("expiringSoon")}`}
          icon={<IdCard className="h-5 w-5" />}
          tone="neutral"
        />
        <StatCard
          label={t("scans24h")}
          value={<KpiNumber value={data.scans24h} />}
          icon={<ScanLine className="h-5 w-5" />}
          tone="success"
          trend={<Trend current={data.scans24h} previous={data.scans24hPrevious} labels={trendLabels} />}
          hint={data.scans24hPrevious >= 10 ? t("vsPrevious") : undefined}
        />
        <StatCard
          label={t("invalidScans24h")}
          value={<KpiNumber value={data.invalid24h} />}
          icon={<AlertTriangle className="h-5 w-5" />}
          tone={data.invalid24h > 0 ? "danger" : "success"}
          trend={<Trend current={data.invalid24h} previous={data.invalid24hPrevious} labels={trendLabels} />}
          hint={data.invalid24hPrevious >= 10 ? t("vsPrevious") : undefined}
        />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-3">
        <SectionCard className="xl:col-span-2"
          title={t("chartTitle")}
          description={t("chartSubtitle")}
          actions={
            <div className="flex rounded-control border border-border p-0.5" role="group" aria-label={t("chartTitle")}>
              {[7, 30].map((value) => (
                <Link
                  key={value}
                  href={`/dashboard?chart=${value}`}
                  className={cn(
                    "rounded-[8px] px-3 py-1.5 text-xs font-semibold",
                    range === value ? "bg-brand text-brand-fg" : "text-muted hover:text-ink",
                  )}
                  aria-current={range === value ? "true" : undefined}
                >
                  {value === 7 ? t("chart7") : t("chart30")}
                </Link>
              ))}
            </div>
          }
        >
          <ScanChart data={series} locale={locale} labels={{ valid: t("valid"), invalid: t("invalid") }} title={t("chartTitle")} />
          <details className="mt-3">
            <summary className="cursor-pointer text-xs font-semibold text-muted">{t("chartTable")}</summary>
            <div className="mt-2 max-h-56 overflow-auto">
              <table className="w-full text-xs">
                <thead className="bg-surface text-start">
                  <tr>
                    <th className="px-2 py-1.5 text-start">{t("date")}</th>
                    <th className="px-2 py-1.5 text-start">{t("valid")}</th>
                    <th className="px-2 py-1.5 text-start">{t("invalid")}</th>
                  </tr>
                </thead>
                <tbody>
                  {series.map((point) => (
                    <tr key={point.date} className="border-t border-border">
                      <td className="px-2 py-1.5">{formatDate(new Date(`${point.date}T00:00:00.000Z`), locale, admin.company.time_zone)}</td>
                      <td className="px-2 py-1.5 tabular-nums">{point.valid}</td>
                      <td className="px-2 py-1.5 tabular-nums">{point.invalid}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </SectionCard>

        <SectionCard title={t("needsAttention")} description={t("quickActions")}>
          {attention.length === 0 ? (
            <p className="text-sm text-muted">{t("needsAttentionEmpty")}</p>
          ) : (
            <ul className="space-y-2">
              {attention.map((item) => (
                <li key={item.key}>
                  <Link
                    href={item.href} className="flex items-center justify-between gap-2 rounded-control border border-border px-3 py-2.5 hover:bg-surface"
                  >
                    <span className="flex items-center gap-2 text-sm">
                      <AlertTriangle
                        className={cn("h-4 w-4 shrink-0", item.tone === "danger" ? "text-danger" : "text-warning")}
                        aria-hidden="true"
                      />
                      <span className="text-ink">{item.label}</span>
                    </span>
                    <span className="flex items-center gap-1 text-xs font-semibold text-muted">
                      {formatNumber(item.count, locale)}
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-5 grid grid-cols-2 gap-2">
            <Link href="/employees/new" className="rounded-control border border-border p-3 text-sm hover:bg-surface">
              <UserPlus className="mb-1 h-4 w-4 text-brand" aria-hidden="true" />
              <span className="block font-medium text-ink">{t("addEmployee")}</span>
            </Link>
            <Link href="/imports" className="rounded-control border border-border p-3 text-sm hover:bg-surface">
              <FileSpreadsheet className="mb-1 h-4 w-4 text-brand" aria-hidden="true" />
              <span className="block font-medium text-ink">{t("importEmployees")}</span>
            </Link>
            <Link href="/logs/scans" className="rounded-control border border-border p-3 text-sm hover:bg-surface">
              <ScanLine className="mb-1 h-4 w-4 text-brand" aria-hidden="true" />
              <span className="block font-medium text-ink">{t("viewScans")}</span>
            </Link>
            <Link href="/cards" className="rounded-control border border-border p-3 text-sm hover:bg-surface">
              <IdCard className="mb-1 h-4 w-4 text-brand" aria-hidden="true" />
              <span className="block font-medium text-ink">{t("printCards")}</span>
            </Link>
          </div>
        </SectionCard>
      </div>

      <div className="mt-5 grid grid-cols-1 items-start gap-5 xl:grid-cols-2">
        <SectionCard
          title={t("expiringTitle")}
          actions={
            <Link href="/cards?expiring=1" className="link text-sm">
              {t("seeAll")}
            </Link>
          }
        >
          {data.expiringCards.length === 0 ? (
            <EmptyState title={t("expiringEmpty")} />
          ) : (
            <ul className="divide-y divide-border">
              {data.expiringCards.map((card) => (
                <li key={card.cardId} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <Link href={`/employees/${card.employeeId}`} className="block truncate text-sm font-semibold text-ink hover:text-brand">
                      {card.employeeName}
                    </Link>
                    <p className="text-xs text-muted">{card.employeeCode}</p>
                  </div>
                  <span className="flex shrink-0 items-center gap-1.5 text-xs text-warning">
                    <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
                    {formatDate(card.expiresAt, locale, admin.company.time_zone)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title={t("recentInvalid")}
          actions={
            <Link href="/logs/scans?result=INVALID" className="link text-sm">
              {t("viewAll")}
            </Link>
          }
        >
          {data.recentInvalid.length === 0 ? (
            <EmptyState title={t("recentInvalidEmpty")} />
          ) : (
            <ul className="divide-y divide-border">
              {data.recentInvalid.map((scan) => (
                <li key={scan.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    {scan.employee_id ? (
                      <Link href={`/employees/${scan.employee_id}`} className="block truncate text-sm font-semibold text-ink hover:text-brand">
                        {scan.employee_name}
                      </Link>
                    ) : (
                      <p className="truncate text-sm font-semibold text-ink">{tc("unknown")}</p>
                    )}
                    <p className="text-xs text-muted" dir="ltr">
                      {scan.token_prefix}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Badge tone="danger">{ts("scanInvalid")}</Badge>
                    <span className="text-[11px] text-muted">{formatDateTime(scan.created_at, locale, admin.company.time_zone)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
