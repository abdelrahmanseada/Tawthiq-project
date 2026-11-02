import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Download, Plus, Search, SlidersHorizontal } from "lucide-react";
import { EmptyState, PageHeader, Pagination, SectionCard } from "@/components/ui";
import { EmployeesTable } from "@/components/EmployeesTable";
import { can } from "@/lib/auth/rbac";
import { requirePermission } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { formatNumber } from "@/lib/format";
import type { Locale } from "@/lib/locale";
import { validateVerifyBaseUrl } from "@/lib/qr";
import { employeePhotoUrl, listEmployees } from "@/lib/services/employees";
import { employeeListQuerySchema, searchParamsToObject } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("employees");
  return { title: t("title") };
}

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await requirePermission("employees.read");
  const [t, tp, tc] = await Promise.all([
    getTranslations("employees"),
    getTranslations("pagination"),
    getTranslations("common"),
  ]);
  const locale = (await getLocale()) as Locale;

  const params = await searchParams;
  const parsed = employeeListQuerySchema.safeParse(searchParamsToObject(params));
  const query = parsed.success ? parsed.data : employeeListQuerySchema.parse({});
  const data = await listEmployees(admin.companyId, query);
  const canWrite = can(admin.role, "employees.write");
  const rows = data.rows.map((row) => ({ ...row, photoUrl: employeePhotoUrl(row) }));
  const urlCheck = validateVerifyBaseUrl(admin.company.verify_base_url, env.NODE_ENV === "production");
  const printingAllowed = urlCheck.ok && urlCheck.productionValid;

  const exportQuery = new URLSearchParams();
  if (query.q) exportQuery.set("q", query.q);
  if (query.status) exportQuery.set("status", query.status);
  if (query.department) exportQuery.set("department", query.department);

  return (
    <div>
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          <>
            <details className="group relative">
              <summary className="btn btn-secondary list-none [&::-webkit-details-marker]:hidden">
                <Download className="h-4 w-4" aria-hidden="true" />
                {tc("export")}
              </summary>
              <div className="absolute end-0 z-20 mt-2 w-48 rounded-card border border-border bg-card p-1.5 shadow-raised">
                <a className="block rounded-control px-3 py-2 text-sm hover:bg-surface"
                  href={`/api/admin/employees/export?format=csv&${exportQuery.toString()}`}
                >
                  {t("exportCsv")}
                </a>
                <a className="block rounded-control px-3 py-2 text-sm hover:bg-surface"
                  href={`/api/admin/employees/export?format=xlsx&${exportQuery.toString()}`}
                >
                  {t("exportXlsx")}
                </a>
              </div>
            </details>
            {canWrite ? (
              <Link href="/employees/new" className="btn btn-primary">
                <Plus className="h-4 w-4" aria-hidden="true" />
                {t("newEmployee")}
              </Link>
            ) : null}
          </>
        }
      />

      <SectionCard className="mb-4">
        <form action="/employees" method="get" className="grid gap-3 md:grid-cols-12">
          <div className="md:col-span-4">
            <label className="label" htmlFor="q">
              {tc("search")}
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
              <input
                id="q"
                name="q"
                type="search"
                defaultValue={query.q}
                placeholder={t("searchPlaceholder")} className="input ps-9"
              />
            </div>
          </div>
          <div className="md:col-span-2">
            <label className="label" htmlFor="status-filter">
              {t("filterStatus")}
            </label>
            <select id="status-filter" name="status" defaultValue={query.status} className="input">
              <option value="">{t("allStatuses")}</option>
              <option value="ACTIVE">{tc("active")}</option>
              <option value="SUSPENDED">{t("suspend")}</option>
              <option value="TERMINATED">{t("terminate")}</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="label" htmlFor="department-filter">
              {t("filterDepartment")}
            </label>
            <select id="department-filter" name="department" defaultValue={query.department} className="input">
              <option value="">{t("allDepartments")}</option>
              {data.departments.map((department) => (
                <option key={department} value={department}>
                  {department}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="label" htmlFor="photo-filter">
              {t("photo")}
            </label>
            <select id="photo-filter" name="photo" defaultValue={query.photo} className="input">
              <option value="all">{tc("all")}</option>
              <option value="missing">{t("filterMissingPhoto")}</option>
            </select>
          </div>
          <div className="flex items-end gap-2 md:col-span-2">
            <button type="submit" className="btn btn-primary flex-1">
              <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
              {tc("apply")}
            </button>
            <Link href="/employees" className="btn btn-secondary">
              {tc("reset")}
            </Link>
          </div>
          {query.deleted === "1" ? <input type="hidden" name="deleted" value="1" /> : null}
        </form>
        <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-border pt-3 text-sm text-muted">
          <span>
            {tc("showing")} {formatNumber(data.rows.length, locale)} {tc("of")} {formatNumber(data.total, locale)}{" "}
            {tc("results")}
          </span>
          <Link
            href={`/employees?${new URLSearchParams({ ...(query.q ? { q: query.q } : {}), deleted: query.deleted === "1" ? "0" : "1" }).toString()}`} className="link ms-auto text-sm"
          >
            {query.deleted === "1" ? t("backToList") : t("viewDeleted")}
          </Link>
        </div>
      </SectionCard>

      {rows.length === 0 ? (
        <SectionCard>
          <EmptyState
            title={t("noEmployees")}
            description={t("emptyHint")}
            action={
              canWrite ? (
                <Link href="/employees/new" className="btn btn-primary">
                  {t("newEmployee")}
                </Link>
              ) : null
            }
          />
        </SectionCard>
      ) : (
        <EmployeesTable rows={rows} canWrite={canWrite} locale={locale} printingAllowed={printingAllowed} />
      )}

      <Pagination
        basePath="/employees"
        query={{
          q: query.q,
          status: query.status,
          department: query.department,
          photo: query.photo,
          deleted: query.deleted,
        }}
        page={data.page}
        pageCount={data.pageCount}
        labels={{ previous: tc("previous"), next: tc("next"), pageOf: tp("pageOf", { page: data.page, pages: data.pageCount }) }}
      />
    </div>
  );
}
