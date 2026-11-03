import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import {
  AlertTriangle,
  CalendarClock,
  Download,
  IdCard,
  Pencil,
  RefreshCw,
  ShieldCheck,
  UserRound,
  XCircle,
} from "lucide-react";
import { Alert, Badge, EmptyState, PageHeader, SectionCard, cn } from "@/components/ui";
import { CardPreview } from "@/components/CardPreview";
import { ConfirmForm } from "@/components/ConfirmForm";
import { can } from "@/lib/auth/rbac";
import { requirePermission } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { formatDate, formatDateTime } from "@/lib/format";
import { hasMessage, translate } from "@/lib/i18n";
import type { Locale } from "@/lib/locale";
import { validateVerifyBaseUrl } from "@/lib/qr";
import { cardIsExpired } from "@/lib/services/cards";
import { employeePhotoUrl, getEmployeeDetail } from "@/lib/services/employees";
import {
  changeEmployeeStatusAction,
  deleteEmployeeAction,
  regenerateCardAction,
  removePhotoAction,
  restoreEmployeeAction,
  revokeCardAction,
} from "../actions";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("employees");
  return { title: t("detailTitle") };
}

export default async function EmployeeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await requirePermission("employees.read");
  const { id } = await params;
  const query = await searchParams;
  const detail = await getEmployeeDetail(admin.companyId, id);
  if (!detail) notFound();

  const [t, ts, tc, tl, ta] = await Promise.all([
    getTranslations("employees"),
    getTranslations("statuses"),
    getTranslations("common"),
    getTranslations("logs"),
    getTranslations("audit"),
  ]);
  const locale = (await getLocale()) as Locale;
  const canWrite = can(admin.role, "employees.write");
  const canManageCards = can(admin.role, "cards.write");
  const { employee, cards, scans, activity } = detail;
  const activeCard = cards.find((card) => card.status === "ACTIVE") ?? null;
  const photoUrl = employeePhotoUrl(employee);
  const next = `/employees/${employee.id}`;
  const tab = query.tab === "card" || query.tab === "scans" || query.tab === "activity" ? query.tab : "overview";
  const statusTone = employee.deleted_at
    ? "neutral"
    : employee.status === "ACTIVE"
      ? "success"
      : employee.status === "SUSPENDED"
        ? "warning"
        : "danger";
  const statusLabel = employee.deleted_at
    ? t("deleted")
    : ts(
        employee.status === "ACTIVE"
          ? "employeeActive"
          : employee.status === "SUSPENDED"
            ? "employeeSuspended"
            : "employeeTerminated",
      );

  const productionUrl = validateVerifyBaseUrl(admin.company.verify_base_url, env.NODE_ENV === "production");
  const printingAllowed = productionUrl.ok && productionUrl.productionValid;
  const cardExpired = activeCard ? cardIsExpired(activeCard) : false;
  const printBlockers: string[] = [];
  if (!printingAllowed) printBlockers.push(t("printBlockedDomain"));
  if (!activeCard) printBlockers.push(t("noCard"));
  else if (activeCard.status !== "ACTIVE") printBlockers.push(t("printBlockedRevoked"));
  else if (cardExpired) printBlockers.push(t("printBlockedExpired"));
  else if (!activeCard.token_enc) printBlockers.push(t("cardNeedsReissue"));
  const canPrint = printBlockers.length === 0;

  let domain = admin.company.verify_base_url;
  try {
    domain = new URL(admin.company.verify_base_url).host;
  } catch {
    // raw preview value
  }

  const tabs = [
    { key: "overview", label: t("tabsOverview"), href: `${next}?tab=overview` },
    { key: "card", label: t("tabsCard"), href: `${next}?tab=card` },
    { key: "scans", label: t("tabsScans"), href: `${next}?tab=scans` },
    { key: "activity", label: t("tabsActivity"), href: `${next}?tab=activity` },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title={employee.full_name}
        subtitle={`${employee.employee_code} · ${employee.job_title ?? tc("dash")}`}
        actions={
          <>
            <Link href="/employees" className="btn btn-secondary btn-sm">
              {t("backToList")}
            </Link>
            {canWrite && !employee.deleted_at ? (
              <Link href={`/employees/${employee.id}/edit`} className="btn btn-primary btn-sm">
                <Pencil className="h-4 w-4" aria-hidden="true" />
                {tc("edit")}
              </Link>
            ) : null}
          </>
        }
      />

      {query.created ? <Alert tone="success">{t("savedCreate")}</Alert> : null}
      {query.saved ? <Alert tone="success">{t("savedUpdate")}</Alert> : null}
      {query.revoked ? <Alert tone="warning">{t("cardRevoked")}</Alert> : null}
      {query.regenerated ? <Alert tone="success">{t("cardRegenerated")}</Alert> : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          <div className="flex flex-wrap items-center gap-2 border-b border-border">
            {tabs.map((entry) => (
              <Link
                key={entry.key}
                href={entry.href}
                className={cn(
                  "-mb-px border-b-2 px-3 py-2.5 text-sm font-semibold",
                  tab === entry.key ? "border-brand text-brand" : "border-transparent text-muted hover:text-ink",
                )}
                aria-current={tab === entry.key ? "page" : undefined}
              >
                {entry.label}
              </Link>
            ))}
          </div>

          {tab === "overview" ? (
            <div className="space-y-5">
              <SectionCard title={t("detailTitle")}>
                <dl className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{t("code")}</dt>
                    <dd className="mt-1 font-medium text-ink" dir="ltr">
                      {employee.employee_code}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{t("statusLabel")}</dt>
                    <dd className="mt-1">
                      <Badge tone={statusTone}>{statusLabel}</Badge>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{t("department")}</dt>
                    <dd className="mt-1 text-ink">{employee.department ?? tc("dash")}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{t("jobTitle")}</dt>
                    <dd className="mt-1 text-ink">{employee.job_title ?? tc("dash")}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{tc("created")}</dt>
                    <dd className="mt-1 text-ink">{formatDateTime(employee.created_at, locale, admin.company.time_zone)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{t("issuedAt")}</dt>
                    <dd className="mt-1 text-ink">{activeCard ? formatDate(activeCard.issued_at, locale, admin.company.time_zone) : tc("dash")}</dd>
                  </div>
                </dl>
              </SectionCard>

              <SectionCard
                title={t("card")}
                actions={
                  <Link href={`${next}?tab=card`} className="link text-sm">
                    {t("tabsCard")}
                  </Link>
                }
              >
                {activeCard ? (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-control bg-brand-tint text-brand">
                        <IdCard className="h-5 w-5" aria-hidden="true" />
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-ink">
                          {t("validUntil")}: {formatDate(activeCard.expires_at, locale, admin.company.time_zone)}
                        </p>
                        <p className="text-xs text-muted" dir="ltr">
                          {activeCard.token_prefix}
                        </p>
                      </div>
                    </div>
                    <Badge tone={activeCard.status === "ACTIVE" ? "success" : "danger"}>
                      {activeCard.status === "ACTIVE" ? ts("cardActive") : ts("cardRevoked")}
                    </Badge>
                  </div>
                ) : (
                  <p className="text-sm text-muted">{t("noCard")}</p>
                )}
              </SectionCard>

              <SectionCard title={t("tabsScans")} actions={<Link href={`${next}?tab=scans`} className="link text-sm">{tc("viewAll")}</Link>}>
                {scans.length === 0 ? <p className="text-sm text-muted">{t("scanHistoryEmpty")}</p> : (
                  <ul className="divide-y divide-border">
                    {scans.slice(0, 5).map((scan) => (
                      <li key={scan.id} className="flex items-center justify-between py-2 text-sm">
                        <span className="text-ink">{formatDateTime(scan.created_at, locale, admin.company.time_zone)}</span>
                        <Badge tone={scan.result === "VALID" ? "success" : "danger"}>
                          {ts(scan.result === "VALID" ? "scanValid" : "scanInvalid")}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </SectionCard>
            </div>
          ) : null}

          {tab === "card" ? (
            <div className="space-y-5">
              {printBlockers.length > 0 ? (
                <Alert tone="warning" title={t("printBlocked")}>
                  <ul className="list-disc space-y-1 ps-5">
                    {printBlockers.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </Alert>
              ) : null}
              <SectionCard title={t("previewTitle")} description={t("previewHint")}>
                <div className="mx-auto max-w-[520px]">
                <CardPreview
                  data={{
                    companyName: admin.company.name,
                    companyLogoUrl: admin.company.logo_url ? `/api/media/logo?company=${admin.company.id}&v=${encodeURIComponent(admin.company.updated_at.toISOString())}` : null,
                    primaryColor: admin.company.primary_color,
                    secondaryColor: admin.company.secondary_color,
                    employeeName: employee.full_name,
                    jobTitle: employee.job_title,
                    department: employee.department,
                    employeeCode: employee.employee_code,
                    photoUrl,
                    validUntil: activeCard ? formatDate(activeCard.expires_at, locale, admin.company.time_zone) : tc("dash"),
                    domain,
                    website: admin.company.website,
                    tagline: admin.company.tagline,
                    showVerifyHostOnCard: admin.company.show_verify_host_on_card,
                    phone: admin.company.contact_phone,
                    email: admin.company.contact_email,
                  }}
                />
                </div>
              </SectionCard>
            </div>
          ) : null}

          {tab === "scans" ? (
            <SectionCard title={t("tabsScans")} description={t("scanStats", { total: scans.length, valid: scans.filter((scan) => scan.result === "VALID").length, invalid: scans.filter((scan) => scan.result !== "VALID").length })}>
              {scans.length === 0 ? (
                <EmptyState title={t("scanHistoryEmpty")} />
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th className="th">{tl("dateTime")}</th>
                        <th className="th">{tl("result")}</th>
                        <th className="th">{tl("prefix")}</th>
                        <th className="th hidden sm:table-cell">{tl("ipHash")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {scans.map((scan) => (
                        <tr key={scan.id}>
                          <td className="td whitespace-nowrap">{formatDateTime(scan.created_at, locale, admin.company.time_zone)}</td>
                          <td className="td">
                            <Badge tone={scan.result === "VALID" ? "success" : "danger"}>
                              {ts(scan.result === "VALID" ? "scanValid" : "scanInvalid")}
                            </Badge>
                          </td>
                          <td className="td font-mono text-xs" dir="ltr">{scan.token_prefix}</td>
                          <td className="td hidden font-mono text-xs sm:table-cell" dir="ltr">{scan.ip_hash.slice(0, 12)}…</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          ) : null}

          {tab === "activity" ? (
            <SectionCard title={t("tabsActivity")}>
              {activity.length === 0 ? (
                <EmptyState title={t("activityEmpty")} />
              ) : (
                <ol className="relative space-y-4 border-s border-border ps-4">
                  {activity.map((entry) => {
                    const actionKey = `audit.actions.${entry.action}`;
                    const actionLabel = hasMessage(locale, actionKey) ? translate(locale, actionKey) : ta("unknownAction");
                    return (
                      <li key={entry.id} className="relative">
                        <span className="absolute -start-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-brand" />
                        <p className="text-sm text-ink">
                          {entry.admin?.name ?? tl("system")} — {actionLabel}
                        </p>
                        <p className="text-xs text-muted">{formatDateTime(entry.created_at, locale, admin.company.time_zone)}</p>
                      </li>
                    );
                  })}
                </ol>
              )}
            </SectionCard>
          ) : null}
        </div>

        <aside className="space-y-4 xl:sticky xl:top-20 xl:self-start">
          <SectionCard>
            <div className="flex flex-col items-center gap-3 text-center">
              {photoUrl ? (
                <Image
                  src={photoUrl}
                  alt={t("photoAlt", { name: employee.full_name })}
                  width={240}
                  height={320}
                  unoptimized className="aspect-[3/4] w-full max-w-[240px] rounded-card object-cover ring-1 ring-border"
                />
              ) : (
                <div className="flex aspect-[3/4] w-full max-w-[240px] flex-col items-center justify-center gap-2 rounded-card bg-surface text-subtle ring-1 ring-border">
                  <UserRound className="h-12 w-12" aria-hidden="true" />
                  <span className="text-xs">{t("photoMissing")}</span>
                </div>
              )}
              <div>
                <p className="text-base font-bold text-ink">{employee.full_name}</p>
                <p className="text-sm text-muted">{employee.job_title ?? tc("dash")}</p>
                <p className="text-xs text-subtle" dir="ltr">{employee.employee_code}</p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Badge tone={statusTone}>{statusLabel}</Badge>
                {activeCard ? (
                  <Badge tone={cardExpired ? "danger" : "neutral"}>
                    <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
                    {formatDate(activeCard.expires_at, locale, admin.company.time_zone)}
                  </Badge>
                ) : null}
              </div>

              {activeCard && canManageCards ? (
                <div className="grid w-full gap-2">
                  {canPrint ? (
                    <a href={`/api/admin/cards/${activeCard.id}/pdf`} className="btn btn-primary btn-sm w-full">
                      <Download className="h-4 w-4" aria-hidden="true" />
                      {t("printCard")}
                    </a>
                  ) : null}
                  {activeCard.token_enc ? (
                    <a href={`/api/admin/cards/${activeCard.id}/pdf?mode=test`} className="btn btn-secondary btn-sm w-full">
                      {t("testPrint")}
                    </a>
                  ) : null}
                  <ConfirmForm action={regenerateCardAction} message={`${t("confirmRegenerate")} ${t("confirmRegenerateBody")}`}>
                    <input type="hidden" name="employee_id" value={employee.id} />
                    <input type="hidden" name="next" value={next} />
                    <button type="submit" className="btn btn-secondary btn-sm w-full">
                      <RefreshCw className="h-4 w-4" aria-hidden="true" />
                      {t("regenerateCard")}
                    </button>
                  </ConfirmForm>
                  <ConfirmForm action={revokeCardAction} message={t("confirmRevoke")}>
                    <input type="hidden" name="employee_id" value={employee.id} />
                    <input type="hidden" name="card_id" value={activeCard.id} />
                    <input type="hidden" name="next" value={next} />
                    <button type="submit" className="btn btn-danger btn-sm w-full">
                      <XCircle className="h-4 w-4" aria-hidden="true" />
                      {t("revokeCard")}
                    </button>
                  </ConfirmForm>
                </div>
              ) : null}
            </div>
          </SectionCard>

          {canWrite ? (
            <SectionCard title={tc("actions")}>
              <div className="grid gap-2">
                {employee.deleted_at ? (
                  <ConfirmForm action={restoreEmployeeAction} message={t("confirmRestore")}>
                    <input type="hidden" name="employee_id" value={employee.id} />
                    <input type="hidden" name="next" value={next} />
                    <button type="submit" className="btn btn-secondary btn-sm w-full">{t("restore")}</button>
                  </ConfirmForm>
                ) : (
                  <>
                    {employee.status !== "ACTIVE" ? (
                      <form action={changeEmployeeStatusAction}>
                        <input type="hidden" name="employee_id" value={employee.id} />
                        <input type="hidden" name="status" value="ACTIVE" />
                        <input type="hidden" name="next" value={next} />
                        <button type="submit" className="btn btn-secondary btn-sm w-full">{t("activate")}</button>
                      </form>
                    ) : (
                      <ConfirmForm action={changeEmployeeStatusAction} message={t("confirmSuspend")}>
                        <input type="hidden" name="employee_id" value={employee.id} />
                        <input type="hidden" name="status" value="SUSPENDED" />
                        <input type="hidden" name="next" value={next} />
                        <button type="submit" className="btn btn-secondary btn-sm w-full">{t("suspend")}</button>
                      </ConfirmForm>
                    )}
                    <ConfirmForm action={changeEmployeeStatusAction} message={t("confirmTerminate")}>
                      <input type="hidden" name="employee_id" value={employee.id} />
                      <input type="hidden" name="status" value="TERMINATED" />
                      <input type="hidden" name="next" value={next} />
                      <button type="submit" className="btn btn-secondary btn-sm w-full">{t("terminate")}</button>
                    </ConfirmForm>
                    {photoUrl ? (
                      <ConfirmForm action={removePhotoAction} message={t("removePhoto")}>
                        <input type="hidden" name="employee_id" value={employee.id} />
                        <input type="hidden" name="next" value={next} />
                        <button type="submit" className="btn btn-ghost btn-sm w-full">{t("removePhoto")}</button>
                      </ConfirmForm>
                    ) : null}
                    <ConfirmForm action={deleteEmployeeAction} message={t("confirmDelete")}>
                      <input type="hidden" name="employee_id" value={employee.id} />
                      <input type="hidden" name="next" value={next} />
                      <button type="submit" className="btn btn-danger btn-sm w-full">{t("delete")}</button>
                    </ConfirmForm>
                  </>
                )}
              </div>
              {!employee.deleted_at && !photoUrl ? (
                <p className="mt-3 flex items-start gap-1.5 text-xs text-warning">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {t("missingPhotoNotice")}
                </p>
              ) : null}
            </SectionCard>
          ) : null}

          <div className="rounded-card border border-border bg-surface p-4 text-xs text-muted">
            <p className="flex items-center gap-1.5 font-semibold text-ink">
              <ShieldCheck className="h-4 w-4 text-brand" aria-hidden="true" />
              {tc("securityNote")}
            </p>
            <p className="mt-1 leading-relaxed">{tc("permissionDenied")}</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
