import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { KeyRound, Monitor } from "lucide-react";
import { Alert, Badge, PageHeader, SectionCard } from "@/components/ui";
import { ConfirmForm } from "@/components/ConfirmForm";
import { requirePermission } from "@/lib/auth/session";
import { listUserSessions } from "@/lib/auth/session-registry";
import { formatDateTime } from "@/lib/format";
import type { Locale } from "@/lib/locale";
import { signOutOtherSessionsAction } from "./actions";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admins");
  return { title: t("accountTitle") };
}

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await requirePermission("dashboard.view");
  const [t, tc, tr, ta] = await Promise.all([
    getTranslations("admins"),
    getTranslations("common"),
    getTranslations("roles"),
    getTranslations("auth"),
  ]);
  const locale = (await getLocale()) as Locale;
  const params = await searchParams;
  const sessions = await listUserSessions(admin.id);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={t("accountTitle")}
        subtitle={t("accountSubtitle")}
        actions={
          <Link href="/dashboard" className="btn btn-secondary btn-sm">
            {t("backToDashboard")}
          </Link>
        }
      />
      {params.sessions ? (
        <Alert tone="success">{t("signedOutOthers", { count: Number(params.sessions) || 0 })}</Alert>
      ) : null}

      <div className="mt-4 grid gap-5 lg:grid-cols-2">
        <SectionCard title={t("profile")}>
          <dl className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted">{t("name")}</dt>
              <dd className="font-semibold text-ink">{admin.name}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted">{t("email")}</dt>
              <dd className="text-ink" dir="ltr">{admin.email}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted">{t("role")}</dt>
              <dd><Badge tone="info">{tr(admin.role)}</Badge></dd>
            </div>
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/change-password" className="btn btn-secondary btn-sm">
              <KeyRound className="h-4 w-4" aria-hidden="true" />
              {ta("changePassword")}
            </Link>
          </div>
        </SectionCard>


        <SectionCard title={t("sessionsTitle")} description={t("sessionsHint")}>
          <ul className="space-y-2">
            {sessions.map((session) => {
              const current = session.id === admin.sessionId;
              return (
                <li key={session.id} className="rounded-control border border-border p-3 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 font-medium text-ink">
                        <Monitor className="h-4 w-4 text-muted" aria-hidden="true" />
                        <span className="truncate">{t("sessionDevice")}</span>
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        {t("sessionLastSeen")}: {formatDateTime(session.last_seen_at, locale)}
                      </p>
                      <p className="text-xs text-muted" dir="ltr">{session.ip_hash.slice(0, 20)}…</p>
                    </div>
                    {current ? <Badge tone="success">{t("sessionCurrent")}</Badge> : session.revoked_at ? <Badge tone="neutral">{tc("inactive")}</Badge> : null}
                  </div>
                </li>
              );
            })}
          </ul>
          <ConfirmForm action={signOutOtherSessionsAction} message={t("confirmSignOutOthers")} className="mt-4">
            <button type="submit" className="btn btn-secondary btn-sm">
              {t("signOutOthers")}
            </button>
          </ConfirmForm>
        </SectionCard>
      </div>
    </div>
  );
}
