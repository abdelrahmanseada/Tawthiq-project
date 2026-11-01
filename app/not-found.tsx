import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LogoMark } from "@/components/ui";

export default async function NotFound() {
  const t = await getTranslations("errors");
  const tb = await getTranslations("brand");
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface px-4 text-center">
      <LogoMark className="h-12 w-12" />
      <p className="text-sm font-bold uppercase tracking-[0.2em] text-brand">404</p>
      <h1 className="text-3xl font-bold tracking-tight text-ink">{t("notFoundTitle")}</h1>
      <p className="max-w-md text-sm leading-relaxed text-muted">{t("notFoundBody")}</p>
      <Link href="/dashboard" className="btn btn-primary mt-2">
        {t("backDashboard")}
      </Link>
      <p className="mt-4 text-xs text-subtle">{tb("name")}</p>
    </main>
  );
}
