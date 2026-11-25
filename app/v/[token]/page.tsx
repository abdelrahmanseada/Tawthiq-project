import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { BadgeCheck, CalendarClock, ShieldX, TriangleAlert } from "lucide-react";
import { VerifyBrandFooter, VerifyBrandHeader } from "@/components/VerifyBrand";
import { CARD_BRAND_NAME } from "@/lib/brand";
import { formatDate, formatDateTime } from "@/lib/format";
import { getIpHash, sanitizeUserAgent } from "@/lib/http";
import { checkVerifyRateLimit } from "@/lib/security/rate-limit";
import { verifyPublicToken, type VerificationView } from "@/lib/services/verification";
import { DEFAULT_TIME_ZONE } from "@/lib/config";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("verify");
  return {
    title: { absolute: `${CARD_BRAND_NAME} · ${t("pageTitle")}` },
    robots: { index: false, follow: false, nocache: true },
  };
}

function StateIcon({ state }: { state: VerificationView["state"] }) {
  const className = "h-9 w-9";
  if (state === "valid") return <BadgeCheck className={className} aria-hidden="true" />;
  if (state === "expired") return <CalendarClock className={className} aria-hidden="true" />;
  if (state === "cancelled") return <ShieldX className={className} aria-hidden="true" />;
  return <TriangleAlert className={className} aria-hidden="true" />;
}

const LABEL = "text-[11px] font-semibold uppercase tracking-[0.16em] text-white/60";

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

  if (!rate.allowed) {
    return (
      <main className="verify-shell min-h-screen">
        <VerifyBrandHeader company={null} />
        <section className="mx-auto max-w-xl px-4 py-16 text-center">
          <div className="verify-panel p-8">
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#b45309] text-white">
              <CalendarClock className="h-8 w-8" aria-hidden="true" />
            </span>
            <h1 className="verify-display mt-5 text-2xl font-semibold text-white">{t("rateLimitedTitle")}</h1>
            <p className="verify-body mt-2 text-sm text-white/75">
              {t("rateLimitedBody", { seconds: rate.retryAfterSeconds })}
            </p>
          </div>
        </section>
        <VerifyBrandFooter company={null} />
      </main>
    );
  }

  const result = await verifyPublicToken(token, { ipHash, userAgent, host: requestHost }, now);
  const company = result.company;
  const brandName = company?.name ?? CARD_BRAND_NAME;
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
      ? "border-s-[#15803d]"
      : result.state === "expired"
        ? "border-s-[#b45309]"
        : "border-s-[#a12b2b]";
  const iconTone =
    result.state === "valid"
      ? "bg-[#15803d] text-white"
      : result.state === "expired"
        ? "bg-[#b45309] text-white"
        : "bg-[#8f0015] text-white";

  return (
    <main className="verify-shell min-h-screen">
      <VerifyBrandHeader company={company} />

      <section className="mx-auto max-w-3xl px-4 py-6 sm:py-10">
        <div
          className={`verify-banner verify-panel flex flex-col gap-4 border-s-[6px] p-5 sm:flex-row sm:items-center sm:p-7 ${stateTone}`}
          role="status"
          aria-live="polite"
        >
          <span className={`verify-icon flex h-16 w-16 shrink-0 items-center justify-center rounded-full ${iconTone}`}>
            <StateIcon state={result.state} />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">{tb("product")}</p>
            <h1 className="verify-display mt-2 text-2xl font-semibold leading-tight text-white sm:text-3xl">{title}</h1>
            <p className="verify-body mt-2 max-w-2xl text-sm leading-relaxed text-white/75">{subtitle}</p>
          </div>
        </div>

        {valid && result.employee ? (
          <div className="mt-5">
            <div className="verify-panel p-5 sm:p-7">
              <p className={LABEL}>{t("validBadge")}</p>
              <h2 className="verify-display mt-2 text-2xl font-semibold uppercase leading-tight tracking-[0.01em] text-white sm:text-3xl">
                {result.employee.full_name}
              </h2>
              <span className="mt-3 block h-[3px] w-12 bg-[#a12b2b]" aria-hidden="true" />

              <dl className="mt-5 grid gap-4 sm:grid-cols-2">
                {result.employee.job_title ? (
                  <div>
                    <dt className={LABEL}>{t("jobTitle")}</dt>
                    <dd className="verify-body mt-1 text-base text-white">{result.employee.job_title}</dd>
                  </div>
                ) : null}
                {result.employee.department ? (
                  <div>
                    <dt className={LABEL}>{t("department")}</dt>
                    <dd className="verify-body mt-1 text-base text-white">{result.employee.department}</dd>
                  </div>
                ) : null}
                {result.valid_until ? (
                  <div>
                    <dt className={LABEL}>{t("validUntil")}</dt>
                    <dd className="verify-body mt-1 text-base text-white">
                      {formatDate(new Date(result.valid_until), "en", timeZone)}
                    </dd>
                  </div>
                ) : null}
              </dl>

              <div className="checked-pulse verify-inset mt-6 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">
                  {t("checkedNowLabel")}
                </p>
                <p className="verify-mono mt-1 text-sm font-semibold text-white" data-live-clock>
                  {formatDateTime(now, "en", timeZone)}
                </p>
                <p className="mt-1 text-[11px] text-white/50">{t("freshnessHint")}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="verify-panel mt-5 p-5 sm:p-7">
            <p className={LABEL}>{t("checkedNowLabel")}</p>
            <p className="verify-mono mt-1 text-sm font-semibold text-white" data-live-clock>
              {formatDateTime(now, "en", timeZone)}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-white/70">{t("footerNote")}</p>
          </div>
        )}

        <div className="mt-6 flex justify-end">
          <Link href={`/v/${token}/report`} className="btn verify-button">
            {t("reportProblem")}
          </Link>
        </div>
      </section>

      <VerifyBrandFooter company={company} />

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
