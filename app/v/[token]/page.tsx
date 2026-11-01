import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Link from "next/link";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { BadgeCheck, CalendarClock, ShieldAlert, ShieldX, TriangleAlert, UserRound } from "lucide-react";
import { normalizeHexColor } from "@/lib/colors";
import { formatDate, formatDateTime } from "@/lib/format";
import { getIpHash, sanitizeUserAgent } from "@/lib/http";
import { checkVerifyRateLimit } from "@/lib/security/rate-limit";
import { verifyPublicToken, type VerificationView } from "@/lib/services/verification";
import { PRODUCT_NAME } from "@/lib/brand";
import { DEFAULT_TIME_ZONE } from "@/lib/config";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata(): Promise<Metadata> {
  const [t, tb] = await Promise.all([getTranslations("verify"), getTranslations("brand")]);
  return {
    title: `${t("pageTitle")} · ${tb("name")}`,
    robots: { index: false, follow: false, nocache: true },
  };
}

function StateIcon({ state }: { state: VerificationView["state"] }) {
  const className = "h-10 w-10";
  if (state === "valid") return <BadgeCheck className={className} aria-hidden="true" />;
  if (state === "expired") return <CalendarClock className={className} aria-hidden="true" />;
  if (state === "cancelled") return <ShieldX className={className} aria-hidden="true" />;
  return <TriangleAlert className={className} aria-hidden="true" />;
}

