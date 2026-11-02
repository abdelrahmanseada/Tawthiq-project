import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PRODUCT_PRIMARY_COLOR, readableTextOn } from "@/lib/colors";
import { PRODUCT_NAME, copyrightText } from "@/lib/brand";
import { LogoMark } from "@/components/ui";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("verify");
  return { title: t("reportTitle"), robots: { index: false, follow: false } };
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
  const t = await getTranslations("verify");
  const tc = await getTranslations("common");
  const primary = PRODUCT_PRIMARY_COLOR;
  const backHref = `/v/${encodeURIComponent(token)}`;

  return (
    <main className="min-h-screen bg-surface" style={{ "--brand": primary } as React.CSSProperties}>
      <header style={{ background: primary, color: readableTextOn(primary) }}>
        <div className="mx-auto flex max-w-xl items-center justify-between gap-3 px-4 py-4">
          <span className="flex items-center gap-2">
            <LogoMark className="h-8 w-8" />
            <span className="truncate text-base font-bold">{PRODUCT_NAME}</span>
          </span>
          <Link href={backHref} className="text-xs font-semibold underline underline-offset-2">
            {t("backToCard")}
          </Link>
        </div>
      </header>

      <section className="mx-auto w-full max-w-xl px-4 py-8">
        <div className="card p-5 sm:p-7">
          <h1 className="text-2xl font-bold tracking-tight text-ink">{t("reportTitle")}</h1>
          <p className="mt-1 text-sm leading-relaxed text-muted">{t("reportSubtitle")}</p>

          {query.ok === "1" ? (
            <div role="status" className="mt-4 rounded-control border border-success bg-success-tint px-4 py-3 text-sm text-success-fg">
              {t("reportThanks")}
            </div>
          ) : null}
          {query.error ? (
            <div role="alert" className="mt-4 rounded-control border border-danger bg-danger-tint px-4 py-3 text-sm text-danger-fg">
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
              placeholder={t("reportPlaceholder")} className="input min-h-32"
            />
            <div className="flex flex-wrap gap-2">
              <button type="submit" className="btn btn-primary">
                {t("reportSubmit")}
              </button>
              <Link href={backHref} className="btn btn-secondary">
                {tc("cancel")}
              </Link>
            </div>
          </form>
        </div>
      </section>
      <footer className="border-t border-border bg-card py-4 text-center text-xs text-subtle">{copyrightText()}</footer>
    </main>
  );
}
