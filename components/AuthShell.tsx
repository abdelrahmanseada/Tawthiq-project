import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { LogoMark } from "@/components/ui";

/** Split auth layout used by login, 2FA and forced password change. */
export async function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  const t = await getTranslations("brand");
  return (
    <main className="min-h-screen bg-surface lg:grid lg:grid-cols-[1.05fr_0.95fr]">
      <section
        aria-hidden="true"
        className="relative hidden overflow-hidden bg-[#062E2B] p-12 text-white lg:flex lg:flex-col lg:justify-between"
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(20,184,166,0.35),transparent_45%),radial-gradient(circle_at_85%_80%,rgba(245,158,11,0.22),transparent_42%)]" />
        <div className="absolute inset-0 opacity-[0.13] [background-image:linear-gradient(rgba(255,255,255,.5)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.5)_1px,transparent_1px)] [background-size:34px_34px]" />
        <div className="relative">
          <div className="inline-flex items-center gap-3">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20 backdrop-blur">
              <LogoMark className="h-10 w-10" />
            </span>
            <span className="text-2xl font-bold tracking-tight">{t("name")}</span>
          </div>
        </div>
        <div className="relative max-w-lg">
          <p className="text-4xl font-bold leading-[1.25] tracking-tight xl:text-5xl">{t("tagline")}</p>
          <p className="mt-5 max-w-md text-base leading-relaxed text-white/70">{t("description")}</p>
          <div className="mt-10 flex items-center gap-3 text-xs font-medium uppercase tracking-[0.16em] text-white/70">
            <span className="h-px w-10 bg-amber-400" />
            {t("product")}
          </div>
        </div>
        <div className="relative flex items-center justify-between text-xs text-white/60">
          <span>© {new Date().getFullYear()} {t("name")}</span>
          <span>{t("poweredBy")}</span>
        </div>
      </section>

      <section className="flex min-h-screen flex-col justify-center px-4 py-8 sm:px-8">
        <div className="mx-auto w-full max-w-[420px]">
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <LogoMark className="h-9 w-9" />
            <span className="text-lg font-bold text-ink">{t("name")}</span>
          </div>
          <div className="rounded-card border border-border bg-card p-6 shadow-card sm:p-8">
            <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted">{subtitle}</p>
            <div className="mt-7">{children}</div>
          </div>
          <p className="mt-6 text-center text-xs text-subtle">{t("poweredBy")}</p>
        </div>
      </section>
    </main>
  );
}
