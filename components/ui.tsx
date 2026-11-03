import type { ReactNode } from "react";
import Link from "next/link";

export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">{title}</h1>
        {subtitle ? <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("panel", className)}>{children}</section>;
}

export function SectionCard({
  title,
  description,
  actions,
  children,
  className,
  id,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section className={cn("card", className)} id={id}>
      {title || actions ? (
        <header className="flex flex-col gap-2 border-b border-border px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
          <div>
            {title ? <h2 className="text-base font-semibold text-ink">{title}</h2> : null}
            {description ? <p className="mt-0.5 text-sm text-muted">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className="p-4 sm:p-6">{children}</div>
    </section>
  );
}

export type Tone = "success" | "danger" | "warning" | "info" | "neutral";

const TONE_CLASSES: Record<Tone, string> = {
  success: "badge-success",
  danger: "badge-danger",
  warning: "badge-warning",
  info: "badge-info",
  neutral: "badge-neutral",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={cn("badge", TONE_CLASSES[tone])}>{children}</span>;
}

const ALERT_CLASSES: Record<Tone, string> = {
  success: "border-success bg-success-tint text-success-fg",
  danger: "border-danger bg-danger-tint text-danger-fg",
  warning: "border-warning bg-warning-tint text-warning-fg",
  info: "border-info bg-info-tint text-info-fg",
  neutral: "border-border bg-surface text-ink",
};

export function Alert({
  tone = "info",
  title,
  children,
}: {
  tone?: Tone;
  title?: string;
  children: ReactNode;
}) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn("rounded-control border-s-4 px-4 py-3 text-sm leading-relaxed", ALERT_CLASSES[tone])}
    >
      {title ? <p className="mb-0.5 font-semibold">{title}</p> : null}
      {children}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-14 text-center">
      <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-brand-tint text-brand">
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.7">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 7.5h16M4 12h10M4 16.5h7" />
        </svg>
      </div>
      <p className="text-base font-semibold text-ink">{title}</p>
      {description ? <p className="max-w-md text-sm leading-relaxed text-muted">{description}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = "neutral",
  icon,
  trend,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: Tone;
  icon?: ReactNode;
  trend?: ReactNode;
}) {
  const accent: Record<Tone, string> = {
    success: "text-success",
    danger: "text-danger",
    warning: "text-warning",
    info: "text-info",
    neutral: "text-muted",
  };
  return (
    <div className="card flex flex-col justify-between gap-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-muted">{label}</p>
        {icon ? <span className={cn("shrink-0", accent[tone])}>{icon}</span> : null}
      </div>
      <div>
        <p className="text-3xl font-bold tabular-nums tracking-tight text-ink">{value}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {trend ? <span className="text-xs font-medium text-muted">{trend}</span> : null}
          {hint ? <span className="text-xs text-muted">{hint}</span> : null}
        </div>
      </div>
    </div>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint ? <p className="hint">{hint}</p> : null}
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function Pagination({
  basePath,
  query,
  page,
  pageCount,
  labels,
}: {
  basePath: string;
  query: Record<string, string | undefined>;
  page: number;
  pageCount: number;
  labels: { previous: string; next: string; pageOf: string };
}) {
  if (pageCount <= 1) return null;
  const href = (targetPage: number) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value) params.set(key, value);
    }
    params.set("page", String(targetPage));
    return `${basePath}?${params.toString()}`;
  };
  const disablePrevious = page <= 1;
  const disableNext = page >= pageCount;
  return (
    <nav className="mt-4 flex items-center justify-between gap-3" aria-label="Pagination">
      {disablePrevious ? (
        <span className="btn btn-secondary btn-sm opacity-50" aria-disabled="true">
          {labels.previous}
        </span>
      ) : (
        <Link className="btn btn-secondary btn-sm" href={href(page - 1)} rel="prev">
          {labels.previous}
        </Link>
      )}
      <span className="text-sm text-muted">{labels.pageOf}</span>
      {disableNext ? (
        <span className="btn btn-secondary btn-sm opacity-50" aria-disabled="true">
          {labels.next}
        </span>
      ) : (
        <Link className="btn btn-secondary btn-sm" href={href(page + 1)} rel="next">
          {labels.next}
        </Link>
      )}
    </nav>
  );
}

export { LogoMark } from "@/components/LogoMark";
