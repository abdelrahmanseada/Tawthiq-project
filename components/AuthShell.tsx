import type { ReactNode } from "react";
import { LogoMark } from "@/components/ui";
import { COMPANY_DESCRIPTION, PRODUCT_NAME, TAGLINE, copyrightText } from "@/lib/brand";
import { PRODUCT_PRIMARY_COLOR, PRODUCT_SECONDARY_COLOR, readableTextOn } from "@/lib/colors";

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
  const primary = PRODUCT_PRIMARY_COLOR;
  const secondary = PRODUCT_SECONDARY_COLOR;
  const onPrimary = readableTextOn(primary);

  return (
    <main className="min-h-screen bg-surface lg:grid lg:grid-cols-[1.05fr_0.95fr]">
      <section
        aria-hidden="true"
        className="auth-panel relative hidden overflow-hidden p-12 lg:flex lg:flex-col lg:justify-between"
        style={{ background: primary, color: onPrimary }}
      >
        <div className="absolute inset-0 opacity-[0.13] [background-image:linear-gradient(rgba(255,255,255,.55)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.55)_1px,transparent_1px)] [background-size:36px_36px]" />
        <div className="relative">
          <div className="inline-flex items-center gap-3">
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
              <LogoMark className="h-11 w-11" />
            </span>
            <span className="text-2xl font-bold tracking-tight">{PRODUCT_NAME}</span>
          </div>
        </div>
        <div className="relative max-w-lg">
          <span className="mb-5 block h-px w-12" style={{ background: secondary }} />
          <p className="text-4xl font-bold leading-[1.2] tracking-tight xl:text-5xl">{TAGLINE}</p>
          <p className="mt-5 max-w-md text-base leading-relaxed opacity-75">{COMPANY_DESCRIPTION}</p>
        </div>
      </section>

      <section className="flex min-h-screen flex-col justify-center px-4 py-8 sm:px-8">
        <div className="mx-auto w-full max-w-[420px]">
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <LogoMark className="h-10 w-10" />
            <span className="text-lg font-bold text-ink">{PRODUCT_NAME}</span>
          </div>
          <div className="auth-form-enter rounded-card border border-border bg-card p-6 shadow-card sm:p-8">
            <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted">{subtitle}</p>
            <div className="mt-7">{children}</div>
          </div>
          <p className="mt-6 text-center text-xs text-subtle">{copyrightText()}</p>
        </div>
      </section>
    </main>
  );
}
