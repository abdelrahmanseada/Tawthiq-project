import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { VerifyBrandFooter, VerifyBrandHeader } from "@/components/VerifyBrand";
import { CARD_BRAND_NAME } from "@/lib/brand";
import { getPublicCompanyForToken } from "@/lib/services/verification";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("verify");
  return { title: { absolute: `${CARD_BRAND_NAME} · ${t("reportTitle")}` }, robots: { index: false, follow: false } };
}

export default async function ReportProblemPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await params;
  const query = await searchParams;
  const [t, tc, company] = await Promise.all([
    getTranslations("verify"),
    getTranslations("common"),
    getPublicCompanyForToken(token),
  ]);
  const backHref = `/v/${encodeURIComponent(token)}`;

  return (
    <main className="verify-shell min-h-screen">
      <VerifyBrandHeader company={company} action={{ href: backHref, label: t("backToCard") }} />

      <section className="mx-auto w-full max-w-xl px-4 py-8">
        <div className="verify-panel p-5 sm:p-7">
          <h1 className="verify-display text-2xl font-semibold tracking-tight text-white">{t("reportTitle")}</h1>
          <p className="verify-body mt-2 text-sm leading-relaxed text-white/70">{t("reportSubtitle")}</p>
          <span className="mt-4 block h-[3px] w-12 bg-[#a12b2b]" aria-hidden="true" />

          {query.ok === "1" ? (
            <div
              role="status"
              className="mt-4 rounded-[10px] border border-[#2f5d3a] bg-[#101b13] px-4 py-3 text-sm text-[#b9e3c3]"
            >
              {t("reportThanks")}
            </div>
          ) : null}
          {query.error ? (
            <div
              role="alert"
              className="mt-4 rounded-[10px] border border-[#6b2020] bg-[#1b0f0f] px-4 py-3 text-sm text-[#f0b4b4]"
            >
              {query.error === "rate" ? t("rateLimitedTitle") : t("reportError")}
            </div>
          ) : null}

          <form action={`/api/verify/${encodeURIComponent(token)}/report`} method="post" className="mt-5 space-y-3">
            <label className="label" htmlFor="note">
              {t("reportNote")}
            </label>
            <textarea
              id="note"
              name="note"
              required
              minLength={3}
              maxLength={500}
              rows={5}
              placeholder={t("reportPlaceholder")}
              className="input min-h-32"
            />
            <div className="flex flex-wrap gap-2">
              <button type="submit" className="btn bg-[#8f0015] text-white hover:bg-[#a12b2b]">
                {t("reportSubmit")}
              </button>
              <Link href={backHref} className="btn verify-button">
                {tc("cancel")}
              </Link>
            </div>
          </form>
        </div>
      </section>

      <VerifyBrandFooter company={company} />
    </main>
  );
}
