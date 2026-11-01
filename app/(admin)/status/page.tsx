import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import { AlertTriangle, CheckCircle2, RefreshCw, XCircle } from "lucide-react";
import { Badge, PageHeader, SectionCard } from "@/components/ui";
import { requirePermission } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/format";
import type { Locale } from "@/lib/locale";
import { getSystemStatus } from "@/lib/services/system-status";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("status");
  return { title: t("title") };
}

export default async function StatusPage() {
  const admin = await requirePermission("settings.manage");
  const [t, tc, locale] = await Promise.all([
    getTranslations("status"),
    getTranslations("common"),
    getLocale() as Promise<Locale>,
  ]);
  const status = await getSystemStatus(await headers(), admin.company);

  const localizedDetail = (check: (typeof status.checks)[number]): string => {
    if (check.id === "storage") {
      const gb = check.detail.match(/([\d.]+)/)?.[1];
      return gb ? t("gbFree", { value: gb }) : check.detail;
    }
    if (check.id === "redis") {
      return /^\d+\s*ms$/.test(check.detail) ? check.detail : t("notConfigured");
    }
    if (check.id === "verifyUrl") {
      if (check.state === "ok") return status.verifyUrl;
      return check.state === "error" ? t("unreachable") : t("notProductionValid");
    }
    if (check.id === "https") {
      return check.state === "ok" ? t("stateOk") : t("notHttps");
    }
    if (check.id === "backup") {
      if (check.state !== "ok") return t("noBackup");
      const days = check.detail.match(/latest ([\d.]+) days/)?.[1];
      return days ? t("backupOk", { days }) : t("stateOk");
    }
    return check.detail;
  };

  return (
    <div>
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          <Link href="/status" className="btn btn-secondary btn-sm">
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            {t("refresh")}
          </Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title={t("checks")}>
          <ul className="space-y-2">
            {status.checks.map((check) => {
              const Icon = check.state === "ok" ? CheckCircle2 : check.state === "warn" ? AlertTriangle : XCircle;
              return (
                <li key={check.id} className="flex items-start justify-between gap-3 rounded-control border border-border p-3">
                  <div className="flex items-start gap-2">
                    <Icon
                      className={
                        check.state === "ok" ? "mt-0.5 h-5 w-5 text-success" : check.state === "warn" ? "mt-0.5 h-5 w-5 text-warning" : "mt-0.5 h-5 w-5 text-danger"
                      }
                      aria-hidden="true"
                    />
                    <div>
                      <p className="text-sm font-semibold text-ink">{t(check.id)}</p>
                      <p className="break-all text-xs text-muted" dir="auto">{localizedDetail(check)}</p>
                    </div>
                  </div>
                  <Badge tone={check.state === "ok" ? "success" : check.state === "warn" ? "warning" : "danger"}>
                    {check.state === "ok" ? t("stateOk") : check.state === "warn" ? t("stateWarn") : t("stateError")}
                  </Badge>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-xs text-muted">
            {t("checkedAt", { time: formatDateTime(new Date(), locale) })}
          </p>
        </SectionCard>

        <SectionCard title={t("details")}>
          <dl className="divide-y divide-border text-sm">
            <div className="flex items-start justify-between gap-3 py-2">
              <dt className="text-muted">{t("clientIp")}</dt>
              <dd className="font-mono text-ink" dir="ltr">{status.ip}</dd>
            </div>
            <div className="flex items-start justify-between gap-3 py-2">
              <dt className="text-muted">{t("ipSource")}</dt>
              <dd className="text-ink" dir="ltr">{status.ipSource}</dd>
            </div>
            <div className="flex items-start justify-between gap-3 py-2">
              <dt className="text-muted">{t("forwardedChain")}</dt>
              <dd className="max-w-[60%] break-all text-end font-mono text-xs text-ink" dir="ltr">
                {status.forwardedChain.join(" ← ") || "—"}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-3 py-2">
              <dt className="text-muted">{t("trustedHops")}</dt>
              <dd className="text-ink" dir="ltr">{status.trustedHops}</dd>
            </div>
            <div className="flex items-start justify-between gap-3 py-2">
              <dt className="text-muted">{t("protocol")}</dt>
              <dd className="text-ink" dir="ltr">{status.protocol}</dd>
            </div>
            <div className="flex items-start justify-between gap-3 py-2">
              <dt className="text-muted">{t("host")}</dt>
              <dd className="text-ink" dir="ltr">{status.host}</dd>
            </div>
            <div className="flex items-start justify-between gap-3 py-2">
              <dt className="text-muted">{t("version")}</dt>
              <dd className="text-ink" dir="ltr">{status.appVersion}</dd>
            </div>
            <div className="flex items-start justify-between gap-3 py-2">
              <dt className="text-muted">{t("publicVerifyUrl")}</dt>
              <dd className="max-w-[60%] break-all text-end font-mono text-xs text-ink" dir="ltr">{status.verifyUrl}</dd>
            </div>
          </dl>
          <p className="mt-4 text-xs text-muted">{tc("securityNote")}</p>
        </SectionCard>
      </div>
    </div>
  );
}
