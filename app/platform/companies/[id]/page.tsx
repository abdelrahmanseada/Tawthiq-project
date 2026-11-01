import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui";
import { formatDate, formatDateTime } from "@/lib/format";
import { getCompanyForPlatform } from "@/lib/services/platform";
import {
  platformDeactivateAdminAction,
  resetOwner2faAction,
  suspendCompanyAction,
  updateCompanyLimitsAction,
} from "../../actions";

export const dynamic = "force-dynamic";

export default async function PlatformCompanyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const company = await getCompanyForPlatform(id);
  if (!company) notFound();
  const owner = company.admin_users.find((admin) => admin.role === "SUPER_ADMIN");

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/platform/companies" className="text-xs font-semibold text-indigo-700 underline underline-offset-2">← All companies</Link>
          <h1 className="mt-2 text-2xl font-bold text-ink">{company.name}</h1>
          <p className="mt-1 font-mono text-xs text-muted">{company.slug}</p>
        </div>
        <form action={suspendCompanyAction}>
          <input type="hidden" name="company_id" value={company.id} />
          <input type="hidden" name="status" value={company.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE"} />
          <button type="submit" className={company.status === "ACTIVE" ? "btn btn-danger" : "btn btn-primary"}>
            {company.status === "ACTIVE" ? "Suspend company" : "Reactivate company"}
          </button>
        </form>
      </div>

      {query.created === "1" ? <div className="mt-4"><Alert tone="success">Company created. Give the owner the temporary password out of band.</Alert></div> : null}
      {query.updated === "1" ? <div className="mt-4"><Alert tone="success">Company settings updated.</Alert></div> : null}
      {query.reset2fa === "1" ? <div className="mt-4"><Alert tone="success">The owner’s second factor and sessions were reset.</Alert></div> : null}
      {query.deactivated === "1" ? <div className="mt-4"><Alert tone="success">Administrator deactivated.</Alert></div> : null}

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          <section className="card p-5">
            <h2 className="text-sm font-bold text-ink">Company</h2>
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="text-muted">Status</dt><dd className="mt-0.5 font-medium text-ink">{company.status === "ACTIVE" ? "Active" : "Suspended"}</dd></div>
              <div><dt className="text-muted">Created</dt><dd className="mt-0.5 font-medium text-ink">{formatDate(company.created_at)}</dd></div>
              <div><dt className="text-muted">Employees</dt><dd className="mt-0.5 font-medium text-ink">{company._count.employees} / {company.max_employees}</dd></div>
              <div><dt className="text-muted">Time zone</dt><dd className="mt-0.5 font-medium text-ink">{company.time_zone}</dd></div>
              <div><dt className="text-muted">Verification URL</dt><dd className="mt-0.5 break-all font-mono text-xs text-ink">{company.verify_base_url}</dd></div>
              <div><dt className="text-muted">Custom domain</dt><dd className="mt-0.5 font-medium text-ink">{company.custom_domain ?? "Not configured"}</dd></div>
            </dl>
          </section>

          <section className="card p-5">
            <h2 className="text-sm font-bold text-ink">Administrators</h2>
            <div className="mt-3 divide-y divide-border">
              {company.admin_users.map((admin) => (
                <div key={admin.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div>
                    <p className="text-sm font-medium text-ink">{admin.name}</p>
                    <p className="text-xs text-muted">{admin.email} · {admin.role === "SUPER_ADMIN" ? "Owner" : admin.role === "ADMIN" ? "Admin" : "Viewer"}</p>
                    <p className="text-xs text-muted">Last sign-in: {admin.last_login_at ? formatDateTime(admin.last_login_at) : "Never"}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {admin.is_active ? (
                      <>
                        <form action={resetOwner2faAction}>
                          <input type="hidden" name="company_id" value={company.id} />
                          <input type="hidden" name="admin_id" value={admin.id} />
                          <button type="submit" className="btn btn-secondary btn-sm">Reset 2FA</button>
                        </form>
                        {admin.id !== owner?.id ? (
                          <form action={platformDeactivateAdminAction}>
                            <input type="hidden" name="company_id" value={company.id} />
                            <input type="hidden" name="admin_id" value={admin.id} />
                            <button type="submit" className="btn btn-danger btn-sm">Deactivate</button>
                          </form>
                        ) : null}
                      </>
                    ) : <span className="badge badge-neutral">Inactive</span>}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className="space-y-5">
          <form action={updateCompanyLimitsAction} className="card space-y-3 p-5">
            <h2 className="text-sm font-bold text-ink">Plan and locale</h2>
            <input type="hidden" name="company_id" value={company.id} />
            <label className="block">
              <span className="label">Employee limit</span>
              <input name="max_employees" type="number" min={1} max={100000} defaultValue={company.max_employees} className="input" required />
            </label>
            <label className="block">
              <span className="label">Time zone</span>
              <input name="time_zone" defaultValue={company.time_zone} className="input" required maxLength={64} />
            </label>
            <button type="submit" className="btn btn-primary w-full">Save limits</button>
          </form>
          <div className="rounded-card border border-indigo-200 bg-indigo-50 p-4 text-xs leading-relaxed text-indigo-900">
            <p className="font-semibold">Tenant actions are audited.</p>
            <p className="mt-1">Suspension blocks all tenant sign-ins immediately and makes every card verify as invalid without revealing the reason.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
