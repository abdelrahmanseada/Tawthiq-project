"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { ChevronDown, IdCard, Rows3, UserRound } from "lucide-react";
import { Badge, EmptyState, cn } from "@/components/ui";
import { bulkSuspendEmployeesAction } from "@/app/(admin)/employees/bulk-actions";
import type { EmployeeListItem } from "@/lib/services/employees";
import type { Locale } from "@/lib/locale";
import { formatDate } from "@/lib/format";

export function EmployeesTable({
  rows,
  canWrite,
  locale,
  printingAllowed,
}: {
  rows: Array<EmployeeListItem & { photoUrl: string | null }>;
  canWrite: boolean;
  locale: Locale;
  printingAllowed: boolean;
}) {
  const t = useTranslations("employees");
  const tc = useTranslations("common");
  const ts = useTranslations("statuses");
  const [selected, setSelected] = useState<string[]>([]);
  const [compact, setCompact] = useState(false);

  const allSelected = rows.length > 0 && selected.length === rows.length;
  const toggleAll = () => setSelected(allSelected ? [] : rows.map((row) => row.id));
  const toggle = (id: string) =>
    setSelected((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));

  if (rows.length === 0) {
    return <EmptyState title={t("noEmployees")} description={t("emptyHint")} />;
  }

  return (
    <div>
      {canWrite ? (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-muted">{t("bulkSelected", { count: selected.length })}</p>
          <form action="/cards" method="get" className="contents">
            {selected.map((id) => (
              <input key={id} type="hidden" name="ids" value={id} />
            ))}
            <button type="submit" className="btn btn-secondary btn-sm" disabled={selected.length === 0}>
              <IdCard className="h-4 w-4" aria-hidden="true" />
              {t("bulkPrint")}
            </button>
          </form>
          <form
            action={bulkSuspendEmployeesAction}
            className="contents"
            onSubmit={(event) => {
              if (!window.confirm(t("bulkConfirmSuspend"))) event.preventDefault();
            }}
          >
            {selected.map((id) => (
              <input key={id} type="hidden" name="ids" value={id} />
            ))}
            <button type="submit" className="btn btn-secondary btn-sm" disabled={selected.length === 0}>
              {t("bulkSuspend")}
            </button>
          </form>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelected([])} disabled={selected.length === 0}>
            {t("bulkClear")}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm ms-auto"
            onClick={() => setCompact((value) => !value)}
            aria-pressed={compact}
            title={t("density")}
          >
            <Rows3 className="h-4 w-4" aria-hidden="true" />
            {compact ? t("densityCompact") : t("densityComfortable")}
          </button>
        </div>
      ) : null}

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              {canWrite ? (
                <th className="th w-10">
                  <input
                    type="checkbox"
                    aria-label={t("selectAll")}
                    checked={allSelected}
                    onChange={toggleAll}
                    className="h-4 w-4 rounded border-border text-brand focus:ring-brand"
                  />
                </th>
              ) : null}
              <th className="th">{t("fullName")}</th>
              <th className="th hidden md:table-cell">{t("department")}</th>
              <th className="th">{t("statusLabel")}</th>
              <th className="th hidden lg:table-cell">{t("card")}</th>
              <th className="th hidden xl:table-cell">{tc("created")}</th>
              <th className="th w-12">
                <span className="sr-only">{tc("actions")}</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-card">
            {rows.map((row) => {
              const expiringSoon =
                row.card?.status === "ACTIVE" && row.card.expires_at.getTime() - Date.now() < 30 * 86400000;
              return (
                <tr key={row.id} className={cn("hover:bg-surface", compact ? "[&>td]:py-1.5" : "[&>td]:py-3")}>
                  {canWrite ? (
                    <td className="td">
                      <input
                        type="checkbox"
                        aria-label={`${tc("select")} ${row.full_name}`}
                        checked={selected.includes(row.id)}
                        onChange={() => toggle(row.id)}
                        className="h-4 w-4 rounded border-border text-brand focus:ring-brand"
                      />
                    </td>
                  ) : null}
                  <td className="td">
                    <div className="flex min-w-0 items-center gap-3">
                      {row.photoUrl ? (
                        <Image
                          src={row.photoUrl}
                          alt={t("photoAlt", { name: row.full_name })}
                          width={40}
                          height={40}
                          unoptimized
                          className="h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-border"
                        />
                      ) : (
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface text-subtle ring-1 ring-border">
                          <UserRound className="h-5 w-5" aria-hidden="true" />
                        </span>
                      )}
                      <div className="min-w-0">
                        <Link href={`/employees/${row.id}`} className="block truncate font-semibold text-ink hover:text-brand">
                          {row.full_name}
                        </Link>
                        <p className="truncate text-xs text-muted" dir="ltr">
                          {row.employee_code}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="td hidden md:table-cell">
                    <p className="text-sm text-ink">{row.department ?? tc("dash")}</p>
                    <p className="text-xs text-muted">{row.job_title ?? ""}</p>
                  </td>
                  <td className="td">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge
                        tone={
                          row.status === "ACTIVE" ? "success" : row.status === "SUSPENDED" ? "warning" : "danger"
                        }
                      >
                        {ts(
                          row.status === "ACTIVE"
                            ? "employeeActive"
                            : row.status === "SUSPENDED"
                              ? "employeeSuspended"
                              : "employeeTerminated",
                        )}
                      </Badge>
                      {!row.photoUrl ? <Badge tone="warning">{t("noPhoto")}</Badge> : null}
                    </div>
                  </td>
                  <td className="td hidden lg:table-cell">
                    {row.card ? (
                      <div className="flex flex-col gap-1">
                        <Badge tone={row.card.status === "ACTIVE" ? "success" : "danger"}>
                          {row.card.status === "ACTIVE" ? ts("cardActive") : ts("cardRevoked")}
                        </Badge>
                        <span className={cn("text-xs", expiringSoon ? "font-semibold text-warning" : "text-muted")}>
                          {t("validUntil")}: {formatDate(row.card.expires_at, locale)}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted">{t("noCard")}</span>
                    )}
                  </td>
                  <td className="td hidden text-xs text-muted xl:table-cell">{formatDate(row.created_at, locale)}</td>
                  <td className="td">
                    <details className="group relative">
                      <summary className="btn btn-ghost btn-icon list-none [&::-webkit-details-marker]:hidden" aria-label={tc("actions")}>
                        <ChevronDown className="h-4 w-4" aria-hidden="true" />
                      </summary>
                      <div className="absolute end-0 z-20 mt-1 w-52 rounded-card border border-border bg-card p-1.5 shadow-raised">
                        <Link href={`/employees/${row.id}`} className="block rounded-control px-3 py-2 text-sm hover:bg-surface">
                          {t("detailTitle")}
                        </Link>
                        {canWrite ? (
                          <Link
                            href={`/employees/${row.id}/edit`}
                            className="block rounded-control px-3 py-2 text-sm hover:bg-surface"
                          >
                            {t("editEmployee")}
                          </Link>
                        ) : null}
                        {row.card?.status === "ACTIVE" ? (
                          printingAllowed && row.photoUrl && row.card.has_token ? (
                            <a
                              href={`/api/admin/cards/${row.card.id}/pdf`}
                              className="block rounded-control px-3 py-2 text-sm hover:bg-surface"
                            >
                              {t("printCard")}
                            </a>
                          ) : (
                            <span className="block cursor-not-allowed rounded-control px-3 py-2 text-sm text-subtle">
                              {t("printCard")}
                            </span>
                          )
                        ) : null}
                      </div>
                    </details>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
