import Link from "next/link";
import { formatDate } from "@/lib/format";
import { listCompanies } from "@/lib/services/platform";

export const dynamic = "force-dynamic";

export default async function CompaniesPage() {
  const companies = await listCompanies();
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-indigo-600">Platform console</p>
          <h1 className="mt-1 text-2xl font-bold text-ink">Companies</h1>
          <p className="mt-1 text-sm text-muted">Every tenant, its plan usage and current status.</p>
        </div>
        <Link href="/platform/companies/new" className="btn btn-primary">Create company</Link>
      </div>
      <div className="mt-5 card overflow-hidden">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th className="th">Company</th>
                <th className="th">Slug</th>
                <th className="th">Status</th>
                <th className="th">Employees</th>
                <th className="th">Active cards</th>
                <th className="th">Scans · 30d</th>
                <th className="th">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {companies.map((company) => (
                <tr key={company.id}>
                  <td className="td font-semibold text-ink">
                    <Link href={`/platform/companies/${company.id}`} className="hover:underline">{company.name}</Link>
                  </td>
                  <td className="td font-mono text-xs text-muted">{company.slug}</td>
                  <td className="td">
                    <span className={company.status === "ACTIVE" ? "badge badge-success" : "badge badge-danger"}>
                      {company.status === "ACTIVE" ? "Active" : "Suspended"}
                    </span>
                  </td>
                  <td className="td tabular-nums">{company.employees} / {company.max_employees}</td>
                  <td className="td tabular-nums">{company.activeCards}</td>
                  <td className="td tabular-nums">{company.scans30d}</td>
                  <td className="td whitespace-nowrap text-xs text-muted">{formatDate(company.created_at)}</td>
                </tr>
              ))}
              {companies.length === 0 ? (
                <tr><td className="td py-10 text-center text-muted" colSpan={7}>No companies yet. Create the first tenant.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
