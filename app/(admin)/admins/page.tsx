import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Alert, Badge, EmptyState, PageHeader, SectionCard } from "@/components/ui";
import { ConfirmForm } from "@/components/ConfirmForm";
import { requirePermission } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/format";
import type { Locale } from "@/lib/locale";
import { listAdmins } from "@/lib/services/admins";
import { AdminForm } from "./admin-form";
import { deactivateAdminAction, updateAdminRoleAction } from "./actions";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admins");
  return { title: t("title") };
}

export default async function AdminsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await requirePermission("admins.manage");
  const [t, tc, tr] = await Promise.all([
    getTranslations("admins"),
    getTranslations("common"),
    getTranslations("roles"),
  ]);
  const locale = (await getLocale()) as Locale;
  const admins = await listAdmins(admin.companyId);
  const params = await searchParams;

  return (
    <div>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      <div className="space-y-3">
        {params.created === "1" ? <Alert tone="success">{t("created")}</Alert> : null}
        {params.updated === "1" ? <Alert tone="success">{t("roleUpdated")}</Alert> : null}
        {params.removed === "1" ? <Alert tone="success">{t("adminDeactivated")}</Alert> : null}
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <SectionCard title={t("title")} description={t("roleChangeHint")}>
          {admins.length === 0 ? (
            <EmptyState title={t("noAdmins")} />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th className="th">{t("name")}</th>
                    <th className="th">{t("role")}</th>
                    <th className="th hidden lg:table-cell">{t("lastLogin")}</th>
                    <th className="th">{tc("actions")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {admins.map((entry) => {
                    const isSelf = entry.id === admin.id;
                    return (
                      <tr key={entry.id} className={entry.is_active ? "" : "opacity-60"}>
                        <td className="td">
                          <div className="flex flex-wrap items-center gap-1.5 font-semibold text-ink">
                            {entry.name}
                            {isSelf ? <Badge tone="info">{t("self")}</Badge> : null}
                            {!entry.is_active ? <Badge tone="neutral">{tc("inactive")}</Badge> : null}
                          </div>
                          <p className="text-xs text-muted" dir="ltr">{entry.email}</p>
                        </td>
                        <td className="td">
                          <form action={updateAdminRoleAction} className="flex flex-wrap items-center gap-2">
                            <input type="hidden" name="admin_id" value={entry.id} />
                            <select
                              name="role"
                              defaultValue={entry.role}
                              aria-label={t("role")} className="input w-auto min-w-36 py-1.5 text-xs"
                              disabled={!entry.is_active || isSelf}
                            >
                              <option value="ADMIN">{tr("ADMIN")}</option>
                              <option value="SUPER_ADMIN">{tr("SUPER_ADMIN")}</option>
                              <option value="VIEWER">{tr("VIEWER")}</option>
                            </select>
                            <button type="submit" className="btn btn-secondary btn-sm" disabled={!entry.is_active || isSelf}>
                              {tc("save")}
                            </button>
                          </form>
                        </td>
                        <td className="td hidden whitespace-nowrap text-xs text-muted lg:table-cell">
                          {entry.last_login_at ? formatDateTime(entry.last_login_at, locale) : t("never")}
                        </td>
                        <td className="td">
                          {entry.is_active ? (
                            <div className="flex flex-wrap items-center gap-1.5">
                              {!isSelf ? (
                                <ConfirmForm action={deactivateAdminAction} message={t("confirmDeactivate")}>
                                  <input type="hidden" name="admin_id" value={entry.id} />
                                  <button type="submit" className="btn btn-danger btn-sm">
                                    {t("deactivate")}
                                  </button>
                                </ConfirmForm>
                              ) : null}
                            </div>
                          ) : (
                            <span className="text-xs text-muted">{tc("inactive")}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        <SectionCard title={t("addAdmin")}>
          <AdminForm />
        </SectionCard>
      </div>
    </div>
  );
}
