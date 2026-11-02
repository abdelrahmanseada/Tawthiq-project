"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { LogoMark } from "@/components/ui";
import { copyrightText } from "@/lib/brand";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("errors");
  const tc = useTranslations("common");
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface px-4 text-center">
      <LogoMark className="h-12 w-12" />
      <h1 className="text-3xl font-bold tracking-tight text-ink">{t("serverTitle")}</h1>
      <p className="max-w-md text-sm leading-relaxed text-muted">{t("serverBody")}</p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        <button type="button" onClick={reset} className="btn btn-primary">
          {tc("retry")}
        </button>
        <Link href="/dashboard" className="btn btn-secondary">
          {t("backDashboard")}
        </Link>
      </div>
      <p className="mt-4 text-xs text-subtle">{copyrightText()}</p>
    </main>
  );
}
