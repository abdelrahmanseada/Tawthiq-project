import Link from "next/link";
import { Building2, CalendarDays, ShieldAlert, Users, ScanLine } from "lucide-react";
import { formatDate, formatDateTime } from "@/lib/format";
import { platformStats } from "@/lib/services/platform";

export const dynamic = "force-dynamic";

export default async function PlatformOverviewPage() {
  const stats = await platformStats();
  const cards = [
    { label: "Companies", value: stats.companies, icon: Building2 },
    { label: "Employees", value: stats.employees, icon: Users },
    { label: "Scans (30 days)", value: stats.scans, icon: ScanLine },
    { label: "Failed logins (30 days)", value: stats.failedLogins, icon: ShieldAlert },
  ];
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-indigo-600">Platform console</p>
          <h1 className="mt-1 text-2xl font-bold text-ink">Operator overview</h1>
          <p className="mt-1 text-sm text-muted">Monitor tenants, limits and sign-in health across the platform.</p>
        </div>
        <Link href="/platform/companies/new" className="btn btn-primary">Create company</Link>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="card p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">{card.label}</p>
              <card.icon className="h-4 w-4 text-indigo-600" aria-hidden="true" />
            </div>
            <p className="mt-2 text-3xl font-bold tracking-tight text-ink">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <section className="card p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-bold text-ink">Recent signups</h2>
            <Link href="/platform/companies" className="text-xs font-semibold text-indigo-700 underline underline-offset-2">All companies</Link>
          </div>
          <ul className="mt-3 divide-y divide-border">
            {stats.recentSignups.map((company) => (
              <li key={company.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <Link href={`/platform/companies/${company.id}`} className="font-medium text-ink hover:underline">{company.name}</Link>
                <span className="text-xs text-muted">{formatDate(company.created_at)}</span>
              </li>
            ))}
            {stats.recentSignups.length === 0 ? <li className="py-6 text-sm text-muted">No companies yet.</li> : null}
          </ul>
        </section>

        <section className="card p-5">
          <h2 className="flex items-center gap-2 text-sm font-bold text-ink"><CalendarDays className="h-4 w-4 text-indigo-600" aria-hidden="true" /> Recent platform activity</h2>
          <ul className="mt-3 divide-y divide-border">
            {stats.recentAudit.map((entry) => (
              <li key={entry.id} className="py-2.5 text-sm">
                <p className="font-medium text-ink">{entry.action.replaceAll(".", " · ")}</p>
                <p className="text-xs text-muted">{formatDateTime(entry.created_at)}</p>
              </li>
            ))}
            {stats.recentAudit.length === 0 ? <li className="py-6 text-sm text-muted">No platform actions yet.</li> : null}
          </ul>
        </section>
      </div>
    </div>
  );
}