export default async function VerifyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [t, tb, tc, headerStore] = await Promise.all([
    getTranslations("verify"),
    getTranslations("brand"),
    getTranslations("common"),
    headers(),
  ]);
  const nonce = headerStore.get("x-nonce") ?? "";
  const ipHash = getIpHash(headerStore);
  const userAgent = sanitizeUserAgent(headerStore.get("user-agent"));
  const requestHost = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  const now = new Date();

  const rate = await checkVerifyRateLimit(ipHash);
  const productPrimary = "#0F766E";

  if (!rate.allowed) {
    return (
      <main className="min-h-screen bg-surface" style={{ "--brand": productPrimary } as CSSProperties}>
        <header className="border-b border-border bg-card">
          <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-control bg-brand-tint text-brand">
              <ShieldAlert className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="font-bold text-ink">{PRODUCT_NAME}</span>
          </div>
        </header>
        <section className="mx-auto max-w-xl px-4 py-16 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-warning-tint text-warning">
            <CalendarClock className="h-8 w-8" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-bold text-ink">{t("rateLimitedTitle")}</h1>
          <p className="mt-2 text-sm text-muted">{t("rateLimitedBody", { seconds: rate.retryAfterSeconds })}</p>
        </section>
      </main>
    );
  }

  const result = await verifyPublicToken(token, { ipHash, userAgent, host: requestHost }, now);
  const company = result.company;
  const brandPrimary = normalizeHexColor(company?.primary_color, productPrimary);
  const brandSecondary = normalizeHexColor(company?.secondary_color, "#F59E0B");
  const brandName = company?.name ?? PRODUCT_NAME;
  const timeZone = company?.time_zone ?? DEFAULT_TIME_ZONE;
  const valid = result.state === "valid";
  const title =
    result.state === "valid"
      ? t("validHeading", { company: brandName })
      : result.state === "expired"
        ? t("expiredHeading")
        : result.state === "cancelled"
          ? t("cancelledHeading")
          : t("notValidHeading");
  const subtitle =
    result.state === "valid"
      ? t("validSubtitle", { company: brandName })
      : result.state === "expired"
        ? t("expiredBody")
        : result.state === "cancelled"
          ? t("cancelledBody")
          : t("invalidBody");
  const stateTone =
    result.state === "valid"
      ? "border-success bg-success-tint text-success-fg"
      : result.state === "expired"
        ? "border-warning bg-warning-tint text-warning-fg"
        : "border-danger bg-danger-tint text-danger-fg";
  const iconTone =
    result.state === "valid" ? "bg-success text-white" : result.state === "expired" ? "bg-warning text-white" : "bg-danger text-white";

  return (
    <main
      className="min-h-screen bg-surface"
      style={{ "--brand": brandPrimary, "--secondary": brandSecondary } as CSSProperties}
    >
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-4">
          <div className="flex min-w-0 items-center gap-3">
            {company?.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/media/logo?company=${company.id}`}
                alt={t("companyLogoAlt")}
                className="h-10 w-10 rounded-control bg-white object-contain p-1 ring-1 ring-border"
              />
            ) : (
              <span className="flex h-10 w-10 items-center justify-center rounded-control bg-brand-tint text-brand">
                <BadgeCheck className="h-5 w-5" aria-hidden="true" />
              </span>
            )}
            <span className="truncate text-base font-bold text-ink">{brandName}</span>
          </div>
          <span className="hidden rounded-pill bg-surface px-3 py-1 text-xs font-semibold text-muted sm:inline">
            {tb("name")}
          </span>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-4 py-6 sm:py-10">
        <div className={`rounded-card border-s-8 p-5 sm:p-7 ${stateTone}`} role="status" aria-live="polite">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <span className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-full motion-safe:animate-pulse ${iconTone}`}>
              <StateIcon state={result.state} />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.14em]">{tb("product")}</p>
              <h1 className="mt-1 text-2xl font-bold leading-tight sm:text-3xl">{title}</h1>
              <p className="mt-1.5 max-w-2xl text-sm leading-relaxed opacity-90">{subtitle}</p>
            </div>
          </div>
        </div>

        {valid && result.employee ? (
          <div className="mt-5 grid items-start gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
            <div className="card overflow-hidden">
              {result.employee.photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={result.employee.photo_url}
                  alt={t("employeePhotoAlt")}
                  width={480}
                  height={640}
                  className="aspect-[3/4] w-full object-cover"
                />
              ) : (
                <div className="flex aspect-[3/4] w-full items-center justify-center bg-surface text-subtle">
                  <UserRound className="h-12 w-12" aria-hidden="true" />
                </div>
              )}
              <p className="px-4 py-3 text-center text-xs font-medium text-muted">{t("comparePhoto")}</p>
            </div>

            <div className="card p-5 sm:p-7">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{t("validBadge")}</p>
              <h2 className="mt-1 text-2xl font-bold tracking-tight text-ink">{result.employee.full_name}</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {result.employee.job_title ? (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("jobTitle")}</p>
                    <p className="mt-0.5 text-sm font-medium text-ink">{result.employee.job_title}</p>
                  </div>
                ) : null}
                {result.employee.department ? (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("department")}</p>
                    <p className="mt-0.5 text-sm font-medium text-ink">{result.employee.department}</p>
                  </div>
                ) : null}
                {result.valid_until ? (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("validUntil")}</p>
                    <p className="mt-0.5 text-sm font-medium text-ink">{formatDate(new Date(result.valid_until), "en", timeZone)}</p>
                  </div>
                ) : null}
              </div>

              <div className="mt-6 rounded-control border border-border bg-surface px-4 py-3">
                <p className="text-xs font-medium text-muted">{t("checkedNowLabel")}</p>
                <p className="mt-0.5 font-mono text-sm font-semibold text-ink" data-live-clock>
                  {formatDateTime(now, "en", timeZone)}
                </p>
                <p className="mt-1 text-[11px] text-subtle">{t("freshnessHint")}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-5 card p-5 sm:p-7">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-danger-tint text-danger">
                <ShieldX className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-semibold text-ink">{t("invalidTitle")}</p>
                <p className="mt-1 text-sm leading-relaxed text-muted">{t("invalidBody")}</p>
              </div>
            </div>
            <div className="mt-5 rounded-control border border-border bg-surface px-4 py-3">
              <p className="text-xs font-medium text-muted">{t("checkedNowLabel")}</p>
              <p className="mt-0.5 font-mono text-sm font-semibold text-ink" data-live-clock>
                {formatDateTime(now, "en", timeZone)}
              </p>
            </div>
          </div>
        )}

        <div className="mt-6 flex justify-end">
          <Link href={`/v/${token}/report`} className="btn btn-secondary">
            {t("reportProblem")}
          </Link>
        </div>
      </section>

      <footer className="border-t border-border bg-card">
        <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-5 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <p className="font-semibold text-ink">{t("poweredBy", { brand: PRODUCT_NAME })}</p>
          <p>{t("footerNote")}</p>
        </div>
      </footer>

      <script
        nonce={nonce}
        dangerouslySetInnerHTML={{
          __html: `(()=>{const el=document.querySelector('[data-live-clock]');if(!el)return;const fmt=new Intl.DateTimeFormat(${JSON.stringify('en-GB')},{timeZone:${JSON.stringify(timeZone)},dateStyle:'medium',timeStyle:'medium'});const tick=()=>{el.textContent=fmt.format(new Date())};tick();setInterval(tick,1000)})()`,
        }}
      />
      <span className="sr-only">{tc("securityNote")}</span>
    </main>
  );
}
